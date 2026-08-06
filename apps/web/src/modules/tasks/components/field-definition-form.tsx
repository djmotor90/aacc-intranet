"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createFieldDefinition } from "../actions";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Text area" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "multi_select", label: "Multi-select" },
  { value: "color", label: "Color" },
  { value: "user", label: "People" },
  { value: "checkbox", label: "Checkbox" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "file", label: "Files" },
] as const;

const OPTIONS_TYPES = new Set(["dropdown", "multi_select"]);

/** Starter palette for color fields. */
const PRESET_COLORS: { hex: string; name: string }[] = [
  { hex: "#ef4444", name: "Red" },
  { hex: "#f97316", name: "Orange" },
  { hex: "#eab308", name: "Yellow" },
  { hex: "#22c55e", name: "Green" },
  { hex: "#14b8a6", name: "Teal" },
  { hex: "#3b82f6", name: "Blue" },
  { hex: "#8b5cf6", name: "Purple" },
  { hex: "#ec4899", name: "Pink" },
  { hex: "#64748b", name: "Slate" },
  { hex: "#0f172a", name: "Dark" },
  { hex: "#ffffff", name: "White" },
  { hex: "#a3a3a3", name: "Gray" },
];

type ColorOpt = { hex: string; name: string };

/** Hex only when unnamed; `#hex Name` when a label is set. */
function serializeColorOptions(opts: ColorOpt[]): string {
  return opts
    .map((o) => {
      const name = o.name.trim();
      return name ? `${o.hex} ${name}` : o.hex;
    })
    .join("\n");
}

export function FieldDefinitionForm({ listId }: { listId: string }) {
  const [type, setType] = useState("text");
  // Default: unlabeled swatches (name empty) — labels are optional for color fields.
  const [colorOptions, setColorOptions] = useState<ColorOpt[]>(() =>
    PRESET_COLORS.slice(0, 6).map((p) => ({ hex: p.hex, name: "" })),
  );
  const [customHex, setCustomHex] = useState("#6366f1");
  const [customName, setCustomName] = useState("");

  const colorOptionsText = useMemo(() => serializeColorOptions(colorOptions), [colorOptions]);

  function togglePreset(p: { hex: string; name: string }) {
    setColorOptions((cur) => {
      const exists = cur.some((o) => o.hex.toLowerCase() === p.hex.toLowerCase());
      if (exists) return cur.filter((o) => o.hex.toLowerCase() !== p.hex.toLowerCase());
      // Presets add as unlabeled swatches; user can name them in the list below.
      return [...cur, { hex: p.hex, name: "" }];
    });
  }

  function addCustomColor() {
    let hex = customHex.trim();
    if (!hex.startsWith("#")) hex = `#${hex}`;
    if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex)) return;
    if (hex.length === 4) {
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    hex = hex.toLowerCase();
    const name = customName.trim(); // optional — empty = swatch only
    setColorOptions((cur) => {
      if (cur.some((o) => o.hex === hex)) return cur;
      return [...cur, { hex, name }];
    });
    setCustomName("");
  }

  function removeColor(hex: string) {
    setColorOptions((cur) => cur.filter((o) => o.hex !== hex));
  }

  return (
    <form action={createFieldDefinition} className="flex flex-col gap-3 border-t pt-4">
      <input type="hidden" name="listId" value={listId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-label">Label</Label>
          <Input id="f-label" name="label" required className="w-48" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-type">Type</Label>
          <select
            id="f-type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" name="isRequired" className="size-4 rounded border" />
          Required on create
        </label>
        <Button type="submit" disabled={type === "color" && colorOptions.length === 0}>
          Add field
        </Button>
      </div>

      {type === "user" && (
        <p className="max-w-lg text-xs text-muted-foreground">
          People fields let you pick one or more users on each task. Names appear in the list
          view.
        </p>
      )}

      {OPTIONS_TYPES.has(type) && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-options">Options — one per line</Label>
          <Textarea id="f-options" name="options" rows={3} className="max-w-sm" />
        </div>
      )}

      {type === "color" && (
        <div className="flex max-w-lg flex-col gap-3 rounded-lg border bg-muted/20 p-3">
          <input type="hidden" name="options" value={colorOptionsText} />
          <div>
            <p className="text-sm font-medium">Color palette</p>
            <p className="text-xs text-muted-foreground">
              Pick preset swatches or add custom hex colors. Names are optional — leave blank for
              color-only chips. Users pick one swatch per task.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PRESET_COLORS.map((p) => {
              const selected = colorOptions.some(
                (o) => o.hex.toLowerCase() === p.hex.toLowerCase(),
              );
              return (
                <button
                  key={p.hex}
                  type="button"
                  title={p.name}
                  onClick={() => togglePreset(p)}
                  className={cn(
                    "size-7 rounded-full border-2 shadow-sm transition-transform hover:scale-110",
                    selected ? "border-foreground ring-2 ring-ring ring-offset-1" : "border-border",
                  )}
                  style={{ backgroundColor: p.hex }}
                />
              );
            })}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="f-custom-hex">Custom color</Label>
              <div className="flex items-center gap-2">
                <input
                  id="f-custom-hex"
                  type="color"
                  value={/^#[0-9A-Fa-f]{6}$/.test(customHex) ? customHex : "#6366f1"}
                  onChange={(e) => setCustomHex(e.target.value)}
                  className="size-9 cursor-pointer rounded border bg-transparent p-0.5"
                />
                <Input
                  value={customHex}
                  onChange={(e) => setCustomHex(e.target.value)}
                  className="w-28 font-mono text-xs"
                  placeholder="#6366f1"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="f-custom-name">Name (optional)</Label>
              <Input
                id="f-custom-name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-36"
                placeholder="Indigo"
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addCustomColor}>
              <Plus className="size-3.5" />
              Add
            </Button>
          </div>

          {colorOptions.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {colorOptions.map((o) => (
                <li
                  key={o.hex}
                  className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm"
                >
                  <span
                    className="size-5 shrink-0 rounded-full border border-border shadow-sm"
                    style={{ backgroundColor: o.hex }}
                  />
                  <Input
                    value={o.name}
                    onChange={(e) =>
                      setColorOptions((cur) =>
                        cur.map((x) => (x.hex === o.hex ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    className="min-w-0 flex-1 h-8"
                    placeholder="Name (optional)"
                  />
                  <span className="font-mono text-xs text-muted-foreground">{o.hex}</span>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => removeColor(o.hex)}
                    aria-label={`Remove ${o.name}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-destructive">Add at least one color.</p>
          )}
        </div>
      )}
    </form>
  );
}
