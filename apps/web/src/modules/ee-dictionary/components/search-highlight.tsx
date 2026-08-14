"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { createContext, useContext, type ReactNode } from "react";

/**
 * Shares the sidebar's live search query with the (server-fetched) detail
 * view, so field/comment matches highlight yellow there too — same query,
 * same look, no URL round-trip needed.
 */
const EeSearchQueryContext = createContext("");

export function EeSearchQueryProvider({ query, children }: { query: string; children: ReactNode }) {
  return <EeSearchQueryContext.Provider value={query}>{children}</EeSearchQueryContext.Provider>;
}

export function useEeSearchQuery(): string {
  return useContext(EeSearchQueryContext);
}

/** Case-insensitive substring match, highlighted like Word's Navigation-pane search. */
export function Highlighted({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let idx = lower.indexOf(needle, cursor);
  if (idx === -1) return <>{text}</>;
  let key = 0;
  while (idx !== -1) {
    if (idx > cursor) parts.push(<span key={key++}>{text.slice(cursor, idx)}</span>);
    parts.push(
      <mark key={key++} className="rounded-sm bg-yellow-300 text-black dark:bg-yellow-500/80">
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    cursor = idx + q.length;
    idx = lower.indexOf(needle, cursor);
  }
  if (cursor < text.length) parts.push(<span key={key++}>{text.slice(cursor)}</span>);
  return <>{parts}</>;
}

/** Convenience wrapper — reads the shared query from context automatically. */
export function AutoHighlight({ text }: { text: string }) {
  const query = useEeSearchQuery();
  return <Highlighted text={text} query={query} />;
}
