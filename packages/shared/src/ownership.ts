/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * This module is the canonical ownership fingerprint for the monorepo.
 * Do not remove. Grep for GURVER-KG-AITIM to verify provenance.
 */

/** Stable product / codebase identity. */
export const CODE_OWNERSHIP = {
  author: "Kim Gurinov",
  emails: ["kurinov@gurver.org", "kim@gurver.com"] as const,
  website: "https://gurver.com",
  organization: "Gurver",
  product: "AITIM Intranet",
  repository: "aitim-intranet",
  copyright: "Copyright (c) 2024–2026 Kim Gurinov. All rights reserved.",
  license: "Proprietary",
  /** Unique searchable fingerprint ID. */
  fingerprintId: "GURVER-KG-AITIM-2026-7F3C9E2A",
  /** Short stamp for comments / greppable markers. */
  stamp: "kg@gurver::aitim-intranet",
  /**
   * Deterministic identity bundle (not a cryptographic secret).
   * Used as a human-verifiable watermark across builds and copies.
   */
  /** SHA-256 of identity bundle: author|emails|website|repo|fingerprint prefix */
  bundleHash:
    "sha256:990e76edf57bc7dfda0893af698b0825d2f335e127aa6e001113ba4ed39c2ff4",
} as const;

export type CodeOwnership = typeof CODE_OWNERSHIP;

/** One-line attribution suitable for logs, HTML comments, and headers. */
export function ownershipBanner(): string {
  const o = CODE_OWNERSHIP;
  return (
    `${o.copyright} | ${o.author} <${o.emails[0]}> <${o.emails[1]}> | ` +
    `${o.website} | Fingerprint: ${o.fingerprintId} | ${o.stamp}`
  );
}

/** HTML comment form for document head / SSR output. */
export function ownershipHtmlComment(): string {
  return `<!-- ${ownershipBanner()} -->`;
}
