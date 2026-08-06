"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MODULE_ICONS, type WorkspaceModuleRow } from "@/modules/shell/module-types";
import {
  createWorkspaceModule,
  deleteWorkspaceModule,
  getWorkspaceModulesData,
  updateWorkspaceModule,
} from "@/modules/shell/actions/modules";

export function SettingsModulesPanel() {
  const [rows, setRows] = useState<WorkspaceModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    icon: "building" as string,
    color: "#64748b",
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getWorkspaceModulesData();
      setRows(data.modules);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load apps");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  function startCreate() {
    setEditId(null);
    setCreating(true);
    setForm({ name: "", description: "", icon: "building", color: "#64748b" });
  }

  function startEdit(row: WorkspaceModuleRow) {
    setCreating(false);
    setEditId(row.id);
    setForm({
      name: row.name,
      description: row.description ?? "",
      icon: row.icon || "tasks",
      color: row.color ?? "#64748b",
    });
  }

  function cancelForm() {
    setCreating(false);
    setEditId(null);
  }

  function submitForm() {
    const name = form.name.trim();
    if (!name) return;
    startTransition(async () => {
      try {
        if (editId) {
          await updateWorkspaceModule({
            moduleId: editId,
            name,
            description: form.description,
            icon: form.icon,
            color: form.color,
          });
        } else {
          await createWorkspaceModule({
            name,
            description: form.description,
            icon: form.icon,
            color: form.color,
          });
        }
        cancelForm();
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading apps…</p>;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Building2 className="size-5 text-primary" />
            Apps &amp; menus
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Top-level sidebar items (Tasks, Accounts, …). Each app has its own spaces and lists so
            departments stay separated.
          </p>
        </div>
        {!creating && !editId && (
          <Button type="button" size="sm" onClick={startCreate}>
            <Plus className="size-4" /> New app
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {(creating || editId) && (
        <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4">
          <h3 className="text-sm font-semibold">{editId ? "Rename app" : "Create app"}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="mod-name">Name</Label>
              <Input
                id="mod-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Accounts"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="mod-desc">Description (optional)</Label>
              <Input
                id="mod-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What this app is for"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mod-icon">Icon</Label>
              <select
                id="mod-icon"
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
              >
                {MODULE_ICONS.map((ic) => (
                  <option key={ic} value={ic}>
                    {ic}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mod-color">Color</Label>
              <Input
                id="mod-color"
                type="color"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="h-9 w-16 p-1"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={pending || !form.name.trim()} onClick={submitForm}>
              {editId ? "Save" : "Create"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={cancelForm}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <ul className="divide-y rounded-xl border">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white"
              style={{ backgroundColor: row.color || "#64748b" }}
            >
              {row.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{row.name}</span>
                {row.isSystem && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    System
                  </span>
                )}
                {!row.isEnabled && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    Disabled
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                /{row.slug === "tasks" ? "tasks" : `w/${row.slug}`} · {row.spaceCount} space
                {row.spaceCount === 1 ? "" : "s"} · icon: {row.icon}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-8 p-0"
                title="Rename"
                onClick={() => startEdit(row)}
              >
                <Pencil className="size-3.5" />
              </Button>
              {!row.isSystem && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-8 p-0 text-destructive hover:text-destructive"
                  title="Delete"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`Delete app “${row.name}”? It must have no spaces.`)) return;
                    startTransition(async () => {
                      try {
                        await deleteWorkspaceModule(row.id);
                        await load();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Delete failed");
                      }
                    });
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className={cn("text-xs text-muted-foreground")}>
        Create spaces under an app via right-click on its sidebar item. Spaces and lists stay under{" "}
        <code className="rounded bg-muted px-1">/tasks/…</code> paths; the menu only separates the
        trees.
      </p>
    </div>
  );
}
