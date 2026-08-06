/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */

/**
 * Product "What's New" feed schema.
 *
 * Source of truth today: static entries in this package (ships with deploys).
 * Future: same types can be served from DB/API/admin UI without changing the shell.
 *
 * Rules for every AI / contributor: see docs/whats-new.md and root AGENTS.md.
 */

/** User-facing change categories (matches the product badge UI). */
export type WhatsNewKind = "new" | "fixed" | "improved";

/**
 * Who should see this entry.
 * - all: every signed-in user (default)
 * - admin: platform admins only
 * - internal: hidden from product UI (kept for draft history / tooling)
 */
export type WhatsNewAudience = "all" | "admin" | "internal";

/**
 * One product announcement. Prefer plain language over commit messages.
 *
 * Stability:
 * - `id` must never change after ship (used for seen-state and deep links later).
 * - Bump `publishedAt` only if you intentionally want re-highlight for users who
 *   already dismissed older news.
 */
export type WhatsNewEntry = {
  /** Stable kebab id, e.g. "2026-08-04-whats-new-feed". Never recycle. */
  id: string;
  /**
   * Calendar day shown in the UI (YYYY-MM-DD). Grouping key for the timeline.
   * Use the ship / release day users should associate with the change.
   */
  date: string;
  /**
   * ISO-8601 instant used for "since last visit" comparisons.
   * Default to date + T12:00:00.000Z if time of day is unimportant.
   */
  publishedAt: string;
  kind: WhatsNewKind;
  /** Short headline (sentence case). */
  title: string;
  /** 1–3 sentences of plain product copy. */
  body: string;
  /**
   * Optional deep link inside the app (path only, e.g. "/tasks").
   * When set, the entry title can open this route.
   */
  href?: string;
  /** Optional product area for filtering / future per-module digests. */
  module?: "shell" | "tasks" | "forms" | "directory" | "admin" | "platform";
  /** Defaults to "all". */
  audience?: WhatsNewAudience;
  /**
   * Soft-hide without deleting history (useful for mistaken publishes).
   * Hidden entries are omitted from the product UI.
   */
  hidden?: boolean;
  /** Free-form tags for search/analytics later (not shown in v1 UI). */
  tags?: string[];
};

/** Versioned feed envelope so loaders can migrate shape later. */
export type WhatsNewFeed = {
  schemaVersion: 1;
  entries: WhatsNewEntry[];
};

export const WHATS_NEW_KIND_LABEL: Record<WhatsNewKind, string> = {
  new: "New",
  fixed: "Fixed",
  improved: "Improved",
};
