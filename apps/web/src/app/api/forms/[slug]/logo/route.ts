/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, publicForms } from "@aitim/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { BUCKETS, getObjectStream } from "@/lib/storage";
import { parseFormTheme } from "@/modules/tasks/lib/form-types";

/** Public logo for a form (no auth). Streams from S3 when theme.logoObjectKey is set. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const [form] = await db
    .select({ theme: publicForms.theme, isActive: publicForms.isActive })
    .from(publicForms)
    .where(eq(publicForms.slug, slug))
    .limit(1);
  if (!form) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const theme = parseFormTheme(form.theme);
  if (!theme.logoObjectKey) {
    return NextResponse.json({ error: "no logo" }, { status: 404 });
  }

  try {
    const { body, contentType, length } = await getObjectStream(
      BUCKETS.attachments,
      theme.logoObjectKey,
    );
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentType ?? "image/png",
        "Content-Length": String(length ?? buf.length),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[form logo]", err);
    return NextResponse.json({ error: "logo unavailable" }, { status: 404 });
  }
}
