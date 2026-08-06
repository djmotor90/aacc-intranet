/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */

/**
 * Client-side "What's New" seen-state.
 *
 * v1: localStorage (fast, no migration, works offline).
 * Future: mirror to user prefs in DB for multi-device sync — keep the same
 * shape (`WhatsNewSeenState`) and swap load/save implementations.
 */

export const WHATS_NEW_STORAGE_KEY = "aitim:whats-new:seen";
export const WHATS_NEW_STORAGE_VERSION = 1 as const;

/**
 * Acknowledged-through cursor.
 * Any entry with `publishedAt` strictly greater than this is "new since last visit".
 */
export type WhatsNewSeenState = {
  version: typeof WHATS_NEW_STORAGE_VERSION;
  /**
   * ISO-8601 publishedAt cursor. Null/missing means the user has never
   * dismissed the dialog (treat all visible entries as unseen).
   */
  acknowledgedThrough: string | null;
  /** ISO-8601 when the user last clicked "Got it". */
  acknowledgedAt: string | null;
};

export function defaultWhatsNewSeenState(): WhatsNewSeenState {
  return {
    version: WHATS_NEW_STORAGE_VERSION,
    acknowledgedThrough: null,
    acknowledgedAt: null,
  };
}

function migrateSeenState(raw: unknown): WhatsNewSeenState {
  const base = defaultWhatsNewSeenState();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  // Future: if (o.version === 2) ...
  return {
    version: WHATS_NEW_STORAGE_VERSION,
    acknowledgedThrough:
      typeof o.acknowledgedThrough === "string" ? o.acknowledgedThrough : null,
    acknowledgedAt: typeof o.acknowledgedAt === "string" ? o.acknowledgedAt : null,
  };
}

export function loadWhatsNewSeenState(): WhatsNewSeenState {
  if (typeof window === "undefined") return defaultWhatsNewSeenState();
  try {
    const raw = window.localStorage.getItem(WHATS_NEW_STORAGE_KEY);
    if (!raw) return defaultWhatsNewSeenState();
    return migrateSeenState(JSON.parse(raw) as unknown);
  } catch {
    return defaultWhatsNewSeenState();
  }
}

export function saveWhatsNewSeenState(state: WhatsNewSeenState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WHATS_NEW_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota / private mode — badge may reappear; acceptable for v1.
  }
}

export function acknowledgeWhatsNew(throughPublishedAt: string): WhatsNewSeenState {
  const next: WhatsNewSeenState = {
    version: WHATS_NEW_STORAGE_VERSION,
    acknowledgedThrough: throughPublishedAt,
    acknowledgedAt: new Date().toISOString(),
  };
  saveWhatsNewSeenState(next);
  return next;
}
