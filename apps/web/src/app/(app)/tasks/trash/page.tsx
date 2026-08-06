/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, userOwnsAnySpace } from "@/lib/rbac";

/**
 * Trash lives under Settings now.
 * Keep this route so old links / context menus don't 404.
 */
export default async function TasksTrashPage() {
  const user = await requireUser();
  const isAdmin = user.platformRole === "admin";
  const { userHasPermission } = await import("@/lib/permissions");
  const canManageTrash =
    isAdmin ||
    (await userOwnsAnySpace(user.id, user.platformRole)) ||
    (await userHasPermission(user, "manage_trash"));
  if (canManageTrash) {
    redirect("/?settings=trash");
  }

  return (
    <div className="mx-auto w-full max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold">Trash moved</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Soft-deleted spaces, folders, lists, and tasks are managed under{" "}
        <strong>Settings → Trash</strong> by Space Admins and Super Admins. Ask one of them to
        restore or permanently delete something.
      </p>
      <Link href="/tasks" className="mt-6 inline-block text-sm text-primary hover:underline">
        ← Back to Tasks
      </Link>
    </div>
  );
}
