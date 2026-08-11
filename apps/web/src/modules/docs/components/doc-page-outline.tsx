/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

/**
 * Pages rail — nested document tree with drag-and-drop:
 * - Top of row    → reorder before (same indent)
 * - Middle of row → nest as subpage (indented ghost)
 * - Bottom of row → reorder after; on the last child, drag left / lower
 *   outdents to parent level (subpage → page)
 * - Footer zone   → append as top-level page
 */

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  CopyPlus,
  ExternalLink,
  FileText,
  FolderInput,
  GripVertical,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MutableRefObject,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  duplicateDocPage,
  listDocTransferTargets,
  moveDocPage,
  trashPage,
  transferDocPage,
  updatePageMeta,
} from "@/modules/docs/actions/pages";
import { pagePath } from "@/modules/docs/lib/constants";
import type { DocOutlineNode } from "@/modules/docs/queries";
import { CreatePageDialog } from "./create-page-dialog";

type DropZone = "before" | "into" | "after" | "end";

type DropIntent = {
  targetId: string;
  zone: DropZone;
  /** Parent after drop (null = top-level peer). */
  parentPageId: string | null;
  /** Place before this sibling; null = append at end of parent. */
  beforePageId: string | null;
  /** Indent for the floating ghost + drop line. */
  previewDepth: number;
  /** True when leaving a parent (subpage → page). */
  promote: boolean;
};

type FlatMeta = {
  id: string;
  depth: number;
  parentId: string | null;
  nextSiblingId: string | null;
};

type DocTransferTarget = Awaited<
  ReturnType<typeof listDocTransferTargets>
>[number];

function collectDescendantIds(node: DocOutlineNode): Set<string> {
  const ids = new Set<string>([node.id]);
  for (const c of node.children) {
    for (const id of collectDescendantIds(c)) ids.add(id);
  }
  return ids;
}

function findNode(nodes: DocOutlineNode[], id: string): DocOutlineNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const c = findNode(n.children, id);
    if (c) return c;
  }
  return null;
}

function buildFlatMeta(
  nodes: DocOutlineNode[],
  parentId: string | null = null,
  depth = 0,
  out: Map<string, FlatMeta> = new Map(),
): Map<string, FlatMeta> {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    out.set(n.id, {
      id: n.id,
      depth,
      parentId,
      nextSiblingId: nodes[i + 1]?.id ?? null,
    });
    if (n.children.length) buildFlatMeta(n.children, n.id, depth + 1, out);
  }
  return out;
}

const outlineCollision: CollisionDetection = (args) => {
  const filtered = {
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => {
      const id = String(c.id);
      return id.startsWith("docoutline-row:") || id === "docoutline-list-end";
    }),
  };
  return closestCenter(filtered);
};

function zoneFromPointer(
  clientY: number,
  rect: { top: number; height: number },
): "before" | "into" | "after" {
  const y = clientY - rect.top;
  const h = Math.max(rect.height, 1);
  const ratio = y / h;
  if (ratio < 0.28) return "before";
  if (ratio > 0.62) return "after";
  return "into";
}

function indentPx(depth: number) {
  return 8 + Math.min(depth, 8) * 12;
}

/**
 * After-drop candidates for a row, deepest first then outdents (shallower).
 * Last child of a parent can promote to sibling of that parent, etc.
 */
function afterCandidates(
  meta: FlatMeta,
  activeId: string,
  flatMeta: Map<string, FlatMeta>,
): DropIntent[] {
  const out: DropIntent[] = [];

  // Same-level after (skip no-op: after yourself with nothing after you)
  const sameLevelNoop = meta.id === activeId && meta.nextSiblingId === null;
  if (!sameLevelNoop) {
    out.push({
      targetId: meta.id,
      zone: "after",
      parentPageId: meta.parentId,
      beforePageId: meta.nextSiblingId,
      previewDepth: meta.depth,
      promote: false,
    });
  }

  // Outdent chain when this is the last sibling (or you're the last item dragging on yourself).
  // Walk parents so a nested page can become a top-level peer.
  if (meta.nextSiblingId === null) {
    let cursor: FlatMeta | undefined = meta;
    // When hovering another last-child row, still walk from that row's parent chain.
    // When hovering self, walk from self's parents.
    while (cursor?.parentId) {
      const parent = flatMeta.get(cursor.parentId);
      if (!parent) break;
      // Become sibling of `parent`, placed after it
      out.push({
        targetId: meta.id,
        zone: "after",
        parentPageId: parent.parentId,
        beforePageId: parent.nextSiblingId,
        previewDepth: parent.depth,
        promote: true,
      });
      cursor = parent;
    }
  } else if (meta.id === activeId) {
    // Dragging self with siblings after: still allow outdent via parent chain
    let cursor: FlatMeta | undefined = meta;
    while (cursor?.parentId) {
      const parent = flatMeta.get(cursor.parentId);
      if (!parent) break;
      out.push({
        targetId: meta.id,
        zone: "after",
        parentPageId: parent.parentId,
        beforePageId: parent.nextSiblingId,
        previewDepth: parent.depth,
        promote: true,
      });
      cursor = parent;
    }
  }

  return out;
}

function pickByIndent(candidates: DropIntent[], clientX: number, listLeft: number): DropIntent {
  if (candidates.length === 1) return candidates[0]!;
  // Prefer the candidate whose indent is closest to the pointer X.
  let best = candidates[0]!;
  let bestDist = Infinity;
  for (const c of candidates) {
    const ideal = listLeft + indentPx(c.previewDepth) + 24;
    const dist = Math.abs(clientX - ideal);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

function intentForRow(
  meta: FlatMeta,
  zone: "before" | "into" | "after",
  activeId: string,
  descendants: Set<string> | undefined,
  flatMeta: Map<string, FlatMeta>,
  clientX: number,
  listLeft: number,
): DropIntent | null {
  // Cannot nest into self or own descendants
  if (zone === "into") {
    if (meta.id === activeId) return null;
    if (descendants?.has(meta.id)) return null;
    return {
      targetId: meta.id,
      zone: "into",
      parentPageId: meta.id,
      beforePageId: null,
      previewDepth: meta.depth + 1,
      promote: false,
    };
  }

  if (zone === "before") {
    if (meta.id === activeId) return null;
    if (descendants?.has(meta.id)) return null;
    return {
      targetId: meta.id,
      zone: "before",
      parentPageId: meta.parentId,
      beforePageId: meta.id,
      previewDepth: meta.depth,
      promote: false,
    };
  }

  // after — allow self (for outdent on last nested item)
  if (meta.id !== activeId && descendants?.has(meta.id)) return null;

  const candidates = afterCandidates(meta, activeId, flatMeta);
  if (candidates.length === 0) return null;
  return pickByIndent(candidates, clientX, listLeft);
}

function DropLine({ depth }: { depth: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-1 z-30 flex items-center"
      style={{ paddingLeft: indentPx(depth) }}
      aria-hidden
    >
      <span className="relative flex h-0 w-full items-center">
        <span className="absolute -left-1 size-2 rounded-full bg-sky-500 shadow-[0_0_0_3px] shadow-sky-500/30" />
        <span className="h-0.5 w-full rounded-full bg-sky-500 shadow-[0_0_10px] shadow-sky-500/45" />
      </span>
    </div>
  );
}

function ListEndDrop({
  active,
  dragging,
}: {
  active: boolean;
  dragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: "docoutline-list-end",
    data: { kind: "list-end" },
  });
  const show = dragging && (active || isOver);
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative mt-0.5 min-h-6 rounded-md border border-dashed transition-colors",
        show
          ? "border-sky-500/50 bg-sky-500/5"
          : dragging
            ? "border-border/60 bg-transparent"
            : "border-transparent",
      )}
    >
      {show && (
        <div className="absolute inset-x-1 top-1/2 -translate-y-1/2">
          <DropLine depth={0} />
        </div>
      )}
      {dragging && (
        <p
          className={cn(
            "px-2 py-1 text-[10px] font-medium",
            show ? "text-sky-700 dark:text-sky-300" : "text-muted-foreground/70",
          )}
        >
          Drop here as a top-level page
        </p>
      )}
    </div>
  );
}

function TreePageRow({
  node,
  depth,
  parentId,
  nextSiblingId,
  activePageId,
  canDrag,
  dragging,
  intent,
  rowEls,
  collapsed,
  toggleCollapsed,
  canManage,
  onAddSubpage,
  onRename,
  onCopyLink,
  onDuplicate,
  onTransfer,
  onDelete,
}: {
  node: DocOutlineNode;
  depth: number;
  parentId: string | null;
  nextSiblingId: string | null;
  activePageId: string;
  canDrag: boolean;
  dragging: boolean;
  intent: DropIntent | null;
  rowEls: MutableRefObject<Map<string, HTMLElement>>;
  collapsed: Set<string>;
  toggleCollapsed: (id: string) => void;
  canManage: boolean;
  onAddSubpage: (node: DocOutlineNode) => void;
  onRename: (node: DocOutlineNode) => void;
  onCopyLink: (node: DocOutlineNode) => void;
  onDuplicate: (node: DocOutlineNode) => void;
  onTransfer: (node: DocOutlineNode) => void;
  onDelete: (node: DocOutlineNode) => void;
}) {
  const hasChildren = node.children.length > 0;
  const open = !collapsed.has(node.id);
  const active = node.id === activePageId;
  const href = pagePath(node.id, node.slug);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `docoutline:${node.id}`,
    disabled: !canDrag,
    data: { pageId: node.id, depth, title: node.title },
  });

  const { setNodeRef: setDropRef } = useDroppable({
    id: `docoutline-row:${node.id}`,
    data: {
      pageId: node.id,
      meta: {
        id: node.id,
        depth,
        parentId,
        nextSiblingId,
      } satisfies FlatMeta,
    },
    disabled: !canDrag,
  });

  const setRefs = (el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
    if (el) rowEls.current.set(node.id, el);
    else rowEls.current.delete(node.id);
  };

  const isTarget = intent?.targetId === node.id;
  const showBefore = isTarget && intent.zone === "before";
  const showInto = isTarget && intent.zone === "into";
  // When outdent line is drawn, use previewDepth (may be shallower than row)
  const lineDepth = intent && isTarget ? intent.previewDepth : depth;
  const showAfterLine = isTarget && intent.zone === "after";

  return (
    <div className={cn(isDragging && "opacity-30")}>
      <div
        ref={setRefs}
        className={cn(
          "group relative flex min-h-7 items-center gap-0 rounded-md transition-[background,box-shadow] duration-100",
          canDrag && "cursor-grab active:cursor-grabbing",
          active && !showInto && "bg-muted",
          showInto &&
            "bg-sky-500/[0.12] shadow-[inset_0_0_0_1.5px] shadow-sky-500/50",
        )}
        style={{
          paddingLeft: indentPx(depth),
          ...(canDrag ? { touchAction: "none", userSelect: "none" } : null),
        }}
        {...(canDrag ? { ...listeners, ...attributes } : {})}
      >
        {showBefore && (
          <div className="absolute inset-x-0 top-0 z-30 -translate-y-1/2">
            <DropLine depth={lineDepth} />
          </div>
        )}
        {showAfterLine && (
          <div className="absolute inset-x-0 bottom-0 z-30 translate-y-1/2">
            <DropLine depth={lineDepth} />
          </div>
        )}

        {hasChildren ? (
          <button
            type="button"
            className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background/80"
            aria-expanded={open}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleCollapsed(node.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {open ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </button>
        ) : (
          <span className="size-4 shrink-0" aria-hidden />
        )}

        {canDrag && (
          <span
            className="flex size-4 shrink-0 items-center justify-center text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          >
            <GripVertical className="size-3" />
          </span>
        )}

        <Link
          href={href}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 pr-1.5 text-[13px] leading-tight transition-colors",
            active
              ? "font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={(e) => {
            if (dragging) e.preventDefault();
          }}
        >
          <FileText
            className={cn(
              "size-3 shrink-0 transition-colors",
              active || showInto
                ? "text-sky-600 dark:text-sky-400"
                : "opacity-70",
            )}
          />
          <span className="min-w-0 flex-1 truncate">{node.title || "Untitled"}</span>
          {showInto && (
            <span className="shrink-0 rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-sky-700 dark:text-sky-300">
              Subpage
            </span>
          )}
          {showBefore && (
            <span className="shrink-0 rounded-md bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border">
              Reorder
            </span>
          )}
          {showAfterLine && (
            <span
              className={cn(
                "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ring-1",
                intent?.promote
                  ? "bg-sky-500/15 text-sky-700 ring-sky-500/30 dark:text-sky-300"
                  : "bg-background/90 font-medium text-muted-foreground ring-border",
              )}
            >
              {intent?.promote
                ? intent.previewDepth === 0
                  ? "As page"
                  : "Outdent"
                : "Reorder"}
            </span>
          )}
        </Link>

        <div
          className="mr-0.5 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {canDrag && (
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
              onClick={() => onAddSubpage(node)}
              title={`Add subpage under ${node.title || "Untitled"}`}
              aria-label={`Add subpage under ${node.title || "Untitled"}`}
            >
              <Plus className="size-3.5" />
            </button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground data-[state=open]:bg-background data-[state=open]:text-foreground"
                title={`Options for ${node.title || "Untitled"}`}
                aria-label={`Options for ${node.title || "Untitled"}`}
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-52">
              <DropdownMenuItem asChild>
                <Link href={href}>
                  <ExternalLink />
                  Open page
                </Link>
              </DropdownMenuItem>
              {canDrag && (
                <DropdownMenuItem onSelect={() => onAddSubpage(node)}>
                  <Plus />
                  New subpage
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => onCopyLink(node)}>
                <Copy />
                Copy link
              </DropdownMenuItem>
              {canDrag && (
                <DropdownMenuItem onSelect={() => onRename(node)}>
                  <Pencil />
                  Rename page
                </DropdownMenuItem>
              )}
              {canDrag && (
                <DropdownMenuItem onSelect={() => onDuplicate(node)}>
                  <CopyPlus />
                  Duplicate page
                </DropdownMenuItem>
              )}
              {canDrag && (
                <DropdownMenuItem onSelect={() => onTransfer(node)}>
                  <FolderInput />
                  Copy or move to another Doc
                </DropdownMenuItem>
              )}
              {canManage && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => onDelete(node)}
                  >
                    <Trash2 />
                    Move to trash
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {hasChildren && open && (
        <div className="flex flex-col">
          {node.children.map((c, i) => (
            <TreePageRow
              key={c.id}
              node={c}
              depth={depth + 1}
              parentId={node.id}
              nextSiblingId={node.children[i + 1]?.id ?? null}
              activePageId={activePageId}
              canDrag={canDrag}
              dragging={dragging}
              intent={intent}
              rowEls={rowEls}
              collapsed={collapsed}
              toggleCollapsed={toggleCollapsed}
              canManage={canManage}
              onAddSubpage={onAddSubpage}
              onRename={onRename}
              onCopyLink={onCopyLink}
              onDuplicate={onDuplicate}
              onTransfer={onTransfer}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DragGhost({
  title,
  depth,
  mode,
}: {
  title: string;
  depth: number;
  mode: "into" | "peer" | "promote" | "idle";
}) {
  return (
    <div
      className={cn(
        "flex min-w-[11rem] max-w-[15rem] items-center gap-2 rounded-xl border bg-popover/95 py-2 pr-3 text-sm shadow-xl backdrop-blur-md transition-all duration-150",
        mode === "into" &&
          "border-sky-500/55 shadow-sky-500/25 ring-1 ring-sky-500/35",
        mode === "promote" &&
          "border-emerald-500/50 shadow-emerald-500/20 ring-1 ring-emerald-500/30",
        mode === "peer" && "border-border/80 shadow-lg",
        mode === "idle" && "border-border/60 opacity-90",
      )}
      style={{
        marginLeft:
          mode === "into"
            ? 12 + Math.min(depth, 6) * 6
            : Math.min(depth, 6) * 4,
        paddingLeft: 10,
      }}
    >
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md",
          mode === "into" && "bg-sky-500/15",
          mode === "promote" && "bg-emerald-500/15",
          (mode === "peer" || mode === "idle") && "bg-muted",
        )}
      >
        <FileText
          className={cn(
            "size-3.5",
            mode === "into" && "text-sky-600",
            mode === "promote" && "text-emerald-600",
            (mode === "peer" || mode === "idle") && "text-muted-foreground",
          )}
        />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
      {mode === "into" && (
        <span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
          Nest
        </span>
      )}
      {mode === "promote" && (
        <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          Page
        </span>
      )}
      {mode === "peer" && (
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Move
        </span>
      )}
    </div>
  );
}

export function DocPageOutline({
  tree,
  activePageId,
  homeSpaceId,
  docId,
  canEdit,
  canManage,
  spaces,
  rootTitle,
  embedded = false,
  onCollapse,
}: {
  tree: DocOutlineNode[];
  activePageId: string;
  homeSpaceId: string;
  docId: string;
  canEdit: boolean;
  canManage: boolean;
  spaces: { id: string; name: string }[];
  rootTitle?: string;
  embedded?: boolean;
  /** Desktop: hide the rail for more writing space. */
  onCollapse?: () => void;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [addDocId, setAddDocId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<DocOutlineNode | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DocOutlineNode | null>(null);
  const [transferTarget, setTransferTarget] = useState<DocOutlineNode | null>(null);
  const [transferTargets, setTransferTargets] = useState<DocTransferTarget[]>([]);
  const [destinationDocId, setDestinationDocId] = useState("");
  const [transferMode, setTransferMode] = useState<"copy" | "move">("copy");
  const [dragTitle, setDragTitle] = useState<string | null>(null);
  const [dragSourceDepth, setDragSourceDepth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [activeDragPageId, setActiveDragPageId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [intent, setIntent] = useState<DropIntent | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [pending, startTransition] = useTransition();
  const rowEls = useRef<Map<string, HTMLElement>>(new Map());
  const listEl = useRef<HTMLDivElement | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const intentRef = useRef<DropIntent | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const flatMeta = useMemo(() => buildFlatMeta(tree), [tree]);

  const descendantMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    function walk(n: DocOutlineNode) {
      map.set(n.id, collectDescendantIds(n));
      for (const c of n.children) walk(c);
    }
    for (const n of tree) walk(n);
    return map;
  }, [tree]);

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const recomputeIntent = useCallback(
    (pageId: string, over: string | null, x: number, y: number) => {
      const listLeft = listEl.current?.getBoundingClientRect().left ?? 0;

      if (over === "docoutline-list-end") {
        const next: DropIntent = {
          targetId: "__list_end__",
          zone: "end",
          parentPageId: null,
          beforePageId: null,
          previewDepth: 0,
          promote: true,
        };
        intentRef.current = next;
        setIntent(next);
        return;
      }

      if (!over || !over.startsWith("docoutline-row:")) {
        intentRef.current = null;
        setIntent(null);
        return;
      }

      const rowId = over.slice("docoutline-row:".length);
      const meta = flatMeta.get(rowId);
      const el = rowEls.current.get(rowId);
      if (!meta || !el) {
        intentRef.current = null;
        setIntent(null);
        return;
      }

      const rect = el.getBoundingClientRect();
      // When pointer is below the row (dragging lower past last item), force "after"
      // so outdent candidates still resolve.
      let zone: "before" | "into" | "after";
      if (y > rect.bottom - 2) zone = "after";
      else if (y < rect.top + 2) zone = "before";
      else zone = zoneFromPointer(y, rect);

      const next = intentForRow(
        meta,
        zone,
        pageId,
        descendantMap.get(pageId),
        flatMeta,
        x,
        listLeft,
      );
      intentRef.current = next;
      setIntent(next);
    },
    [descendantMap, flatMeta],
  );

  useEffect(() => {
    if (!dragging || !activeDragPageId) return;
    const onMove = (ev: PointerEvent) => {
      pointer.current = { x: ev.clientX, y: ev.clientY };
      recomputeIntent(activeDragPageId, overId, ev.clientX, ev.clientY);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [dragging, activeDragPageId, overId, recomputeIntent]);

  if (tree.length === 0) return null;

  const docTitle = rootTitle ?? tree[0]?.title ?? "Untitled";

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (!id.startsWith("docoutline:")) return;
    const pageId = id.slice("docoutline:".length);
    const node = findNode(tree, pageId);
    const meta = flatMeta.get(pageId);
    setDragging(true);
    setActiveDragPageId(pageId);
    setDragTitle(node?.title || "Page");
    setDragSourceDepth(meta?.depth ?? 0);
    setOverId(null);
    intentRef.current = null;
    setIntent(null);

    const ae = e.activatorEvent as PointerEvent | MouseEvent | undefined;
    if (ae && "clientY" in ae) {
      pointer.current = { x: ae.clientX, y: ae.clientY };
    }
  }

  function onDragOver(e: DragOverEvent) {
    const activeId = String(e.active.id);
    if (!activeId.startsWith("docoutline:")) return;
    const pageId = activeId.slice("docoutline:".length);
    const nextOver = e.over ? String(e.over.id) : null;
    setOverId(nextOver);
    recomputeIntent(pageId, nextOver, pointer.current.x, pointer.current.y);
  }

  function onDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    const pageId = activeId.startsWith("docoutline:")
      ? activeId.slice("docoutline:".length)
      : null;
    const nextOver = e.over ? String(e.over.id) : null;
    if (pageId) {
      recomputeIntent(pageId, nextOver, pointer.current.x, pointer.current.y);
    }

    const finalIntent = intentRef.current;
    setDragging(false);
    setActiveDragPageId(null);
    setDragTitle(null);
    setOverId(null);
    setIntent(null);
    intentRef.current = null;

    if (!canEdit || !finalIntent || !pageId) return;

    startTransition(async () => {
      try {
        await moveDocPage({
          pageId,
          parentPageId: finalIntent.parentPageId,
          beforePageId: finalIntent.beforePageId ?? undefined,
          homeSpaceId,
        });
        toast.success(
          finalIntent.zone === "into"
            ? "Moved as subpage"
            : finalIntent.promote && finalIntent.parentPageId === null
              ? "Moved as page"
              : finalIntent.promote
                ? "Moved out one level"
                : "Page reordered",
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Move failed");
      }
    });
  }

  function onDragCancel() {
    setDragging(false);
    setActiveDragPageId(null);
    setDragTitle(null);
    setOverId(null);
    setIntent(null);
    intentRef.current = null;
  }

  function openAddSubpage(node: DocOutlineNode) {
    setAddParentId(node.id);
    setAddDocId(null);
    setAddOpen(true);
    setCollapsed((previous) => {
      if (!previous.has(node.id)) return previous;
      const next = new Set(previous);
      next.delete(node.id);
      return next;
    });
  }

  function openRename(node: DocOutlineNode) {
    setRenameTarget(node);
    setRenameValue(node.title || "Untitled");
  }

  function copyPageLink(node: DocOutlineNode) {
    void navigator.clipboard
      .writeText(window.location.origin + pagePath(node.id, node.slug))
      .then(() => toast.success("Page link copied"))
      .catch(() => toast.error("Could not copy the page link"));
  }

  function duplicatePage(node: DocOutlineNode) {
    startTransition(async () => {
      try {
        const duplicate = await duplicateDocPage(node.id);
        toast.success("Page duplicated");
        router.push(duplicate.path);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not duplicate page");
      }
    });
  }

  function openTransfer(node: DocOutlineNode) {
    setTransferTarget(node);
    setTransferTargets([]);
    setDestinationDocId("");
    setTransferMode("copy");
    startTransition(async () => {
      try {
        const targets = await listDocTransferTargets(node.id);
        setTransferTargets(targets);
        setDestinationDocId(targets[0]?.docId ?? "");
      } catch (error) {
        setTransferTarget(null);
        toast.error(error instanceof Error ? error.message : "Could not load Docs");
      }
    });
  }

  function submitTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transferTarget || !destinationDocId) return;
    const source = transferTarget;
    startTransition(async () => {
      try {
        const transferred = await transferDocPage({
          pageId: source.id,
          destinationDocId,
          mode: transferMode,
        });
        setTransferTarget(null);
        toast.success(
          transferMode === "copy"
            ? "Page copied to the selected Doc"
            : "Page moved to the selected Doc",
        );
        router.push(transferred.path);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not transfer page");
      }
    });
  }

  function submitRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = renameValue.trim();
    if (!renameTarget || !title) return;
    const target = renameTarget;
    startTransition(async () => {
      try {
        const updated = await updatePageMeta({ pageId: target.id, title });
        setRenameTarget(null);
        toast.success("Page renamed");
        if (target.id === activePageId) {
          router.replace(pagePath(updated.id, updated.slug));
        }
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not rename page");
      }
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        await trashPage(target.id);
        setDeleteTarget(null);
        toast.success("Page moved to trash");
        if (target.id === activePageId) router.push("/docs");
        else router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not delete page");
      }
    });
  }

  const ghostMode: "into" | "peer" | "promote" | "idle" = !intent
    ? "idle"
    : intent.zone === "into"
      ? "into"
      : intent.promote
        ? "promote"
        : "peer";
  const ghostDepth = intent?.previewDepth ?? dragSourceDepth;

  const body = (
    <DndContext
      id="doc-outline-dnd"
      sensors={sensors}
      collisionDetection={outlineCollision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {/* Match main editor chrome (h-12) so the shared border-b lines up. */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
          <FileText className="size-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold leading-none text-foreground">
            {docTitle || "Untitled"}
          </h2>
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Collapse pages panel"
            aria-label="Collapse pages panel"
          >
            <PanelLeftClose className="size-3.5" />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-1.5 py-1.5">
        <p className="mb-0.5 shrink-0 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Pages
        </p>

        <div className="relative min-h-0 flex-1">
          {dragging && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
              <div className="rounded-lg border border-border/70 bg-popover/95 px-2.5 py-1.5 text-[10px] leading-snug text-muted-foreground shadow-md backdrop-blur-sm">
                {intent?.zone === "into" ? (
                  <>
                    <span className="font-semibold text-sky-600 dark:text-sky-400">
                      Nest
                    </span>
                    {" as a subpage"}
                  </>
                ) : intent?.promote && intent.parentPageId === null ? (
                  <>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      As page
                    </span>
                    {" — same level as the others"}
                  </>
                ) : intent?.promote ? (
                  <>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      Outdent
                    </span>
                    {" one level"}
                  </>
                ) : intent ? (
                  <>
                    <span className="font-semibold text-foreground">Reorder</span>
                    {" at this level"}
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">Edges</span>
                    {" reorder · "}
                    <span className="font-medium text-sky-600">Center</span>
                    {" nest · drag "}
                    <span className="font-medium text-emerald-600">left/down</span>
                    {" to make a page"}
                  </>
                )}
              </div>
            </div>
          )}

          <div
            ref={listEl}
            className="h-full min-h-0 overflow-y-auto overscroll-contain"
          >
            <div className="flex flex-col py-0.5">
              {tree.map((n, i) => (
                <TreePageRow
                  key={n.id}
                  node={n}
                  depth={0}
                  parentId={null}
                  nextSiblingId={tree[i + 1]?.id ?? null}
                  activePageId={activePageId}
                  canDrag={canEdit}
                  dragging={dragging}
                  intent={intent}
                  rowEls={rowEls}
                  collapsed={collapsed}
                  toggleCollapsed={toggleCollapsed}
                  canManage={canManage}
                  onAddSubpage={openAddSubpage}
                  onRename={openRename}
                  onCopyLink={copyPageLink}
                  onDuplicate={duplicatePage}
                  onTransfer={openTransfer}
                  onDelete={setDeleteTarget}
                />
              ))}

              {canEdit && (
                <ListEndDrop
                  dragging={dragging}
                  active={intent?.zone === "end"}
                />
              )}
            </div>
          </div>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setAddParentId(null);
              setAddDocId(docId);
              setAddOpen(true);
            }}
            className="mt-0.5 flex w-full shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Add page
          </button>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragTitle ? (
          <DragGhost title={dragTitle} depth={ghostDepth} mode={ghostMode} />
        ) : null}
      </DragOverlay>

      <CreatePageDialog
        spaces={spaces}
        defaultSpaceId={homeSpaceId}
        parentPageId={addParentId}
        docId={addDocId}
        open={addOpen}
        onOpenChange={setAddOpen}
        dialogTitle="Add page"
      />

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setRenameTarget(null);
        }}
      >
        <DialogContent>
          <form onSubmit={submitRename}>
            <DialogHeader>
              <DialogTitle>Rename page</DialogTitle>
              <DialogDescription>
                Update the page name shown in this Doc and its URL.
              </DialogDescription>
            </DialogHeader>
            <Input
              className="mt-4"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              autoFocus
              maxLength={200}
              required
            />
            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending || !renameValue.trim()}>
                {pending ? "Renaming…" : "Rename"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move page to trash?</DialogTitle>
            <DialogDescription>
              “{deleteTarget?.title || "Untitled"}” and its nested subpages will no
              longer appear in this Doc.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={confirmDelete}
            >
              {pending ? "Moving…" : "Move to trash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={transferTarget !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setTransferTarget(null);
        }}
      >
        <DialogContent>
          <form onSubmit={submitTransfer}>
            <DialogHeader>
              <DialogTitle>Copy or move page</DialogTitle>
              <DialogDescription>
                Choose another Doc for “{transferTarget?.title || "Untitled"}”.
                Nested subpages and relationships are included when copying.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 grid gap-4">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Action</label>
                <Select
                  value={transferMode}
                  onValueChange={(value) => setTransferMode(value as "copy" | "move")}
                  disabled={pending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="copy">Copy page tree</SelectItem>
                    <SelectItem value="move">Move page tree</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Destination Doc</label>
                <Select
                  value={destinationDocId}
                  onValueChange={setDestinationDocId}
                  disabled={pending || transferTargets.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={pending ? "Loading Docs…" : "Select a Doc"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {transferTargets.map((target) => (
                      <SelectItem key={target.docId} value={target.docId}>
                        {target.title} · {target.spaceName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!pending && transferTargets.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No other editable Docs are available.
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="mt-5">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending || !destinationDocId}>
                {pending
                  ? "Working…"
                  : transferMode === "copy"
                    ? "Copy page"
                    : "Move page"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DndContext>
  );

  if (embedded) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col bg-muted/30">{body}</div>
    );
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-muted/30">
      {body}
    </aside>
  );
}
