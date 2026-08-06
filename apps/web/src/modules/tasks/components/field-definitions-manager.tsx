"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { archiveFieldDefinition, updateFieldDefinition } from "../actions";
import { FieldDefinitionForm } from "./field-definition-form";

export type FieldDefRow = {
  id: string;
  label: string;
  type: string;
  options: unknown;
  isRequired: boolean;
  isArchived: boolean;
};

type OptionDraft = {
  /** Stable client key for React lists */
  key: string;
  id?: string;
  label: string;
  color?: string;
};

const OPTION_TYPES = new Set(["dropdown", "multi_select", "color"]);

const PRESET_COLORS = [
  "#007582",
  "#BE5513",
  "#ef4444",
  "#eab308",
  "#22c55e",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
  "#0f172a",
  "#a3a3a3",
  "#ffffff",
];

function newKey() {
  return `k_${Math.random().toString(36).slice(2, 10)}`;
}

function optionsFromField(field: FieldDefRow): OptionDraft[] {
  const raw = (field.options ?? []) as { id: string; label: string; color?: string }[];
  return raw.map((o) => ({
    key: newKey(),
    id: o.id,
    label: o.label,
    color: o.color,
  }));
}

const TYPE_LABELS: Record<string, string> = {
  text: "Text",
  textarea: "Text area",
  number: "Number",
  date: "Date",
  dropdown: "Dropdown",
  multi_select: "Multi-select",
  color: "Color",
  user: "People",
  checkbox: "Checkbox",
  url: "URL",
  email: "Email",
  phone: "Phone",
};

function FieldEditDialog({
  field,
  open,
  onOpenChange,
}: {
  field: FieldDefRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState(field.label);
  const [isRequired, setIsRequired] = useState(field.isRequired);
  const [options, setOptions] = useState<OptionDraft[]>(() => optionsFromField(field));
  const [error, setError] = useState<string | null>(null);

  const hasOptions = OPTION_TYPES.has(field.type);

  // Reset draft when the dialog opens for this field
  // (adjust-state-during-render instead of an effect).
  const [prevTarget, setPrevTarget] = useState({ open, field });
  if (prevTarget.open !== open || prevTarget.field !== field) {
    setPrevTarget({ open, field });
    if (open) {
      setLabel(field.label);
      setIsRequired(field.isRequired);
      setOptions(optionsFromField(field));
      setError(null);
    }
  }

  function updateOption(key: string, patch: Partial<OptionDraft>) {
    setOptions((cur) => cur.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  }

  function removeOption(key: string) {
    setOptions((cur) => cur.filter((o) => o.key !== key));
  }

  function addOption() {
    if (field.type === "color") {
      setOptions((cur) => [
        ...cur,
        { key: newKey(), label: "", color: "#007582" },
      ]);
    } else {
      setOptions((cur) => [...cur, { key: newKey(), label: "" }]);
    }
  }

  function save() {
    setError(null);
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Label is required");
      return;
    }
    if (hasOptions) {
      const cleaned =
        field.type === "color"
          ? options
              .map((o) => ({
                id: o.id,
                label: o.label.trim(), // may be empty — swatch only
                color: o.color,
              }))
              .filter((o) => Boolean(o.color))
          : options
              .map((o) => ({
                id: o.id,
                label: o.label.trim(),
                color: o.color,
              }))
              .filter((o) => o.label.length > 0);
      if (cleaned.length === 0) {
        setError(field.type === "color" ? "Add at least one color" : "Add at least one option");
        return;
      }
      if (field.type === "color" && cleaned.some((o) => !o.color)) {
        setError("Every color option needs a hex color");
        return;
      }
      startTransition(async () => {
        try {
          await updateFieldDefinition({
            fieldId: field.id,
            label: trimmed,
            isRequired,
            options: cleaned,
          });
          toast.success("Field updated");
          onOpenChange(false);
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to update");
        }
      });
      return;
    }

    startTransition(async () => {
      try {
        await updateFieldDefinition({
          fieldId: field.id,
          label: trimmed,
          isRequired,
        });
        toast.success("Field updated");
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit field</DialogTitle>
          <DialogDescription>
            {TYPE_LABELS[field.type] ?? field.type}
            {hasOptions
              ? field.type === "color"
                ? " — manage swatches. Names are optional; leave blank for color-only chips."
                : " — rename the field and manage options. Renaming an option keeps existing task values."
              : " — rename the field or change whether it is required on create."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-field-label">Label</Label>
            <Input
              id="edit-field-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={pending}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border"
              checked={isRequired}
              disabled={pending}
              onChange={(e) => setIsRequired(e.target.checked)}
            />
            Required when creating a task
          </label>

          {hasOptions && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Options</Label>
                <Button type="button" variant="outline" size="sm" onClick={addOption} disabled={pending}>
                  <Plus className="size-3.5" />
                  Add option
                </Button>
              </div>

              {field.type === "color" ? (
                <ul className="flex flex-col gap-2">
                  {options.map((o) => (
                    <li
                      key={o.key}
                      className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2"
                    >
                      <input
                        type="color"
                        value={
                          o.color && /^#[0-9A-Fa-f]{6}$/.test(o.color) ? o.color : "#007582"
                        }
                        onChange={(e) => updateOption(o.key, { color: e.target.value })}
                        className="size-9 cursor-pointer rounded border bg-transparent p-0.5"
                        disabled={pending}
                      />
                      <Input
                        value={o.color ?? ""}
                        onChange={(e) => updateOption(o.key, { color: e.target.value })}
                        className="w-28 font-mono text-xs"
                        placeholder="#007582"
                        disabled={pending}
                      />
                      <Input
                        value={o.label}
                        onChange={(e) => updateOption(o.key, { label: e.target.value })}
                        className="min-w-[8rem] flex-1"
                        placeholder="Name (optional)"
                        disabled={pending}
                      />
                      <div className="flex flex-wrap gap-1">
                        {PRESET_COLORS.map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            title={hex}
                            disabled={pending}
                            onClick={() => updateOption(o.key, { color: hex })}
                            className={cn(
                              "size-5 rounded-full border border-border",
                              o.color?.toLowerCase() === hex && "ring-2 ring-ring ring-offset-1",
                            )}
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto text-destructive"
                        disabled={pending || options.length <= 1}
                        onClick={() => removeOption(o.key)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {options.map((o) => (
                    <li key={o.key} className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full bg-muted-foreground/40"
                        title={o.id ? "Existing option" : "New option"}
                      />
                      <Input
                        value={o.label}
                        onChange={(e) => updateOption(o.key, { label: e.target.value })}
                        placeholder="Option label"
                        disabled={pending}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-destructive"
                        disabled={pending || options.length <= 1}
                        onClick={() => removeOption(o.key)}
                        aria-label="Remove option"
                      >
                        <X className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-xs text-muted-foreground">
                Removing an option does not delete historical values on tasks — they stay until
                someone clears or changes them.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FieldDefinitionsManager({
  listId,
  fieldDefs,
}: {
  listId: string;
  fieldDefs: FieldDefRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<FieldDefRow | null>(null);
  const [pendingArchive, startArchive] = useTransition();

  function archive(fieldId: string) {
    if (!window.confirm("Archive this field? It will be hidden from forms but historical values stay readable.")) {
      return;
    }
    startArchive(async () => {
      try {
        const fd = new FormData();
        fd.set("fieldId", fieldId);
        await archiveFieldDefinition(fd);
        toast.success("Field archived");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to archive");
      }
    });
  }

  const active = fieldDefs.filter((f) => !f.isArchived);
  const archived = fieldDefs.filter((f) => f.isArchived);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {active.map((f) => {
          const opts = (f.options ?? []) as { id: string; label: string; color?: string }[];
          return (
            <li
              key={f.id}
              className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{f.label}</span>
                  <Badge variant="outline">{TYPE_LABELS[f.type] ?? f.type}</Badge>
                  {f.isRequired && <Badge variant="secondary">required</Badge>}
                </div>
                {OPTION_TYPES.has(f.type) && opts.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {opts.slice(0, 12).map((o) => (
                      <span
                        key={o.id}
                        className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px]"
                        title={o.label || o.color || o.id}
                      >
                        {f.type === "color" && o.color ? (
                          <span
                            className="size-3 rounded-full border border-border"
                            style={{ backgroundColor: o.color }}
                          />
                        ) : null}
                        {f.type === "color" ? (o.label || null) : o.label}
                      </span>
                    ))}
                    {opts.length > 12 && (
                      <span className="text-[11px] text-muted-foreground">+{opts.length - 12} more</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setEditing(f)}
                >
                  <Pencil className="size-3.5" />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pendingArchive}
                  onClick={() => archive(f.id)}
                >
                  Archive
                </Button>
              </div>
            </li>
          );
        })}
        {active.length === 0 && (
          <li className="text-sm text-muted-foreground">No custom fields yet.</li>
        )}
      </ul>

      {archived.length > 0 && (
        <div className="rounded-lg border border-dashed p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Archived</p>
          <ul className="flex flex-col gap-1">
            {archived.map((f) => (
              <li key={f.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="line-through">{f.label}</span>
                <Badge variant="outline" className="text-[10px]">
                  {TYPE_LABELS[f.type] ?? f.type}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <FieldDefinitionForm listId={listId} />

      {editing && (
        <FieldEditDialog
          key={editing.id}
          field={editing}
          open={Boolean(editing)}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      )}
    </div>
  );
}
