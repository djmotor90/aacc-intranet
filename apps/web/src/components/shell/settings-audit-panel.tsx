"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { ChevronDown, ChevronRight, RefreshCw, Search, Shield } from "lucide-react";
import { Fragment, useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getAdminAuditLogs } from "@/modules/shell/actions/admin";

const TABS = [
  { id: "all", label: "All" },
  { id: "user", label: "User" },
  { id: "task", label: "Task" },
  { id: "fields", label: "Fields" },
  { id: "hierarchy", label: "Hierarchy" },
  { id: "agents", label: "Agents" },
  { id: "other", label: "Other" },
] as const;

type AuditRow = Awaited<ReturnType<typeof getAdminAuditLogs>>["items"][number];

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return {
      date: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(d),
      time: new Intl.DateTimeFormat(undefined, { timeStyle: "medium" }).format(d),
    };
  } catch {
    return { date: iso, time: "" };
  }
}

function roleLabel(role: string | null) {
  if (!role) return "—";
  if (role === "super_admin") return "super admin";
  return role.replace(/_/g, " ");
}

function formatRefreshedAgo(refreshedAt: Date) {
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
    Math.round((refreshedAt.getTime() - Date.now()) / 1000),
    "second",
  );
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
        s === "success" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
        s === "failure" && "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
        s === "denied" && "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
        !["success", "failure", "denied"].includes(s) && "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

function initials(name: string | null, email: string | null) {
  const src = name || email || "?";
  return src
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function SettingsAuditPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [status, setStatus] = useState<"all" | "success" | "failure" | "denied">("all");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(
    (opts?: { silent?: boolean }) => {
      startTransition(async () => {
        try {
          const data = await getAdminAuditLogs({
            category: tab,
            status,
            q: q.trim() || undefined,
            limit: 100,
            offset: 0,
          });
          setItems(data.items);
          setTotal(data.total);
          setError(null);
          setRefreshedAt(new Date());
        } catch (e) {
          if (!opts?.silent) {
            setError(e instanceof Error ? e.message : "Failed to load audit logs");
          }
        }
      });
    },
    [tab, status, q],
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex h-full min-h-[560px] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Shield className="size-5 text-primary" />
            Audit Logs
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Enterprise trail of security and workspace events. Super Admin only. Append-only —
            events are not editable.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {refreshedAt && (
            <span>refreshed {formatRefreshedAgo(refreshedAt)}</span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => load()}
            className="gap-1.5"
          >
            <RefreshCw className={cn("size-3.5", pending && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1 border-b pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") load();
            }}
            placeholder="Search user, event, email…"
            className="h-9 pl-8"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="h-9 rounded-md border bg-transparent px-2 text-sm"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
          <option value="denied">Denied</option>
        </select>
        <Button type="button" size="sm" variant="secondary" onClick={() => load()} disabled={pending}>
          Apply
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {total} event{total === 1 ? "" : "s"}
        {items.length < total ? ` · showing ${items.length}` : null}
      </p>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border">
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 border-b bg-muted/95 backdrop-blur">
            <tr>
              <th className="w-8 px-2 py-2" />
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Date
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                User
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Role
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Event
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const { date, time } = formatDate(row.createdAt);
              const isOpen = expanded === row.id;
              return (
                <Fragment key={row.id}>
                  <tr
                    className={cn(
                      "cursor-pointer border-b transition-colors hover:bg-muted/40",
                      isOpen && "bg-muted/30",
                    )}
                    onClick={() => setExpanded(isOpen ? null : row.id)}
                  >
                    <td className="px-2 py-2 text-muted-foreground">
                      {isOpen ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      <div className="font-medium">{date}</div>
                      <div className="text-xs text-muted-foreground">{time}</div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-2">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                          {initials(row.actorName, row.actorEmail)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {row.actorName ?? "System"}
                          </div>
                          {row.actorEmail && (
                            <div className="truncate text-xs text-muted-foreground">
                              {row.actorEmail}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top capitalize text-muted-foreground">
                      {roleLabel(row.actorRole)}
                    </td>
                    <td className="px-3 py-2 align-top font-medium">{row.title}</td>
                    <td className="px-3 py-2 align-top">{statusBadge(row.eventStatus)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b bg-muted/20">
                      <td colSpan={6} className="px-4 py-3">
                        <pre className="max-h-80 overflow-auto rounded-lg border bg-background p-3 text-xs leading-relaxed">
                          {JSON.stringify(
                            {
                              authPath: (row.payload as { authPath?: string })?.authPath,
                              ...(typeof row.payload === "object" && row.payload
                                ? (row.payload as object)
                                : {}),
                              title: row.title,
                              eventType: row.eventType,
                              eventStatus: row.eventStatus,
                              category: row.category,
                              clientIp: row.clientIp,
                              clientAgent: row.clientAgent,
                              targetType: row.targetType,
                              targetId: row.targetId,
                              targetLabel: row.targetLabel,
                              startTime: row.createdAt,
                              endTime: row.createdAt,
                            },
                            null,
                            2,
                          )}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {items.length === 0 && !pending && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground">
                  No audit events yet. Sign-ins and workspace changes will appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
