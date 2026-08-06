"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import {
  APPEARANCE_COLORS,
  APPEARANCE_EMOJIS,
  EntityIcon,
} from "./entity-icon";

export type AppearanceKind = "space" | "folder" | "list";

export function ColorIconDialog({
  open,
  onOpenChange,
  kind,
  name,
  initialIcon,
  initialColor,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: AppearanceKind;
  name: string;
  initialIcon?: string | null;
  initialColor?: string | null;
  onSave: (params: { icon: string | null; color: string | null }) => Promise<void>;
}) {
  /** Folders are color-only (standard folder glyph + tint). */
  const colorOnly = kind === "folder";
  const [icon, setIcon] = useState(initialIcon ?? "");
  const [color, setColor] = useState(initialColor?.trim() || APPEARANCE_COLORS[0]);
  const [customEmoji, setCustomEmoji] = useState("");
  const [pending, startTransition] = useTransition();

  // Reset the draft when the dialog opens (or the target appearance changes
  // while open) — adjust-state-during-render instead of an effect.
  const [prevReset, setPrevReset] = useState({ open, initialIcon, initialColor, colorOnly });
  if (
    prevReset.open !== open ||
    prevReset.initialIcon !== initialIcon ||
    prevReset.initialColor !== initialColor ||
    prevReset.colorOnly !== colorOnly
  ) {
    setPrevReset({ open, initialIcon, initialColor, colorOnly });
    if (open) {
      setIcon(colorOnly ? "" : (initialIcon ?? ""));
      setColor(initialColor?.trim() || APPEARANCE_COLORS[0]);
      setCustomEmoji("");
    }
  }

  function save() {
    startTransition(async () => {
      try {
        await onSave({
          icon: colorOnly ? null : icon.trim() || null,
          color: color?.trim() || null,
        });
        toast.success(colorOnly ? "Color updated" : "Color & icon updated");
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update");
      }
    });
  }

  function applyCustomEmoji() {
    const value = customEmoji.trim();
    if (!value) return;
    const first = [...value][0] ?? value.slice(0, 4);
    setIcon(first);
    setCustomEmoji("");
  }

  const kindLabel = kind === "space" ? "Space" : kind === "folder" ? "Folder" : "List";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{colorOnly ? "Color" : "Color & Icon"}</DialogTitle>
          <DialogDescription>
            {colorOnly ? (
              <>
                Choose a color for <strong>{name}</strong> ({kindLabel}).
              </>
            ) : (
              <>
                Customize how <strong>{name}</strong> appears in the sidebar ({kindLabel}).
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          <EntityIcon
            icon={colorOnly ? null : icon || null}
            color={color}
            fallback={kind}
            size="lg"
          />
          <p className="text-sm font-medium text-foreground">{name}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">Color</Label>
          <div className="flex flex-wrap gap-1.5">
            {APPEARANCE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                aria-label={`Color ${c}`}
                aria-pressed={color.toLowerCase() === c.toLowerCase()}
                onClick={() => setColor(c)}
                className={cn(
                  "size-7 rounded-full border-2 transition-transform hover:scale-110",
                  color.toLowerCase() === c.toLowerCase()
                    ? "border-foreground ring-2 ring-foreground/20"
                    : "border-transparent",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
            <label
              className="relative flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-muted-foreground/40"
              title="Custom color"
            >
              <span className="text-[10px] text-muted-foreground">+</span>
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#64748b"}
                onChange={(e) => setColor(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
        </div>

        {!colorOnly && (
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Icon</Label>
            <div className="grid max-h-40 grid-cols-10 gap-1 overflow-y-auto rounded-md border p-2">
              <button
                type="button"
                title="No icon"
                onClick={() => setIcon("")}
                className={cn(
                  "flex size-7 items-center justify-center rounded text-[10px] text-muted-foreground hover:bg-muted",
                  !icon && "bg-muted ring-1 ring-foreground/15",
                )}
              >
                ∅
              </button>
              {APPEARANCE_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  title={e}
                  onClick={() => setIcon(e)}
                  className={cn(
                    "flex size-7 items-center justify-center rounded text-base hover:bg-muted",
                    icon === e && "bg-muted ring-1 ring-foreground/15",
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={customEmoji}
                onChange={(e) => setCustomEmoji(e.target.value)}
                placeholder="Or paste any emoji…"
                maxLength={8}
                className="h-8"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyCustomEmoji();
                  }
                }}
              />
              <Button type="button" variant="secondary" size="sm" onClick={applyCustomEmoji}>
                Use
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (!colorOnly) setIcon("");
              setColor(APPEARANCE_COLORS[0]);
            }}
            disabled={pending}
          >
            Reset
          </Button>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
