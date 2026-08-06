/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** Our internal users.id (uuid) */
      id: string;
      platformRole: "admin" | "member";
    } & DefaultSession["user"];
    /** Delegated Graph access token (for presence etc.) */
    accessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    platformRole?: "admin" | "member";
    accessToken?: string;
    refreshToken?: string;
    /** Epoch seconds */
    expiresAt?: number;
    /** Epoch millis of last DB role re-check */
    roleCheckedAt?: number;
    error?: "RefreshTokenError";
  }
}
