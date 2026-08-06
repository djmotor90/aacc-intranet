/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, users } from "@aitim/db";
import { eq, isNotNull } from "drizzle-orm";
import { cacheEntraPhotoForUser, entraPhotoObjectKey } from "@/lib/user-photos";

/**
 * Refresh Entra directory photos into S3.
 * - Always updates the stable Entra object (`{userId}.jpg`).
 * - Only points `photoKey` at it when the user has not set a custom avatar.
 */
export async function runSyncPhotos(): Promise<string> {
  const rows = await db
    .select({
      id: users.id,
      entraObjectId: users.entraObjectId,
      photoCustom: users.photoCustom,
    })
    .from(users)
    .where(isNotNull(users.entraObjectId));

  let cached = 0;
  let displayUpdated = 0;
  for (const user of rows) {
    if (!user.entraObjectId) continue;
    try {
      const key = await cacheEntraPhotoForUser({
        userId: user.id,
        entraObjectId: user.entraObjectId,
      });
      if (!key) continue;
      cached++;

      if (!user.photoCustom) {
        await db
          .update(users)
          .set({
            photoKey: entraPhotoObjectKey(user.id),
            photoCustom: false,
          })
          .where(eq(users.id, user.id));
        displayUpdated++;
      }
      // If photoCustom: Entra file is refreshed in storage for later fallback,
      // but photoKey stays on the custom upload.
    } catch (err) {
      console.error(`photo sync failed for user ${user.id}`, err);
    }
  }
  return `cached ${cached}/${rows.length} Entra photos · display updated ${displayUpdated}`;
}
