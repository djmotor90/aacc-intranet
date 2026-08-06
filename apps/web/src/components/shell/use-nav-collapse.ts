"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";

const STORAGE_KEY = "aitim-nav-collapsed";
/** Same-tab change notification (the "storage" event only fires across tabs). */
const CHANGE_EVENT = "aitim-nav-collapsed-change";

function readRaw(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function parseIds(raw: string): Set<string> {
  try {
    const ids = JSON.parse(raw) as unknown;
    if (!Array.isArray(ids)) return new Set();
    return new Set(ids.filter((x): x is string => typeof x === "string"));
  } catch {
    // ignore corrupt storage
    return new Set();
  }
}

function write(ids: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // storage full / unavailable — state still updates via the event below
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Client-only: true after hydration so we can safely read localStorage prefs. */
function subscribeHydrated() {
  return () => {};
}
function getHydratedClient() {
  return true;
}
function getHydratedServer() {
  return false;
}

/**
 * Persist which sidebar tree nodes (spaces / folders / module roots) the user
 * has collapsed. Default after load is expanded; only collapsed ids are stored.
 *
 * SSR cannot read localStorage, so the server always assumes "nothing collapsed"
 * (everything expanded). That caused a flash: full tree → then your saved
 * collapsed state. Until the client has hydrated, we treat nodes as collapsed
 * so we never paint the full tree and snatch it away.
 */
export function useNavCollapse() {
  const hydrated = useSyncExternalStore(
    subscribeHydrated,
    getHydratedClient,
    getHydratedServer,
  );
  const raw = useSyncExternalStore(subscribe, readRaw, () => "[]");
  const collapsed = useMemo(() => parseIds(raw), [raw]);

  const isExpanded = useCallback(
    (key: string) => {
      // Pre-hydration: closed. Avoids "open then snap shut" on refresh.
      if (!hydrated) return false;
      return !collapsed.has(key);
    },
    [collapsed, hydrated],
  );

  const toggle = useCallback((key: string) => {
    const next = parseIds(readRaw());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    write(next);
  }, []);

  /** Force a node open (e.g. when the active list lives under it). */
  const expand = useCallback((key: string) => {
    const next = parseIds(readRaw());
    if (next.delete(key)) write(next);
  }, []);

  return { isExpanded, toggle, expand, hydrated };
}

export function spaceCollapseKey(spaceId: string) {
  return `space:${spaceId}`;
}

export function folderCollapseKey(folderId: string) {
  return `folder:${folderId}`;
}

/** Collapse key for a top-level workspace app (Tasks, Accounts, …). */
export function tasksRootCollapseKey(moduleId = "tasks") {
  return `module-root:${moduleId}`;
}

export function docsRootCollapseKey() {
  return "docs:root";
}

export function docsSpaceCollapseKey(spaceId: string) {
  return `docs:space:${spaceId}`;
}

export function docsPageCollapseKey(pageId: string) {
  return `docs:page:${pageId}`;
}
