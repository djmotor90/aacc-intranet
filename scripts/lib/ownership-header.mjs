/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Shared header templates for auto-stamping source files.
 */

export const FINGERPRINT_ID = "GURVER-KG-AITIM-2026-7F3C9E2A";
export const STAMP = "kg@gurver::aitim-intranet";

export const BLOCK_HEADER = `/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: ${FINGERPRINT_ID}
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
`;

export const LINE_HEADER = `// Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: ${FINGERPRINT_ID}
`;

export const HASH_HEADER = `# Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: ${FINGERPRINT_ID}
`;

export const SQL_HEADER = `-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: ${FINGERPRINT_ID}
`;

/** Extensions we auto-stamp (source, not generated assets). */
export const STAMP_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".sql",
]);

/** Path segments that must never be stamped. */
export const SKIP_DIR_PARTS = new Set([
  "node_modules",
  ".next",
  "dist",
  "coverage",
  ".git",
  "meta", // drizzle migration snapshots
]);

/** Generated / tool-owned basenames (Next, TypeScript, etc.). */
export const SKIP_BASENAMES = new Set([
  "next-env.d.ts",
  "next-env.d.ts.map",
]);

/**
 * Whether this relative path is a candidate for ownership headers.
 * @param {string} relPath posix-style path from repo root
 */
export function shouldStampPath(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (parts.some((p) => SKIP_DIR_PARTS.has(p))) return false;
  const base = parts[parts.length - 1] ?? "";
  if (SKIP_BASENAMES.has(base)) return false;
  // Auto-generated drizzle journal/snapshots already skipped via meta/
  // Stamp SQL migrations (hand-written) under packages/db/migrations/*.sql
  const ext = normalized.includes(".")
    ? `.${normalized.split(".").pop()?.toLowerCase()}`
    : "";
  if (!STAMP_EXTENSIONS.has(ext)) return false;
  // Root config files often share tooling; still stamp app/package source trees.
  if (
    normalized.startsWith("apps/") ||
    normalized.startsWith("packages/") ||
    normalized.startsWith("scripts/")
  ) {
    return true;
  }
  return false;
}

/**
 * Insert ownership header after shebang and "use client"/"use server" directives.
 * @param {string} source
 * @param {string} ext including leading dot
 * @returns {{ text: string, changed: boolean }}
 */
export function insertHeader(source, ext) {
  if (source.includes(FINGERPRINT_ID)) {
    return { text: source, changed: false };
  }

  let header;
  if (ext === ".sql") header = SQL_HEADER;
  else if (ext === ".css") header = BLOCK_HEADER; /* css supports block comments */
  else header = BLOCK_HEADER;

  // Preserve trailing newline on header
  if (!header.endsWith("\n")) header += "\n";

  const lines = source.split(/\r?\n/);
  let insertAt = 0;

  // Shebang
  if (lines[0]?.startsWith("#!")) {
    insertAt = 1;
  }

  // Next.js / bundler directives must stay first (after shebang)
  while (insertAt < lines.length) {
    const line = lines[insertAt]?.trim() ?? "";
    if (line === '"use client";' || line === "'use client';") {
      insertAt += 1;
      continue;
    }
    if (line === '"use server";' || line === "'use server';") {
      insertAt += 1;
      continue;
    }
    if (line === "") {
      // keep a single blank after directives optional — stop on blank after directive
      break;
    }
    break;
  }

  // Skip leading blank lines at insert point for cleaner result
  while (insertAt < lines.length && lines[insertAt] === "") {
    insertAt += 1;
  }

  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  const pieces = [];
  if (before.length) pieces.push(before.join("\n"));
  pieces.push(header.trimEnd());
  if (after.length) pieces.push(after.join("\n"));
  let text = pieces.join("\n");
  if (!text.endsWith("\n") && source.endsWith("\n")) text += "\n";
  // Ensure file ends with newline
  if (!text.endsWith("\n")) text += "\n";

  return { text, changed: true };
}
