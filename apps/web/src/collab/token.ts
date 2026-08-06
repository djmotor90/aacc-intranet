/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type CollabTokenPayload = {
  pageId: string;
  userId: string;
  name: string;
  color: string;
  canEdit: boolean;
  exp: number;
};

function secret(): string {
  const s =
    process.env.COLLAB_TOKEN_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET (or COLLAB_TOKEN_SECRET) is required for collab tokens");
  return s;
}

/** Deterministic pastel-ish color from a user id (stable across sessions). */
export function colorForUserId(userId: string): string {
  const palette = [
    "#e11d48", // rose
    "#ea580c", // orange
    "#ca8a04", // yellow
    "#16a34a", // green
    "#0891b2", // cyan
    "#2563eb", // blue
    "#7c3aed", // violet
    "#db2777", // pink
    "#0d9488", // teal
    "#4f46e5", // indigo
  ];
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return palette[h % palette.length]!;
}

export function signCollabToken(
  payload: Omit<CollabTokenPayload, "exp">,
  ttlSeconds = 60 * 60 * 8,
): string {
  const full: CollabTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyCollabToken(token: string): CollabTokenPayload {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("Invalid collab token");
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid collab token signature");
  }
  const payload = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8"),
  ) as CollabTokenPayload;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Collab token expired");
  }
  if (!payload.pageId || !payload.userId) throw new Error("Invalid collab token payload");
  return payload;
}
