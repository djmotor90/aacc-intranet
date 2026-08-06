/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, users } from "@aitim/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { colorForUserId, signCollabToken } from "@/collab/token";
import { auth } from "@/lib/auth";
import { getPageForUser } from "@/modules/docs/queries";

/**
 * Issue a short-lived collab token for a doc page.
 * Client opens Hocuspocus with this token + document name = pageId.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let pageId: string | undefined;
  try {
    const body = (await req.json()) as { pageId?: string };
    pageId = body.pageId;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!pageId || !/^[0-9a-f-]{36}$/i.test(pageId)) {
    return NextResponse.json({ error: "pageId required" }, { status: 400 });
  }

  const page = await getPageForUser(
    {
      id: session.user.id,
      platformRole: session.user.platformRole,
    },
    pageId,
  );
  if (!page) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [profile] = await db
    .select({
      displayName: users.displayName,
      photoKey: users.photoKey,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const name =
    profile?.displayName?.trim() ||
    session.user.name?.trim() ||
    session.user.email?.split("@")[0] ||
    "Someone";
  const color = colorForUserId(session.user.id);
  const canEdit = page.canEdit;
  const photoKey = profile?.photoKey ?? null;

  const token = signCollabToken({
    pageId,
    userId: session.user.id,
    name,
    color,
    canEdit,
  });

  const collabUrl =
    process.env.NEXT_PUBLIC_COLLAB_URL ||
    process.env.COLLAB_PUBLIC_URL ||
    `ws://localhost:${process.env.COLLAB_PORT ?? 1234}`;

  return NextResponse.json({
    token,
    url: collabUrl,
    pageId,
    user: {
      id: session.user.id,
      name,
      color,
      canEdit,
      photoKey,
    },
  });
}
