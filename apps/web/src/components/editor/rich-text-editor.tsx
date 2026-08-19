"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import "tippy.js/dist/tippy.css";

import type { AnyExtension, Editor } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import type { Doc as YDoc } from "yjs";
import {
  AtSign,
  Bold,
  BetweenHorizonalEnd,
  BetweenHorizonalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Highlighter,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Paperclip,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Table2,
  Trash2,
  Type,
  Underline as UnderlineIcon,
  Unlink,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  docToPlainText,
  docToStored,
  isDocEmpty,
  storedToDoc,
  toPlainJSON,
  type StoredRichDoc,
} from "./doc-utils";
import { BlockDragGrip } from "./block-drag-grip";
import { BlockMove } from "./block-move-extension";
import {
  ActionButton,
  Badge,
  Banner,
  Column,
  Columns,
  HIGHLIGHT_COLORS,
  PullQuote,
  TEXT_COLORS,
  ToggleBlock,
  type BadgeVariant,
  type ColorName,
} from "./editor-extras";
import { FileAttachment } from "./file-attachment-extension";
import {
  createMentionExtension,
  type MentionUser,
} from "./mention-extension";
import { ResizableImage } from "./resizable-image-extension";
import { RichDocView } from "./rich-doc-view";
import { createSlashCommand } from "./slash-command";
import { TaskEmbed } from "./task-embed-extension";
import {
  toggleBulletListSmart,
  toggleOrderedListSmart,
  toggleTaskListSmart,
} from "./list-helpers";
import {
  classifyPasteWithFiles,
  dataUrlToFile,
  escapeRegExp,
  fileToDataUrl,
  sanitizePastedHtml,
  uploadingPlaceholderDataUrl,
} from "./paste-utils";
import {
  collectFiles,
  isImageFile,
  uploadEditorFile,
  type EditorUploadTarget,
} from "./upload-file";

const EditableImage = ResizableImage.configure({
  inline: false,
  // Allow data: SVG placeholders + brief previews while uploads finish
  allowBase64: true,
  resizable: true,
  HTMLAttributes: {
    class: "aitim-editor-image",
  },
});

/** Table that can be dragged as a block + column resize. */
const DraggableTable = Table.extend({
  draggable: true,
}).configure({
  resizable: true,
  renderWrapper: true,
  HTMLAttributes: {
    class: "aitim-table",
  },
});

type EditorVariant = "default" | "minimal" | "compact";

type RichTextEditorProps = {
  /** Initial value: TipTap doc, hybrid `{ text, doc }`, or legacy `{ text }`. */
  initialContent?: StoredRichDoc | JSONContent | string | null;
  placeholder?: string;
  editable?: boolean;
  /**
   * Visual density / chrome:
   * - `default` — full bordered card + top toolbar (forms)
   * - `minimal` — compact description style (soft chrome, bubble on select)
   * - `compact` — comments (shorter, denser)
   */
  variant?: EditorVariant;
  /** @deprecated use variant="compact" */
  compact?: boolean;
  className?: string;
  /** Reactive class for the content viewport (also retained in full screen). */
  contentClassName?: string;
  editorClassName?: string;
  autoFocus?: boolean;
  onChange?: (payload: {
    text: string;
    doc: JSONContent;
    empty: boolean;
  }) => void;
  /** Hidden input name to submit JSON `{ text, doc }` in forms. */
  name?: string;
  /** Users available for @-mentions (list-access filtered). Enables @ suggestion. */
  mentionUsers?: MentionUser[];
  /** Show expand control for full-screen document writing. */
  expandable?: boolean;
  /** Title shown in the full-screen header. */
  expandTitle?: string;
  /**
   * Task id for uploading pasted/dropped images & files (stored as attachments
   * and embedded via `/api/attachments/:id`).
   */
  taskId?: string;
  /**
   * Docs page id for uploads (stored as doc_attachments, served via
   * `/api/docs/attachments/:id`). Prefer over taskId when both are set.
   */
  pageId?: string;
  /**
   * Chat conversation id for uploads (stored as chat_attachments, served via
   * `/api/chat/attachments/:id`). Used when neither pageId nor taskId is set.
   */
  conversationId?: string;
  /** Enable /Task slash embed (live task chip). Default true when pageId set. */
  enableTaskEmbed?: boolean;
  /** Called after a file/image was uploaded (e.g. refresh attachments list). */
  onFilesUploaded?: () => void;
  /** Allows autosave owners to collapse a multi-file paste into one final save. */
  onUploadBatchChange?: (active: boolean) => void;
  /**
   * Live multiplayer (Yjs). When set, content is driven by the shared document
   * (not `initialContent`), history is disabled, and remote carets render.
   */
  collaboration?: {
    document: YDoc;
    /** Hocuspocus (or compatible) provider for awareness / carets. */
    provider: unknown;
    user: { name: string; color: string; id?: string };
  } | null;
};

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
  className,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => {
        // Keep selection in the editor
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-foreground/70 transition-colors",
        "hover:bg-muted hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-40",
        active && "bg-accent text-accent-foreground shadow-sm",
        className,
      )}
    >
      {children}
    </button>
  );
}

function insertDefaultTable(editor: Editor) {
  editor
    .chain()
    .focus()
    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
    .run();
}

function TableControls({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <ToolbarButton
        title="Add column before"
        onClick={() => editor.chain().focus().addColumnBefore().run()}
      >
        <BetweenVerticalStart className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Add column after"
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      >
        <BetweenVerticalEnd className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Delete column"
        onClick={() => editor.chain().focus().deleteColumn().run()}
      >
        <span className="text-[10px] font-semibold leading-none">Col−</span>
      </ToolbarButton>
      <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
      <ToolbarButton
        title="Add row before"
        onClick={() => editor.chain().focus().addRowBefore().run()}
      >
        <BetweenHorizonalStart className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Add row after"
        onClick={() => editor.chain().focus().addRowAfter().run()}
      >
        <BetweenHorizonalEnd className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Delete row"
        onClick={() => editor.chain().focus().deleteRow().run()}
      >
        <span className="text-[10px] font-semibold leading-none">Row−</span>
      </ToolbarButton>
      <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
      <ToolbarButton
        title="Delete table"
        onClick={() => editor.chain().focus().deleteTable().run()}
      >
        <Trash2 className="size-3.5 text-destructive" />
      </ToolbarButton>
    </div>
  );
}

const COLOR_KEYS = [
  "default",
  "red",
  "orange",
  "yellow",
  "blue",
  "purple",
  "pink",
  "green",
  "grey",
] as const satisfies readonly ColorName[];

const BADGE_KEYS: BadgeVariant[] = [
  "red",
  "orange",
  "yellow",
  "blue",
  "purple",
  "pink",
  "green",
  "grey",
];

function ColorSwatch({
  color,
  title,
  active,
  onClick,
}: {
  color: string | null;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "size-4 shrink-0 rounded-sm border border-border transition-transform hover:scale-110",
        active && "ring-2 ring-primary ring-offset-1 ring-offset-popover",
      )}
      style={{
        background:
          color === null || color === "transparent"
            ? "var(--background)"
            : color,
      }}
    />
  );
}

/**
 * Floating toolbar on text selection — full formatting suite for
 * description and comments (marks, colors, highlights, badges, structure).
 */
function SelectionFormatToolbar({
  editor,
  hasMentions,
}: {
  editor: Editor;
  hasMentions: boolean;
}) {
  const setLink = useCallback(() => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Paste a URL", prev ?? "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    let href = url.trim();
    if (!/^https?:\/\//i.test(href) && !href.startsWith("mailto:")) {
      href = `https://${href}`;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }, [editor]);

  const currentColor = (editor.getAttributes("textStyle").color as string | undefined) ?? null;
  const currentHighlight =
    (editor.getAttributes("highlight").color as string | undefined) ?? null;
  const currentBadge = (editor.getAttributes("badge").variant as string | undefined) ?? null;

  return (
    <div className="flex max-w-[min(92vw,28rem)] flex-col gap-1 p-0.5">
      {/* Marks */}
      <div className="flex flex-wrap items-center gap-0.5">
        <ToolbarButton
          title="Bold (⌘B)"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic (⌘I)"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Underline (⌘U)"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Inline code"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Link"
          active={editor.isActive("link")}
          onClick={setLink}
        >
          <Link2 className="size-3.5" />
        </ToolbarButton>
        {editor.isActive("link") && (
          <ToolbarButton
            title="Remove link"
            onClick={() =>
              editor.chain().focus().extendMarkRange("link").unsetLink().run()
            }
          >
            <Unlink className="size-3.5" />
          </ToolbarButton>
        )}
        <ToolbarButton
          title="Clear formatting"
          onClick={() =>
            editor.chain().focus().unsetAllMarks().unsetBadge().run()
          }
        >
          <RemoveFormatting className="size-3.5" />
        </ToolbarButton>
        {hasMentions && (
          <ToolbarButton
            title="Mention someone"
            onClick={() => {
              editor.chain().focus().insertContent("@").run();
            }}
          >
            <AtSign className="size-3.5" />
          </ToolbarButton>
        )}
      </div>

      {/* Structure */}
      <div className="flex flex-wrap items-center gap-0.5 border-t border-border/70 pt-1">
        <ToolbarButton
          title="Heading 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        >
          <Heading1 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <Heading2 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        >
          <Heading3 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 4"
          active={editor.isActive("heading", { level: 4 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 4 }).run()
          }
        >
          <Heading4 className="size-3.5" />
        </ToolbarButton>
        <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
        <ToolbarButton
          title="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => toggleBulletListSmart(editor)}
        >
          <List className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => toggleOrderedListSmart(editor)}
        >
          <ListOrdered className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Checklist"
          active={editor.isActive("taskList")}
          onClick={() => toggleTaskListSmart(editor)}
        >
          <CheckSquare className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="size-3.5" />
        </ToolbarButton>
      </div>

      {/* Text color */}
      <div className="flex flex-wrap items-center gap-1 border-t border-border/70 px-0.5 pt-1">
        <Type className="size-3 shrink-0 text-muted-foreground" />
        <span className="mr-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          Color
        </span>
        {COLOR_KEYS.map((key) => {
          const value = TEXT_COLORS[key];
          const active =
            key === "default"
              ? !currentColor
              : currentColor?.toLowerCase() === value?.toLowerCase();
          return (
            <ColorSwatch
              key={`c-${key}`}
              color={value}
              title={key === "default" ? "Default color" : `${key} text`}
              active={active}
              onClick={() => {
                if (!value) editor.chain().focus().unsetColor().run();
                else editor.chain().focus().setColor(value).run();
              }}
            />
          );
        })}
      </div>

      {/* Highlight */}
      <div className="flex flex-wrap items-center gap-1 border-t border-border/70 px-0.5 pt-1">
        <Highlighter className="size-3 shrink-0 text-muted-foreground" />
        <span className="mr-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          Highlight
        </span>
        {COLOR_KEYS.map((key) => {
          const value = HIGHLIGHT_COLORS[key];
          const active =
            key === "default"
              ? !currentHighlight
              : currentHighlight?.toLowerCase() === value?.toLowerCase();
          return (
            <ColorSwatch
              key={`h-${key}`}
              color={value}
              title={
                key === "default" ? "Remove highlight" : `${key} highlight`
              }
              active={active}
              onClick={() => {
                if (!value) editor.chain().focus().unsetHighlight().run();
                else editor.chain().focus().setHighlight({ color: value }).run();
              }}
            />
          );
        })}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-1 border-t border-border/70 px-0.5 pt-1">
        <span className="mr-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          Badge
        </span>
        <button
          type="button"
          title="Remove badge"
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().unsetBadge().run();
          }}
          className={cn(
            "rounded px-1 text-[9px] font-medium text-muted-foreground hover:bg-muted",
            !currentBadge && "ring-1 ring-primary",
          )}
        >
          None
        </button>
        {BADGE_KEYS.map((key) => {
          const active = currentBadge === key;
          return (
            <button
              key={`b-${key}`}
              type="button"
              title={`${key} badge — select text first`}
              onMouseDown={(e) => {
                e.preventDefault();
                // setBadge returns false if selection is empty
                const ok = editor.chain().focus().setBadge(key).run();
                if (!ok) {
                  // Expand to word if caret-only so badge still applies
                  editor
                    .chain()
                    .focus()
                    .setTextSelection(editor.state.selection)
                    .setBadge(key)
                    .run();
                }
              }}
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                "aitim-badge aitim-badge--" + key,
                "cursor-pointer",
                active && "ring-2 ring-primary ring-offset-1 ring-offset-popover",
              )}
            >
              Aa
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Compact top toolbar for non-minimal editors (comments, full-screen). */
function FormatToolbar({
  editor,
  hasMentions,
  onInsertImage,
  onAttachFile,
  fileUploading,
}: {
  editor: Editor;
  hasMentions: boolean;
  onInsertImage?: () => void;
  onAttachFile?: () => void;
  fileUploading?: boolean;
}) {
  const setLink = useCallback(() => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Paste a URL", prev ?? "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    let href = url.trim();
    if (!/^https?:\/\//i.test(href) && !href.startsWith("mailto:")) {
      href = `https://${href}`;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }, [editor]);

  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <ToolbarButton
        title="Bold (⌘B)"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Italic (⌘I)"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Underline (⌘U)"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Inline code"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Link"
        active={editor.isActive("link")}
        onClick={setLink}
      >
        <Link2 className="size-3.5" />
      </ToolbarButton>
      <span className="mx-1 h-4 w-px shrink-0 bg-border" />
      <ToolbarButton
        title="Heading"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      >
        <Heading2 className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => toggleBulletListSmart(editor)}
      >
        <List className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => toggleOrderedListSmart(editor)}
      >
        <ListOrdered className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="To-do list"
        active={editor.isActive("taskList")}
        onClick={() => toggleTaskListSmart(editor)}
      >
        <CheckSquare className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Insert table"
        active={editor.isActive("table")}
        onClick={() => insertDefaultTable(editor)}
      >
        <Table2 className="size-3.5" />
      </ToolbarButton>
      {onInsertImage && (
        <ToolbarButton
          title={
            fileUploading ? "Uploading…" : "Insert image (or paste screenshot)"
          }
          disabled={fileUploading}
          onClick={onInsertImage}
        >
          <ImageIcon className="size-3.5" />
        </ToolbarButton>
      )}
      {onAttachFile && (
        <ToolbarButton
          title={fileUploading ? "Uploading…" : "Attach file"}
          disabled={fileUploading}
          onClick={onAttachFile}
        >
          <Paperclip className="size-3.5" />
        </ToolbarButton>
      )}
      {hasMentions && (
        <>
          <span className="mx-1 h-4 w-px shrink-0 bg-border" />
          <ToolbarButton
            title="Mention someone"
            onClick={() => {
              editor.chain().focus().insertContent("@").run();
            }}
          >
            <AtSign className="size-3.5" />
          </ToolbarButton>
        </>
      )}
    </div>
  );
}

function createTableExtensions(): AnyExtension[] {
  return [DraggableTable, TableRow, TableHeader, TableCell];
}

/**
 * AACC Hub TipTap editor: `/` slash commands, optional `@` mentions,
 * bubble format menu on selection, polished typography.
 */
export function RichTextEditor({
  initialContent,
  placeholder = "Write something… Type / for commands",
  editable = true,
  variant,
  compact = false,
  className,
  contentClassName,
  editorClassName,
  autoFocus,
  onChange,
  name,
  mentionUsers,
  expandable = false,
  expandTitle = "Description",
  taskId,
  pageId,
  conversationId,
  enableTaskEmbed,
  onFilesUploaded,
  onUploadBatchChange,
  collaboration = null,
}: RichTextEditorProps) {
  const taskEmbedEnabled = enableTaskEmbed ?? Boolean(pageId);
  const resolvedVariant: EditorVariant =
    variant ?? (compact ? "compact" : "default");
  const isCompact = resolvedVariant === "compact";
  const isMinimal = resolvedVariant === "minimal";
  const isCollab = Boolean(collaboration?.document);
  const collaborationDocument = collaboration?.document;

  const uploadTarget: EditorUploadTarget | null = useMemo(
    () =>
      pageId
        ? { type: "page", id: pageId }
        : taskId
          ? { type: "task", id: taskId }
          : conversationId
            ? { type: "chat", id: conversationId }
            : null,
    [pageId, taskId, conversationId],
  );

  const [storedJson, setStoredJson] = useState(() =>
    name
      ? JSON.stringify(docToStored(storedToDoc(initialContent as StoredRichDoc)))
      : "",
  );
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const uploadTargetRef = useRef(uploadTarget);
  const insertFilesRef = useRef<
    ((files: File[], ed: Editor) => Promise<void>) | null
  >(null);
  const onFilesUploadedRef = useRef(onFilesUploaded);
  const onUploadBatchChangeRef = useRef(onUploadBatchChange);
  const uploadBatchCountRef = useRef(0);
  const uploadBatchClientIdRef = useRef<string | null>(null);
  // Latest-value refs may only be written from effects, not during render.
  useEffect(() => {
    onFilesUploadedRef.current = onFilesUploaded;
    onUploadBatchChangeRef.current = onUploadBatchChange;
    uploadTargetRef.current = uploadTarget;
  });

  const beginUploadBatch = useCallback(() => {
    uploadBatchCountRef.current += 1;
    onUploadBatchChangeRef.current?.(true);
    if (!collaborationDocument || uploadBatchCountRef.current !== 1) return;
    const clientId = uploadBatchClientIdRef.current ?? crypto.randomUUID();
    uploadBatchClientIdRef.current = clientId;
    collaborationDocument.getMap("aitim-upload-batches").set(clientId, true);
  }, [collaborationDocument]);

  const endUploadBatch = useCallback(() => {
    uploadBatchCountRef.current = Math.max(0, uploadBatchCountRef.current - 1);
    onUploadBatchChangeRef.current?.(false);
    if (!collaborationDocument || uploadBatchCountRef.current !== 0) return;
    const clientId = uploadBatchClientIdRef.current;
    if (clientId) {
      collaborationDocument.getMap("aitim-upload-batches").delete(clientId);
    }
  }, [collaborationDocument]);
  // TipTap/ProseMirror must only mount on the client — keep a stable skeleton
  // for SSR + the first client paint to avoid hydration attribute mismatches.
  // Server snapshot false / client snapshot true: React re-renders before
  // paint on hydration, so there is no visible flash.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Lock page scroll + Esc to exit full screen
  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Let slash/@ menus handle Esc first (they stop propagation when open)
        e.preventDefault();
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  const hasMentions = Boolean(mentionUsers && mentionUsers.length > 0);
  /** Images can be pasted/dropped as data URLs even before a task exists. */
  const canInsertImages = Boolean(editable);
  const canUploadFiles = Boolean(uploadTarget && editable);

  // Opens an OS file picker at event time. Fully stable (no deps): the editor
  // and insertFiles are reached through refs inside the change handler, so
  // nothing here is read during render.
  const pickFiles = useCallback((imagesOnly: boolean) => {
    const input = document.createElement("input");
    input.type = "file";
    if (imagesOnly) input.accept = "image/*";
    input.multiple = true;
    input.onchange = () => {
      let files = Array.from(input.files ?? []);
      if (imagesOnly) files = files.filter((f) => f.type.startsWith("image/"));
      const ed = editorRef.current;
      if (files.length && ed) void insertFilesRef.current?.(files, ed);
    };
    input.click();
  }, []);

  const insertTaskEmbed = useCallback(() => {
    const raw = window.prompt("Task number (e.g. CEWD-142)");
    if (!raw?.trim()) return;
    const ed = editorRef.current;
    if (!ed) return;
    ed.chain()
      .focus()
      .setTaskEmbed({ taskNumber: raw.trim().toUpperCase() })
      .run();
  }, []);

  const extensions = useMemo((): AnyExtension[] => {
    // These callbacks only read editor/upload refs after a user-triggered DOM event.
    // eslint-disable-next-line react-hooks/refs
    const slash = createSlashCommand({
      onInsertImage: canInsertImages ? () => pickFiles(true) : undefined,
      onAttachFile: canUploadFiles ? () => pickFiles(false) : undefined,
      onInsertTaskEmbed: taskEmbedEnabled ? insertTaskEmbed : undefined,
    });

    const base: AnyExtension[] = [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        // TipTap 3 StarterKit ships Link + Underline — turn them off so our
        // configured copies below aren't duplicated (console warn).
        link: false,
        underline: false,
        // Undo/redo is provided by Collaboration when multiplayer is on.
        undoRedo: isCollab ? false : undefined,
        dropcursor: {
          color: "var(--primary)",
          width: 2,
        },
        codeBlock: {
          HTMLAttributes: {
            class:
              "rounded-lg border border-border bg-muted/60 px-3.5 py-3 font-mono text-[13px] leading-relaxed",
          },
        },
        blockquote: {
          HTMLAttributes: {
            class:
              "border-l-[3px] border-primary/35 pl-3.5 text-muted-foreground italic",
          },
        },
        horizontalRule: {
          HTMLAttributes: {
            class: "my-5 border-border",
          },
        },
        code: {
          HTMLAttributes: {
            class:
              "rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground before:content-none after:content-none",
          },
        },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Underline,
      Link.configure({
        openOnClick: !editable,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          class:
            "text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary",
          rel: "noopener noreferrer nofollow",
        },
      }),
      TaskList.configure({
        HTMLAttributes: {
          class: "not-prose list-none space-y-1.5 pl-0",
        },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: "flex items-start gap-2.5",
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
        emptyNodeClass: "is-empty",
      }),
      Badge,
      Banner,
      PullQuote,
      ToggleBlock,
      Column,
      Columns,
      ActionButton,
      EditableImage,
      FileAttachment,
      TaskEmbed,
      ...createTableExtensions(),
      BlockMove,
      slash,
    ];
    if (mentionUsers && mentionUsers.length > 0) {
      base.push(createMentionExtension(mentionUsers));
    }
    if (isCollab && collaboration) {
      base.push(
        Collaboration.configure({
          document: collaboration.document,
          field: "default",
        }),
      );
      if (collaboration.provider) {
        base.push(
          CollaborationCaret.configure({
            provider: collaboration.provider,
            user: {
              name: collaboration.user.name,
              color: collaboration.user.color,
              id: collaboration.user.id,
            },
            render: (user) => {
              const caret = document.createElement("span");
              caret.classList.add("collab-caret");
              caret.style.borderColor = String(user.color ?? "#007582");

              const label = document.createElement("span");
              label.classList.add("collab-caret-label");
              label.style.backgroundColor = String(user.color ?? "#007582");
              label.textContent = String(user.name ?? "User");
              caret.appendChild(label);
              return caret;
            },
            selectionRender: (user) => ({
              nodeName: "span",
              class: "collab-selection",
              style: `background-color: ${String(user.color ?? "#007582")}33`,
              "data-user": String(user.name ?? ""),
            }),
          }),
        );
      }
    }
    return base;
    // mentionUsers / canUpload / collab captured on mount; remount via key when needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMentions, placeholder, editable, canInsertImages, canUploadFiles, taskEmbedEnabled, isCollab]);

  /** Swap a pending image by stable id (placeholder → permanent URL). */
  const replacePendingImage = useCallback(
    (
      ed: Editor,
      uploadId: string,
      toSrc: string,
      meta?: { alt?: string; title?: string },
    ): boolean => {
      if (!ed || ed.isDestroyed) return false;
      const { tr } = ed.state;
      let changed = false;
      ed.state.doc.descendants((node, pos) => {
        if (node.type.name !== "image") return;
        if (node.attrs.uploadId !== uploadId) return;
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          src: toSrc,
          alt: meta?.alt ?? node.attrs.alt,
          title: meta?.title ?? node.attrs.title,
          uploadId: null,
        });
        changed = true;
      });
      if (changed) ed.view.dispatch(tr);
      return changed;
    },
    [],
  );

  /** Recovery for Word variants that create an image node without HTML attrs. */
  const replaceFirstUnresolvedImage = useCallback(
    (
      ed: Editor,
      toSrc: string,
      meta?: { alt?: string; title?: string },
    ): boolean => {
      if (!ed || ed.isDestroyed) return false;
      const tr = ed.state.tr;
      let changed = false;
      ed.state.doc.descendants((node, pos) => {
        if (changed || node.type.name !== "image") return;
        const src = typeof node.attrs.src === "string" ? node.attrs.src : "";
        if (src && !src.startsWith("data:")) return;
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          src: toSrc,
          alt: meta?.alt ?? node.attrs.alt,
          title: meta?.title ?? node.attrs.title,
          uploadId: null,
        });
        changed = true;
      });
      if (changed) ed.view.dispatch(tr);
      return changed;
    },
    [],
  );

  /**
   * Images → insert local preview immediately, upload in background, then swap src.
   * Non-image files → paperclip chip after upload (no good preview).
   */
  const insertFiles = useCallback(
    async (files: File[], ed: Editor) => {
      if (files.length === 0) return;
      setFileError(null);

      // Compose-before-save (New task): keep images as data URLs until create.
      if (!uploadTarget) {
        const images = files.filter((file) => isImageFile(file));
        const skipped = files.length - images.length;
        const errors: string[] = [];
        for (const file of images) {
          try {
            const src = await fileToDataUrl(file);
            ed.chain()
              .focus()
              .setImage({ src, alt: file.name, title: file.name })
              .run();
          } catch (err) {
            errors.push(err instanceof Error ? err.message : "Could not insert image");
          }
        }
        if (skipped > 0) {
          errors.push(
            skipped === 1
              ? "That file can be attached after the task is created"
              : "Those files can be attached after the task is created",
          );
        }
        if (errors.length) {
          setFileError(errors.length === 1 ? errors[0]! : `${errors.length} files could not be added`);
        }
        return;
      }

      type Job =
        | { kind: "image"; file: File; uploadId: string }
        | { kind: "file"; file: File };

      const jobs: Job[] = files.map((file) => {
        const asImage = isImageFile(file);
        if (asImage) {
          return { kind: "image" as const, file, uploadId: crypto.randomUUID() };
        }
        return { kind: "file" as const, file };
      });

      // 1) Place images immediately so the user isn’t waiting on the network
      for (const job of jobs) {
        if (job.kind !== "image") continue;
        ed.chain()
          .focus()
          .setImage({
            src: uploadingPlaceholderDataUrl("Uploading image…"),
            alt: job.file.name,
            title: "Uploading…",
            uploadId: job.uploadId,
          })
          .run();
      }

      const uploadJobs = jobs;
      if (uploadJobs.length === 0) return;

      setFileUploading(true);
      beginUploadBatch();
      setUploadProgress({ done: 0, total: uploadJobs.length });
      let done = 0;
      const errors: string[] = [];

      try {
        for (const job of uploadJobs) {
          try {
            const uploaded = await uploadEditorFile(uploadTarget, job.file);
            if (job.kind === "image") {
              const replaced = replacePendingImage(ed, job.uploadId, uploaded.url, {
                alt: uploaded.fileName,
                title: uploaded.fileName,
              });
              if (!replaced) {
                throw new Error("The image placeholder was removed before upload completed");
              }
            } else {
              ed.chain()
                .focus()
                .setFileAttachment({
                  id: uploaded.id,
                  href: uploaded.url,
                  fileName: uploaded.fileName,
                  mimeType: uploaded.mimeType,
                  sizeBytes: uploaded.sizeBytes,
                })
                .run();
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Upload failed";
            errors.push(msg);
            if (job.kind === "image") {
              replacePendingImage(ed, job.uploadId, uploadingPlaceholderDataUrl("Upload failed"), {
                alt: job.file.name,
                title: msg,
              });
            }
          }
          done += 1;
          setUploadProgress({ done, total: uploadJobs.length });
        }
        onFilesUploadedRef.current?.();
        if (errors.length) {
          setFileError(
            errors.length === 1
              ? errors[0]!
              : `${errors.length} files failed to upload`,
          );
        }
      } finally {
        setFileUploading(false);
        setUploadProgress(null);
        endUploadBatch();
      }
    },
    [beginUploadBatch, endUploadBatch, uploadTarget, replacePendingImage],
  );
  // Sync the latest insertFiles into the ref from an effect (not render).
  useEffect(() => {
    insertFilesRef.current = insertFiles;
  }, [insertFiles]);

  /**
   * Paste HTML immediately (text + image placeholders), then upload assets in background.
   */
  const pasteHtmlWithAssets = useCallback(
    async (
      ed: Editor,
      sanitizedHtml: string,
      dataImages: { marker: string; dataUrl: string; mime: string }[],
      extraFiles: File[],
      droppedImageCount = 0,
    ) => {
      if (!uploadTarget) {
        setFileError(null);
        let html = sanitizedHtml;
        for (const img of dataImages) {
          html = html.replace(new RegExp(escapeRegExp(img.marker), "g"), img.dataUrl);
        }
        if (html.trim()) {
          ed.chain().focus().insertContent(html).run();
        }

        const extraImages: File[] = [];
        let skippedNonImages = 0;
        for (const file of extraFiles) {
          const alreadyQueued = dataImages.some((img) => {
            const asFile = dataUrlToFile(img.dataUrl, img.mime, 0);
            return Boolean(asFile && asFile.size === file.size && asFile.type === file.type);
          });
          if (alreadyQueued) continue;
          if (isImageFile(file)) extraImages.push(file);
          else skippedNonImages += 1;
        }
        for (const file of extraImages) {
          try {
            const src = await fileToDataUrl(file);
            ed.chain()
              .focus()
              .setImage({ src, alt: file.name, title: file.name })
              .run();
          } catch {
            skippedNonImages += 1;
          }
        }

        const missingImageCount = Math.max(0, droppedImageCount - extraImages.length);
        const errors: string[] = [];
        if (missingImageCount > 0) {
          errors.push(
            missingImageCount === 1
              ? "1 image from your paste couldn't be inserted. Copy and paste that image on its own, or drag its file in."
              : `${missingImageCount} images from your paste couldn't be inserted. Copy and paste each image on its own, or drag its file in.`,
          );
        }
        if (skippedNonImages > 0) {
          errors.push("Other files can be attached after the task is created");
        }
        if (errors.length) {
          setFileError(errors.length === 1 ? errors[0]! : errors.join(" "));
        }
        return;
      }

      setFileError(null);

      type Pending = {
        uploadId: string;
        file: File;
        placeholderSrc: string;
      };
      const pending: Pending[] = [];
      let html = sanitizedHtml;

      // Resolve markers → lightweight placeholders so the saved draft never contains blob URLs.
      for (let i = 0; i < dataImages.length; i++) {
        const img = dataImages[i]!;
        const file = dataUrlToFile(img.dataUrl, img.mime, i);
        const esc = escapeRegExp(img.marker);
        if (!file) {
          const ph = uploadingPlaceholderDataUrl("Image unavailable");
          html = html.replace(
            new RegExp(`(src=["'])${esc}(["'])`, "gi"),
            `$1${ph}$2`,
          );
          continue;
        }
        const uploadId = crypto.randomUUID();
        const placeholderSrc = uploadingPlaceholderDataUrl(`Uploading image ${i + 1}…`);
        pending.push({ uploadId, file, placeholderSrc });
        html = html.replace(
          new RegExp(`(src=["'])${esc}(["'])`, "gi"),
          `$1${placeholderSrc}$2`,
        );
        // Stable id survives editor normalization and collaborative transactions.
        html = html.replace(
          new RegExp(
            `(<img\\b[^>]*\\bsrc=["']${escapeRegExp(placeholderSrc)}["'][^>]*)(>)`,
            "gi",
          ),
          `$1 data-upload-id="${uploadId}" title="Uploading…" alt="${file.name.replace(/"/g, "")}"$2`,
        );
      }

      // 1) Insert text + preview images immediately
      if (html.trim()) {
        const insertFrom = ed.state.selection.from;
        ed.chain().focus().insertContent(html).run();

        // Some Word HTML variants parse <img> as an image node but discard all
        // attributes. Bind the newly inserted image nodes to their upload jobs
        // by insertion order so replacement never depends on DOM attributes.
        if (pending.length > 0) {
          const insertTo = ed.state.selection.from;
          const rangeStart = Math.max(0, Math.min(insertFrom, insertTo) - 2);
          const rangeEnd = Math.max(insertFrom, insertTo) + 2;
          const tr = ed.state.tr;
          let pendingIndex = 0;
          ed.state.doc.descendants((node, pos) => {
            if (pendingIndex >= pending.length) return false;
            if (pos < rangeStart || pos > rangeEnd) return;
            if (node.type.name !== "image") return;
            const job = pending[pendingIndex++]!;
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              src: job.placeholderSrc,
              alt: job.file.name,
              title: "Uploading…",
              uploadId: job.uploadId,
            });
          });
          if (tr.docChanged) ed.view.dispatch(tr);
        }
      }

      // Extra clipboard files: images as previews now; non-images after upload
      const extraImageJobs: Pending[] = [];
      const extraNonImages: File[] = [];
      for (const file of extraFiles) {
        // Word can expose the same image as both an HTML data URL and a
        // clipboard File. Upload and insert that asset only once.
        const alreadyQueued = pending.some(
          (job) => job.file.size === file.size && job.file.type === file.type,
        );
        if (alreadyQueued) continue;
        if (isImageFile(file)) {
          const uploadId = crypto.randomUUID();
          const placeholderSrc = uploadingPlaceholderDataUrl("Uploading image…");
          extraImageJobs.push({ uploadId, file, placeholderSrc });
          ed.chain()
            .focus()
            .setImage({
              src: placeholderSrc,
              alt: file.name,
              title: "Uploading…",
              uploadId,
            })
            .run();
        } else {
          extraNonImages.push(file);
        }
      }

      // sanitizePastedHtml has to drop <img> tags whose src is a local-only
      // reference (file:/cid:/webkit-fake-url:) — that path only exists on
      // the sender's machine, most often from Word/Outlook on Windows. If the
      // clipboard didn't also hand us that image as a real file, it's gone;
      // say so instead of silently losing it.
      const missingImageCount = Math.max(0, droppedImageCount - extraImageJobs.length);

      const allPending = [...pending, ...extraImageJobs];
      const total = allPending.length + extraNonImages.length;
      if (total === 0) {
        onFilesUploadedRef.current?.();
        if (missingImageCount > 0) {
          setFileError(
            missingImageCount === 1
              ? "1 image from your paste couldn't be inserted. Copy and paste that image on its own, or drag its file in."
              : `${missingImageCount} images from your paste couldn't be inserted. Copy and paste each image on its own, or drag its file in.`,
          );
        }
        return;
      }

      setFileUploading(true);
      beginUploadBatch();
      setUploadProgress({ done: 0, total });
      let done = 0;
      const errors: string[] = missingImageCount > 0
        ? [
            missingImageCount === 1
              ? "1 image from your paste couldn't be inserted"
              : `${missingImageCount} images from your paste couldn't be inserted`,
          ]
        : [];

      try {
        for (const job of allPending) {
          try {
            const uploaded = await uploadEditorFile(uploadTarget, job.file);
            const meta = {
              alt: uploaded.fileName,
              title: uploaded.fileName,
            };
            const replaced =
              replacePendingImage(ed, job.uploadId, uploaded.url, meta) ||
              replaceFirstUnresolvedImage(ed, uploaded.url, meta);
            if (!replaced) {
              throw new Error("The image placeholder was removed before upload completed");
            }
          } catch (err) {
            errors.push(err instanceof Error ? err.message : "Upload failed");
            replacePendingImage(
              ed,
              job.uploadId,
              uploadingPlaceholderDataUrl("Upload failed"),
              { alt: job.file.name, title: "Upload failed" },
            );
          } finally {
            done += 1;
            setUploadProgress({ done, total });
          }
        }

        for (const file of extraNonImages) {
          try {
            const uploaded = await uploadEditorFile(uploadTarget, file);
            ed.chain()
              .focus()
              .setFileAttachment({
                id: uploaded.id,
                href: uploaded.url,
                fileName: uploaded.fileName,
                mimeType: uploaded.mimeType,
                sizeBytes: uploaded.sizeBytes,
              })
              .run();
          } catch (err) {
            errors.push(err instanceof Error ? err.message : "Upload failed");
          }
          done += 1;
          setUploadProgress({ done, total });
        }

        onFilesUploadedRef.current?.();
        if (errors.length) {
          setFileError(
            errors.length === 1
              ? errors[0]!
              : `${errors.length} images failed to upload`,
          );
        }
      } catch (err) {
        setFileError(err instanceof Error ? err.message : "Paste failed");
      } finally {
        setFileUploading(false);
        setUploadProgress(null);
        endUploadBatch();
      }
    },
    [
      beginUploadBatch,
      endUploadBatch,
      replaceFirstUnresolvedImage,
      replacePendingImage,
      uploadTarget,
    ],
  );

  const pasteHtmlWithAssetsRef = useRef(pasteHtmlWithAssets);
  useEffect(() => {
    pasteHtmlWithAssetsRef.current = pasteHtmlWithAssets;
  }, [pasteHtmlWithAssets]);

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable,
      autofocus: autoFocus ? "end" : false,
      extensions,
      // Collaborative docs are driven by Yjs — do not set initial content.
      content: isCollab ? undefined : storedToDoc(initialContent as StoredRichDoc),
      editorProps: {
        attributes: {
          class: cn(
            "aitim-editor prose prose-sm dark:prose-invert max-w-none focus:outline-none",
            "prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground",
            "prose-h1:text-2xl prose-h2:text-xl prose-h3:text-base",
            "prose-p:my-1.5 prose-p:leading-relaxed",
            "prose-headings:my-2.5",
            "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-li:leading-relaxed",
            "prose-strong:font-semibold prose-strong:text-foreground",
            // Left padding leaves room for the 6-dot drag handle
            isCompact
              ? "min-h-[4.5rem] pl-8 pr-3 py-2.5 text-sm"
              : isMinimal
                ? "min-h-[7rem] pl-8 pr-1 py-1 text-[15px] leading-relaxed"
                : "min-h-[8rem] pl-9 pr-3.5 py-3 text-sm",
            editorClassName,
          ),
          spellcheck: "true",
        },
        handleDOMEvents: {
          focus: () => {
            setFocused(true);
            return false;
          },
          blur: () => {
            setFocused(false);
            return false;
          },
        },
        handlePaste: (_view, event) => {
          const ed = editorRef.current;
          if (!ed) return false;

          const files = collectFiles(event.clipboardData);
          const classified = classifyPasteWithFiles(event.clipboardData, files);

          // Screenshot / file-only paste (no real HTML body)
          if (classified.mode === "files-only") {
            event.preventDefault();
            if (insertFilesRef.current) {
              void insertFilesRef.current(classified.files, ed);
            }
            return true;
          }

          // Word / browser HTML that may include data-URL images and/or files
          if (classified.mode === "html-with-assets") {
            event.preventDefault();
            void pasteHtmlWithAssetsRef.current?.(
              ed,
              classified.sanitizedHtml,
              classified.dataImages,
              classified.files,
              classified.droppedImageCount,
            );
            return true;
          }

          // Plain text or trivial HTML — TipTap default + transformPastedHTML
          return false;
        },
        handleDrop: (view, event, _slice, moved) => {
          // Internal block drag (from the 6-dot handle) — let ProseMirror move it
          if (moved || view.dragging) return false;
          const files = collectFiles(event.dataTransfer);
          if (files.length === 0) return false;
          // Don't steal drops that aren't file uploads
          if (!files.some((f) => f.size > 0)) return false;
          event.preventDefault();
          const ed = editorRef.current;
          if (ed && insertFilesRef.current) {
            void insertFilesRef.current(files, ed);
          }
          return true;
        },
        // Fallback path when we don't take over paste (simple browser HTML).
        transformPastedHTML(html) {
          return sanitizePastedHtml(html);
        },
      },
      onUpdate: ({ editor: ed }) => {
        // prosemirror-model gives every attrs-bearing node/mark a
        // null-prototype attrs object (see toPlainJSON's doc comment) — plain
        // JSON round-trip before this doc can travel through a Server Action.
        const doc = toPlainJSON(ed.getJSON());
        // Include [Image] markers so image-only docs still have non-empty text.
        const text = docToPlainText(doc);
        if (name) setStoredJson(JSON.stringify(docToStored(doc)));
        onChange?.({ text, doc, empty: isDocEmpty(doc) });
      },
    },
    // Only construct the editor after mount (client).
    [mounted],
  );

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  if (!mounted || !editor) {
    return (
      <div
        className={cn(
          "animate-pulse rounded-xl border border-border bg-muted/30",
          isCompact ? "h-24" : "h-36",
          className,
        )}
        aria-hidden
      />
    );
  }

  // Full-screen mode always shows a full toolbar (document writing).
  // Permanent top bar: full-screen description only (not compact comments / inline description).
  // Comments still get the floating selection toolbar on text select.
  const showTopToolbar = editable && expanded;
  const showMinimalHint = editable && isMinimal && focused && !expanded;

  const expandToggle =
    expandable && editable ? (
      <ToolbarButton
        title={expanded ? "Exit full screen" : "Write full screen"}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <Minimize2 className="size-3.5" />
        ) : (
          <Maximize2 className="size-3.5" />
        )}
      </ToolbarButton>
    ) : null;

  const editorChrome = (
    <div
      className={cn(
        "group/editor relative flex flex-col transition-all duration-150",
        expanded
          ? "h-full min-h-0 border-0 bg-background shadow-none"
          : isMinimal
            ? cn(
                "rounded-lg border border-transparent bg-transparent",
                "hover:border-border/60 hover:bg-muted/20",
                focused &&
                  "border-primary/30 bg-card shadow-sm ring-2 ring-primary/10",
              )
            : cn(
                // overflow-visible so the left drag handle isn't clipped
                "overflow-visible rounded-xl border border-border bg-card shadow-sm",
                "focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15",
              ),
        !editable && !expanded && "bg-muted/20",
        !expanded && className,
      )}
    >
      {expanded && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">
              {expandTitle}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Full-screen document mode ·{" "}
              <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">
                esc
              </kbd>{" "}
              to exit
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExpanded(false)}
            >
              <Minimize2 className="size-3.5" />
              Exit full screen
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setExpanded(false)}
            >
              Done
            </Button>
          </div>
        </div>
      )}

      {showTopToolbar && (
        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border bg-muted/25 px-1.5 py-1",
            "supports-[backdrop-filter]:bg-muted/20 supports-[backdrop-filter]:backdrop-blur-sm",
            expanded && "px-4 sm:px-6",
          )}
        >
          <FormatToolbar
            editor={editor}
            hasMentions={hasMentions}
            fileUploading={fileUploading}
            onInsertImage={canInsertImages ? () => pickFiles(true) : undefined}
            onAttachFile={canUploadFiles ? () => pickFiles(false) : undefined}
          />
          <div className="ml-auto flex items-center gap-1 pr-0.5">
            {expandToggle}
            <span className="hidden items-center gap-1.5 pl-1.5 text-[10px] text-muted-foreground sm:inline-flex">
              {hasMentions && (
                <>
                  <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">
                    @
                  </kbd>
                  <span>mention</span>
                  <span className="text-border">·</span>
                </>
              )}
              <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">
                /
              </kbd>
              <span>commands</span>
              {canInsertImages && (
                <>
                  <span className="text-border">·</span>
                  <span>drop files</span>
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Minimal description: icon-only full-screen toggle */}
      {editable && isMinimal && !expanded && expandable && (
        <div className="absolute top-1.5 right-1.5 z-10 opacity-0 transition-opacity group-hover/editor:opacity-100 group-focus-within/editor:opacity-100">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="size-7 bg-card/95 p-0 shadow-sm backdrop-blur-sm"
            onClick={() => setExpanded(true)}
            title="Full screen"
            aria-label="Full screen"
          >
            <Maximize2 className="size-3.5" />
          </Button>
        </div>
      )}

      {editable && (
        <>
          <BubbleMenu
            editor={editor}
            options={{
              placement: "top",
              offset: 8,
              flip: true,
            }}
            shouldShow={({ editor: ed, state }) => {
              const { from, to } = state.selection;
              if (from === to) return false;
              // Dedicated menus for tables / media
              if (
                ed.isActive("table") ||
                ed.isActive("image") ||
                ed.isActive("fileAttachment")
              ) {
                return false;
              }
              return true;
            }}
            className={cn(
              "z-[210] max-w-[min(92vw,28rem)] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg",
              "ring-1 ring-foreground/10",
            )}
          >
            <SelectionFormatToolbar
              editor={editor}
              hasMentions={hasMentions}
            />
          </BubbleMenu>

          <BubbleMenu
            editor={editor}
            options={{
              placement: "top",
              offset: 10,
              flip: true,
            }}
            shouldShow={({ editor: ed }) => ed.isActive("table")}
            className={cn(
              "z-[210] flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg",
              "ring-1 ring-foreground/10",
            )}
          >
            <TableControls editor={editor} />
          </BubbleMenu>

          <BubbleMenu
            editor={editor}
            options={{
              placement: "top",
              offset: 8,
              flip: true,
            }}
            shouldShow={({ editor: ed, state }) => {
              const { from, to } = state.selection;
              // Node-selected image or file chip
              return (
                ed.isActive("image") ||
                ed.isActive("fileAttachment") ||
                (from === to - 1 && ed.isActive("image"))
              );
            }}
            className={cn(
              "z-[210] flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg",
              "ring-1 ring-foreground/10",
            )}
          >
            <ToolbarButton
              title="Delete"
              onClick={() => {
                editor.chain().focus().deleteSelection().run();
              }}
            >
              <Trash2 className="size-3.5 text-destructive" />
            </ToolbarButton>
          </BubbleMenu>
        </>
      )}

      <div
        className={cn(
          "relative",
          expanded
            ? "min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-10 md:px-[max(2.5rem,calc((100%-48rem)/2))]"
            : isMinimal
              ? "px-2.5 py-2"
              : undefined,
        )}
      >
        <div
          className={cn(
            expanded &&
              "mx-auto min-h-full max-w-3xl rounded-xl border border-border/60 bg-card px-6 py-8 shadow-sm sm:px-10 sm:py-10",
            contentClassName,
          )}
        >
          {editable && <BlockDragGrip editor={editor} enabled />}
          <EditorContent
            editor={editor}
            className={cn(
              expanded &&
                "[&_.ProseMirror]:min-h-[calc(100vh-14rem)] [&_.ProseMirror]:text-base [&_.ProseMirror]:leading-relaxed",
            )}
          />
        </div>
      </div>

      {showMinimalHint && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/50 px-1 font-mono">
              /
            </kbd>
            blocks
          </span>
          {canInsertImages && (
            <span className="inline-flex items-center gap-1">
              paste / drop files
            </span>
          )}
          {expandable && (
            <span className="inline-flex items-center gap-1">
              <Maximize2 className="size-3" />
              full screen
            </span>
          )}
          {hasMentions && (
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted/50 px-1 font-mono">
                @
              </kbd>
              people
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            Select text for formatting
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/50 px-1 font-mono">
              ⌥↑↓
            </kbd>
            move blocks
          </span>
        </div>
      )}

      {(fileUploading || fileError) && (
        <div
          className={cn(
            "flex items-center gap-2 border-t border-border/60 px-3 py-1.5 text-xs",
            fileError ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {fileUploading && (
            <span
              className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary"
              aria-hidden
            />
          )}
          <span>
            {fileUploading
              ? uploadProgress
                ? `Uploading images ${uploadProgress.done}/${uploadProgress.total}… you can keep editing`
                : "Uploading images… you can keep editing"
              : fileError}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Stay in the form so task save still receives the description */}
      {name && <input type="hidden" name={name} value={storedJson} readOnly />}

      {expanded ? (
        <>
          <div
            className={cn(
              "flex min-h-[7rem] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground",
              className,
            )}
          >
            <span className="inline-flex items-center gap-2">
              <Maximize2 className="size-4" />
              Editing in full screen…
              <button
                type="button"
                className="font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => setExpanded(false)}
              >
                Return
              </button>
            </span>
          </div>
          {createPortal(
            <div
              className="fixed inset-0 z-[200] flex flex-col bg-background"
              role="dialog"
              aria-modal="true"
              aria-label={`${expandTitle} full screen editor`}
            >
              {editorChrome}
            </div>,
            document.body,
          )}
        </>
      ) : (
        editorChrome
      )}
    </>
  );
}

/**
 * Read-only renderer for stored rich content (comments / activity / inbox).
 * Uses a React walker (not ProseMirror) so images always paint as <img>
 * — TipTap node-views were unreliable for read-only comment display.
 */
export function RichTextViewer({
  content,
  className,
}: {
  content: StoredRichDoc | JSONContent | string | null | undefined;
  className?: string;
}) {
  return <RichDocView content={content} className={className} />;
}
