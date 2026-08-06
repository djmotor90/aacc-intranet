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
import { notFound } from "next/navigation";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSpaceRole, requireUser } from "@/lib/rbac";

export default async function WorkspaceModuleHomePage(props: {
  params: Promise<{ moduleSlug: string }>;
}) {
  const { moduleSlug } = await props.params;
  const user = await requireUser();

  const [mod] = await db
    .select()
    .from(modules)
    .where(and(eq(modules.slug, moduleSlug), eq(modules.isEnabled, true)));
  if (!mod) notFound();

  const candidates = await db
    .select()
    .from(spaces)
    .where(
      and(
        eq(spaces.moduleId, mod.id),
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
      <h1 className="mb-1 text-2xl font-semibold">{mod.name}</h1>
      {mod.description && (
        <p className="mb-4 text-sm text-muted-foreground">{mod.description}</p>
      )}
      {allSpaces.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <FolderKanban className="size-6 text-muted-foreground/60" />
          <p className="text-sm">
            No spaces yet
            {user.platformRole === "admin"
              ? " — right-click this app in the sidebar to create one."
              : ". Ask an admin to add you to one."}
          </p>
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
