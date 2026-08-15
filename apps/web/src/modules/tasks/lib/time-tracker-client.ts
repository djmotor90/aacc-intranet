"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { TIME_TRACKER_CHANGED_EVENT } from "./time";

export interface TimeTrackerSnapshot {
  userId: string;
  runningId: string | null;
  runningTaskId: string | null;
  runningStartedAt: string | null;
}

let snapshot: TimeTrackerSnapshot | null = null;
const listeners = new Set<() => void>();

export function getTimeTrackerSnapshot() {
  return snapshot;
}

export function publishTimeTrackerSnapshot(next: TimeTrackerSnapshot) {
  snapshot = next;
  listeners.forEach((fn) => fn());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(TIME_TRACKER_CHANGED_EVENT));
  }
}

export function subscribeTimeTrackerSnapshot(onChange: () => void) {
  listeners.add(onChange);
  if (typeof window !== "undefined") {
    window.addEventListener(TIME_TRACKER_CHANGED_EVENT, onChange);
  }
  return () => {
    listeners.delete(onChange);
    if (typeof window !== "undefined") {
      window.removeEventListener(TIME_TRACKER_CHANGED_EVENT, onChange);
    }
  };
}
