"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createSecretCategory } from "../actions";
import type { SecretCategoryRow } from "../queries";

const CATEGORY_COLOR_PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
] as const;

export function AddSecretCategoryDialog({
  listId,
  onCreated,
}: {
  listId: string;
  onCreated: (category: SecretCategoryRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(CATEGORY_COLOR_PALETTE[6]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setColor(CATEGORY_COLOR_PALETTE[6]);
    setError(null);
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      try {
        const category = await createSecretCategory({ listId, name: trimmed, color });
        onCreated(category);
        setOpen(false);
        reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create category");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Add category
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New category</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="secret-category-name">Name</Label>
            <Input
              id="secret-category-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="e.g. Vendor Portals"
              maxLength={50}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Color</Label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => setColor(c)}
                  className={cn(
                    "size-6 rounded-full ring-offset-background transition-shadow",
                    color === c && "ring-2 ring-ring ring-offset-1",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" onClick={submit} disabled={pending || !name.trim()}>
            {pending ? "Creating…" : "Create category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
