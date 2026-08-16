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
  { id: "needs_review", label: "Needs Review" },
  { id: "in_review", label: "In Review" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "presented", label: "Presented" },
  { id: "accepted", label: "Accepted" },
  { id: "denied", label: "Denied" },
] as const;

export const OBJECT_ICON = {
  lead: "bg-success text-success-foreground",
  opportunity: "bg-brand-orange text-white",
  account: "bg-brand-teal text-white",
  quote: "bg-brand-teal-deep text-white",
  product: "bg-primary text-primary-foreground",
  priceBook: "bg-brand-teal-deep text-white",
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

const LEGACY_QUOTE_STATUS: Record<string, QuoteStatus> = {
  sent: "presented",
  declined: "denied",
};

export function normalizeQuoteStatus(status: string): QuoteStatus {
  if (LEGACY_QUOTE_STATUS[status]) return LEGACY_QUOTE_STATUS[status];
  return QUOTE_STATUSES.some((s) => s.id === status) ? (status as QuoteStatus) : "draft";
}

export function labelFor<T extends { id: string; label: string }>(list: readonly T[], id: string) {
  return list.find((s) => s.id === id)?.label ?? id;
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function lineTotalCents(quantity: number, unitPriceCents: number) {
  return Math.max(0, quantity) * Math.max(0, unitPriceCents);
}

export function quoteTotals(input: {
  lines: { quantity: number; unitPriceCents: number }[];
  discountBps?: number;
  taxCents?: number;
  shippingCents?: number;
}) {
  const subtotal = input.lines.reduce((sum, line) => sum + lineTotalCents(line.quantity, line.unitPriceCents), 0);
  const discountBps = Math.min(10_000, Math.max(0, input.discountBps ?? 0));
  const discount = Math.round((subtotal * discountBps) / 10_000);
  const total = Math.max(0, subtotal - discount);
  const tax = Math.max(0, input.taxCents ?? 0);
  const shipping = Math.max(0, input.shippingCents ?? 0);
  return { subtotal, discount, discountBps, total, tax, shipping, grand: total + tax + shipping };
}

export const QUOTE_ORG = {
  title: "TRAINING & BUSINESS SERVICES QUOTE",
  address: ["101 College Parkway", "CALT 121C", "Arnold, Maryland 21012"],
  phone: "(410) 777-2087",
  footer:
    "p. 410.777.2732  |  e. ctg@aacc.edu  |  www.ctgaacc.com  |  7556 Teague Road, Suite 300  |  Hanover, MD 21076",
} as const;
