/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { notFound } from "next/navigation";
import { getFolderRole, getSpaceRole, requireUser } from "@/lib/rbac";
import { StackedListsView } from "@/modules/tasks/components/stacked-lists-view";
import { findFolderInTree, flattenLists } from "@/modules/tasks/lib/flatten-lists";
import { loadStackedListBundles } from "@/modules/tasks/lib/load-stacked-lists";
import {
  getActiveUsers,
  getFolderBySlug,
  getSpaceBySlug,
  getSpaceContentTree,
  getTagsForSpace,
  getTaskTypesForSpace,
  getWritableListsForUser,
} from "@/modules/tasks/queries";

export default async function FolderPage(props: {
  params: Promise<{ spaceSlug: string; folderSlug: string }>;
}) {
  const { spaceSlug, folderSlug } = await props.params;
  const user = await requireUser();
  const space = await getSpaceBySlug(spaceSlug);
  if (!space) notFound();
  const spaceRole = await getSpaceRole(user.id, space.id, user.platformRole);
  const folder = await getFolderBySlug(space.id, folderSlug);
  if (!folder) notFound();
  const folderRole = await getFolderRole(user.id, folder.id, user.platformRole);
  if (!spaceRole && !folderRole && user.platformRole !== "admin") notFound();

  const tree = await getSpaceContentTree(space.id, user.id, user.platformRole, spaceRole === "owner");
  const node = findFolderInTree(tree.folders, folder.id);
  if (!node) notFound();

  const lists = flattenLists(node.subfolders, node.lists);
  const [bundles, activeUsers, spaceTags, writableLists, taskTypes] = await Promise.all([
    loadStackedListBundles(lists, user.id, user.platformRole),
    getActiveUsers(),
    getTagsForSpace(space.id),
    getWritableListsForUser(user),
    getTaskTypesForSpace(space.id),
  ]);

  return (
    <StackedListsView
      spaceName={space.name}
      spaceSlug={space.slug}
      title={node.name}
      icon={node.icon}
      color={node.color}
      crumbs={[
        { href: `/tasks/${space.slug}`, label: space.name },
        { href: `/tasks/${space.slug}/folder/${node.slug}`, label: node.name },
      ]}
      folders={node.subfolders}
      lists={node.lists}
      bundles={bundles}
      activeUsers={activeUsers}
      spaceTags={spaceTags}
      writableLists={writableLists}
      taskTypes={taskTypes}
      currentUserId={user.id}
    />
  );
}
