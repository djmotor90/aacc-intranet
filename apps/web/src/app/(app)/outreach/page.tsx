/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/rbac";
import { ensureCatalogSeeded } from "@/modules/outreach/actions";
import { formatMoney, labelFor, LEAD_STATUSES, OPP_STAGES } from "@/modules/outreach/lib/stages";
import { listFollowedRecords, listLeads, listOpportunities, listQuotes, listUpcomingEventsForUser } from "@/modules/outreach/queries";

export default async function OutreachHomePage() {
  const user = await requireUser();
  await ensureCatalogSeeded();
  const [leads, opps, quotes, following, upcoming] = await Promise.all([
    listLeads(),
    listOpportunities(),
    listQuotes(),
    listFollowedRecords(user.id),
    listUpcomingEventsForUser(user.id),
  ]);
  const openLeads = leads.filter((r) => r.lead.status !== "converted" && r.lead.status !== "unqualified");
  const openOpps = opps.filter((r) => r.opportunity.stage !== "closed_won" && r.opportunity.stage !== "closed_lost");
  const pipeline = openOpps.reduce((sum, r) => sum + r.opportunity.amountCents, 0);

  return (
    <div className="grid gap-3">
      <section className="rounded-xl bg-brand-teal-deep px-4 py-5 text-white shadow-sm">
        <p className="text-[11px] text-white/75">Home</p>
        <h1 className="text-lg font-bold">Corporate Outreach</h1>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat href="/outreach/leads" label="Open leads" value={String(openLeads.length)} />
        <Stat href="/outreach/opportunities" label="Open opportunities" value={String(openOpps.length)} />
        <Stat href="/outreach/opportunities" label="Pipeline" value={formatMoney(pipeline)} />
        <Stat href="/outreach/quotes" label="Quotes" value={String(quotes.length)} />
      </div>
      <section className="grid gap-3 lg:grid-cols-2">
        <Panel title="Recent leads">
          <ul className="mt-3 grid gap-2">
            {leads.slice(0, 6).map((row) => (
              <li key={row.lead.id}>
                <Link
                  href={`/outreach/leads/${row.lead.id}`}
                  className="flex items-center justify-between gap-2 text-sm text-primary hover:underline"
                >
                  <span className="truncate font-medium">
                    {row.lead.firstName} {row.lead.lastName}
                  </span>
                  <span className="text-muted-foreground">{labelFor(LEAD_STATUSES, row.lead.status)}</span>
                </Link>
              </li>
            ))}
            {leads.length === 0 && <li className="text-sm text-muted-foreground">No leads yet.</li>}
          </ul>
        </Panel>
        <Panel title="Opportunities">
          <ul className="mt-3 grid gap-2">
            {opps.slice(0, 6).map((row) => (
              <li key={row.opportunity.id}>
                <Link
                  href={`/outreach/opportunities/${row.opportunity.id}`}
                  className="flex items-center justify-between gap-2 text-sm text-primary hover:underline"
                >
                  <span className="truncate font-medium">{row.opportunity.name}</span>
                  <span className="text-muted-foreground">{labelFor(OPP_STAGES, row.opportunity.stage)}</span>
                </Link>
              </li>
            ))}
            {opps.length === 0 && <li className="text-sm text-muted-foreground">No opportunities yet.</li>}
          </ul>
        </Panel>
      </section>
      <section className="grid gap-3 lg:grid-cols-2">
        <Panel title="Following">
          <ul className="mt-3 grid gap-2">
            {following.slice(0, 8).map((row) => (
              <li key={`${row.entityType}-${row.entityId}`}>
                <Link href={row.href} className="flex items-center justify-between gap-2 text-sm text-primary hover:underline">
                  <span className="truncate font-medium">{row.title}</span>
                  <span className="capitalize text-muted-foreground">{row.entityType}</span>
                </Link>
              </li>
            ))}
            {following.length === 0 && (
              <li className="text-sm text-muted-foreground">Follow a lead or opportunity to pin it here.</li>
            )}
          </ul>
        </Panel>
        <Panel title="Upcoming events">
          <ul className="mt-3 grid gap-2">
            {upcoming.map((event) => (
              <li key={event.id}>
                <Link href={event.href} className="block text-sm text-primary hover:underline">
                  <span className="font-medium">{event.subject}</span>
                </Link>
                <div className="text-xs text-muted-foreground">
                  {new Date(event.startsAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}
                  {event.location ? ` · ${event.location}` : ""}
                </div>
              </li>
            ))}
            {upcoming.length === 0 && (
              <li className="text-sm text-muted-foreground">No upcoming events on records you own or follow.</li>
            )}
          </ul>
        </Panel>
      </section>
      <p className="text-sm text-muted-foreground">
        Use Products and Price Books to keep training offerings ready for quotes.
      </p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-brand-teal-deep">{title}</h2>
      {children}
    </div>
  );
}

function Stat({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-card p-4 shadow-sm hover:border-primary/40 hover:bg-secondary/60"
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
    </Link>
  );
}
