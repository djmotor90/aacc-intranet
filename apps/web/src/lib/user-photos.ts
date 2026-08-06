/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Entra-synced avatars live at a stable key; custom uploads use custom/{userId}/…
 * so removing a custom photo can fall back to the Entra image.
 */

import { BUCKETS, putObject } from "@/lib/storage";

/** Stable S3 key for the Entra / Graph directory photo. */
export function entraPhotoObjectKey(userId: string): string {
  return `${userId}.jpg`;
}

export function isCustomPhotoKey(photoKey: string | null | undefined): boolean {
  return !!photoKey && photoKey.startsWith("custom/");
}

/**
 * Fetch the user's Entra photo via Microsoft Graph and store it under the stable key.
 * Returns the object key, or null if the user has no photo / Graph is unavailable.
 */
export async function cacheEntraPhotoForUser(params: {
  userId: string;
  entraObjectId: string;
}): Promise<string | null> {
  const { graphFetch } = await import("@/lib/graph/app-client");
  const res = await graphFetch(`/users/${params.entraObjectId}/photos/96x96/$value`);
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  const key = entraPhotoObjectKey(params.userId);
  await putObject(
    BUCKETS.photos,
    key,
    buffer,
    res.headers.get("content-type") ?? "image/jpeg",
  );
  return key;
}
