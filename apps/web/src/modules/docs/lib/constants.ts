/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */

/** Days without re-verification before a page is considered stale. */
export const DOC_STALE_AFTER_DAYS = 90;

export function isDocStale(
  verifiedAt: Date | string | null | undefined,
  now = new Date(),
): boolean {
  if (!verifiedAt) return true;
  const t = typeof verifiedAt === "string" ? new Date(verifiedAt) : verifiedAt;
  if (Number.isNaN(t.getTime())) return true;
  const ageMs = now.getTime() - t.getTime();
  return ageMs > DOC_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

export function pagePath(pageId: string, slug?: string | null): string {
  if (slug) return `/docs/p/${pageId}/${slug}`;
  return `/docs/p/${pageId}`;
}
