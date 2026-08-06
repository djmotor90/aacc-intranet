/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";

export type CollabUser = {
  id: string;
  name: string;
  color: string;
  canEdit: boolean;
  /** S3/object key for profile photo — used by UserAvatar. */
  photoKey?: string | null;
};

export type CollabAwarenessUser = {
  clientId: number;
  user?: {
    id?: string;
    name?: string;
    color?: string;
    photoKey?: string | null;
  };
};

export type DocCollabState = {
  status: "loading" | "connecting" | "synced" | "error" | "offline";
  error: string | null;
  ydoc: Y.Doc | null;
  provider: HocuspocusProvider | null;
  self: CollabUser | null;
  peers: CollabAwarenessUser[];
};

/** Give up on the collab server quickly so the editor never sits blocked. */
const CONNECT_TIMEOUT_MS = 2500;

/**
 * Connect to the Hocuspocus collab room for a doc page.
 *
 * Design notes:
 * - Multiplayer (Yjs CRDT) is the same class of tech Notion/ClickUp use under
 *   the hood for concurrent editing + carets — not overkill for that feature.
 * - It *is* optional infrastructure: if the collab process isn't running we
 *   fail open to normal local editing after a short timeout.
 */
export function useDocCollab(pageId: string | null, enabled: boolean): DocCollabState {
  const [status, setStatus] = useState<DocCollabState["status"]>(
    enabled ? "loading" : "offline",
  );
  const [error, setError] = useState<string | null>(null);
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [self, setSelf] = useState<CollabUser | null>(null);
  const [peers, setPeers] = useState<CollabAwarenessUser[]>([]);

  useEffect(() => {
    if (!enabled || !pageId) {
      setStatus("offline");
      setError(null);
      setYdoc(null);
      setProvider(null);
      setSelf(null);
      setPeers([]);
      return;
    }

    // Explicit opt-out: set NEXT_PUBLIC_COLLAB_URL=off to skip multiplayer entirely.
    const envUrl = process.env.NEXT_PUBLIC_COLLAB_URL;
    if (envUrl === "off" || envUrl === "0" || envUrl === "false") {
      setStatus("offline");
      setError(null);
      return;
    }

    let cancelled = false;
    let prov: HocuspocusProvider | null = null;
    let doc: Y.Doc | null = null;
    let settled = false;

    const failOpen = (message: string) => {
      if (cancelled || settled) return;
      settled = true;
      setStatus("offline");
      setError(message);
      try {
        prov?.destroy();
      } catch {
        // ignore
      }
      try {
        doc?.destroy();
      } catch {
        // ignore
      }
      setProvider(null);
      setYdoc(null);
      setPeers([]);
    };

    const timer = window.setTimeout(() => {
      failOpen(
        "Live collab timed out — editing locally. Run `pnpm collab:dev` for multiplayer.",
      );
    }, CONNECT_TIMEOUT_MS);

    async function connect() {
      setStatus("loading");
      setError(null);
      try {
        const res = await fetch("/api/docs/collab-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageId }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `Collab token failed (${res.status})`);
        }
        const data = (await res.json()) as {
          token: string;
          url: string;
          user: CollabUser;
        };
        if (cancelled || settled) return;

        doc = new Y.Doc();
        prov = new HocuspocusProvider({
          url: data.url,
          name: pageId!,
          document: doc,
          token: data.token,
          // Don't spin forever reconnecting in the background when server is down.
          // Provider still reconnects a few times; our timeout fail-opens the UI.
          onStatus: ({ status: s }) => {
            if (cancelled || settled) return;
            if (s === "connecting") setStatus("connecting");
          },
          onSynced: ({ state }) => {
            if (cancelled || settled) return;
            if (state) {
              settled = true;
              window.clearTimeout(timer);
              setStatus("synced");
            }
          },
          onAuthenticationFailed: () => {
            failOpen("Collaboration authentication failed");
          },
          onClose: () => {
            // If we never synced, the timeout handles fail-open.
          },
        });

        prov.setAwarenessField("user", {
          id: data.user.id,
          name: data.user.name,
          color: data.user.color,
          photoKey: data.user.photoKey ?? null,
        });

        const syncPeers = () => {
          if (cancelled || !prov) return;
          const states = prov.awareness?.getStates() ?? new Map();
          const list: CollabAwarenessUser[] = [];
          states.forEach((state, clientId) => {
            list.push({
              clientId: Number(clientId),
              user: (state as { user?: CollabAwarenessUser["user"] }).user,
            });
          });
          setPeers(list);
        };
        prov.awareness?.on("change", syncPeers);
        syncPeers();

        if (cancelled || settled) {
          prov.destroy();
          doc.destroy();
          return;
        }

        setSelf(data.user);
        setYdoc(doc);
        setProvider(prov);
        setStatus("connecting");
      } catch (err) {
        if (cancelled) return;
        console.warn("[collab] unavailable, using local editor:", err);
        failOpen(
          err instanceof Error
            ? err.message
            : "Live collab unavailable — editing locally",
        );
      }
    }

    void connect();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      try {
        prov?.destroy();
      } catch {
        // ignore
      }
      try {
        doc?.destroy();
      } catch {
        // ignore
      }
      setProvider(null);
      setYdoc(null);
      setPeers([]);
    };
  }, [pageId, enabled]);

  return useMemo(
    () => ({ status, error, ydoc, provider, self, peers }),
    [status, error, ydoc, provider, self, peers],
  );
}
