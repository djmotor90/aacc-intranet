/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { auth } from "@/lib/auth";
import { getSseEmitter, type AppEvent } from "@/lib/sse";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream. Emits:
 *  - `notification` events for the signed-in user
 *  - `list` events when ?listId=<uuid> matches an updated list
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response(null, { status: 401 });
  const userId = session.user.id;
  const url = new URL(req.url);
  const listId = url.searchParams.get("listId");
  const conversationId = url.searchParams.get("conversationId");

  const emitter = getSseEmitter();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: object) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const onEvent = (e: AppEvent) => {
        if (e.kind === "notification" && e.recipientId === userId) {
          send("notification", {
            notificationId: e.notificationId,
            type: e.type,
            taskId: e.taskId,
            toast: e.toast === true,
            payload: e.payload ?? null,
          });
        } else if (e.kind === "list" && listId && e.listId === listId) {
          send("list", {});
        } else if (e.kind === "chat") {
          // Fan-out: recipient-scoped or conversation-scoped subscription
          if (e.recipientId && e.recipientId !== userId) return;
          if (conversationId && e.conversationId !== conversationId) return;
          if (!conversationId && e.recipientId !== userId) return;
          send("chat", {
            conversationId: e.conversationId,
            messageId: e.messageId,
          });
        }
      };
      emitter.on("event", onEvent);
      const keepalive = setInterval(() => {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 25_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        emitter.off("event", onEvent);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
