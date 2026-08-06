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
import { auth } from "@/lib/auth";
import { BUCKETS, getObjectStream } from "@/lib/storage";

export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  if (!session?.user) return new NextResponse(null, { status: 401 });

  const { userId } = await ctx.params;
  const [user] = await db
    .select({ photoKey: users.photoKey })
    .from(users)
    .where(eq(users.id, userId));
  if (!user?.photoKey) return new NextResponse(null, { status: 404 });

  try {
    const { body, contentType } = await getObjectStream(BUCKETS.photos, user.photoKey);
    // Version query (?v=) busts cache after upload. Long max-age so refresh reuses
    // the browser disk cache and avoids a 1s empty→image flash.
    const versioned = new URL(_req.url).searchParams.has("v");
    return new NextResponse(body as unknown as ReadableStream, {
      headers: {
        "Content-Type": contentType ?? "image/jpeg",
        "Cache-Control": versioned
          ? "private, max-age=604800, immutable"
          : "private, max-age=300, stale-while-revalidate=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
