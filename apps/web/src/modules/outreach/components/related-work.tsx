"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Link2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  completeOutreachEvent,
  createAndLinkTask,
  createOutreachEvent,
  deleteOutreachEvent,
  linkExistingTask,
  logOutreachNote,
  searchOutreachTasks,
  unlinkTask,
} from "../actions";
import type { OutreachEntity } from "../lib/stages";

type EntityType = OutreachEntity;

export function RelatedTasks({
  entityType,
  entityId,
  tasks,
  lists,
}: {
  entityType: EntityType;
  entityId: string;
  tasks: {
    linkId: string;
    taskId: string;
    number: string;
    title: string;
    dueDate: string | null;
    statusName: string;
    statusColor: string;
  }[];
  lists: { id: string; name: string; spaceName: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ id: string; number: string; title: string }[]>([]);

  return (
    <section className="rounded-2xl border bg-card p-4" aria-labelledby="related-tasks-heading">
      <h2 id="related-tasks-heading" className="text-sm font-semibold">
        Related tasks ({tasks.length})
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Create a Hub task or connect one that already exists.
      </p>

      <ul className="mt-3 grid gap-2">
        {tasks.length === 0 && <li className="text-sm text-muted-foreground">No tasks linked yet.</li>}
        {tasks.map((task) => (
          <li key={task.linkId} className="flex items-start justify-between gap-2 rounded-xl border px-3 py-2">
            <div className="min-w-0">
              <Link href={`/tasks/task/${task.number}`} className="block truncate text-sm font-medium hover:underline">
                {task.title}
              </Link>
              <div className="text-xs text-muted-foreground">
                {task.number}
                {task.dueDate ? ` · due ${task.dueDate}` : ""} · {task.statusName}
              </div>
            </div>
            <button
              type="button"
              className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Unlink ${task.number}`}
              onClick={() => {
                startTransition(async () => {
                  await unlinkTask(task.linkId);
                  router.refresh();
                });
              }}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      {lists.length > 0 && (
        <form
          className="mt-4 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim() || !listId) return;
            startTransition(async () => {
              try {
                await createAndLinkTask({ listId, title, entityType, entityId });
                setTitle("");
                toast.success("Task created");
                router.refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not create task");
              }
            });
          }}
        >
          <label className="text-xs font-medium" htmlFor="new-task-title">
            New task
          </label>
          <Input id="new-task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Follow up with contact" />
          <label className="sr-only" htmlFor="new-task-list">
            List
          </label>
          <select
            id="new-task-list"
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
          >
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.spaceName} / {list.name}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={pending || !title.trim()}>
            <Plus className="size-3.5" aria-hidden />
            Create task
          </Button>
        </form>
      )}

      <div className="mt-4 grid gap-2">
        <label className="text-xs font-medium" htmlFor="link-task-search">
          Connect existing task
        </label>
        <Input
          id="link-task-search"
          value={query}
          placeholder="Search by title or number"
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            startTransition(async () => {
              setHits(await searchOutreachTasks(next));
            });
          }}
        />
        {hits.length > 0 && (
          <ul className="max-h-40 overflow-auto rounded-md border">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    startTransition(async () => {
                      await linkExistingTask({ taskId: hit.id, entityType, entityId });
                      setQuery("");
                      setHits([]);
                      toast.success("Task linked");
                      router.refresh();
                    });
                  }}
                >
                  <Link2 className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">
                    {hit.number} · {hit.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function localInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultEventTimes() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start: localInputValue(start), end: localInputValue(end) };
}

export function ActivityFeed({
  entityType,
  entityId,
  items,
  upcoming = [],
  events = [],
}: {
  entityType: EntityType;
  entityId: string;
  items: { id: string; kind: string; body: string | null; actorName: string | null; createdAt: Date }[];
  upcoming?: { number: string; title: string; dueDate: string | null; statusName: string }[];
  events?: {
    id: string;
    subject: string;
    startsAt: Date;
    endsAt: Date;
    location: string | null;
    completedAt: Date | null;
    ownerName: string | null;
  }[];
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<"note" | "call" | "event">("note");
  const [pending, startTransition] = useTransition();
  const defaults = defaultEventTimes();
  const openEvents = events.filter((event) => !event.completedAt);
  const placeholders = {
    note: "What happened, and what’s next?",
    call: "Log a call — who, outcome, follow-up…",
    event: "Meeting subject",
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["call", "Log a Call"],
            ["note", "New Note"],
            ["event", "New Event"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setKind(id)}
            className={cn(
              "rounded-sm border px-2.5 py-1.5 text-xs font-medium",
              kind === id
                ? "border-primary bg-secondary text-primary"
                : "border-border bg-card text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {kind === "event" ? (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const data = new FormData(form);
            startTransition(async () => {
              try {
                await createOutreachEvent({
                  entityType,
                  entityId,
                  subject: String(data.get("subject") ?? ""),
                  startsAt: String(data.get("startsAt") ?? ""),
                  endsAt: String(data.get("endsAt") ?? ""),
                  location: String(data.get("location") ?? ""),
                  description: String(data.get("description") ?? ""),
                });
                form.reset();
                toast.success("Event scheduled");
                router.refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not schedule event");
              }
            });
          }}
        >
          <div className="grid gap-1.5 sm:col-span-2">
            <label htmlFor="event-subject" className="text-xs font-medium">
              Subject
            </label>
            <Input id="event-subject" name="subject" required placeholder={placeholders.event} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="event-start" className="text-xs font-medium">
              Start
            </label>
            <Input id="event-start" name="startsAt" type="datetime-local" required defaultValue={defaults.start} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="event-end" className="text-xs font-medium">
              End
            </label>
            <Input id="event-end" name="endsAt" type="datetime-local" required defaultValue={defaults.end} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <label htmlFor="event-location" className="text-xs font-medium">
              Location
            </label>
            <Input id="event-location" name="location" placeholder="Teams, campus, or address" />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <label htmlFor="event-description" className="text-xs font-medium">
              Description
            </label>
            <textarea
              id="event-description"
              name="description"
              className="min-h-16 rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" size="sm" disabled={pending} className="w-fit">
            Save
          </Button>
        </form>
      ) : (
        <form
          className="mt-3 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return;
            startTransition(async () => {
              await logOutreachNote(entityType, entityId, `${kind === "call" ? "Call: " : ""}${note}`);
              setNote("");
              router.refresh();
            });
          }}
        >
          <label htmlFor="activity-note" className="sr-only">
            {placeholders[kind]}
          </label>
          <textarea
            id="activity-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={placeholders[kind]}
            className="min-h-20 rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
          />
          <Button type="submit" size="sm" disabled={pending || !note.trim()} className="w-fit">
            Save
          </Button>
        </form>
      )}

      <div className="mt-6">
        <h3 className="bg-muted px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Upcoming & overdue
        </h3>
        {openEvents.length === 0 && upcoming.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No activities to show. Get started by logging a call, scheduling an event, or creating a task.
          </p>
        ) : (
          <ul className="divide-y">
            {openEvents.map((event) => (
              <li key={event.id} className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{event.subject}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(event.startsAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}
                    {" – "}
                    {new Date(event.endsAt).toLocaleTimeString("en", { timeStyle: "short" })}
                    {event.location ? ` · ${event.location}` : ""}
                    {event.ownerName ? ` · ${event.ownerName}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => {
                      startTransition(async () => {
                        await completeOutreachEvent(event.id);
                        router.refresh();
                      });
                    }}
                  >
                    Complete
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:underline"
                    aria-label={`Delete ${event.subject}`}
                    onClick={() => {
                      startTransition(async () => {
                        await deleteOutreachEvent(event.id);
                        router.refresh();
                      });
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
            {upcoming.map((task) => (
              <li key={task.number} className="px-3 py-2 text-sm">
                <Link href={`/tasks/task/${task.number}`} className="font-medium text-primary hover:underline">
                  {task.title}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {task.dueDate ? `Due ${task.dueDate}` : "No due date"} · {task.statusName}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4">
        <h3 className="bg-muted px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Past activity
        </h3>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No past activity. Past meetings and tasks marked as done show up here.
          </p>
        ) : (
          <ol className="grid gap-3 p-3">
            {items.map((item) => (
              <li key={item.id} className="border-l-2 border-primary pl-3 text-sm">
                <div className="text-xs text-muted-foreground">
                  {item.actorName ?? "Someone"} · {item.kind} ·{" "}
                  {new Date(item.createdAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}
                </div>
                {item.body && <p className="mt-0.5">{item.body}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
