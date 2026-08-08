/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { EventEmitter } from "node:events";
import { Client } from "pg";

export interface AppEvent {
  kind: "notification" | "list" | "chat";
  /** Present on notification events for live toasts. */
  notificationId?: string;
  type?: string;
  taskId?: string | null;
  toast?: boolean;
  payload?: Record<string, unknown> | null;
  recipientId?: string;
  listId?: string;
  /** Chat realtime (Super Agent DMs / channels). */
  conversationId?: string;
  messageId?: string;
}

const globalForSse = globalThis as unknown as {
  sseEmitter?: EventEmitter;
  sseListener?: Promise<void>;
};

export function getSseEmitter(): EventEmitter {
  if (!globalForSse.sseEmitter) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(500);
    globalForSse.sseEmitter = emitter;
  }
  if (!globalForSse.sseListener) {
    globalForSse.sseListener = startListener(globalForSse.sseEmitter);
  }
  return globalForSse.sseEmitter;
}

async function startListener(emitter: EventEmitter): Promise<void> {
  const connect = async () => {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      connectionTimeoutMillis: 15_000,
    });
    client.on("notification", (msg) => {
      if (msg.channel !== "app_events" || !msg.payload) return;
      try {
        emitter.emit("event", JSON.parse(msg.payload) as AppEvent);
      } catch {
        // ignore malformed payloads
      }
    });
    client.on("error", () => {
      client.end().catch(() => {});
      setTimeout(connect, 3000);
    });
    // Remote LISTEN sockets can go quiet; periodic no-op keeps the TCP path warm.
    const keepalive = setInterval(() => {
      client.query("SELECT 1").catch(() => {});
    }, 30_000);
    client.on("end", () => clearInterval(keepalive));
    await client.connect();
    await client.query("LISTEN app_events");
  };
  await connect().catch((err) => {
    console.error("SSE pg listener failed to start", err);
    globalForSse.sseListener = undefined;
  });
}
