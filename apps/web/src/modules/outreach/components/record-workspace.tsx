"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DetailsPanel({
  title,
  edit,
  children,
}: {
  title: string;
  edit?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-border pb-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {edit}
      </div>
      {children}
    </div>
  );
}

export function DetailField({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}

export function RecordWorkspace({
  objectLabel,
  title,
  icon,
  iconClass,
  actions,
  highlights,
  path,
  activity,
  details,
  related = [],
}: {
  objectLabel: string;
  title: string;
  icon: ReactNode;
  iconClass: string;
  actions?: ReactNode;
  highlights: { label: string; value: ReactNode }[];
  path?: ReactNode;
  activity?: ReactNode;
  details: ReactNode;
  related?: { title: string; count: number; icon?: ReactNode; wide?: boolean; children: ReactNode }[];
}) {
  const [tab, setTab] = useState<"activity" | "details">(activity ? "activity" : "details");
  const sideRelated = related.filter((card) => !card.wide);
  const wideRelated = related.filter((card) => card.wide);
  const showTabs = Boolean(activity);

  return (
    <div className="grid gap-3">
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className={cn("mt-0.5 flex size-10 items-center justify-center rounded-lg", iconClass)}>
              {icon}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">{objectLabel}</p>
              <h1 className="truncate text-xl font-bold text-foreground">{title}</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">{actions}</div>
        </div>
        <dl className="grid gap-4 border-t border-border px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
          {highlights.map((field) => (
            <div key={field.label} className="min-w-0">
              <dt className="text-[11px] text-muted-foreground">{field.label}</dt>
              <dd className="truncate text-sm text-primary">{field.value || "—"}</dd>
            </div>
          ))}
        </dl>
      </section>

      {path && (
        <section className="rounded-xl border border-border bg-card px-3 py-3 shadow-sm">{path}</section>
      )}

      <div className={cn("grid items-start gap-3", sideRelated.length > 0 && "lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]")}>
        <section className="min-w-0 rounded-xl border border-border bg-card shadow-sm">
          {showTabs && (
            <div className="flex gap-4 border-b border-border px-4">
              {(
                [
                  ["activity", "Activity"],
                  ["details", "Details"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "border-b-2 py-2.5 text-sm",
                    tab === id
                      ? "border-primary font-semibold text-primary"
                      : "border-transparent text-muted-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="p-4">{showTabs && tab === "activity" ? activity : details}</div>
        </section>

        {sideRelated.length > 0 && (
          <aside className="grid min-w-0 gap-3">
            <h2 className="px-1 text-sm font-bold text-brand-teal-deep">Related</h2>
            {sideRelated.map((card) => (
              <RelatedCard key={card.title} {...card} />
            ))}
          </aside>
        )}
      </div>

      {wideRelated.map((card) => (
        <RelatedCard key={card.title} {...card} />
      ))}
    </div>
  );
}

function RelatedCard({
  title,
  count,
  icon,
  wide,
  children,
}: {
  title: string;
  count: number;
  icon?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(count > 0);
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 bg-muted px-3 py-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {title} ({count})
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition", open && "rotate-180")} aria-hidden />
      </button>
      {open && <div className={cn("min-w-0 p-3", wide && "overflow-x-auto")}>{children}</div>}
    </section>
  );
}
