/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import {
  CheckSquare,
  FileText,
  Folder,
  LayoutGrid,
  User,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { cn } from "@/lib/utils";
import { resolveMentionLabels, searchAgentMentions } from "../actions/mention-search";
import {
  detectMentionQuery,
  encodeMentionToken,
  extractMentionTokens,
  mentionChipLabel,
  mentionChipPrefix,
  mentionTypeLabel,
  parseInstructionSegments,
  type AgentMentionItem,
  type AgentMentionType,
} from "../lib/agent-mentions";

const TYPE_ICON: Record<AgentMentionType, typeof User> = {
  user: User,
  task: CheckSquare,
  space: LayoutGrid,
  doc: FileText,
  folder: Folder,
};

const CHIP_CLASS: Record<AgentMentionType, string> = {
  user: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
  task: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-200",
  space:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  doc: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100",
  folder:
    "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-100",
};

const PREFIX_HINT =
  "@ person · @@ task · @@@ workspace · @@@@ doc · @@@@@ folder";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function chipHtml(
  type: AgentMentionType,
  id: string,
  label: string,
  token: string,
  labelOverrides: Record<string, string>,
): string {
  // The label baked into the stored token is a point-in-time snapshot — show
  // the entity's current name when resolved (see resolveMentionLabels). The
  // token itself (what actually gets saved) is untouched either way.
  const displayLabel = labelOverrides[`${type}:${id}`] ?? label;
  const safeLabel = escapeHtml(mentionChipLabel(type, displayLabel));
  const safeToken = escapeHtml(token);
  const prefix = escapeHtml(mentionChipPrefix(type));
  const color = CHIP_CLASS[type];
  return (
    `<span` +
    ` contenteditable="false"` +
    ` data-agent-mention="1"` +
    ` data-type="${type}"` +
    ` data-id="${escapeHtml(id)}"` +
    ` data-label="${escapeHtml(label)}"` +
    ` data-token="${safeToken}"` +
    ` class="agent-mention-chip inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 align-baseline text-[12px] font-medium leading-tight shadow-sm ${color}"` +
    ` title="${safeToken}"` +
    `>` +
    `<span class="opacity-70 text-[10px] font-semibold uppercase tracking-wide">${prefix}</span>` +
    `<span class="truncate">${safeLabel}</span>` +
    `</span>`
  );
}

function valueToHtml(value: string, labelOverrides: Record<string, string>): string {
  const segments = parseInstructionSegments(value);
  let html = "";
  for (const seg of segments) {
    if (seg.kind === "text") {
      html += escapeHtml(seg.text).replace(/\n/g, "<br>");
    } else {
      html += chipHtml(seg.type, seg.id, seg.label, seg.token, labelOverrides);
    }
  }
  // Ensure the caret has a place to go after a trailing chip
  if (!html || html.endsWith("</span>")) html += "<br>";
  return html;
}

function serializeEditor(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.dataset.agentMention === "1" && el.dataset.token) {
      out += el.dataset.token;
      return;
    }
    if (el.tagName === "BR") {
      out += "\n";
      return;
    }
    if (el.tagName === "DIV" || el.tagName === "P") {
      // Block boundaries → newlines (except first)
      if (out.length > 0 && !out.endsWith("\n")) out += "\n";
    }
    for (const child of Array.from(el.childNodes)) walk(child);
  };
  for (const child of Array.from(root.childNodes)) walk(child);
  // Trim a single trailing newline from the extra <br>
  return out.replace(/\n$/, "");
}

/** Plain-text offset (serialized) of the caret inside the contenteditable. */
function getSerializedCaretOffset(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  let offset = 0;
  let found = false;

  const walk = (node: Node): void => {
    if (found) return;
    if (node === range.startContainer && node.nodeType === Node.TEXT_NODE) {
      offset += range.startOffset;
      found = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length ?? 0;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.dataset.agentMention === "1" && el.dataset.token) {
      if (el === range.startContainer || el.contains(range.startContainer)) {
        // Caret on/in chip → place after token
        offset += el.dataset.token.length;
        found = true;
        return;
      }
      offset += el.dataset.token.length;
      return;
    }
    if (el.tagName === "BR") {
      if (el === range.startContainer) {
        found = true;
        return;
      }
      offset += 1;
      return;
    }
    for (const child of Array.from(el.childNodes)) {
      walk(child);
      if (found) return;
    }
  };

  for (const child of Array.from(root.childNodes)) {
    walk(child);
    if (found) break;
  }
  return found ? offset : serializeEditor(root).length;
}

function setCaretToEnd(root: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function AgentInstructionEditor({
  value,
  onChange,
  placeholder,
  minHeightClass = "min-h-[200px]",
  id,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeightClass?: string;
  id?: string;
  className?: string;
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const editorRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const queryMetaRef = useRef<{
    start: number;
    end: number;
    type: AgentMentionType | "all";
    query: string;
  } | null>(null);
  const valueRef = useRef(value);
  useLayoutEffect(() => {
    valueRef.current = value;
  }, [value]);
  const skipNextSync = useRef(false);

  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AgentMentionItem[]>([]);
  const [selected, setSelected] = useState(0);
  const [queryMeta, setQueryMeta] = useState<{
    start: number;
    end: number;
    type: AgentMentionType | "all";
    query: string;
  } | null>(null);
  const [focused, setFocused] = useState(false);
  const [labelOverrides, setLabelOverrides] = useState<Record<string, string>>({});
  const renderedLabelOverridesRef = useRef(labelOverrides);

  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Stored tokens freeze the entity's name at the moment they were inserted
  // (or last saved) — resolve current names so chips don't show a doc/task's
  // old title after it's renamed.
  const mentionKeysSignature = extractMentionTokens(value)
    .map((t) => `${t.type}:${t.id}`)
    .filter((k, i, arr) => arr.indexOf(k) === i)
    .sort()
    .join(",");

  useEffect(() => {
    if (!mentionKeysSignature) return;
    let cancelled = false;
    const items = mentionKeysSignature.split(",").map((k) => {
      const [type, id] = k.split(":") as [AgentMentionType, string];
      return { type, id };
    });
    void resolveMentionLabels(items).then((resolved) => {
      if (!cancelled) setLabelOverrides((prev) => ({ ...prev, ...resolved }));
    });
    return () => {
      cancelled = true;
    };
  }, [mentionKeysSignature]);

  // Keep DOM chips in sync when parent sets value (e.g. AI build result) or
  // when label resolution completes.
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el || !hydrated) return;
    const labelsChanged = renderedLabelOverridesRef.current !== labelOverrides;
    if (skipNextSync.current) {
      skipNextSync.current = false;
      if (!labelsChanged) return;
    }
    const current = serializeEditor(el);
    if (current === value && !labelsChanged) return;
    renderedLabelOverridesRef.current = labelOverrides;
    el.innerHTML = valueToHtml(value, labelOverrides);
  }, [value, hydrated, labelOverrides]);

  const refreshMentions = useCallback((text: string, cursor: number) => {
    const det = detectMentionQuery(text, cursor);
    if (!det) {
      setOpen(false);
      setQueryMeta(null);
      queryMetaRef.current = null;
      setItems([]);
      return;
    }
    const meta = {
      start: det.start,
      end: det.end,
      type: det.type,
      query: det.query,
    };
    setQueryMeta(meta);
    queryMetaRef.current = meta;
    setOpen(true);
    startTransition(async () => {
      const rows = await searchAgentMentions(det.query, det.type);
      setItems(rows);
      setSelected(0);
    });
  }, []);

  function emitFromDom() {
    const el = editorRef.current;
    if (!el) return;
    const next = serializeEditor(el);
    valueRef.current = next;
    skipNextSync.current = true;
    onChange(next);
    const caret = getSerializedCaretOffset(el) ?? next.length;
    refreshMentions(next, caret);
  }

  function applyItem(item: AgentMentionItem) {
    const el = editorRef.current;
    const meta = queryMetaRef.current;
    if (!el || !meta) return;

    const text = valueRef.current;
    const token = encodeMentionToken(item);
    const next = `${text.slice(0, meta.start)}${token} ${text.slice(meta.end)}`;
    valueRef.current = next;
    skipNextSync.current = true;
    onChange(next);
    el.innerHTML = valueToHtml(next, labelOverrides);
    setOpen(false);
    setQueryMeta(null);
    queryMetaRef.current = null;
    setItems([]);
    requestAnimationFrame(() => {
      el.focus();
      setCaretToEnd(el);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (open && items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((i) => (i + 1) % items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((i) => (i + items.length - 1) % items.length);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const item = items[selected];
        if (item) applyItem(item);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
    }
  }

  useEffect(() => {
    if (!open) return;
    const close = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (editorRef.current?.contains(t)) return;
      if (popupRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const empty = !value.trim();

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "relative rounded-md border border-input bg-transparent shadow-xs",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
          minHeightClass,
        )}
      >
        {empty && !focused && (
          <div className="pointer-events-none absolute inset-0 px-3 py-2 text-sm text-muted-foreground">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          id={fieldId}
          role="textbox"
          aria-multiline
          contentEditable={hydrated}
          suppressContentEditableWarning
          onInput={emitFromDom}
          onKeyUp={emitFromDom}
          onClick={emitFromDom}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={cn(
            "w-full px-3 py-2 text-sm leading-relaxed outline-none",
            "whitespace-pre-wrap break-words",
            minHeightClass,
          )}
        />
      </div>

      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Tag with <span className="font-medium text-foreground/80">{PREFIX_HINT}</span>
        {queryMeta && open ? (
          <span className="ml-1">
            · filtering <strong>{mentionTypeLabel(queryMeta.type)}</strong>
            {pending ? "…" : ""}
          </span>
        ) : null}
      </p>

      {hydrated && open && (
        <div
          ref={popupRef}
          className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10"
          role="listbox"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="flex flex-wrap gap-1 border-b px-2 py-1.5">
            {(["all", "user", "task", "space", "doc", "folder"] as const).map((t) => (
              <span
                key={t}
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  queryMeta?.type === t
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground",
                )}
              >
                {mentionTypeLabel(t)}
              </span>
            ))}
          </div>
          <div className="max-h-56 overflow-y-auto p-1.5">
            {items.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                {pending ? "Searching…" : "No matches"}
              </p>
            ) : (
              items.map((item, index) => {
                const Icon = TYPE_ICON[item.type];
                const active = index === selected;
                return (
                  <button
                    key={`${item.type}:${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setSelected(index)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      applyItem(item);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                      active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full",
                        active ? "bg-background/40" : "bg-primary/10 text-primary",
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.label}</span>
                      <span
                        className={cn(
                          "block truncate text-[11px]",
                          active ? "text-accent-foreground/70" : "text-muted-foreground",
                        )}
                      >
                        {item.subtitle ?? item.type}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold uppercase text-muted-foreground">
                      {item.type}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
