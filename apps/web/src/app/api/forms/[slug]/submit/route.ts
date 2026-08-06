/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  submitPublicForm,
  type FormUploadFile,
} from "@/modules/tasks/actions/forms";
import { MAX_ATTACHMENT_BYTES } from "@/lib/upload-limits";

function hashClientIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

function isFileLike(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  const ipHash = hashClientIp(ip);

  const contentType = request.headers.get("content-type") ?? "";

  let answers: Record<string, unknown> = {};
  const files: FormUploadFile[] = [];

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const answersRaw = formData.get("answers");
      if (typeof answersRaw === "string" && answersRaw.trim()) {
        answers = JSON.parse(answersRaw) as Record<string, unknown>;
      }
      for (const [key, value] of formData.entries()) {
        if (!isFileLike(value)) continue;
        if (value.size === 0) continue;
        if (value.size > MAX_ATTACHMENT_BYTES) {
          return NextResponse.json(
            { ok: false, error: `File "${value.name}" is too large` },
            { status: 413 },
          );
        }
        // file_<fieldId> → mapped file question; "file" / "files" → general bucket
        let fieldId: string | null = null;
        if (key.startsWith("file_")) {
          fieldId = key.slice("file_".length) || null;
        } else if (key !== "file" && key !== "files") {
          continue;
        }
        files.push({
          fileName: value.name || "upload",
          mimeType: value.type || "application/octet-stream",
          buffer: Buffer.from(await value.arrayBuffer()),
          fieldId,
        });
      }
    } else {
      const body = (await request.json()) as { answers?: Record<string, unknown> };
      answers = body.answers ?? {};
    }
  } catch (err) {
    console.error("[forms/submit] body parse", err);
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  try {
    const result = await submitPublicForm({
      slug,
      answers,
      ipHash,
      files: files.length > 0 ? files : undefined,
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[forms/submit] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Submission failed" },
      { status: 500 },
    );
  }
}
