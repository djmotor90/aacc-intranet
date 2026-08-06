/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import { useRouter } from "next/navigation";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPage } from "@/modules/docs/actions/pages";
import { cn } from "@/lib/utils";

const TEMPLATES = [
  { id: "blank", label: "Blank page" },
  { id: "sop", label: "SOP / procedure" },
  { id: "meeting", label: "Meeting notes" },
  { id: "decision", label: "Decision record" },
] as const;

export function CreatePageDialog({
  spaces,
  defaultSpaceId,
  parentPageId,
  /** Add as top-level peer in an existing doc (ignored when parentPageId is set). */
  docId,
  /** Place a brand-new doc in this hub folder. */
  folderId,
  linkTargetType,
  linkTargetId,
  trigger,
  open: controlledOpen,
  onOpenChange,
  defaultTemplate,
  defaultKind,
  dialogTitle,
  /** When true, home space is fixed (create from space/folder context). */
  lockSpace = false,
  locationLabel,
}: {
  spaces: { id: string; name: string }[];
  defaultSpaceId?: string;
  parentPageId?: string | null;
  docId?: string | null;
  folderId?: string | null;
  linkTargetType?: "space" | "folder" | "list" | "task";
  linkTargetId?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultTemplate?: (typeof TEMPLATES)[number]["id"];
  defaultKind?: "page" | "wiki";
  /** Override dialog heading (e.g. "New subpage"). */
  dialogTitle?: string;
  lockSpace?: boolean;
  /** Shown under the title when creating from a space/folder. */
  locationLabel?: string;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [title, setTitle] = useState("");
  const [spaceId, setSpaceId] = useState(defaultSpaceId ?? spaces[0]?.id ?? "");
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]["id"]>(
    defaultTemplate ?? "blank",
  );
  const [kind, setKind] = useState<"page" | "wiki">(defaultKind ?? "page");
  const [pending, startTransition] = useTransition();

  // Sync presets when controlled dialog opens with new template/kind.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      if (defaultTemplate) setTemplate(defaultTemplate);
      if (defaultKind) setKind(defaultKind);
      if (defaultSpaceId) setSpaceId(defaultSpaceId);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !spaceId) {
      toast.error("Title and space are required");
      return;
    }
    startTransition(async () => {
      try {
        const res = await createPage({
          title: title.trim(),
          homeSpaceId: spaceId || defaultSpaceId || spaces[0]?.id || "",
          parentPageId: parentPageId ?? undefined,
          docId: parentPageId ? undefined : (docId ?? undefined),
          folderId:
            parentPageId || docId ? undefined : (folderId ?? undefined),
          kind: template === "sop" ? "wiki" : kind,
          template: parentPageId || docId ? "blank" : template,
          linkTargetType,
          linkTargetId,
        });
        toast.success("Page created");
        setOpen(false);
        setTitle("");
        router.push(res.path);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not create page");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger != null && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {dialogTitle ?? (parentPageId || docId ? "New page" : "New Doc")}
          </DialogTitle>
          <DialogDescription>
            {parentPageId
              ? "Add a page nested under the current page."
              : docId
                ? "Add a top-level page to this doc. All pages are equal — nest later by dragging."
                : locationLabel
                  ? `Create a doc in ${locationLabel}. You can add more equal pages after opening it.`
                  : "Create a doc. You can add more equal pages after opening it."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">Title</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                parentPageId
                  ? "e.g. Procedure step 1"
                  : "e.g. Incident response SOP"
              }
              autoFocus
            />
          </div>
          {!parentPageId && !docId && !lockSpace && (
            <div className="space-y-1.5">
              <Label>Home space</Label>
              <Select value={spaceId} onValueChange={setSpaceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select space" />
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
          {!parentPageId && lockSpace && locationLabel && (
            <p className="text-xs text-muted-foreground">
              Location: <span className="font-medium text-foreground">{locationLabel}</span>
            </p>
          )}
          {!parentPageId && !docId && (
            <div className="space-y-1.5">
              <Label>Template</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTemplate(t.id);
                      if (t.id === "sop") setKind("wiki");
                    }}
                    className={cn(
                      "rounded-lg border px-2.5 py-2 text-left text-xs transition-colors",
                      template === t.id
                        ? "border-primary bg-primary/5 font-medium"
                        : "hover:bg-muted",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || spaces.length === 0}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
