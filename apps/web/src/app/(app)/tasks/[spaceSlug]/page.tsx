/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSpaceRole, requireUser } from "@/lib/rbac";
import { EntityIcon } from "@/modules/tasks/components/entity-icon";
import { SpaceSettingsMenu } from "@/modules/tasks/components/space-settings-menu";
import {
  getActiveUsers,
  getSpaceBySlug,
  getSpaceContentTree,
  getSpaceMembers,
  getTaskTypesForSpace,
  type FolderNavNode,
  type ListNavNode,
} from "@/modules/tasks/queries";

function ListCard({ list, spaceSlug }: { list: ListNavNode; spaceSlug: string }) {
  return (
    <Link href={`/tasks/${spaceSlug}/${list.slug}`}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <EntityIcon icon={list.icon} color={list.color} fallback="list" size="sm" />
            <span className="truncate">{list.name}</span>
          </CardTitle>
          {list.description && <CardDescription>{list.description}</CardDescription>}
        </CardHeader>
      </Card>
    </Link>
  );
}

function FolderSection({ folder, spaceSlug }: { folder: FolderNavNode; spaceSlug: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <EntityIcon color={folder.color} fallback="folder" size="sm" />
        {folder.name}
      </div>
      {folder.lists.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {folder.lists.map((list) => (
            <ListCard key={list.id} list={list} spaceSlug={spaceSlug} />
          ))}
        </div>
      )}
      {folder.subfolders.length > 0 && (
        <div className="ml-6 flex flex-col gap-3 border-l pl-4">
          {folder.subfolders.map((sub) => (
            <FolderSection key={sub.id} folder={sub} spaceSlug={spaceSlug} />
          ))}
        </div>
      )}
    </div>
  );
}

export default async function SpacePage(props: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await props.params;
  const user = await requireUser();
  const space = await getSpaceBySlug(spaceSlug);
  if (!space) notFound();
  const role = await getSpaceRole(user.id, space.id, user.platformRole);
  if (!role) notFound();

  const tree = await getSpaceContentTree(space.id, user.id, user.platformRole, role === "owner");
  const [members, activeUsers, taskTypes] = role === "owner"
    ? await Promise.all([getSpaceMembers(space.id), getActiveUsers(), getTaskTypesForSpace(space.id)])
    : [[], [], []];
  const memberUserIds = new Set(members.map((m) => m.userId));
  const addableUsers = activeUsers.filter((u) => !memberUserIds.has(u.id));

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold">
          <EntityIcon icon={space.icon} color={space.color} fallback="space" size="md" />
          {space.name}
        </h1>
        {role === "owner" && (
          <SpaceSettingsMenu
            spaceId={space.id}
            members={members}
            addableUsers={addableUsers}
            taskTypes={taskTypes}
          />
        )}
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Space · prefix {space.taskPrefix} · your role: {role}
      </p>

      <div className="flex flex-col gap-6">
        {tree.folders.map((folder) => (
          <FolderSection key={folder.id} folder={folder} spaceSlug={space.slug} />
        ))}

        {tree.lists.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {tree.lists.map((list) => (
              <ListCard key={list.id} list={list} spaceSlug={space.slug} />
            ))}
          </div>
        )}

        {tree.folders.length === 0 && tree.lists.length === 0 && (
          <p className="text-sm text-muted-foreground">No lists or folders yet.</p>
        )}
      </div>
    </div>
  );
}
