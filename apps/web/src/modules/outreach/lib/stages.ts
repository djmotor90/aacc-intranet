/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */

export const LEAD_STATUSES = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "nurturing", label: "Nurturing" },
  { id: "unqualified", label: "Unqualified" },
  { id: "converted", label: "Converted" },
] as const;

export const OPP_STAGES = [
  { id: "prospect", label: "Prospect" },
  { id: "analysis", label: "Opportunity Analysis" },
  { id: "pre_proposal", label: "Pre-Proposal" },
  { id: "presentation", label: "Proposal Presentation" },
  { id: "negotiation", label: "Negotiation" },
  { id: "contract", label: "Contract" },
  { id: "closed_won", label: "Closed Won" },
  { id: "closed_lost", label: "Closed Lost" },
] as const;

export const QUOTE_STATUSES = [
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "accepted", label: "Accepted" },
  { id: "declined", label: "Declined" },
] as const;

export const OBJECT_ICON = {
  lead: "bg-success text-success-foreground",
  opportunity: "bg-brand-orange text-white",
  account: "bg-brand-teal text-white",
  quote: "bg-brand-teal-deep text-white",
} as const;

export type OutreachEntity = "account" | "lead" | "opportunity" | "quote";

export function entityPath(type: OutreachEntity, id: string) {
  const plural = {
    account: "accounts",
    lead: "leads",
    opportunity: "opportunities",
    quote: "quotes",
  } as const;
  return `/outreach/${plural[type]}/${id}`;
}

export const CONTEXT_LEVELS = [
  { id: "none", label: "No contextualization" },
  { id: "light", label: "Light contextualization" },
  { id: "full", label: "Full contextualization" },
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number]["id"];
export type OppStage = (typeof OPP_STAGES)[number]["id"];
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]["id"];
export type ContextLevel = (typeof CONTEXT_LEVELS)[number]["id"];

export function labelFor<T extends { id: string; label: string }>(list: readonly T[], id: string) {
  return list.find((s) => s.id === id)?.label ?? id;
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function lineTotalCents(quantity: number, unitPriceCents: number) {
  return Math.max(0, quantity) * Math.max(0, unitPriceCents);
}
