/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

/**
 * All Docs hub — Drive-style folders with list/icons views + drag-and-drop
 * (same interaction model as task attachment browser).
 */

import {
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  LayoutGrid,
  Link2,
  List,
  Lock,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type DragEvent,
} from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  createDocFolder,
  deleteDocFolder,
  listDocFoldersForMove,
  moveDocFolder,
  moveDocToFolder,
  renameDocFolder,
} from "@/modules/docs/actions/folders";
import { pagePath } from "@/modules/docs/lib/constants";
import type { DocFolderListItem, DocPageListItem } from "@/modules/docs/queries";
import { CreatePageDialog } from "./create-page-dialog";

type SortKey = "updated" | "name" | "location";
type ViewMode = "list" | "grid";

const VIEW_STORAGE_KEY = "aitim.docs.hub.view";
/** Custom types (Chrome) + text/plain prefixes (Safari / Firefox reliability). */
const MIME_DOC = "application/x-aitim-doc-page";
const MIME_FOLDER = "application/x-aitim-doc-folder";
const PREFIX_DOC = "aitim-doc:";
const PREFIX_FOLDER = "aitim-folder:";

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (startToday.getTime() - startThat.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7 && diffDays > 1)
    return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const TEMPLATE_CARDS = [
  {
    id: "project" as const,
    template: "blank" as const,
    kind: "page" as const,
    title: "Project Overview",
    description: "Summarize goals, scope, and milestones",
    accent: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  },
  {
    id: "meeting" as const,
    template: "meeting" as const,
    kind: "page" as const,
    title: "Meeting Notes",
    description: "Capture an agenda, notes, and action items",
    accent: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
  {
    id: "wiki" as const,
    template: "sop" as const,
    kind: "wiki" as const,
    title: "Wiki",
    description: "Organize information in one place",
    accent: "bg-brand-orange/10 text-brand-orange dark:bg-brand-orange/20",
  },
];

function FolderIcon({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <Folder
      className={cn(
        "shrink-0 fill-amber-400/85 text-amber-500",
        size === "lg" ? "size-12" : "size-4",
      )}
      strokeWidth={size === "lg" ? 1.25 : 2}
    />
  );
}

function ItemMenu({
  items,
}: {
  items: {
    label: string;
    destructive?: boolean;
    onSelect: () => void;
    disabled?: boolean;
  }[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-7 shrink-0 p-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
          aria-label="More actions"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            disabled={item.disabled}
            className={cn(
              item.destructive && "text-destructive focus:text-destructive",
            )}
            onSelect={() => item.onSelect()}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DocsHubClient({
  initialPages,
  initialFolders,
  breadcrumbs,
  currentFolderId,
  currentFolderSpaceId,
  spaces,
}: {
  initialPages: DocPageListItem[];
  initialFolders: DocFolderListItem[];
  breadcrumbs: { id: string; name: string }[];
  currentFolderId: string | null;
  currentFolderSpaceId?: string | null;
  spaces: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [view, setView] = useState<ViewMode>("list");
  const [showTemplates, setShowTemplates] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [presetTemplate, setPresetTemplate] = useState<
    "blank" | "sop" | "meeting" | "decision" | undefined
  >();
  const [presetKind, setPresetKind] = useState<"page" | "wiki" | undefined>();

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderSpaceId, setFolderSpaceId] = useState(spaces[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [dropTargetId, setDropTargetId] = useState<string | "current" | "root" | null>(
    null,
  );
  const [surfaceDragOver, setSurfaceDragOver] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [moving, setMoving] = useState<
    | { kind: "doc"; pageId: string; title: string; homeSpaceId: string }
    | { kind: "folder"; folderId: string; title: string; homeSpaceId: string }
    | null
  >(null);
  const [moveTargets, setMoveTargets] = useState<
    {
      id: string;
      name: string;
      parentFolderId: string | null;
      homeSpaceId?: string;
      spaceName?: string;
    }[]
  >([]);
  const [moveDest, setMoveDest] = useState<string>("__root__");

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
        if (saved === "list" || saved === "grid") setView(saved);
      } catch {
        // ignore
      }
    });
  }, []);

  function setViewPersist(next: ViewMode) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  const searching = q.trim().length > 0;

  const folders = useMemo(() => {
    let list = [...initialFolders];
    const query = q.trim().toLowerCase();
    if (query) list = list.filter((f) => f.name.toLowerCase().includes(query));
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [initialFolders, q]);

  const pages = useMemo(() => {
    let list = [...initialPages];
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.spaceName.toLowerCase().includes(query),
      );
    }
    list.sort((a, b) => {
      if (sort === "name") return a.title.localeCompare(b.title);
      if (sort === "location") return a.spaceName.localeCompare(b.spaceName);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return list;
  }, [initialPages, q, sort]);

  const isEmpty = folders.length === 0 && pages.length === 0;

  function openCreate(
    template?: "blank" | "sop" | "meeting" | "decision",
    kind?: "page" | "wiki",
  ) {
    setPresetTemplate(template);
    setPresetKind(kind);
    setCreateOpen(true);
  }

  function goFolder(id: string | null) {
    setSelectedId(null);
    if (id) router.push(`/docs?folder=${id}`);
    else router.push("/docs");
  }

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function submitNewFolder() {
    if (!newFolderName.trim() || !folderSpaceId) {
      toast.error("Name and space are required");
      return;
    }
    run(async () => {
      await createDocFolder({
        name: newFolderName.trim(),
        homeSpaceId: folderSpaceId,
        parentFolderId: currentFolderId,
      });
      toast.success("Folder created");
      setCreatingFolder(false);
      setNewFolderName("");
    });
  }

  // ── Drag & drop ──────────────────────────────────────────────

  function onDragStartDoc(e: DragEvent, pageId: string) {
    e.stopPropagation();
    e.dataTransfer.setData(MIME_DOC, pageId);
    e.dataTransfer.setData("text/plain", `${PREFIX_DOC}${pageId}`);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragStartFolder(e: DragEvent, folderId: string) {
    e.stopPropagation();
    e.dataTransfer.setData(MIME_FOLDER, folderId);
    e.dataTransfer.setData("text/plain", `${PREFIX_FOLDER}${folderId}`);
    e.dataTransfer.effectAllowed = "move";
  }

  function isOurDrag(e: DragEvent) {
    const types = Array.from(e.dataTransfer.types);
    // text/plain is always listed during dragover; custom types may not be.
    return (
      types.includes(MIME_DOC) ||
      types.includes(MIME_FOLDER) ||
      types.includes("text/plain") ||
      types.includes("Text")
    );
  }

  function acceptDropTarget(e: DragEvent, target: string | "current" | "root") {
    if (!isOurDrag(e)) return false;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(target);
    return true;
  }

  function readDragPayload(e: DragEvent): {
    pageId?: string;
    folderId?: string;
  } {
    const doc =
      e.dataTransfer.getData(MIME_DOC) ||
      (() => {
        const t = e.dataTransfer.getData("text/plain") || "";
        return t.startsWith(PREFIX_DOC) ? t.slice(PREFIX_DOC.length) : "";
      })();
    const folder =
      e.dataTransfer.getData(MIME_FOLDER) ||
      (() => {
        const t = e.dataTransfer.getData("text/plain") || "";
        return t.startsWith(PREFIX_FOLDER) ? t.slice(PREFIX_FOLDER.length) : "";
      })();
    return {
      pageId: doc || undefined,
      folderId: folder || undefined,
    };
  }

  async function handleDropOn(e: DragEvent, targetFolderId: string | null) {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetId(null);
    setSurfaceDragOver(false);

    const { pageId, folderId } = readDragPayload(e);

    if (pageId) {
      run(async () => {
        await moveDocToFolder({ pageId, folderId: targetFolderId });
        toast.success(
          targetFolderId ? "Doc moved into folder" : "Doc moved to All Docs",
        );
      });
      return;
    }

    if (folderId) {
      if (targetFolderId === folderId) return;
      run(async () => {
        await moveDocFolder({ folderId, parentFolderId: targetFolderId });
        toast.success(
          targetFolderId ? "Folder moved" : "Folder moved to All Docs",
        );
      });
    }
  }

  // ── Move dialog (fallback) ───────────────────────────────────

  function openMoveDoc(p: DocPageListItem) {
    setMoving({
      kind: "doc",
      pageId: p.id,
      title: p.title,
      homeSpaceId: p.homeSpaceId,
    });
    setMoveDest(p.folderId ?? "__root__");
    startTransition(async () => {
      try {
        // All accessible folders (any space) so moves between locations work.
        setMoveTargets(await listDocFoldersForMove());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not load folders");
        setMoveTargets([]);
      }
    });
  }

  function openMoveFolder(f: DocFolderListItem) {
    setMoving({
      kind: "folder",
      folderId: f.id,
      title: f.name,
      homeSpaceId: f.homeSpaceId,
    });
    setMoveDest(f.parentFolderId ?? "__root__");
    startTransition(async () => {
      try {
        // Folders stay within the same space (parent must match space).
        const rows = await listDocFoldersForMove(f.homeSpaceId);
        setMoveTargets(rows.filter((r) => r.id !== f.id));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not load folders");
        setMoveTargets([]);
      }
    });
  }

  function confirmMove() {
    if (!moving) return;
    const dest = moveDest === "__root__" ? null : moveDest;
    run(async () => {
      if (moving.kind === "doc") {
        await moveDocToFolder({ pageId: moving.pageId, folderId: dest });
        toast.success("Doc moved");
      } else {
        await moveDocFolder({ folderId: moving.folderId, parentFolderId: dest });
        toast.success("Folder moved");
      }
      setMoving(null);
    });
  }

  function confirmRename() {
    if (!renaming?.name.trim()) return;
    run(async () => {
      await renameDocFolder({
        folderId: renaming.id,
        name: renaming.name.trim(),
      });
      toast.success("Folder renamed");
      setRenaming(null);
    });
  }

  function confirmDeleteFolder(folderId: string, name: string) {
    if (!window.confirm(`Delete folder “${name}”? Contents move up one level.`))
      return;
    run(async () => {
      await deleteDocFolder(folderId);
      toast.success("Folder deleted");
    });
  }

  const moveOptions = useMemo(() => {
    // Group by space so cross-space destinations are clear.
    const bySpace = new Map<string, typeof moveTargets>();
    for (const t of moveTargets) {
      const key = t.homeSpaceId ?? "_";
      const list = bySpace.get(key) ?? [];
      list.push(t);
      bySpace.set(key, list);
    }
    const out: { id: string; label: string }[] = [];
    for (const [, spaceFolders] of bySpace) {
      const spaceLabel = spaceFolders[0]?.spaceName;
      const byParent = new Map<string | null, typeof moveTargets>();
      for (const t of spaceFolders) {
        const list = byParent.get(t.parentFolderId) ?? [];
        list.push(t);
        byParent.set(t.parentFolderId, list);
      }
      function walk(parentId: string | null, depth: number) {
        const kids = (byParent.get(parentId) ?? [])
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name));
        for (const k of kids) {
          const prefix = spaceLabel && depth === 0 ? `${spaceLabel} · ` : "";
          out.push({
            id: k.id,
            label: `${prefix}${"·· ".repeat(depth)}${k.name}`,
          });
          walk(k.id, depth + 1);
        }
      }
      walk(null, 0);
    }
    return out;
  }, [moveTargets]);

  // ── Row / tile components ────────────────────────────────────

  function FolderTile({ folder }: { folder: DocFolderListItem }) {
    const isDrop = dropTargetId === folder.id;
    const isSelected = selectedId === `folder:${folder.id}`;

    return (
      <div
        role="button"
        tabIndex={0}
        draggable
        onDragStart={(e) => onDragStartFolder(e, folder.id)}
        onDragOver={(e) => acceptDropTarget(e, folder.id)}
        onDragLeave={() =>
          setDropTargetId((cur) => (cur === folder.id ? null : cur))
        }
        onDrop={(e) => void handleDropOn(e, folder.id)}
        onClick={() => setSelectedId(`folder:${folder.id}`)}
        onDoubleClick={() => goFolder(folder.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter") goFolder(folder.id);
        }}
        className={cn(
          "group relative flex flex-col items-center gap-2 rounded-2xl border bg-card p-3 text-center transition-all",
          "cursor-grab select-none hover:bg-muted/50 hover:shadow-sm active:cursor-grabbing",
          isSelected && "border-primary/50 bg-primary/5 ring-2 ring-primary/20",
          isDrop && "border-primary bg-primary/10 ring-2 ring-primary/40",
          !isSelected && !isDrop && "border-border/80",
        )}
      >
        <div className="absolute right-1.5 top-1.5">
          <ItemMenu
            items={[
              { label: "Open", onSelect: () => goFolder(folder.id) },
              {
                label: "Rename",
                onSelect: () => setRenaming({ id: folder.id, name: folder.name }),
              },
              { label: "Move to…", onSelect: () => openMoveFolder(folder) },
              {
                label: "Delete folder",
                destructive: true,
                onSelect: () => confirmDeleteFolder(folder.id, folder.name),
              },
            ]}
          />
        </div>
        <FolderIcon size="lg" />
        <span className="line-clamp-2 w-full wrap-break-word text-xs font-medium leading-snug">
          {folder.name}
        </span>
        {folder.itemCount > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {folder.itemCount} item{folder.itemCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
    );
  }

  function DocTile({ page }: { page: DocPageListItem }) {
    const isSelected = selectedId === `doc:${page.id}`;
    const href = pagePath(page.id, page.slug);

    return (
      <div
        role="button"
        tabIndex={0}
        draggable
        onDragStart={(e) => onDragStartDoc(e, page.id)}
        onClick={() => setSelectedId(`doc:${page.id}`)}
        onDoubleClick={() => router.push(href)}
        onKeyDown={(e) => {
          if (e.key === "Enter") router.push(href);
        }}
        className={cn(
          "group relative flex flex-col items-center gap-2 rounded-2xl border bg-card p-3 text-center transition-all",
          "cursor-grab select-none hover:bg-muted/50 hover:shadow-sm active:cursor-grabbing",
          isSelected && "border-primary/50 bg-primary/5 ring-2 ring-primary/20",
          !isSelected && "border-border/80",
        )}
      >
        <div className="absolute right-1.5 top-1.5">
          <ItemMenu
            items={[
              { label: "Open", onSelect: () => router.push(href) },
              { label: "Move to folder…", onSelect: () => openMoveDoc(page) },
            ]}
          />
        </div>
        <span className="flex size-12 items-center justify-center rounded-xl bg-sky-500/10">
          <FileText className="size-6 text-sky-600 dark:text-sky-400" strokeWidth={1.5} />
        </span>
        <div className="w-full min-w-0">
          <div
            className="line-clamp-2 wrap-break-word text-xs font-medium leading-snug"
            title={page.title}
          >
            {page.title || "Untitled"}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {page.spaceName}
          </div>
        </div>
      </div>
    );
  }

  function FolderListRow({ folder }: { folder: DocFolderListItem }) {
    const isDrop = dropTargetId === folder.id;

    return (
      <li
        draggable
        onDragStart={(e) => onDragStartFolder(e, folder.id)}
        onDragOver={(e) => acceptDropTarget(e, folder.id)}
        onDragLeave={() =>
          setDropTargetId((cur) => (cur === folder.id ? null : cur))
        }
        onDrop={(e) => void handleDropOn(e, folder.id)}
        className={cn(
          "group flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm transition-colors",
          "cursor-grab select-none active:cursor-grabbing",
          isDrop
            ? "border-primary bg-primary/10 ring-1 ring-primary/30"
            : "border-transparent hover:border-border hover:bg-muted/40",
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          draggable={false}
          onClick={() => goFolder(folder.id)}
        >
          <FolderIcon size="sm" />
          <span className="min-w-0 flex-1 truncate font-medium">{folder.name}</span>
          {folder.itemCount > 0 && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {folder.itemCount}
            </span>
          )}
        </button>
        <span className="hidden w-28 shrink-0 truncate text-xs text-muted-foreground sm:block">
          {folder.spaceName}
        </span>
        <span className="hidden w-20 shrink-0 text-xs text-muted-foreground sm:block">
          {formatRelativeDate(folder.updatedAt)}
        </span>
        <ItemMenu
          items={[
            { label: "Open", onSelect: () => goFolder(folder.id) },
            {
              label: "Rename",
              onSelect: () => setRenaming({ id: folder.id, name: folder.name }),
            },
            { label: "Move to…", onSelect: () => openMoveFolder(folder) },
            {
              label: "Delete folder",
              destructive: true,
              onSelect: () => confirmDeleteFolder(folder.id, folder.name),
            },
          ]}
        />
      </li>
    );
  }

  function DocListRow({ page }: { page: DocPageListItem }) {
    const href = pagePath(page.id, page.slug);

    return (
      <li
        draggable
        onDragStart={(e) => onDragStartDoc(e, page.id)}
        className={cn(
          "group flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sm transition-colors",
          "cursor-grab select-none hover:border-border hover:bg-muted/40 active:cursor-grabbing",
        )}
      >
        <Link
          href={href}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className="flex min-w-0 flex-1 items-center gap-2"
          onClick={(e) => {
            // Allow click to open; drag uses the row's draggable.
            if (e.defaultPrevented) e.preventDefault();
          }}
        >
          <FileText className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate font-medium">
            {page.title || "Untitled"}
          </span>
          {page.kind === "wiki" && (
            <span className="shrink-0 rounded bg-brand-orange/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-orange dark:bg-brand-orange/20">
              Wiki
            </span>
          )}
          {page.isProtected && (
            <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Protected" />
          )}
          {page.linkCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
              <Link2 className="size-3" />
              {page.linkCount}
            </span>
          )}
          {page.childCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              <FileText className="size-3" />
              {page.childCount}
            </span>
          )}
        </Link>
        <span className="hidden w-28 shrink-0 truncate text-xs text-muted-foreground sm:block">
          {page.spaceName}
        </span>
        <span className="hidden w-20 shrink-0 text-xs text-muted-foreground sm:block">
          {formatRelativeDate(page.updatedAt)}
        </span>
        <span className="hidden w-8 shrink-0 sm:block">
          {page.ownerId ? (
            <UserAvatar
              userId={page.ownerId}
              name={page.ownerName ?? "Owner"}
              hasPhoto={!!page.ownerPhotoKey}
              photoVersion={page.ownerPhotoKey}
              className="size-6"
            />
          ) : null}
        </span>
        <ItemMenu
          items={[
            { label: "Open", onSelect: () => router.push(href) },
            { label: "Move to folder…", onSelect: () => openMoveDoc(page) },
          ]}
        />
      </li>
    );
  }

  function crumbDropProps(target: "root" | string) {
    const folderId = target === "root" ? null : target;
    return {
      onDragOver: (e: DragEvent) => {
        if (acceptDropTarget(e, target)) e.preventDefault();
      },
      onDragLeave: () =>
        setDropTargetId((cur) => (cur === target ? null : cur)),
      onDrop: (e: DragEvent) => void handleDropOn(e, folderId),
    };
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">All Docs</h1>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              setCreatingFolder(true);
              setFolderSpaceId(
                currentFolderSpaceId ??
                  pages[0]?.homeSpaceId ??
                  folders[0]?.homeSpaceId ??
                  spaces[0]?.id ??
                  "",
              );
            }}
          >
            <FolderPlus className="size-3.5" />
            New folder
          </Button>
          <Button
            type="button"
            className="gap-1.5"
            onClick={() => openCreate("blank", "page")}
          >
            <Plus className="size-3.5" />
            New Doc
          </Button>
        </div>
      </div>

      {/* Templates — root only */}
      {!currentFolderId && !searching && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Templates
            </span>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setShowTemplates((v) => !v)}
            >
              {showTemplates ? "Hide" : "Show"}
            </button>
          </div>
          {showTemplates && (
            <div className="grid gap-3 sm:grid-cols-3">
              {TEMPLATE_CARDS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openCreate(t.template, t.kind)}
                  className="flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                      t.accent,
                    )}
                  >
                    {t.id === "wiki" ? "W" : t.id === "meeting" ? "M" : "P"}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{t.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Breadcrumbs — droppable path segments */}
      <nav aria-label="Folder path" className="flex flex-wrap items-center gap-0.5 text-sm">
        <button
          type="button"
          onClick={() => goFolder(null)}
          {...crumbDropProps("root")}
          className={cn(
            "rounded-md px-2 py-1 font-medium transition-colors hover:bg-muted",
            dropTargetId === "root" && "bg-primary/10 text-primary ring-1 ring-primary/40",
            currentFolderId === null && !searching && dropTargetId !== "root"
              ? "text-foreground"
              : dropTargetId !== "root" && "text-muted-foreground",
          )}
        >
          All Docs
        </button>
        {breadcrumbs.map((crumb) => (
          <span key={crumb.id} className="flex items-center gap-0.5">
            <ChevronRight className="size-3.5 text-muted-foreground/60" />
            <button
              type="button"
              onClick={() => goFolder(crumb.id)}
              {...crumbDropProps(crumb.id)}
              className={cn(
                "rounded-md px-2 py-1 font-medium transition-colors hover:bg-muted",
                dropTargetId === crumb.id &&
                  "bg-primary/10 text-primary ring-1 ring-primary/40",
                currentFolderId === crumb.id &&
                  !searching &&
                  dropTargetId !== crumb.id
                  ? "text-foreground"
                  : dropTargetId !== crumb.id && "text-muted-foreground",
              )}
            >
              {crumb.name}
            </button>
          </span>
        ))}
        {searching && (
          <span className="flex items-center gap-0.5">
            <ChevronRight className="size-3.5 text-muted-foreground/60" />
            <span className="px-2 py-1 text-muted-foreground">Search</span>
          </span>
        )}
      </nav>

      {/* New folder form */}
      {creatingFolder && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
          <div className="min-w-[12rem] flex-1 space-y-1">
            <Label htmlFor="new-doc-folder">Folder name</Label>
            <Input
              id="new-doc-folder"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. SOPs, Onboarding"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setCreatingFolder(false);
                  setNewFolderName("");
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitNewFolder();
                }
              }}
            />
          </div>
          {!currentFolderId && spaces.length > 1 && (
            <div className="w-44 space-y-1">
              <Label>Space</Label>
              <Select value={folderSpaceId} onValueChange={setFolderSpaceId}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {spaces.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button
            type="button"
            size="sm"
            disabled={pending || !newFolderName.trim()}
            onClick={() => submitNewFolder()}
          >
            Create
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setCreatingFolder(false);
              setNewFolderName("");
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Toolbar: search + sort + view toggle */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search docs & folders"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {(
            [
              { id: "updated" as const, label: "Date updated" },
              { id: "name" as const, label: "Name" },
              { id: "location" as const, label: "Location" },
            ] as const
          ).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSort(s.id)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                sort === s.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-0.5 rounded-lg border p-0.5">
          <button
            type="button"
            onClick={() => setViewPersist("list")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              view === "list"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-pressed={view === "list"}
            title="List view"
          >
            <List className="size-3.5" />
            List
          </button>
          <button
            type="button"
            onClick={() => setViewPersist("grid")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              view === "grid"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-pressed={view === "grid"}
            title="Icons view"
          >
            <LayoutGrid className="size-3.5" />
            Icons
          </button>
        </div>
      </div>

      {/* Content surface — drop here to move into current folder */}
      <div
        className={cn(
          "min-h-40 rounded-xl border border-dashed p-3 transition-colors",
          surfaceDragOver || dropTargetId === "current"
            ? "border-primary bg-primary/5 ring-2 ring-primary/25"
            : "border-border bg-muted/10",
        )}
        onDragOver={(e) => {
          if (isOurDrag(e)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setSurfaceDragOver(true);
            setDropTargetId("current");
          }
        }}
        onDragLeave={() => {
          setSurfaceDragOver(false);
          setDropTargetId((cur) => (cur === "current" ? null : cur));
        }}
        onDrop={(e) => void handleDropOn(e, currentFolderId)}
      >
        {!searching && (
          <p className="mb-3 text-xs text-muted-foreground">
            Drag docs or folders onto a folder (or breadcrumb) to move them
          </p>
        )}

        {isEmpty ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Folder
              className="size-10 text-muted-foreground/40"
              strokeWidth={1.25}
            />
            <p className="text-sm font-medium text-foreground">
              {searching ? "No matches" : "This folder is empty"}
            </p>
            <p className="max-w-sm text-xs">
              {searching
                ? "Try a different search."
                : "Create a folder or doc, or drop items here from elsewhere."}
            </p>
            {!searching && (
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setCreatingFolder(true)}
                >
                  <FolderPlus className="size-3.5" />
                  New folder
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => openCreate("blank")}
                >
                  <Plus className="size-3.5" />
                  New Doc
                </Button>
              </div>
            )}
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {folders.map((f) => (
              <FolderTile key={f.id} folder={f} />
            ))}
            {pages.map((p) => (
              <DocTile key={p.id} page={p} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col">
            {/* List column headers */}
            <div className="mb-1 hidden items-center gap-2 px-2 text-[11px] font-medium text-muted-foreground sm:flex">
              <span className="min-w-0 flex-1">Name</span>
              <span className="w-28 shrink-0">Location</span>
              <span className="w-20 shrink-0">Updated</span>
              <span className="w-8 shrink-0" />
              <span className="w-7 shrink-0" />
            </div>
            <ul className="flex flex-col gap-0.5">
              {folders.map((f) => (
                <FolderListRow key={f.id} folder={f} />
              ))}
              {pages.map((p) => (
                <DocListRow key={p.id} page={p} />
              ))}
            </ul>
          </div>
        )}
      </div>

      <CreatePageDialog
        spaces={spaces}
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) {
            setPresetTemplate(undefined);
            setPresetKind(undefined);
          }
        }}
        defaultTemplate={presetTemplate}
        defaultKind={presetKind}
        folderId={currentFolderId}
        defaultSpaceId={
          currentFolderSpaceId ??
          pages[0]?.homeSpaceId ??
          folders[0]?.homeSpaceId ??
          spaces[0]?.id
        }
      />

      {/* Rename */}
      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
            <DialogDescription>Update the folder display name.</DialogDescription>
          </DialogHeader>
          <Input
            value={renaming?.name ?? ""}
            onChange={(e) =>
              setRenaming((r) => (r ? { ...r, name: e.target.value } : r))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmRename();
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button disabled={pending} onClick={() => confirmRename()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move dialog fallback */}
      <Dialog open={!!moving} onOpenChange={(o) => !o && setMoving(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Move {moving?.kind === "folder" ? "folder" : "doc"}
            </DialogTitle>
            <DialogDescription>
              Choose a destination for{" "}
              <span className="font-medium text-foreground">
                {moving?.title || "Untitled"}
              </span>
              . Drag onto a folder also works.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Destination</Label>
            <Select value={moveDest} onValueChange={setMoveDest}>
              <SelectTrigger>
                <SelectValue placeholder="Select folder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__root__">All Docs (root)</SelectItem>
                {moveOptions.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    No folders yet — create one first
                  </SelectItem>
                ) : (
                  moveOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {moving?.kind === "doc" && moveOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Create a folder with <span className="font-medium">New folder</span>, then
                move this doc into it.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoving(null)}>
              Cancel
            </Button>
            <Button disabled={pending} onClick={() => confirmMove()}>
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
