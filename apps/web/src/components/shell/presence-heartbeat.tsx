"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { useEffect } from "react";
import { heartbeat } from "@/modules/shell/actions/profile";

const INTERVAL_MS = 2 * 60 * 1000;

/** Pings `lastActiveAt` while the app is open so profile presence reflects real activity. */
export function PresenceHeartbeat() {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      heartbeat().catch(() => {
        // best-effort — a missed beat just delays "online" by one interval
      });
    };

    ping();
    const interval = setInterval(ping, INTERVAL_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);

  return null;
}
