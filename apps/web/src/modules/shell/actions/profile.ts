/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use server";

import { randomUUID } from "node:crypto";
import { db, permissionRoles, users } from "@aitim/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { platformRoleLabel } from "@/lib/role-labels";
import { requireUser } from "@/lib/rbac";
import { BUCKETS, deleteObject, putObject } from "@/lib/storage";
import {
  cacheEntraPhotoForUser,
  entraPhotoObjectKey,
  isCustomPhotoKey,
} from "@/lib/user-photos";

/** Post-compression cap (client prepares ~512px JPEG/WebP). Source files may be larger. */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type MyProfile = {
  id: string;
  displayName: string;
  email: string;
  photoKey: string | null;
  photoCustom: boolean;
  hasPhoto: boolean;
  /** Raw platform role (`admin` = Super Admin gate). */
  platformRole: "admin" | "member";
  isProtectedAdmin: boolean;
  /** True Super Admin (platform god mode). */
  isSuperAdmin: boolean;
  /**
   * Human-facing role for Account UI.
   * Super Admin → "Super Admin"; otherwise Security & Permissions membership name.
   */
  roleLabel: string;
  /** Extra line under the role (e.g. full access / membership note). */
  roleDescription: string | null;
};

export async function getMyProfile(): Promise<MyProfile> {
  const sessionUser = await requireUser();
  const [row] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      photoKey: users.photoKey,
      photoCustom: users.photoCustom,
      platformRole: users.platformRole,
      isProtectedAdmin: users.isProtectedAdmin,
      permissionRoleId: users.permissionRoleId,
    })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);
  if (!row) throw new Error("User not found");

  const isSuperAdmin = row.isProtectedAdmin || row.platformRole === "admin";
  let roleLabel = platformRoleLabel(row.platformRole, { protected: row.isProtectedAdmin });
  let roleDescription: string | null = isSuperAdmin
    ? "Full platform access (god mode)"
    : null;

  if (!isSuperAdmin) {
    // Membership from Security & Permissions (Guest / Member / Admin / custom)
    let membershipName: string | null = null;
    if (row.permissionRoleId) {
      const [pr] = await db
        .select({ name: permissionRoles.name, slug: permissionRoles.slug })
        .from(permissionRoles)
        .where(eq(permissionRoles.id, row.permissionRoleId))
        .limit(1);
      membershipName = pr?.name ?? null;
    }
    if (!membershipName) {
      const [member] = await db
        .select({ name: permissionRoles.name })
        .from(permissionRoles)
        .where(eq(permissionRoles.slug, "member"))
        .limit(1);
      membershipName = member?.name ?? "Member";
    }
    roleLabel = membershipName;
    roleDescription = "App permissions from Security & Permissions";
  }

  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    photoKey: row.photoKey,
    photoCustom: row.photoCustom,
    hasPhoto: !!row.photoKey,
    platformRole: row.platformRole,
    isProtectedAdmin: row.isProtectedAdmin,
    isSuperAdmin,
    roleLabel,
    roleDescription,
  };
}

/**
 * Stamps `lastActiveAt` for the current session user. Called on an interval by
 * a client-side heartbeat while the app is open, so the profile panel's
 * "online" indicator reflects real activity rather than only last sign-in.
 */
export async function heartbeat(): Promise<void> {
  const sessionUser = await requireUser();
  await db
    .update(users)
    .set({ lastActiveAt: new Date() })
    .where(eq(users.id, sessionUser.id));
}

export async function uploadMyAvatar(formData: FormData): Promise<MyProfile> {
  const sessionUser = await requireUser();
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose an image file to upload");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("Avatar is too large after processing (max 2 MB)");
  }

  const mime = (file.type || "").toLowerCase();
  const ext = ALLOWED_TYPES[mime];
  if (!ext) {
    throw new Error("Use a JPEG, PNG, WebP, or GIF image");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Basic magic-byte check so content-type spoofing is less likely
  if (!looksLikeImage(buffer, mime)) {
    throw new Error("File does not look like a valid image");
  }

  const [existing] = await db
    .select({ photoKey: users.photoKey, photoCustom: users.photoCustom })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);
  if (!existing) throw new Error("User not found");

  const key = `custom/${sessionUser.id}/${randomUUID()}.${ext}`;
  await putObject(BUCKETS.photos, key, buffer, mime);

  await db
    .update(users)
    .set({
      photoKey: key,
      photoCustom: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, sessionUser.id));

  // Best-effort cleanup of previous custom object (not Entra-synced keys like `{id}.jpg`)
  if (existing.photoCustom && existing.photoKey && existing.photoKey !== key) {
    try {
      await deleteObject(BUCKETS.photos, existing.photoKey);
    } catch {
      // ignore
    }
  }

  try {
    const { writeAuditLog } = await import("@/lib/audit");
    await writeAuditLog({
      category: "user",
      eventType: "USER_AVATAR_UPLOADED",
      title: "User Avatar Uploaded",
      eventStatus: "success",
      actorId: sessionUser.id,
      targetType: "user",
      targetId: sessionUser.id,
      payload: { photoKey: key, contentType: mime, bytes: file.size },
    });
  } catch {
    // ignore audit failures
  }

  revalidatePath("/");
  return getMyProfile();
}

/**
 * Remove custom avatar and restore the Entra directory photo as the active avatar.
 * Falls back to initials only if Entra has no photo either.
 */
export async function removeMyAvatar(): Promise<MyProfile> {
  const sessionUser = await requireUser();
  const [existing] = await db
    .select({
      photoKey: users.photoKey,
      photoCustom: users.photoCustom,
      entraObjectId: users.entraObjectId,
    })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);
  if (!existing) throw new Error("User not found");

  if (!existing.photoCustom) {
    // Already on Entra / no custom — nothing to remove.
    return getMyProfile();
  }

  const customKey =
    existing.photoKey && isCustomPhotoKey(existing.photoKey) ? existing.photoKey : null;

  // Prefer a fresh Entra fetch so remove restores the directory photo when available.
  let displayKey: string | null = null;
  if (existing.entraObjectId) {
    try {
      displayKey = await cacheEntraPhotoForUser({
        userId: sessionUser.id,
        entraObjectId: existing.entraObjectId,
      });
    } catch (err) {
      console.error("[avatar] Entra restore failed", err);
    }
  }
  // Fall back to previously cached Entra object from photo sync (stable key).
  if (!displayKey) {
    const stable = entraPhotoObjectKey(sessionUser.id);
    try {
      const { getObjectStream } = await import("@/lib/storage");
      await getObjectStream(BUCKETS.photos, stable);
      displayKey = stable;
    } catch {
      displayKey = null;
    }
  }

  await db
    .update(users)
    .set({
      photoKey: displayKey,
      photoCustom: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, sessionUser.id));

  if (customKey) {
    try {
      await deleteObject(BUCKETS.photos, customKey);
    } catch {
      // ignore
    }
  }

  try {
    const { writeAuditLog } = await import("@/lib/audit");
    await writeAuditLog({
      category: "user",
      eventType: "USER_AVATAR_REMOVED",
      title: "User Custom Avatar Removed",
      eventStatus: "success",
      actorId: sessionUser.id,
      targetType: "user",
      targetId: sessionUser.id,
      payload: { restoredEntraPhotoKey: displayKey },
    });
  } catch {
    // ignore
  }

  revalidatePath("/");
  return getMyProfile();
}

function looksLikeImage(buf: Buffer, mime: string): boolean {
  if (buf.length < 12) return false;
  // JPEG
  if (mime.includes("jpeg") || mime.includes("jpg")) {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  // PNG
  if (mime.includes("png")) {
    return (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    );
  }
  // GIF
  if (mime.includes("gif")) {
    return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
  }
  // WebP: RIFF....WEBP
  if (mime.includes("webp")) {
    return (
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50
    );
  }
  return false;
}
