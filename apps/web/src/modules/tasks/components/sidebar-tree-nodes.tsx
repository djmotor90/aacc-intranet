"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { EntityIcon } from "./entity-icon";
import { FolderNavContextMenu, ListNavContextMenu } from "./nav-context-menus";
import type { FolderNavNode, ListNavNode } from "../queries";

function useCombinedRef(...refs: ((node: HTMLElement | null) => void)[]) {
  return (node: HTMLElement | null) => {
    for (const ref of refs) ref(node);
  };
}

/** True if this folder (or a nested folder) contains the list currently in the URL. */
export function folderContainsPath(
  node: FolderNavNode,
  spaceSlug: string,
  pathname: string,
): boolean {
  const folderHref = `/tasks/${spaceSlug}/folder/${node.slug}`;
  if (pathname === folderHref || pathname.startsWith(`${folderHref}/`)) return true;
  for (const list of node.lists) {
    const href = `/tasks/${spaceSlug}/${list.slug}`;
    if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  }
  return node.subfolders.some((sub) => folderContainsPath(sub, spaceSlug, pathname));
}

function ListRowImpl({
  list,
  spaceSlug,
  canManage,
}: {
  list: ListNavNode;
  spaceSlug: string;
  canManage: boolean;
}) {
  const pathname = usePathname();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag:list:${list.id}`,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `drop:list:${list.id}` });
  const setRefs = useCombinedRef(setNodeRef, setDropRef);
  const listHref = `/tasks/${spaceSlug}/${list.slug}`;
  const listActive = pathname === listHref || pathname.startsWith(`${listHref}/`);

  return (
    <ListNavContextMenu
      listId={list.id}
      listName={list.name}
      listIcon={list.icon}
      listColor={list.color}
      spaceSlug={spaceSlug}
      listSlug={list.slug}
      canManage={canManage}
    >
      <Link
        ref={setRefs}
        href={listHref}
        {...attributes}
        {...listeners}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
          isDragging && "opacity-40",
          isOver && "bg-muted ring-2 ring-primary/30",
          listActive
            ? "bg-muted font-medium text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <EntityIcon icon={list.icon} color={list.color} fallback="list" size="xs" />
        <span className="min-w-0 flex-1 truncate">{list.name}</span>
      </Link>
    </ListNavContextMenu>
  );
}

export const ListRow = memo(ListRowImpl);

function FolderRowImpl({
  node,
  spaceId,
  spaceSlug,
  spaceName,
  canManage,
  isExpanded,
  onToggle,
  isFolderExpanded,
  onToggleFolder,
}: {
  node: FolderNavNode;
  spaceId: string;
  spaceSlug: string;
  spaceName: string;
  canManage: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  /** Resolve expand state for nested folders. */
  isFolderExpanded: (folderId: string) => boolean;
  onToggleFolder: (folderId: string) => void;
}) {
  const pathname = usePathname();
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `drag:folder:${node.id}`,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `drop:folder:${node.id}` });
  const setRefs = useCombinedRef(setDragRef, setDropRef);

  const hasChildren = node.subfolders.length > 0 || node.lists.length > 0;
  const containsActive = folderContainsPath(node, spaceSlug, pathname);
  const expanded = hasChildren && isExpanded;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-0.5">
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            aria-expanded={expanded}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="size-5 shrink-0" aria-hidden />
        )}

        <FolderNavContextMenu
          folderId={node.id}
          folderName={node.name}
          folderColor={node.color}
          spaceId={spaceId}
          spaceSlug={spaceSlug}
          spaceName={spaceName}
          isPrivate={node.isPrivate}
          canManage={canManage}
        >
          <Link
            ref={setRefs}
            href={`/tasks/${spaceSlug}/folder/${node.slug}`}
            {...attributes}
            {...listeners}
            className={cn(
              "flex min-w-0 flex-1 cursor-grab items-center gap-2 rounded-md px-1.5 py-1.5 text-sm transition-colors active:cursor-grabbing",
              isDragging && "opacity-40",
              containsActive
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              isOver && "bg-muted ring-2 ring-primary/30",
            )}
          >
            <EntityIcon icon={node.icon} color={node.color} fallback="folder" size="xs" />
            <span className="truncate">{node.name}</span>
          </Link>
        </FolderNavContextMenu>
      </div>

      {expanded && hasChildren && (
        <div className="ml-4 flex flex-col gap-0.5 border-l border-[#007582]/20 pl-2.5">
          {node.subfolders.map((sub) => (
            <FolderRow
              key={sub.id}
              node={sub}
              spaceId={spaceId}
              spaceSlug={spaceSlug}
              spaceName={spaceName}
              canManage={canManage}
              isExpanded={isFolderExpanded(sub.id)}
              onToggle={() => onToggleFolder(sub.id)}
              isFolderExpanded={isFolderExpanded}
              onToggleFolder={onToggleFolder}
            />
          ))}
          {node.lists.map((list) => (
            <ListRow key={list.id} list={list} spaceSlug={spaceSlug} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}

export const FolderRow = FolderRowImpl;
