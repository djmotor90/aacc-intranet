/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { notFound } from "next/navigation";
import { getSpaceRole, requireUser } from "@/lib/rbac";
import { SpaceSettingsMenu } from "@/modules/tasks/components/space-settings-menu";
import { StackedListsView } from "@/modules/tasks/components/stacked-lists-view";
import { flattenLists } from "@/modules/tasks/lib/flatten-lists";
import { loadStackedListBundles } from "@/modules/tasks/lib/load-stacked-lists";
import {
  getActiveUsers,
  getSpaceBySlug,
  getSpaceContentTree,
  getSpaceMembers,
  getTagsForSpace,
  getTaskTypesForSpace,
  getTeams,
  getWritableListsForUser,
} from "@/modules/tasks/queries";

export default async function SpacePage(props: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await props.params;
  const user = await requireUser();
  const space = await getSpaceBySlug(spaceSlug);
  if (!space) notFound();
  const role = await getSpaceRole(user.id, space.id, user.platformRole);
  if (!role) notFound();

  const tree = await getSpaceContentTree(space.id, user.id, user.platformRole, role === "owner");
  const lists = flattenLists(tree.folders, tree.lists);
  const [bundles, activeUsers, spaceTags, writableLists, taskTypes, members, teams] = await Promise.all([
    loadStackedListBundles(lists, user.id, user.platformRole),
    getActiveUsers(),
    getTagsForSpace(space.id),
    getWritableListsForUser(user),
    getTaskTypesForSpace(space.id),
    role === "owner" ? getSpaceMembers(space.id) : Promise.resolve([]),
    role === "owner" ? getTeams() : Promise.resolve([]),
  ]);
  const memberUserIds = new Set(members.map((m) => m.userId));
  const memberGroupIds = new Set(members.map((m) => m.groupId));
  const addableUsers = activeUsers.filter((u) => !memberUserIds.has(u.id));
  const addableTeams = teams.filter((team) => !memberGroupIds.has(team.id));

  return (
    <StackedListsView
      spaceName={space.name}
      spaceSlug={space.slug}
      title={space.name}
      icon={space.icon}
      color={space.color}
      fallbackIcon="space"
      crumbs={[{ href: `/tasks/${space.slug}`, label: space.name }]}
      folders={tree.folders}
      lists={tree.lists}
      bundles={bundles}
      activeUsers={activeUsers}
      spaceTags={spaceTags}
      writableLists={writableLists}
      taskTypes={taskTypes}
      currentUserId={user.id}
      headerActions={
        role === "owner" ? (
          <SpaceSettingsMenu
            spaceId={space.id}
            members={members}
            addableUsers={addableUsers}
            addableTeams={addableTeams}
            taskTypes={taskTypes}
          />
        ) : null
      }
    />
  );
}
