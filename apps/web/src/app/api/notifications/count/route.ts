/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, notifications } from "@aitim/db";
import { and, count, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ count: 0 }, { status: 401 });
  const [{ value }] = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientId, session.user.id),
        isNull(notifications.readAt),
        isNull(notifications.clearedAt),
      ),
    );
  return NextResponse.json({ count: value });
}
