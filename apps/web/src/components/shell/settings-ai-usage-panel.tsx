"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { AlertTriangle, Cpu, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getAiUsageEvents, getAiUsageSummary } from "@/modules/shell/actions/ai-usage";

const RANGES = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
] as const;

type Summary = Awaited<ReturnType<typeof getAiUsageSummary>>;
type EventRow = Awaited<ReturnType<typeof getAiUsageEvents>>["items"][number];

function fmtNumber(n: number) {
  return new Intl.NumberFormat(undefined, { notation: n >= 100_000 ? "compact" : "standard" }).format(n);
}

function fmtDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

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

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function BreakdownList({
  title,
  rows,
  active,
  onSelect,
}: {
  title: string;
  rows: { key: string; label: string; calls: number; totalTokens: number }[];
  active: string | null;
  onSelect: (key: string | null) => void;
}) {
  const maxTokens = Math.max(1, ...rows.map((r) => r.totalTokens));
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => onSelect(active === r.key ? null : r.key)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-muted",
                  active === r.key && "bg-primary/10",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {fmtNumber(r.calls)} calls
                </span>
                <span className="w-16 shrink-0 text-right text-xs font-medium tabular-nums">
                  {fmtNumber(r.totalTokens)}
                </span>
              </button>
              <div className="mx-1.5 mt-0.5 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${Math.max(4, (r.totalTokens / maxTokens) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusBadge(ok: boolean) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
        ok
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
      )}
    >
      {ok ? "ok" : "error"}
    </span>
  );
}

export function SettingsAiUsagePanel() {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("7d");
  const [agentId, setAgentId] = useState<string | null>(null);
  const [actorUserId, setActorUserId] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<string | null>(null);
  const [status, setStatus] = useState<"all" | "ok" | "error">("all");
  const [q, setQ] = useState("");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(() => {
    startTransition(async () => {
      try {
        const [s, e] = await Promise.all([
          getAiUsageSummary({ range }),
          getAiUsageEvents({
            range,
            agentId: agentId ?? undefined,
            actorUserId: actorUserId ?? undefined,
            model: model ?? undefined,
            purpose: purpose ?? undefined,
            status,
            q: q.trim() || undefined,
            limit: 100,
          }),
        ]);
        setSummary(s);
        setEvents(e.items);
        setTotal(e.total);
        setError(null);
        setRefreshedAt(new Date());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load AI usage");
      }
    });
  }, [range, agentId, actorUserId, model, purpose, status, q]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = summary?.totals;

  return (
    <div className="flex h-full min-h-[560px] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Cpu className="size-5 text-primary" />
            AI Usage
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every chat reply, brief expansion, and knowledge/embedding call — who triggered it,
            which agent, how long it took, and how many tokens it used.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {refreshedAt && <span>refreshed {formatDate(refreshedAt.toISOString()).time}</span>}
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

      {/* Range tabs */}
      <div className="flex flex-wrap gap-1 border-b pb-2">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRange(r.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              range === r.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </p>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Calls" value={fmtNumber(totals?.calls ?? 0)} />
        <StatCard
          label="Errors"
          value={fmtNumber(totals?.errors ?? 0)}
          sub={
            totals && totals.calls > 0
              ? `${((totals.errors / totals.calls) * 100).toFixed(1)}%`
              : undefined
          }
        />
        <StatCard label="Total tokens" value={fmtNumber(totals?.totalTokens ?? 0)} />
        <StatCard label="Prompt tokens" value={fmtNumber(totals?.promptTokens ?? 0)} />
        <StatCard label="Completion tokens" value={fmtNumber(totals?.completionTokens ?? 0)} />
        <StatCard
          label="Avg duration"
          value={fmtDuration(totals?.avgDurationMs ?? 0)}
          sub={totals ? `max ${fmtDuration(totals.maxDurationMs)}` : undefined}
        />
      </div>

      {/* Breakdown panels */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <BreakdownList
          title="By agent"
          active={agentId}
          onSelect={setAgentId}
          rows={(summary?.byAgent ?? []).map((r) => ({
            key: r.agentId ?? "none",
            label: r.agentName ?? "(no agent)",
            calls: r.calls,
            totalTokens: r.totalTokens,
          }))}
        />
        <BreakdownList
          title="By user"
          active={actorUserId}
          onSelect={setActorUserId}
          rows={(summary?.byUser ?? []).map((r) => ({
            key: r.actorUserId ?? "none",
            label: r.actorName ?? r.actorEmail ?? "System",
            calls: r.calls,
            totalTokens: r.totalTokens,
          }))}
        />
        <BreakdownList
          title="By model"
          active={model}
          onSelect={setModel}
          rows={(summary?.byModel ?? []).map((r) => ({
            key: r.model,
            label: r.model,
            calls: r.calls,
            totalTokens: r.totalTokens,
          }))}
        />
        <BreakdownList
          title="By purpose"
          active={purpose}
          onSelect={setPurpose}
          rows={(summary?.byPurpose ?? []).map((r) => ({
            key: r.purpose,
            label: r.purpose,
            calls: r.calls,
            totalTokens: r.totalTokens,
          }))}
        />
      </div>

      {/* Filters for the raw event table */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") load();
            }}
            placeholder="Search user, agent, model, purpose…"
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
          <option value="ok">Ok</option>
          <option value="error">Error</option>
        </select>
        <Button type="button" size="sm" variant="secondary" onClick={() => load()} disabled={pending}>
          Apply
        </Button>
        {(agentId || actorUserId || model || purpose) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setAgentId(null);
              setActorUserId(null);
              setModel(null);
              setPurpose(null);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {total} event{total === 1 ? "" : "s"}
        {events.length < total ? ` · showing ${events.length}` : null}
      </p>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 border-b bg-muted/95 backdrop-blur">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Time
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Who
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Agent
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Purpose
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Model
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Duration
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tokens (p/c/total)
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {events.map((row) => {
              const { date, time } = formatDate(row.createdAt);
              return (
                <tr key={row.id} className="border-b transition-colors hover:bg-muted/40">
                  <td className="px-3 py-2 align-top whitespace-nowrap">
                    <div className="font-medium">{date}</div>
                    <div className="text-xs text-muted-foreground">{time}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="truncate font-medium">{row.actorName ?? "System"}</div>
                    {row.actorEmail && (
                      <div className="truncate text-xs text-muted-foreground">{row.actorEmail}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-muted-foreground">
                    {row.agentName ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top">{row.purpose}</td>
                  <td className="px-3 py-2 align-top text-muted-foreground">{row.model}</td>
                  <td className="px-3 py-2 align-top text-right tabular-nums">
                    {fmtDuration(row.durationMs)}
                  </td>
                  <td className="px-3 py-2 align-top text-right tabular-nums text-muted-foreground">
                    {fmtNumber(row.promptTokens)}/{fmtNumber(row.completionTokens)}/
                    <span className="font-medium text-foreground">{fmtNumber(row.totalTokens)}</span>
                  </td>
                  <td className="px-3 py-2 align-top" title={row.errorMessage ?? undefined}>
                    {statusBadge(row.ok)}
                  </td>
                </tr>
              );
            })}
            {events.length === 0 && !pending && (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-muted-foreground">
                  No AI calls in this range yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
