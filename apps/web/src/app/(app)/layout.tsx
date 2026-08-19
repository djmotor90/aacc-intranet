/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, users, withDbRetry } from "@aitim/db";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/shell/app-shell";
import { NotificationBell } from "@/components/shell/notification-bell";
import { UserSettingsMenu } from "@/components/shell/user-settings-menu";
import { WhatsNewButton } from "@/components/shell/whats-new-button";
import { TrackTimeButton } from "@/modules/tasks/components/track-time-button";
import { signOut } from "@/lib/auth";
import { requireUser, userOwnsAnySpace } from "@/lib/rbac";
import { navItemsFor, workspaceModulesToNavItems } from "@/modules/registry";
import { listEnabledWorkspaceModules } from "@/modules/shell/actions/modules";
import { getSidebarNavForUser } from "@/modules/shell/actions/sidebar-nav";
import { getTaskNavTreeForUser } from "@/modules/tasks/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isAdmin = user.platformRole === "admin";
  const [workspaceModules, configuredNav, taskNavTree, photoRow, ownsSpace, hasTrashPermission] =
    await Promise.all([
      listEnabledWorkspaceModules(),
      getSidebarNavForUser(),
      getTaskNavTreeForUser(user),
      withDbRetry(() =>
        db
          .select({ photoKey: users.photoKey })
          .from(users)
          .where(eq(users.id, user.id)),
      ).then((rows) => rows[0] ?? null),
      isAdmin ? Promise.resolve(true) : userOwnsAnySpace(user.id, user.platformRole),
      isAdmin
        ? Promise.resolve(true)
        : import("@/lib/permissions").then(({ userHasPermission }) =>
            userHasPermission(user, "manage_trash"),
          ),
    ]);
  const items =
    configuredNav.length > 0
      ? configuredNav
      : [
          { label: "Home", href: "/", icon: "home" as const },
          ...workspaceModulesToNavItems(workspaceModules),
          ...navItemsFor(user),
        ];
  const canManageTrash = isAdmin || ownsSpace || hasTrashPermission;

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AppShell
      items={items}
      taskNavTree={taskNavTree}
      isAdmin={isAdmin}
      header={
        <div className="flex items-center gap-1">
          <TrackTimeButton />
          <WhatsNewButton isAdmin={isAdmin} />
          <NotificationBell />
          <UserSettingsMenu
            user={{
              id: user.id,
              name: user.name ?? null,
              email: user.email ?? null,
              platformRole: user.platformRole,
              photoKey: photoRow?.photoKey ?? null,
            }}
            isAdmin={isAdmin}
            canManageTrash={canManageTrash}
            signOutAction={signOutAction}
          />
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
