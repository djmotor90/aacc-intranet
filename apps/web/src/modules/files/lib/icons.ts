/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */

export function fileKind(mime: string, name: string) {
  const lower = name.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".csv")
  ) {
    return "sheet";
  }
  if (mime.includes("word") || mime.includes("document") || lower.endsWith(".docx")) return "doc";
  if (mime.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".md")) return "text";
  return "file";
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
