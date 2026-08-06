/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */

import { whatsNewFeed } from "./entries";
import type {
  WhatsNewAudience,
  WhatsNewEntry,
  WhatsNewFeed,
  WhatsNewKind,
} from "./types";
import { WHATS_NEW_KIND_LABEL } from "./types";

export type {
  WhatsNewAudience,
  WhatsNewEntry,
  WhatsNewFeed,
  WhatsNewKind,
};
export { WHATS_NEW_KIND_LABEL };

export type WhatsNewViewer = {
  /** When true, includes audience: "admin" entries. */
  isAdmin?: boolean;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Dev/CI guardrails for the static feed (duplicate ids, bad dates). */
export function validateWhatsNewFeed(feed: WhatsNewFeed): void {
  if (feed.schemaVersion !== 1) {
    throw new Error(`Unsupported whats-new schemaVersion: ${feed.schemaVersion}`);
  }
  const ids = new Set<string>();
  for (const entry of feed.entries) {
    if (!entry.id?.trim()) {
      throw new Error("whats-new entry missing id");
    }
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate whats-new id: ${entry.id}`);
    }
    ids.add(entry.id);
    if (!DATE_RE.test(entry.date)) {
      throw new Error(`whats-new ${entry.id}: date must be YYYY-MM-DD`);
    }
    if (!entry.publishedAt || Number.isNaN(Date.parse(entry.publishedAt))) {
      throw new Error(`whats-new ${entry.id}: publishedAt must be a valid ISO datetime`);
    }
    if (!entry.title?.trim() || !entry.body?.trim()) {
      throw new Error(`whats-new ${entry.id}: title and body are required`);
    }
  }
}

/**
 * Load the product feed.
 * Swap the body of this function later (API/DB) without changing UI imports.
 */
export function getWhatsNewFeed(): WhatsNewFeed {
  if (process.env.NODE_ENV !== "production") {
    validateWhatsNewFeed(whatsNewFeed);
  }
  return whatsNewFeed;
}

function isVisibleTo(entry: WhatsNewEntry, viewer: WhatsNewViewer = {}): boolean {
  if (entry.hidden) return false;
  const audience = entry.audience ?? "all";
  if (audience === "internal") return false;
  if (audience === "admin" && !viewer.isAdmin) return false;
  return true;
}

/** Visible entries for a viewer, newest first. */
export function listWhatsNewEntries(viewer: WhatsNewViewer = {}): WhatsNewEntry[] {
  const { entries } = getWhatsNewFeed();
  return entries
    .filter((e) => isVisibleTo(e, viewer))
    .slice()
    .sort((a, b) => {
      const byTime = b.publishedAt.localeCompare(a.publishedAt);
      if (byTime !== 0) return byTime;
      return b.id.localeCompare(a.id);
    });
}

/**
 * How far back "first visit" (no local seen-state) treats as unseen.
 * Prevents a future history backfill from spamming the badge/auto-open.
 * Returning users use the real acknowledgedThrough cursor instead.
 */
export const WHATS_NEW_FIRST_VISIT_LOOKBACK_DAYS = 45;

/** Entries the user has not acknowledged yet (by publishedAt vs cursor). */
export function listUnseenWhatsNewEntries(
  entries: WhatsNewEntry[],
  acknowledgedThrough: string | null,
  options?: { now?: Date; firstVisitLookbackDays?: number },
): WhatsNewEntry[] {
  if (!acknowledgedThrough) {
    const days =
      options?.firstVisitLookbackDays ?? WHATS_NEW_FIRST_VISIT_LOOKBACK_DAYS;
    const now = options?.now ?? new Date();
    const cutoffMs = now.getTime() - days * 24 * 60 * 60 * 1000;
    const cutoff = new Date(cutoffMs).toISOString();
    return entries.filter((e) => e.publishedAt >= cutoff);
  }
  return entries.filter((e) => e.publishedAt > acknowledgedThrough);
}

export type WhatsNewDateGroup = {
  date: string;
  entries: WhatsNewEntry[];
};

/** Group entries by calendar `date` (YYYY-MM-DD), preserving newest-first order. */
export function groupWhatsNewByDate(entries: WhatsNewEntry[]): WhatsNewDateGroup[] {
  const map = new Map<string, WhatsNewEntry[]>();
  const order: string[] = [];
  for (const entry of entries) {
    if (!map.has(entry.date)) {
      map.set(entry.date, []);
      order.push(entry.date);
    }
    map.get(entry.date)!.push(entry);
  }
  return order.map((date) => ({ date, entries: map.get(date)! }));
}

/**
 * Cursor to store after the user dismisses the dialog: max publishedAt among
 * the entries they were shown (or all visible entries).
 */
export function computeAcknowledgeCursor(entries: WhatsNewEntry[]): string | null {
  if (entries.length === 0) return null;
  let max = entries[0]!.publishedAt;
  for (let i = 1; i < entries.length; i++) {
    const t = entries[i]!.publishedAt;
    if (t > max) max = t;
  }
  return max;
}

/** Format YYYY-MM-DD for UI without timezone surprises. */
export function formatWhatsNewDate(date: string, locale = "en-US"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // Noon UTC avoids DST edge cases when formatting calendar-only dates.
  const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}
