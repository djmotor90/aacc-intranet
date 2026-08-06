/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Client-side avatar downscale: accept large phone photos, ship a small JPEG.
 */

/** Max edge length for stored avatars (enough for @2x 80–96px UI avatars). */
export const AVATAR_MAX_EDGE = 512;

/** Accept large camera roll originals; we shrink before upload. */
export const AVATAR_SOURCE_MAX_BYTES = 25 * 1024 * 1024;

/** Hard cap after compression (safety net for server). */
export const AVATAR_UPLOAD_MAX_BYTES = 1.5 * 1024 * 1024;

/**
 * Resize + re-encode an image as JPEG for avatar upload.
 * Center-crops to square, max edge {@link AVATAR_MAX_EDGE}.
 */
export async function prepareAvatarImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file");
  }
  if (file.size > AVATAR_SOURCE_MAX_BYTES) {
    throw new Error("Image must be 25 MB or smaller");
  }

  const bitmap = await loadImageBitmap(file);
  try {
    const { sx, sy, sSize } = squareCrop(bitmap.width, bitmap.height);
    const edge = Math.min(AVATAR_MAX_EDGE, sSize);
    const canvas = document.createElement("canvas");
    canvas.width = edge;
    canvas.height = edge;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, sSize, sSize, 0, 0, edge, edge);

    // Prefer WebP when small enough, else JPEG. Aim under ~400KB.
    let blob = await canvasToBlob(canvas, "image/webp", 0.86);
    let type = "image/webp";
    let ext = "webp";
    if (!blob || blob.size > 400_000) {
      blob = await canvasToBlob(canvas, "image/jpeg", 0.88);
      type = "image/jpeg";
      ext = "jpg";
    }
    if (!blob) throw new Error("Could not encode image");

    // Progressive quality drop if still huge (rare for 512px)
    let quality = 0.8;
    while (blob.size > AVATAR_UPLOAD_MAX_BYTES && quality >= 0.5) {
      blob = await canvasToBlob(canvas, "image/jpeg", quality);
      type = "image/jpeg";
      ext = "jpg";
      if (!blob) throw new Error("Could not encode image");
      quality -= 0.1;
    }
    if (blob.size > AVATAR_UPLOAD_MAX_BYTES) {
      throw new Error("Could not compress image enough — try a simpler photo");
    }

    const base = file.name.replace(/\.[^.]+$/, "") || "avatar";
    return new File([blob], `${base}.${ext}`, { type, lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

function squareCrop(w: number, h: number) {
  const sSize = Math.min(w, h);
  const sx = Math.floor((w - sSize) / 2);
  const sy = Math.floor((h - sSize) / 2);
  return { sx, sy, sSize };
}

async function loadImageBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    // Fallback via HTMLImageElement for older browsers
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Could not read image"));
        el.src = url;
      });
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}
