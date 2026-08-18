"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Bell,
  Building2,
  Check,
  Database,
  Eye,
  EyeOff,
  ClipboardList,
  FileText,
  FolderOpen,
  GripVertical,
  Home,
  type LucideIcon,
  Menu,
  MessageCircle,
  Pencil,
  Shield,
  SquareCheckBig,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getSidebarNavAdmin,
  reorderSidebarNav,
  updateSidebarNavItem,
  type SidebarNavAdminRow,
} from "@/modules/shell/actions/sidebar-nav";
import { NAV_ICONS, type NavIconKey } from "@/modules/shell/nav-catalog";

const ICON_MAP: Record<NavIconKey, LucideIcon> = {
  home: Home,
  tasks: SquareCheckBig,
  users: Users,
  bell: Bell,
  shield: Shield,
  building: Building2,
  docs: FileText,
  forms: ClipboardList,
  files: FolderOpen,
  chat: MessageCircle,
  database: Database,
};

export function SettingsMainMenuPanel() {
  const [rows, setRows] = useState<SidebarNavAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = useCallback(async () => {
    try {
      const next = await getSidebarNavAdmin();
      setError(null);
      setRows(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load menu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await getSidebarNavAdmin();
        if (cancelled) return;
        setRows(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load menu");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((row) => row.id === active.id);
    const to = rows.findIndex((row) => row.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(rows, from, to);
    setRows(next);
    startTransition(async () => {
      try {
        await reorderSidebarNav(next.map((row) => row.id));
        router.refresh();
        toast.success("Menu order saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not reorder");
        await load();
      }
    });
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading menu…</p>;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Menu className="size-5 text-primary" />
          Main menu
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Control the sidebar: rename items, change icons, hide them, or drag to set the order.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <DndContext id="main-menu-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
          <ul className="grid gap-2">
            {rows.map((row) => (
              <MenuRow
                key={row.id}
                row={row}
                disabled={pending}
                onChanged={(patch) => {
                  setRows((cur) => cur.map((item) => (item.id === row.id ? { ...item, ...patch } : item)));
                  router.refresh();
                }}
                onError={setError}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function MenuRow({
  row,
  disabled,
  onChanged,
  onError,
}: {
  row: SidebarNavAdminRow;
  disabled: boolean;
  onChanged: (patch: Partial<SidebarNavAdminRow>) => void;
  onError: (message: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(row.label);
  const [pending, startTransition] = useTransition();

  function saveLabel() {
    const next = label.trim();
    if (!next || next === row.label) {
      setEditing(false);
      setLabel(row.label);
      return;
    }
    startTransition(async () => {
      try {
        await updateSidebarNavItem({ id: row.id, label: next });
        onChanged({ label: next });
        setEditing(false);
        toast.success("Renamed");
      } catch (e) {
        onError(e instanceof Error ? e.message : "Could not rename");
      }
    });
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm",
        isDragging && "opacity-50",
        row.hidden && "opacity-70",
      )}
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={`Reorder ${row.label}`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <IconPicker
        value={row.icon}
        disabled={disabled || pending}
        onChange={(icon) => {
          startTransition(async () => {
            try {
              await updateSidebarNavItem({ id: row.id, icon });
              onChanged({ icon });
              toast.success("Icon updated");
            } catch (e) {
              onError(e instanceof Error ? e.message : "Could not change icon");
            }
          });
        }}
      />

      {editing ? (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="h-8"
            autoFocus
            aria-label="Menu label"
            onKeyDown={(e) => {
              if (e.key === "Enter") saveLabel();
              if (e.key === "Escape") {
                setLabel(row.label);
                setEditing(false);
              }
            }}
          />
          <Button type="button" size="icon-sm" variant="ghost" onClick={saveLabel} aria-label="Save name">
            <Check className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              setLabel(row.label);
              setEditing(false);
            }}
            aria-label="Cancel rename"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{row.label}</span>
            {row.adminOnly && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                Admin
              </span>
            )}
            {row.hidden && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                Hidden
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{row.href}</p>
        </div>
      )}

      {!editing && (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Rename ${row.label}`}
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-3.5" />
        </Button>
      )}

      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={row.locked || pending}
        aria-pressed={!row.hidden}
        aria-label={row.hidden ? `Show ${row.label}` : `Hide ${row.label}`}
        title={row.locked ? "Home stays in the menu" : row.hidden ? "Show in sidebar" : "Hide from sidebar"}
        onClick={() => {
          startTransition(async () => {
            try {
              await updateSidebarNavItem({ id: row.id, hidden: !row.hidden });
              onChanged({ hidden: !row.hidden });
              toast.success(row.hidden ? "Shown in sidebar" : "Hidden from sidebar");
            } catch (e) {
              onError(e instanceof Error ? e.message : "Could not update visibility");
            }
          });
        }}
      >
        {row.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </Button>
    </li>
  );
}

function IconPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (icon: NavIconKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const Current = ICON_MAP[(NAV_ICONS as readonly string[]).includes(value) ? (value as NavIconKey) : "tasks"];
  return (
    <div className="relative">
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        disabled={disabled}
        aria-label="Change icon"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Current className="size-3.5" />
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 grid grid-cols-5 gap-1 rounded-lg border bg-popover p-2 shadow-md">
          {NAV_ICONS.map((icon) => {
            const Glyph = ICON_MAP[icon];
            return (
              <button
                key={icon}
                type="button"
                title={icon}
                className={cn(
                  "flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
                  value === icon && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                )}
                onClick={() => {
                  onChange(icon);
                  setOpen(false);
                }}
              >
                <Glyph className="size-3.5" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
