"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  ClipboardList,
  Copy,
  ExternalLink,
  LayoutGrid,
  List,
  Paperclip,
  Plus,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createFormView } from "../actions/forms";
import type { FormDestination, FormsHubRow } from "../queries";

type Filter = "all" | "live" | "paused";
type ViewMode = "list" | "grid";

const TEMPLATES = [
  { name: "Request", description: "Collect a request as a task", accent: "bg-brand-teal/10 text-brand-teal-deep" },
  { name: "Intake", description: "New person or program intake", accent: "bg-brand-orange/10 text-brand-orange" },
  { name: "Feedback", description: "A short feedback form", accent: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
];

function formatRelativeDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startToday.getTime() - startThat.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function FormsHubClient({
  forms,
  destinations,
  publicBaseUrl,
}: {
  forms: FormsHubRow[];
  destinations: FormDestination[];
  publicBaseUrl: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<ViewMode>("grid");
  const [createOpen, setCreateOpen] = useState(false);
  const [presetName, setPresetName] = useState("Form");
  const [listId, setListId] = useState(destinations[0]?.listId ?? "");
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return forms.filter((form) => {
      if (filter === "live" && !form.isActive) return false;
      if (filter === "paused" && form.isActive) return false;
      if (!needle) return true;
      return `${form.title} ${form.spaceName} ${form.listName}`.toLowerCase().includes(needle);
    });
  }, [forms, q, filter]);

  const liveCount = forms.filter((f) => f.isActive).length;

  function openHref(form: FormsHubRow) {
    return form.listViewId
      ? `/tasks/${form.spaceSlug}/${form.listSlug}?v=${form.listViewId}&view=form`
      : `/tasks/${form.spaceSlug}/${form.listSlug}`;
  }

  function publicUrl(form: FormsHubRow) {
    return `${publicBaseUrl}/forms/${form.slug}`;
  }

  function create(name: string) {
    if (!listId) {
      toast.error("Pick a list to collect submissions");
      return;
    }
    startTransition(async () => {
      try {
        const created = await createFormView({ listId, name });
        const dest = destinations.find((d) => d.listId === listId);
        toast.success("Form created");
        setCreateOpen(false);
        if (dest) {
          router.push(`/tasks/${dest.spaceSlug}/${dest.listSlug}?v=${created.viewId}&view=form`);
          return;
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not create form");
      }
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ClipboardList className="size-6 text-brand-teal-deep" />
            Forms
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Share a link, collect answers as tasks. {liveCount} live
            {forms.length === 1 ? " form" : " forms"}.
          </p>
        </div>
        <Button type="button" onClick={() => { setPresetName("Form"); setCreateOpen(true); }} disabled={destinations.length === 0}>
          <Plus className="size-4" />
          New form
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {TEMPLATES.map((tpl) => (
          <button
            key={tpl.name}
            type="button"
            disabled={destinations.length === 0}
            onClick={() => {
              setPresetName(tpl.name);
              setCreateOpen(true);
            }}
            className="rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow"
          >
            <span className={cn("inline-flex rounded-lg px-2 py-1 text-[11px] font-semibold", tpl.accent)}>{tpl.name}</span>
            <p className="mt-2 text-sm text-muted-foreground">{tpl.description}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">Search forms</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search forms" className="h-9 pl-8" />
        </label>
        {(["all", "live", "paused"] as const).map((id) => (
          <Button key={id} type="button" size="sm" variant={filter === id ? "default" : "outline"} onClick={() => setFilter(id)}>
            {id === "all" ? "All" : id === "live" ? "Live" : "Paused"}
          </Button>
        ))}
        <div className="ml-auto flex gap-1">
          <Button type="button" size="icon-sm" variant={view === "grid" ? "secondary" : "ghost"} aria-label="Grid view" onClick={() => setView("grid")}>
            <LayoutGrid className="size-3.5" />
          </Button>
          <Button type="button" size="icon-sm" variant={view === "list" ? "secondary" : "ghost"} aria-label="List view" onClick={() => setView("list")}>
            <List className="size-3.5" />
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <ClipboardList className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No forms match</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {forms.length === 0 ? "Create a form and share the public link. Submissions become tasks." : "Try a different search or filter."}
          </p>
        </div>
      ) : view === "grid" ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((form) => (
            <li key={form.id} className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <Link href={openHref(form)} className="min-w-0 font-semibold hover:underline">
                  {form.title}
                </Link>
                <Badge variant={form.isActive ? "default" : "secondary"}>{form.isActive ? "Live" : "Paused"}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {form.spaceName} · {form.listName}
              </p>
              <p className="mt-3 text-sm tabular-nums">
                {form.submissionCount} submission{form.submissionCount === 1 ? "" : "s"}
                {form.allowAttachments ? (
                  <span className="ml-2 inline-flex items-center gap-0.5 text-muted-foreground">
                    <Paperclip className="size-3" /> Files
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">Updated {formatRelativeDate(form.updatedAt)}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href={openHref(form)}>Open</Link>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(publicUrl(form));
                    toast.success("Public link copied");
                  }}
                >
                  <Copy className="size-3.5" />
                  Copy link
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <a href={publicUrl(form)} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3.5" />
                    Preview
                  </a>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {visible.map((form) => (
            <li key={form.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={openHref(form)} className="truncate font-medium hover:underline">
                    {form.title}
                  </Link>
                  <Badge variant={form.isActive ? "default" : "secondary"}>{form.isActive ? "Live" : "Paused"}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {form.spaceName} / {form.listName} · {form.submissionCount} submission
                  {form.submissionCount === 1 ? "" : "s"} · {formatRelativeDate(form.updatedAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button asChild size="sm" variant="secondary">
                  <Link href={openHref(form)}>Open</Link>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(publicUrl(form));
                    toast.success("Public link copied");
                  }}
                >
                  Copy link
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New {presetName.toLowerCase()} form</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="form-name">Name</Label>
              <Input id="form-name" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="form-list">Collect into list</Label>
              <select
                id="form-list"
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                className="h-8 rounded-md border bg-transparent px-2 text-sm"
              >
                {destinations.map((dest) => (
                  <option key={dest.listId} value={dest.listId}>
                    {dest.spaceName} · {dest.listName}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending || !listId} onClick={() => create(presetName)}>
              Create form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
