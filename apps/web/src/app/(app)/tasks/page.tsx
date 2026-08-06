/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, modules, spaces } from "@aitim/db";
import { and, eq, isNull } from "drizzle-orm";
import { FolderKanban } from "lucide-react";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSpaceRole, requireUser } from "@/lib/rbac";
import { ensureTasksModule } from "@/modules/shell/actions/modules";

export default async function TasksHomePage() {
  const user = await requireUser();
  await ensureTasksModule();
  const [tasksModule] = await db.select().from(modules).where(eq(modules.slug, "tasks"));

  const candidates = await db
    .select()
    .from(spaces)
    .where(
      and(
        tasksModule ? eq(spaces.moduleId, tasksModule.id) : undefined,
        eq(spaces.isArchived, false),
        isNull(spaces.deletedAt),
      ),
    );
  const roles = await Promise.all(
    candidates.map((s) => getSpaceRole(user.id, s.id, user.platformRole)),
  );
  const allSpaces = candidates.filter((_, i) => roles[i] !== null);

  return (
    <div className="w-full">
      <h1 className="mb-4 text-2xl font-semibold">{tasksModule?.name ?? "Tasks"}</h1>
      {allSpaces.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <FolderKanban className="size-6 text-muted-foreground/60" />
          <p className="text-sm">No spaces yet. Ask an admin to add you to one.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {allSpaces.map((s) => (
            <Link key={s.id} href={`/tasks/${s.slug}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle style={s.color ? { color: s.color } : undefined}>{s.name}</CardTitle>
                  <CardDescription>Space · {s.taskPrefix}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
