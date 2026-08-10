"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import Link from "next/link";
import { Columns3 } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TaskFilterCondition, TaskWithMeta } from "../queries";
import {
  fetchTasksPage,
  saveTableColumnOrder,
  updateTaskCustomField,
  updateTaskDate,
  updateTaskPriority,
  updateTaskStatus,
  updateTaskTitle,
} from "../actions";
import { AssigneeAvatarStack, AssigneeSelect } from "./assignee-select";
import { EntityIcon } from "./entity-icon";
import {
  CustomFieldEditCell,
  PrioritySelectCell,
  StatusSelectCell,
  TaskDateCell,
  TitleEditCell,
} from "./editable-cells";
import { PRIORITY_CARD_STYLES, PRIORITY_LABELS } from "./task-card";
import {
  COL_MIN,
  fieldOptionLabel,
  fmtShortDate,
  renderFieldValue,
  TableChip,
  type ColumnDef,
  type FieldDefLike,
  type StatusLike,
} from "./task-table";
import { TagChips, TagPicker, type TagOption } from "./tag-picker";

// ─── column config (intentionally duplicated from task-table.tsx — see plan:
// the List view's column plumbing is tuned for its virtualizer/grouping and
// isn't worth coupling to a feature whose usage patterns aren't proven yet) ──

const BASE_COLUMNS: ColumnDef[] = [
  { id: "number",     label: "#",            width: 90,  minWidth: COL_MIN },
  { id: "title",      label: "Title",        width: 360, minWidth: COL_MIN },
  { id: "status",     label: "Status",       width: 150, minWidth: COL_MIN },
  { id: "priority",   label: "Priority",     width: 130, minWidth: COL_MIN },
  { id: "tags",       label: "Tags",         width: 180, minWidth: COL_MIN },
  { id: "due",        label: "Due date",     width: 140, minWidth: COL_MIN },
  { id: "start_date", label: "Start date",   width: 140, minWidth: COL_MIN },
  { id: "assignees",  label: "Assignees",    width: 150, minWidth: COL_MIN },
  { id: "created_at", label: "Created date", width: 160, minWidth: COL_MIN },
  { id: "closed_at",  label: "Closed date",  width: 160, minWidth: COL_MIN },
];
const BASE_COL_MAP = new Map(BASE_COLUMNS.map((c) => [c.id, c]));
const ALWAYS_VISIBLE = new Set(["number", "title"]);
const HIDEABLE_BASE_COLS = BASE_COLUMNS.filter((c) => !ALWAYS_VISIBLE.has(c.id));
const DEFAULT_HIDDEN_COLS = ["created_at", "closed_at"];

/** Columns whose value is a single settable field — pasteable / fillable. */
const READONLY_COLS = new Set(["number", "created_at", "closed_at"]);
/** Relational (many-to-many) columns — editable by click, not by paste/fill. */
const RELATIONAL_COLS = new Set(["tags", "assignees"]);

const ROW_H = 37;
const HEADER_H = 42;
const MAX_PASTE_CELLS = 500;
const PASTE_CONCURRENCY = 10;

interface CellPos { row: number; col: number }
interface SelectionState { anchor: CellPos; focus: CellPos }

function normRect(sel: SelectionState) {
  return {
    rowStart: Math.min(sel.anchor.row, sel.focus.row),
    rowEnd: Math.max(sel.anchor.row, sel.focus.row),
    colStart: Math.min(sel.anchor.col, sel.focus.col),
    colEnd: Math.max(sel.anchor.col, sel.focus.col),
  };
}

// ─── value read / display / coerce helpers ─────────────────────────────────

function getCellRaw(colId: string, item: TaskWithMeta): unknown {
  const task = item.task;
  if (colId.startsWith("field-")) {
    const cf = (task.customFields ?? {}) as Record<string, unknown>;
    return cf[colId.slice(6)];
  }
  switch (colId) {
    case "number": return task.number;
    case "title": return task.title;
    case "status": return task.statusId;
    case "priority": return task.priority;
    case "due": return task.dueDate;
    case "start_date": return task.startDate;
    case "created_at": return task.createdAt;
    case "closed_at": return task.completedAt;
    case "tags": return item.tags.map((t) => t.id);
    case "assignees": return item.assignees.map((a) => a.id);
    default: return undefined;
  }
}

function getCellDisplayText(
  colId: string,
  item: TaskWithMeta,
  statusById: Map<string, StatusLike>,
  fieldDefsById: Map<string, FieldDefLike>,
  userNames: Map<string, string>,
): string {
  const task = item.task;
  if (colId.startsWith("field-")) {
    const def = fieldDefsById.get(colId.slice(6));
    if (!def) return "";
    const cf = (task.customFields ?? {}) as Record<string, unknown>;
    const label = fieldOptionLabel(def, cf[def.id], userNames);
    return label === "—" ? "" : label;
  }
  switch (colId) {
    case "number": return task.number;
    case "title": return task.title;
    case "status": return statusById.get(task.statusId)?.name ?? "";
    case "priority": return task.priority ? (PRIORITY_LABELS[task.priority] ?? task.priority) : "";
    case "due": { const s = fmtShortDate(task.dueDate); return s === "—" ? "" : s; }
    case "start_date": { const s = fmtShortDate(task.startDate); return s === "—" ? "" : s; }
    case "created_at": { const s = fmtShortDate(task.createdAt); return s === "—" ? "" : s; }
    case "closed_at": { const s = fmtShortDate(task.completedAt); return s === "—" ? "" : s; }
    case "tags": return item.tags.map((t) => t.name).join(", ");
    case "assignees": return item.assignees.map((a) => a.displayName).join(", ");
    default: return "";
  }
}

function parseDateLoose(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Coerce plain text (external paste, or a cross-column paste) into a column's value. */
function coerceTextForColumn(
  colId: string,
  text: string,
  ctx: { statuses: StatusLike[]; fieldDefsById: Map<string, FieldDefLike>; activeUsers: { id: string; displayName: string }[] },
): { ok: true; value: unknown } | { ok: false } {
  const t = text.trim();
  if (colId.startsWith("field-")) {
    const def = ctx.fieldDefsById.get(colId.slice(6));
    if (!def) return { ok: false };
    const options = (def.options ?? []) as { id: string; label: string }[];
    switch (def.type) {
      case "checkbox":
        if (/^(yes|true|1)$/i.test(t)) return { ok: true, value: true };
        if (/^(no|false|0|)$/i.test(t)) return { ok: true, value: false };
        return { ok: false };
      case "dropdown":
      case "color": {
        const o = options.find((opt) => opt.label.toLowerCase() === t.toLowerCase());
        return o ? { ok: true, value: o.id } : { ok: false };
      }
      case "multi_select": {
        if (!t) return { ok: true, value: [] };
        const ids = t.split(",").map((s) => s.trim().toLowerCase());
        const matched = options.filter((o) => ids.includes(o.label.toLowerCase())).map((o) => o.id);
        return matched.length > 0 ? { ok: true, value: matched } : { ok: false };
      }
      case "user": {
        if (!t) return { ok: true, value: [] };
        const names = t.split(",").map((s) => s.trim().toLowerCase());
        const ids = ctx.activeUsers
          .filter((u) => names.includes(u.displayName.toLowerCase()))
          .map((u) => u.id);
        return ids.length > 0 ? { ok: true, value: ids } : { ok: false };
      }
      case "date": {
        const d = parseDateLoose(t);
        return t === "" ? { ok: true, value: null } : d ? { ok: true, value: d } : { ok: false };
      }
      case "number": {
        if (t === "") return { ok: true, value: undefined };
        const n = Number(t);
        return isNaN(n) ? { ok: false } : { ok: true, value: n };
      }
      case "text":
      case "textarea":
      case "url":
      case "email":
      case "phone":
        return { ok: true, value: t === "" ? undefined : t };
      default:
        return { ok: false };
    }
  }
  switch (colId) {
    case "title":
      return t ? { ok: true, value: t } : { ok: false };
    case "status": {
      const s = ctx.statuses.find((st) => st.name.toLowerCase() === t.toLowerCase());
      return s ? { ok: true, value: s.id } : { ok: false };
    }
    case "priority": {
      if (t === "") return { ok: true, value: null };
      const p = (["urgent", "high", "normal", "low"] as const).find((p) => p === t.toLowerCase());
      return p ? { ok: true, value: p } : { ok: false };
    }
    case "due":
    case "start_date": {
      if (t === "") return { ok: true, value: null };
      const d = parseDateLoose(t);
      return d ? { ok: true, value: d } : { ok: false };
    }
    default:
      return { ok: false };
  }
}

async function applyCellValue(colId: string, taskId: string, value: unknown): Promise<void> {
  if (colId.startsWith("field-")) {
    await updateTaskCustomField(taskId, colId.slice(6), value);
    return;
  }
  switch (colId) {
    case "title": await updateTaskTitle(taskId, value as string); return;
    case "status": await updateTaskStatus(taskId, value as string); return;
    case "priority": await updateTaskPriority(taskId, value as "urgent" | "high" | "normal" | "low" | null); return;
    case "due": await updateTaskDate(taskId, "dueDate", value as string | null); return;
    case "start_date": await updateTaskDate(taskId, "startDate", value as string | null); return;
    default: return;
  }
}

async function runBatch<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  let ok = 0;
  let failed = 0;
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try {
        await fn(items[idx]);
        ok++;
      } catch {
        failed++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return { ok, failed };
}

// ─── component ──────────────────────────────────────────────────────────────

export function TaskGrid({
  items,
  totalCount,
  conditions,
  statuses,
  fieldDefs,
  activeUsers,
  listId,
  initialColumnOrder,
  canEdit = true,
  showClosed = false,
  spaceTags = [],
  viewId,
}: {
  items: TaskWithMeta[];
  totalCount: number;
  conditions?: TaskFilterCondition[];
  statuses: StatusLike[];
  fieldDefs: FieldDefLike[];
  activeUsers: { id: string; displayName: string; photoKey: string | null }[];
  listId: string;
  initialColumnOrder?: string[];
  canEdit?: boolean;
  showClosed?: boolean;
  spaceTags?: TagOption[];
  viewId?: string;
}) {
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const fieldDefsById = useMemo(() => new Map(fieldDefs.map((d) => [d.id, d])), [fieldDefs]);
  const userNames = useMemo(() => new Map(activeUsers.map((u) => [u.id, u.displayName])), [activeUsers]);
  const [, startTransition] = useTransition();

  const PAGE_SIZE = 200;

  // ── sparse row cache (flat — no grouping/subtasks in the grid view) ───────
  const [rowsByOffset, setRowsByOffset] = useState<Map<number, TaskWithMeta>>(
    () => new Map(items.map((it, i) => [i, it])),
  );
  const requestedPages = useRef<Set<number>>(new Set([0]));
  useEffect(() => {
    setRowsByOffset(new Map(items.map((it, i) => [i, it])));
    requestedPages.current = new Set([0]);
  }, [items]);

  const patchRows = useCallback((fn: (it: TaskWithMeta) => TaskWithMeta) => {
    setRowsByOffset((prev) => {
      const next = new Map<number, TaskWithMeta>();
      for (const [offset, it] of prev) next.set(offset, fn(it));
      return next;
    });
  }, []);
  const patchTask = useCallback(
    (taskId: string, patch: Partial<TaskWithMeta["task"]>) => {
      patchRows((it) => (it.task.id === taskId ? { ...it, task: { ...it.task, ...patch } } : it));
    },
    [patchRows],
  );
  const patchCustomField = useCallback(
    (taskId: string, defId: string, value: unknown) => {
      patchRows((it) => {
        if (it.task.id !== taskId) return it;
        const cf = { ...((it.task.customFields as Record<string, unknown> | null) ?? {}) };
        if (value === undefined) delete cf[defId];
        else cf[defId] = value;
        return { ...it, task: { ...it.task, customFields: cf } };
      });
    },
    [patchRows],
  );

  /** Apply a resolved value both optimistically and to the server; returns success. */
  const commitCell = useCallback(
    async (colId: string, item: TaskWithMeta, value: unknown) => {
      const taskId = item.task.id;
      if (colId.startsWith("field-")) patchCustomField(taskId, colId.slice(6), value);
      else if (colId === "title") patchTask(taskId, { title: value as string });
      else if (colId === "status") patchTask(taskId, { statusId: value as string });
      else if (colId === "priority") patchTask(taskId, { priority: value as never });
      else if (colId === "due") patchTask(taskId, { dueDate: value as never });
      else if (colId === "start_date") patchTask(taskId, { startDate: value as never });
      await applyCellValue(colId, taskId, value);
    },
    [patchTask, patchCustomField],
  );

  const fetchPage = useCallback(
    async (pageIdx: number) => {
      if (requestedPages.current.has(pageIdx)) return;
      requestedPages.current.add(pageIdx);
      try {
        const page = await fetchTasksPage({
          listId,
          conditions,
          offset: pageIdx * PAGE_SIZE,
          limit: PAGE_SIZE,
          showClosed,
        });
        setRowsByOffset((prev) => {
          const next = new Map(prev);
          page.items.forEach((it, j) => next.set(pageIdx * PAGE_SIZE + j, it));
          return next;
        });
      } catch {
        requestedPages.current.delete(pageIdx);
        toast.error("Failed to load tasks");
      }
    },
    [listId, conditions, showClosed],
  );

  // ── column order / visibility / widths (persistence mirrors task-table.tsx) ─
  const defaultOrder = useMemo(
    () => [...BASE_COLUMNS.map((c) => c.id), ...fieldDefs.map((d) => `field-${d.id}`)],
    [fieldDefs],
  );
  function mergeOrder(saved: string[], known: string[]): string[] {
    const knownSet = new Set(known);
    const filtered = saved.filter((id) => knownSet.has(id));
    const existing = new Set(filtered);
    return [...filtered, ...known.filter((id) => !existing.has(id))];
  }
  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    initialColumnOrder ? mergeOrder(initialColumnOrder, defaultOrder) : defaultOrder,
  );
  const isFirstOrderRender = useRef(true);
  useEffect(() => {
    if (isFirstOrderRender.current) { isFirstOrderRender.current = false; return; }
    startTransition(() => { saveTableColumnOrder(listId, columnOrder, viewId); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnOrder]);

  const hiddenStorageKey = `aitim:task-grid-hidden:${listId}:${viewId ?? "default"}`;
  const [hiddenColIds, setHiddenColIds] = useState<string[]>([]);
  useEffect(() => {
    const raw = window.localStorage.getItem(hiddenStorageKey);
    try {
      setHiddenColIds(raw ? (JSON.parse(raw) as string[]) : DEFAULT_HIDDEN_COLS);
    } catch {
      window.localStorage.removeItem(hiddenStorageKey);
      setHiddenColIds(DEFAULT_HIDDEN_COLS);
    }
  }, [hiddenStorageKey]);
  useEffect(() => {
    window.localStorage.setItem(hiddenStorageKey, JSON.stringify(hiddenColIds));
  }, [hiddenColIds, hiddenStorageKey]);
  function toggleCol(colId: string) {
    setHiddenColIds((cur) => (cur.includes(colId) ? cur.filter((id) => id !== colId) : [...cur, colId]));
  }

  const widthStorageKey = `aitim:task-grid-widths:${listId}:${viewId ?? "default"}`;
  const [widths, setWidths] = useState<Record<string, number>>({});
  useEffect(() => {
    const raw = window.localStorage.getItem(widthStorageKey);
    if (!raw) return;
    try { setWidths(JSON.parse(raw) as Record<string, number>); } catch { window.localStorage.removeItem(widthStorageKey); }
  }, [widthStorageKey]);
  useEffect(() => {
    if (Object.keys(widths).length === 0) return;
    window.localStorage.setItem(widthStorageKey, JSON.stringify(widths));
  }, [widths, widthStorageKey]);

  const orderedColumns = useMemo<ColumnDef[]>(() => {
    const hiddenSet = new Set(hiddenColIds);
    const result: ColumnDef[] = [];
    for (const id of columnOrder) {
      if (BASE_COL_MAP.has(id)) {
        if (!ALWAYS_VISIBLE.has(id) && hiddenSet.has(id)) continue;
        const base = BASE_COL_MAP.get(id)!;
        result.push({ ...base, width: widths[id] ?? base.width });
      } else if (id.startsWith("field-")) {
        if (hiddenSet.has(id)) continue;
        const def = fieldDefs.find((d) => d.id === id.slice(6));
        if (!def) continue;
        result.push({ id, label: def.label, width: widths[id] ?? 180, minWidth: COL_MIN });
      }
    }
    return result;
  }, [columnOrder, fieldDefs, hiddenColIds, widths]);

  function columnWidth(col: ColumnDef) { return widths[col.id] ?? col.width; }
  /** Cumulative left offset of each column, for selection-overlay geometry. */
  const colOffsets = useMemo(() => {
    const offsets: number[] = [];
    let x = 0;
    for (const col of orderedColumns) { offsets.push(x); x += columnWidth(col); }
    return offsets;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedColumns, widths]);
  const totalWidth = orderedColumns.reduce((sum, col) => sum + columnWidth(col), 0);

  function resizeColumn(col: ColumnDef, event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = columnWidth(col);
    function onMove(e: globalThis.PointerEvent) {
      setWidths((cur) => ({ ...cur, [col.id]: Math.max(COL_MIN, startWidth + e.clientX - startX) }));
    }
    function onUp() { window.removeEventListener("pointermove", onMove); }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  const dragColId = useRef<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  function onColDragStart(e: DragEvent<HTMLTableCellElement>, colId: string) {
    dragColId.current = colId;
    e.dataTransfer.effectAllowed = "move";
  }
  function onColDragOver(e: DragEvent<HTMLTableCellElement>, colId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (colId !== dragColId.current) setDragOverColId(colId);
  }
  function onColDrop(e: DragEvent<HTMLTableCellElement>, targetId: string) {
    e.preventDefault();
    const srcId = dragColId.current;
    dragColId.current = null;
    setDragOverColId(null);
    if (!srcId || srcId === targetId) return;
    setColumnOrder((prev) => {
      const next = [...prev];
      const from = next.indexOf(srcId);
      const to = next.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      next.splice(from, 1);
      next.splice(to, 0, srcId);
      return next;
    });
  }
  function onColDragEnd() { dragColId.current = null; setDragOverColId(null); }

  // ── sort (client-requested server sort, same as List view) ────────────────
  const [sort, setSort] = useState<{ fieldId: string; dir: "asc" | "desc" } | null>(null);
  const isFirstSortRender = useRef(true);
  useEffect(() => {
    if (isFirstSortRender.current) { isFirstSortRender.current = false; return; }
    setRowsByOffset(new Map());
    requestedPages.current = new Set();
    setSelection(null);
    void (async () => {
      requestedPages.current.add(0);
      try {
        const page = await fetchTasksPage({ listId, conditions, sort, offset: 0, limit: PAGE_SIZE, showClosed });
        setRowsByOffset(new Map(page.items.map((it, i) => [i, it])));
      } catch {
        toast.error("Failed to load tasks");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  function toggleSort(colId: string) {
    const isCustom = colId.startsWith("field-");
    const key = isCustom ? colId.slice(6) : colId;
    if (colId === "tags" || colId === "assignees") return;
    setSort((cur) => {
      if (!cur || cur.fieldId !== key) return { fieldId: key, dir: "asc" };
      if (cur.dir === "asc") return { fieldId: key, dir: "desc" };
      return null;
    });
  }

  // ── virtualizer (flat rows, fixed height) ──────────────────────────────────
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => scrollEl,
    estimateSize: () => ROW_H,
    overscan: 18,
    getItemKey: (index) => rowsByOffset.get(index)?.task.id ?? `t:${index}`,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0 ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0;

  const firstVirtualIndex = virtualRows.length > 0 ? virtualRows[0].index : 0;
  const lastVirtualIndex = virtualRows.length > 0 ? virtualRows[virtualRows.length - 1].index : 0;
  useEffect(() => {
    if (totalCount === 0) return;
    const from = Math.max(0, firstVirtualIndex - PAGE_SIZE);
    const to = Math.min(totalCount - 1, lastVirtualIndex + PAGE_SIZE);
    for (let p = Math.floor(from / PAGE_SIZE); p <= Math.floor(to / PAGE_SIZE); p++) {
      if (!requestedPages.current.has(p)) void fetchPage(p);
    }
  }, [firstVirtualIndex, lastVirtualIndex, totalCount, fetchPage]);

  // ── selection / range-select / fill-handle ─────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; colId: string } | null>(null);
  const [fillPreviewRow, setFillPreviewRow] = useState<number | null>(null);
  const clipboardRef = useRef<{ colIds: string[]; rows: unknown[][] } | null>(null);
  const isSelectingRef = useRef(false);
  const isFillingRef = useRef(false);
  const fillOriginRef = useRef<ReturnType<typeof normRect> | null>(null);

  const posFromClientXY = useCallback(
    (clientX: number, clientY: number): CellPos | null => {
      if (!scrollEl || orderedColumns.length === 0) return null;
      const rect = scrollEl.getBoundingClientRect();
      const relY = clientY - rect.top + scrollEl.scrollTop - HEADER_H;
      const relX = clientX - rect.left + scrollEl.scrollLeft;
      const row = Math.min(Math.max(Math.floor(relY / ROW_H), 0), Math.max(totalCount - 1, 0));
      let col = orderedColumns.length - 1;
      for (let i = 0; i < orderedColumns.length; i++) {
        const w = columnWidth(orderedColumns[i]);
        if (relX < colOffsets[i] + w) { col = i; break; }
      }
      return { row, col };
    },
    [scrollEl, orderedColumns, colOffsets, totalCount], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function beginSelect(row: number, col: number, extend: boolean) {
    setSelection((cur) => (extend && cur ? { ...cur, focus: { row, col } } : { anchor: { row, col }, focus: { row, col } }));
    isSelectingRef.current = true;
    containerRef.current?.focus();
    function onMove(e: globalThis.MouseEvent) {
      const pos = posFromClientXY(e.clientX, e.clientY);
      if (pos) setSelection((cur) => (cur ? { ...cur, focus: pos } : cur));
    }
    function onUp() { isSelectingRef.current = false; window.removeEventListener("mousemove", onMove); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
  }

  function beginFill() {
    if (!selection) return;
    isFillingRef.current = true;
    const origin = normRect(selection);
    fillOriginRef.current = origin;
    setFillPreviewRow(origin.rowEnd);
    function onMove(e: globalThis.MouseEvent) {
      const pos = posFromClientXY(e.clientX, e.clientY);
      if (pos) setFillPreviewRow(Math.max(pos.row, origin.rowEnd));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      isFillingRef.current = false;
      void commitFill();
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
  }

  async function commitFill() {
    const origin = fillOriginRef.current;
    const endRow = fillPreviewRow;
    fillOriginRef.current = null;
    setFillPreviewRow(null);
    if (!origin || endRow == null || endRow <= origin.rowEnd || !canEdit) return;

    const ops: { colId: string; item: TaskWithMeta; value: unknown }[] = [];
    let blockedByLoading = false;
    for (let c = origin.colStart; c <= origin.colEnd; c++) {
      const col = orderedColumns[c];
      if (!col || READONLY_COLS.has(col.id) || RELATIONAL_COLS.has(col.id)) continue;
      const sourceItem = rowsByOffset.get(origin.rowStart);
      if (!sourceItem) { blockedByLoading = true; continue; }
      const value = getCellRaw(col.id, sourceItem);
      for (let r = origin.rowEnd + 1; r <= endRow; r++) {
        const item = rowsByOffset.get(r);
        if (!item) { blockedByLoading = true; continue; }
        ops.push({ colId: col.id, item, value });
      }
    }
    if (blockedByLoading) toast.warning("Some rows were still loading and were skipped — scroll there first");
    if (ops.length === 0) return;
    if (ops.length > MAX_PASTE_CELLS) { toast.error(`Fill is limited to ${MAX_PASTE_CELLS} cells at a time`); return; }

    const { ok, failed } = await runBatch(ops, PASTE_CONCURRENCY, (op) => commitCell(op.colId, op.item, op.value));
    if (failed > 0) toast.error(`Filled ${ok} cells — ${failed} failed`);
    setSelection({ anchor: { row: origin.rowStart, col: origin.colStart }, focus: { row: endRow, col: origin.colEnd } });
  }

  // ── copy / paste ────────────────────────────────────────────────────────
  async function handleCopy() {
    if (!selection) return;
    const rect = normRect(selection);
    const colIds = orderedColumns.slice(rect.colStart, rect.colEnd + 1).map((c) => c.id);
    const rawRows: unknown[][] = [];
    const textLines: string[] = [];
    for (let r = rect.rowStart; r <= rect.rowEnd; r++) {
      const item = rowsByOffset.get(r);
      if (!item) {
        toast.error("Selection includes rows still loading — scroll there first, then copy");
        return;
      }
      rawRows.push(colIds.map((id) => getCellRaw(id, item)));
      textLines.push(colIds.map((id) => getCellDisplayText(id, item, statusById, fieldDefsById, userNames)).join("\t"));
    }
    clipboardRef.current = { colIds, rows: rawRows };
    try {
      await navigator.clipboard.writeText(textLines.join("\n"));
    } catch {
      // clipboard API unavailable — internal buffer still covers same-session paste
    }
  }

  async function handlePaste() {
    if (!selection || !canEdit) return;
    const target = normRect(selection);

    let colIds: string[];
    let rows: unknown[][];
    let raw = true;
    const buf = clipboardRef.current;
    if (buf) {
      colIds = buf.colIds;
      rows = buf.rows;
    } else {
      let text: string;
      try {
        text = await navigator.clipboard.readText();
      } catch {
        toast.error("Clipboard access is unavailable — copy a cell in the grid first");
        return;
      }
      raw = false;
      const lines = text.replace(/\r/g, "").split("\n").filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === ""));
      rows = lines.map((line) => line.split("\t"));
      colIds = orderedColumns.slice(target.colStart, target.colStart + (rows[0]?.length ?? 1)).map((c) => c.id);
    }
    if (rows.length === 0 || colIds.length === 0) return;

    // Target rect: tile the copied block to fill a larger selection, else place it at the anchor.
    const singleCellSelection = target.rowStart === target.rowEnd && target.colStart === target.colEnd;
    const rowSpan = singleCellSelection ? rows.length : target.rowEnd - target.rowStart + 1;
    const colSpan = singleCellSelection ? colIds.length : target.colEnd - target.colStart + 1;
    if (rowSpan * colSpan > MAX_PASTE_CELLS) {
      toast.error(`Paste is limited to ${MAX_PASTE_CELLS} cells at a time`);
      return;
    }

    const ops: { colId: string; item: TaskWithMeta; value: unknown }[] = [];
    let skipped = 0;
    let loading = false;
    for (let dr = 0; dr < rowSpan; dr++) {
      const rowIdx = target.rowStart + dr;
      const item = rowsByOffset.get(rowIdx);
      if (!item) { loading = true; continue; }
      const srcRow = rows[dr % rows.length];
      for (let dc = 0; dc < colSpan; dc++) {
        const destCol = orderedColumns[target.colStart + dc];
        if (!destCol) continue;
        if (READONLY_COLS.has(destCol.id) || RELATIONAL_COLS.has(destCol.id)) { skipped++; continue; }
        const srcColId = colIds[dc % colIds.length];
        const srcVal = srcRow[dc % srcRow.length];
        if (raw && srcColId === destCol.id) {
          ops.push({ colId: destCol.id, item, value: srcVal });
          continue;
        }
        const text = typeof srcVal === "string" ? srcVal : String(srcVal ?? "");
        const coerced = coerceTextForColumn(destCol.id, text, { statuses, fieldDefsById, activeUsers });
        if (!coerced.ok) { skipped++; continue; }
        ops.push({ colId: destCol.id, item, value: coerced.value });
      }
    }
    if (loading) toast.warning("Some rows were still loading and were skipped — scroll there first");
    if (ops.length === 0) {
      if (skipped > 0) toast.error(`Nothing pasted — ${skipped} cell(s) were read-only or didn't match`);
      return;
    }
    const { ok, failed } = await runBatch(ops, PASTE_CONCURRENCY, (op) => commitCell(op.colId, op.item, op.value));
    if (failed > 0 || skipped > 0) {
      toast.message(`Updated ${ok} cell${ok === 1 ? "" : "s"}` + (skipped ? ` — ${skipped} skipped` : "") + (failed ? ` — ${failed} failed` : ""));
    }
    setSelection({
      anchor: { row: target.rowStart, col: target.colStart },
      focus: { row: target.rowStart + rowSpan - 1, col: target.colStart + colSpan - 1 },
    });
  }

  function openEditorAt(pos: CellPos) {
    if (!canEdit) return;
    const item = rowsByOffset.get(pos.row);
    const col = orderedColumns[pos.col];
    if (!item || !col || READONLY_COLS.has(col.id)) return;
    setEditingCell({ row: pos.row, colId: col.id });
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="gap-2">
              <Columns3 className="size-4" />
              Fields
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-96 w-52 overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Standard fields</DropdownMenuLabel>
            {HIDEABLE_BASE_COLS.map((col) => (
              <DropdownMenuCheckboxItem
                key={col.id}
                checked={!hiddenColIds.includes(col.id)}
                onCheckedChange={() => toggleCol(col.id)}
                onSelect={(e) => e.preventDefault()}
              >
                {col.label}
              </DropdownMenuCheckboxItem>
            ))}
            {fieldDefs.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">Custom fields</DropdownMenuLabel>
                {fieldDefs.map((field) => (
                  <DropdownMenuCheckboxItem
                    key={field.id}
                    checked={!hiddenColIds.includes(`field-${field.id}`)}
                    onCheckedChange={() => toggleCol(`field-${field.id}`)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {field.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        className="relative min-h-0 flex-1 outline-none"
        onKeyDown={(e) => {
          const isMod = e.ctrlKey || e.metaKey;
          if (isMod && e.key.toLowerCase() === "c") { e.preventDefault(); void handleCopy(); }
          else if (isMod && e.key.toLowerCase() === "v") { e.preventDefault(); void handlePaste(); }
          else if (e.key === "Escape") { setSelection(null); setEditingCell(null); }
          else if (e.key === "Enter" && selection) { openEditorAt(selection.focus); }
        }}
      >
        <div
          ref={setScrollEl}
          className="h-full min-h-0 overflow-auto overscroll-contain [scrollbar-gutter:stable]"
          style={{ WebkitOverflowScrolling: "touch", willChange: "scroll-position" }}
        >
          <table className="w-full caption-bottom table-fixed border-collapse text-sm" style={{ width: totalWidth }}>
            <colgroup>
              {orderedColumns.map((col) => (
                <col key={col.id} style={{ width: columnWidth(col) }} />
              ))}
            </colgroup>
            <TableHeader className="sticky top-0 z-10 border-b border-border bg-background">
              <TableRow className="transition-none hover:bg-transparent">
                {orderedColumns.map((col) => {
                  const isCustom = col.id.startsWith("field-");
                  const sortKey = isCustom ? col.id.slice(6) : col.id;
                  const isSorted = sort?.fieldId === sortKey;
                  const sortable = col.id !== "tags" && col.id !== "assignees" && col.id !== "number";
                  return (
                    <TableHead
                      key={col.id}
                      draggable
                      onDragStart={(e) => onColDragStart(e, col.id)}
                      onDragOver={(e) => onColDragOver(e, col.id)}
                      onDrop={(e) => onColDrop(e, col.id)}
                      onDragEnd={onColDragEnd}
                      onClick={() => sortable && toggleSort(col.id)}
                      className={cn(
                        "relative cursor-grab select-none pr-4 active:cursor-grabbing",
                        dragOverColId === col.id && "border-l-2 border-l-primary bg-muted/60",
                        isSorted && "bg-muted/30",
                      )}
                    >
                      <span className="block truncate">
                        {col.label}
                        {isSorted && <span className="ml-1 text-xs text-muted-foreground">{sort!.dir === "asc" ? "↑" : "↓"}</span>}
                      </span>
                      <div
                        role="separator"
                        aria-label={`Resize ${col.label}`}
                        aria-orientation="vertical"
                        className="absolute top-0 right-0 h-full w-2 cursor-col-resize touch-none after:absolute after:top-2 after:right-1 after:h-[calc(100%-1rem)] after:w-px after:bg-transparent hover:after:bg-border"
                        onPointerDown={(e) => { e.stopPropagation(); resizeColumn(col, e); }}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setWidths((cur) => { const next = { ...cur }; delete next[col.id]; return next; });
                        }}
                      />
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {totalCount === 0 && (
                <TableRow className="transition-none hover:bg-transparent">
                  <TableCell colSpan={orderedColumns.length} className="h-32 text-center text-muted-foreground">
                    No tasks match.
                  </TableCell>
                </TableRow>
              )}
              {paddingTop > 0 && (
                <tr aria-hidden style={{ height: paddingTop }}><td colSpan={orderedColumns.length} className="p-0" /></tr>
              )}
              {virtualRows.map((vRow) => {
                const item = rowsByOffset.get(vRow.index);
                if (!item) {
                  return (
                    <TableRow key={`s-${vRow.index}`} className="h-[37px] transition-none hover:bg-transparent">
                      {orderedColumns.map((col, i) => (
                        <TableCell key={col.id} className="py-2.5">
                          <div className="h-3 rounded bg-muted/70" style={{ width: i === 0 ? "80%" : "55%" }} />
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                }
                return (
                  <GridRow
                    key={item.task.id}
                    row={vRow.index}
                    item={item}
                    orderedColumns={orderedColumns}
                    canEdit={canEdit}
                    statuses={statuses}
                    statusById={statusById}
                    fieldDefsById={fieldDefsById}
                    userNames={userNames}
                    activeUsers={activeUsers}
                    spaceTags={spaceTags}
                    editingColId={editingCell?.row === vRow.index ? editingCell.colId : null}
                    onStartEdit={(colId) => openEditorAt({ row: vRow.index, col: orderedColumns.findIndex((c) => c.id === colId) })}
                    onStopEdit={() => setEditingCell(null)}
                    onPatchTask={patchTask}
                    onPatchCustomField={patchCustomField}
                    onMouseDownCell={(col, e) => { beginSelect(vRow.index, col, e.shiftKey); }}
                  />
                );
              })}
              {paddingBottom > 0 && (
                <tr aria-hidden style={{ height: paddingBottom }}><td colSpan={orderedColumns.length} className="p-0" /></tr>
              )}
            </TableBody>
          </table>

          {/* selection + fill-preview overlay — geometry-derived, no per-cell measurement */}
          {selection && (() => {
            const rect = normRect(selection);
            const previewEnd = fillPreviewRow != null ? Math.max(fillPreviewRow, rect.rowEnd) : rect.rowEnd;
            const left = colOffsets[rect.colStart] ?? 0;
            const right = (colOffsets[rect.colEnd] ?? 0) + columnWidth(orderedColumns[rect.colEnd] ?? { id: "", label: "", width: 0, minWidth: 0 });
            return (
              <>
                <div
                  className="pointer-events-none absolute border-2 border-primary bg-primary/10"
                  style={{
                    left,
                    width: right - left,
                    top: HEADER_H + rect.rowStart * ROW_H,
                    height: (rect.rowEnd - rect.rowStart + 1) * ROW_H,
                  }}
                />
                {fillPreviewRow != null && previewEnd > rect.rowEnd && (
                  <div
                    className="pointer-events-none absolute border-2 border-dashed border-primary/70"
                    style={{
                      left,
                      width: right - left,
                      top: HEADER_H + (rect.rowEnd + 1) * ROW_H,
                      height: (previewEnd - rect.rowEnd) * ROW_H,
                    }}
                  />
                )}
                {canEdit && (
                  <div
                    role="presentation"
                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); beginFill(); }}
                    className="absolute size-2.5 cursor-crosshair border border-background bg-primary"
                    style={{ left: right - 5, top: HEADER_H + (rect.rowEnd + 1) * ROW_H - 5 }}
                  />
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ─── row (display + inline editors, click-to-select / dblclick-to-edit) ────

function GridRow({
  row,
  item,
  orderedColumns,
  canEdit,
  statuses,
  statusById,
  fieldDefsById,
  userNames,
  activeUsers,
  spaceTags,
  editingColId,
  onStartEdit,
  onStopEdit,
  onPatchTask,
  onPatchCustomField,
  onMouseDownCell,
}: {
  row: number;
  item: TaskWithMeta;
  orderedColumns: ColumnDef[];
  canEdit: boolean;
  statuses: StatusLike[];
  statusById: Map<string, StatusLike>;
  fieldDefsById: Map<string, FieldDefLike>;
  userNames: Map<string, string>;
  activeUsers: { id: string; displayName: string; photoKey: string | null }[];
  spaceTags: TagOption[];
  editingColId: string | null;
  onStartEdit: (colId: string) => void;
  onStopEdit: () => void;
  onPatchTask: (taskId: string, patch: Partial<TaskWithMeta["task"]>) => void;
  onPatchCustomField: (taskId: string, defId: string, value: unknown) => void;
  onMouseDownCell: (col: number, e: React.MouseEvent) => void;
}) {
  const task = item.task;
  const cf = (task.customFields ?? {}) as Record<string, unknown>;

  function renderCell(col: ColumnDef, colIndex: number) {
    const editing = canEdit && editingColId === col.id;
    const cellProps = {
      className: "cursor-cell select-none p-0.5",
      onMouseDown: (e: React.MouseEvent) => { if (!editing) onMouseDownCell(colIndex, e); },
      onDoubleClick: () => onStartEdit(col.id),
    };

    switch (col.id) {
      case "number":
        return <TableCell key={col.id} {...cellProps} className={cn(cellProps.className, "font-mono text-xs text-muted-foreground")}>{task.number}</TableCell>;

      case "title":
        return (
          <TableCell key={col.id} {...cellProps}>
            {editing ? (
              <TitleEditCell
                taskId={task.id}
                number={task.number}
                title={task.title}
                canEdit
                startEditing
                onSaved={(next) => { onPatchTask(task.id, { title: next }); onStopEdit(); }}
              />
            ) : (
              <Link
                href={`/tasks/task/${task.number}`}
                className="flex min-w-0 items-center gap-1.5 truncate px-1.5 py-1 font-medium hover:underline"
              >
                {item.taskType && (
                  <EntityIcon
                    icon={item.taskType.icon}
                    color={item.taskType.color}
                    fallback="taskType"
                    size="sm"
                    className="shrink-0"
                  />
                )}
                <span className="min-w-0 truncate">{task.title}</span>
              </Link>
            )}
          </TableCell>
        );

      case "status": {
        if (editing) {
          return (
            <TableCell key={col.id} {...cellProps}>
              <StatusSelectCell
                taskId={task.id}
                statusId={task.statusId}
                statuses={statuses}
                defaultOpen
                onOpenChange={(open) => { if (!open) onStopEdit(); }}
                onSaved={(next) => { onPatchTask(task.id, { statusId: next }); onStopEdit(); }}
              />
            </TableCell>
          );
        }
        const st = statusById.get(task.statusId);
        return (
          <TableCell key={col.id} {...cellProps}>
            {st ? (
              <TableChip style={{ backgroundColor: st.color, color: "#fff" }} title={st.name}>
                <span className="size-1.5 shrink-0 rounded-full bg-white/90" />
                <span className="truncate">{st.name}</span>
              </TableChip>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </TableCell>
        );
      }

      case "priority": {
        if (editing) {
          return (
            <TableCell key={col.id} {...cellProps}>
              <PrioritySelectCell
                taskId={task.id}
                priority={task.priority}
                defaultOpen
                onOpenChange={(open) => { if (!open) onStopEdit(); }}
                onSaved={(next) => { onPatchTask(task.id, { priority: next }); onStopEdit(); }}
              />
            </TableCell>
          );
        }
        return (
          <TableCell key={col.id} {...cellProps}>
            {task.priority ? (
              <TableChip className={PRIORITY_CARD_STYLES[task.priority] ?? PRIORITY_CARD_STYLES.normal}>
                {PRIORITY_LABELS[task.priority] ?? task.priority}
              </TableChip>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </TableCell>
        );
      }

      case "due":
      case "start_date": {
        const field = col.id === "due" ? "dueDate" : "startDate";
        const value = col.id === "due" ? task.dueDate : task.startDate;
        if (editing) {
          return (
            <TableCell key={col.id} {...cellProps}>
              <TaskDateCell
                taskId={task.id}
                field={field}
                value={value}
                startEditing
                onCancel={onStopEdit}
                onSaved={(next) => { onPatchTask(task.id, { [field]: next }); onStopEdit(); }}
              />
            </TableCell>
          );
        }
        return <TableCell key={col.id} {...cellProps} className={cn(cellProps.className, "truncate")}>{fmtShortDate(value)}</TableCell>;
      }

      case "created_at":
        return <TableCell key={col.id} {...cellProps} className="p-0.5 text-sm">{fmtShortDate(task.createdAt)}</TableCell>;
      case "closed_at":
        return <TableCell key={col.id} {...cellProps} className="p-0.5 text-sm">{fmtShortDate(task.completedAt)}</TableCell>;

      case "tags":
        if (editing) {
          return (
            <TableCell key={col.id} {...cellProps} onClick={(e) => e.stopPropagation()}>
              <TagPicker taskId={task.id} spaceTags={spaceTags} selectedTags={item.tags} compact />
            </TableCell>
          );
        }
        return (
          <TableCell key={col.id} {...cellProps}>
            {item.tags.length > 0 ? <TagChips tags={item.tags} /> : <span className="text-muted-foreground">—</span>}
          </TableCell>
        );

      case "assignees":
        return (
          <TableCell key={col.id} {...cellProps} onClick={(e) => e.stopPropagation()}>
            {canEdit ? (
              <AssigneeSelect taskId={task.id} users={activeUsers} selectedUsers={item.assignees} size="sm" />
            ) : (
              <AssigneeAvatarStack users={item.assignees} size="sm" />
            )}
          </TableCell>
        );

      default: {
        if (!col.id.startsWith("field-")) return <TableCell key={col.id} {...cellProps} />;
        const defId = col.id.slice(6);
        const def = fieldDefsById.get(defId);
        if (!def) return <TableCell key={col.id} {...cellProps} />;
        if (editing) {
          return (
            <TableCell key={col.id} {...cellProps}>
              <CustomFieldEditCell
                taskId={task.id}
                def={def}
                value={cf[defId]}
                users={activeUsers}
                onSaved={(next) => onPatchCustomField(task.id, defId, next)}
              />
            </TableCell>
          );
        }
        return <TableCell key={col.id} {...cellProps} className={cn(cellProps.className, "truncate")}>{renderFieldValue(def, cf[defId], userNames)}</TableCell>;
      }
    }
  }

  return (
    <TableRow data-index={row} className="h-[37px] transition-none hover:bg-muted/40">
      {orderedColumns.map((col, i) => renderCell(col, i))}
    </TableRow>
  );
}
