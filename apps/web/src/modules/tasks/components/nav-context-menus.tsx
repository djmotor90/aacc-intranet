"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  Archive,
  Building2,
  ClipboardList,
  FileText,
  FolderPlus,
  ListPlus,
  Palette,
  Pencil,
  Settings,
  Share2,
  Trash2,
} from "lucide-react";
import { CreateDocFromLocationDialog } from "@/components/docs/create-doc-from-location";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addFolderMember,
  addSpaceMember,
  archiveFolder,
  archiveList,
  archiveSpace,
  createFolder,
  createFormOnList,
  createFormView,
  createList,
  createSpace,
  deleteFolder,
  deleteList,
  deleteSpace,
  getFolderSharingData,
  getListsForFormCreate,
  getSpaceSharingData,
  removeFolderMember,
  removeSpaceMember,
  renameList,
  setEntityAppearance,
  setFolderPrivacy,
} from "../actions";
import type { SpaceMemberRow } from "../queries";
import { ColorIconDialog } from "./color-icon-dialog";
import { SharingDialogBody } from "./sharing-dialog-body";

/** Right-click menu on a workspace app root (Tasks, Accounts, …) — space creation is admin-only. */
export function TasksRootContextMenu({
  children,
  isAdmin,
  moduleId,
  moduleName = "Tasks",
}: {
  children: React.ReactNode;
  isAdmin: boolean;
  moduleId: string;
  moduleName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          {isAdmin && (
            <ContextMenuItem onSelect={() => setOpen(true)} className="gap-2">
              <Building2 className="size-4" />
              Create new space
            </ContextMenuItem>
          )}
          <ContextMenuItem asChild className="gap-2">
            <Link href="/tasks/forms">
              <ClipboardList className="size-4" />
              Forms Hub
            </Link>
          </ContextMenuItem>
          <ContextMenuItem asChild className="gap-2">
            <Link href="/?settings=trash">
              <Trash2 className="size-4" />
              Trash
            </Link>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {isAdmin && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Create Space</DialogTitle>
              <DialogDescription>
                Add a new space under <strong>{moduleName}</strong>.
              </DialogDescription>
            </DialogHeader>

            <form action={createSpace} className="flex flex-col gap-3">
              <input type="hidden" name="moduleId" value={moduleId} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-space-name">Name</Label>
                <Input id="new-space-name" name="name" placeholder="e.g. Marketing" required autoFocus />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-space-prefix">Task prefix (optional)</Label>
                <Input
                  id="new-space-prefix"
                  name="taskPrefix"
                  placeholder="e.g. MKT"
                  maxLength={10}
                  className="uppercase"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-space-color">Color</Label>
                <Input id="new-space-color" name="color" type="color" defaultValue="#64748b" className="w-16 p-1" />
              </div>
              <Button type="submit" className="self-end">
                Create
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function useLeaveIfOnPath(prefixes: string[]) {
  const pathname = usePathname();
  const router = useRouter();
  return () => {
    if (prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      router.push("/tasks");
    } else {
      router.refresh();
    }
  };
}

/** Right-click menu on a space row in the sidebar — owner-only actions. */
export function SpaceNavContextMenu({
  children,
  spaceId,
  spaceName,
  spaceSlug,
  spaceIcon,
  spaceColor,
  isOwner,
}: {
  children: React.ReactNode;
  spaceId: string;
  spaceName: string;
  spaceSlug: string;
  spaceIcon?: string | null;
  spaceColor?: string | null;
  isOwner: boolean;
}) {
  const [newListOpen, setNewListOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [newFormOpen, setNewFormOpen] = useState(false);
  const [formLists, setFormLists] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [formName, setFormName] = useState("");
  const [formListId, setFormListId] = useState("");
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);
  const [sharing, setSharing] = useState<{
    members: SpaceMemberRow[];
    addableUsers: { id: string; displayName: string }[];
  } | null>(null);
  const [loading, startLoading] = useTransition();
  const [pending, startPending] = useTransition();
  const leaveIfNeeded = useLeaveIfOnPath([`/tasks/${spaceSlug}`]);
  const router = useRouter();

  if (!isOwner) return <>{children}</>;

  function openNewForm() {
    setNewFormOpen(true);
    setFormName("");
    setFormListId("");
    startLoading(async () => {
      try {
        const rows = await getListsForFormCreate({ spaceId });
        setFormLists(rows);
        if (rows[0]) setFormListId(rows[0].id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load lists");
      }
    });
  }

  function submitNewForm(e: React.FormEvent) {
    e.preventDefault();
    if (!formListId) {
      toast.error("Choose a list for submissions");
      return;
    }
    startPending(async () => {
      try {
        const r = await createFormOnList({
          listId: formListId,
          name: formName.trim() || undefined,
        });
        setNewFormOpen(false);
        toast.success("Form created");
        router.push(`/tasks/${r.spaceSlug}/${r.listSlug}?v=${r.viewId}&view=form`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create form");
      }
    });
  }

  function openSharing() {
    setSharingOpen(true);
    startLoading(async () => {
      const data = await getSpaceSharingData(spaceId);
      setSharing(data);
    });
  }

  function onArchive() {
    if (!window.confirm(`Archive “${spaceName}”? It will hide from the sidebar (not deleted).`)) return;
    startPending(async () => {
      try {
        await archiveSpace(spaceId);
        toast.success("Space archived");
        leaveIfNeeded();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to archive space");
      }
    });
  }

  function onDelete() {
    if (
      !window.confirm(
        `Move “${spaceName}” to Trash? Super Admins can restore it from Settings → Trash.`,
      )
    ) {
      return;
    }
    startPending(async () => {
      try {
        await deleteSpace(spaceId);
        toast.success("Space moved to Trash");
        leaveIfNeeded();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete space");
      }
    });
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setNewDocOpen(true)} className="gap-2" disabled={pending}>
            <FileText className="size-4" />
            New Doc
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setNewListOpen(true)} className="gap-2" disabled={pending}>
            <ListPlus className="size-4" />
            New List
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setNewFolderOpen(true)} className="gap-2" disabled={pending}>
            <FolderPlus className="size-4" />
            New Folder
          </ContextMenuItem>
          <ContextMenuItem onSelect={openNewForm} className="gap-2" disabled={pending}>
            <ClipboardList className="size-4" />
            New Form
          </ContextMenuItem>
          <ContextMenuItem onSelect={openSharing} className="gap-2" disabled={pending}>
            <Share2 className="size-4" />
            Sharing &amp; Permissions
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setAppearanceOpen(true)} className="gap-2" disabled={pending}>
            <Palette className="size-4" />
            Color &amp; Icon
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={onArchive} className="gap-2" disabled={pending}>
            <Archive className="size-4" />
            Archive
          </ContextMenuItem>
          <ContextMenuItem onSelect={onDelete} variant="destructive" className="gap-2" disabled={pending}>
            <Trash2 className="size-4" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <ColorIconDialog
        open={appearanceOpen}
        onOpenChange={setAppearanceOpen}
        kind="space"
        name={spaceName}
        initialIcon={spaceIcon}
        initialColor={spaceColor}
        onSave={async ({ icon, color }) => {
          await setEntityAppearance({ kind: "space", id: spaceId, icon, color });
          router.refresh();
        }}
      />

      <Dialog open={newFormOpen} onOpenChange={setNewFormOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Form</DialogTitle>
            <DialogDescription>
              Submissions create tasks in the AACC Hub list you choose.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitNewForm} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`new-form-name-${spaceId}`}>Form name</Label>
              <Input
                id={`new-form-name-${spaceId}`}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. IT Request"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`new-form-list-${spaceId}`}>Target list</Label>
              <select
                id={`new-form-list-${spaceId}`}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={formListId}
                onChange={(e) => setFormListId(e.target.value)}
                required
                disabled={loading || formLists.length === 0}
              >
                {formLists.length === 0 ? (
                  <option value="">No lists — create a list first</option>
                ) : (
                  formLists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <Button type="submit" className="self-end" disabled={pending || !formListId}>
              Create Form
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={newListOpen} onOpenChange={setNewListOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New List</DialogTitle>
            <DialogDescription>Add a list to this space.</DialogDescription>
          </DialogHeader>

          <form action={createList} className="flex flex-col gap-3">
            <input type="hidden" name="spaceId" value={spaceId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`new-list-name-${spaceId}`}>Name</Label>
              <Input id={`new-list-name-${spaceId}`} name="name" placeholder="e.g. Inspections" required autoFocus />
            </div>
            <Button type="submit" className="self-end">
              Create
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
            <DialogDescription>Add a folder to this space.</DialogDescription>
          </DialogHeader>

          <form action={createFolder} className="flex flex-col gap-3">
            <input type="hidden" name="spaceId" value={spaceId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`new-folder-name-${spaceId}`}>Name</Label>
              <Input
                id={`new-folder-name-${spaceId}`}
                name="name"
                placeholder="e.g. Client Projects"
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="self-end">
              Create
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={sharingOpen} onOpenChange={setSharingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sharing &amp; Permissions</DialogTitle>
            <DialogDescription>Who has access to this space and its lists.</DialogDescription>
          </DialogHeader>

          {loading || !sharing ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <SharingDialogBody
              idFieldName="spaceId"
              idValue={spaceId}
              members={sharing.members}
              addableUsers={sharing.addableUsers}
              addAction={async (formData) => {
                await addSpaceMember(formData);
                setSharing(await getSpaceSharingData(spaceId));
              }}
              removeAction={async (formData) => {
                await removeSpaceMember(formData);
                setSharing(await getSpaceSharingData(spaceId));
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <CreateDocFromLocationDialog
        open={newDocOpen}
        onOpenChange={setNewDocOpen}
        spaceId={spaceId}
        spaceName={spaceName}
      />
    </>
  );
}

/** Right-click menu on a list row in the sidebar — links into the full list settings page. */
export function ListNavContextMenu({
  children,
  listId,
  listName,
  listIcon,
  listColor,
  spaceSlug,
  listSlug,
  canManage,
}: {
  children: React.ReactNode;
  listId: string;
  listName: string;
  listIcon?: string | null;
  listColor?: string | null;
  spaceSlug: string;
  listSlug: string;
  canManage: boolean;
}) {
  const [pending, startPending] = useTransition();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const leaveIfNeeded = useLeaveIfOnPath([`/tasks/${spaceSlug}/${listSlug}`]);
  const router = useRouter();

  if (!canManage) return <>{children}</>;

  const settingsHref = `/tasks/${spaceSlug}/${listSlug}/settings`;

  function onRename(formData: FormData) {
    startPending(async () => {
      try {
        await renameList(formData);
        toast.success("List renamed");
        setRenameOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to rename list");
      }
    });
  }

  function onArchive() {
    if (!window.confirm(`Archive “${listName}”? It will hide from the sidebar (not deleted).`)) return;
    startPending(async () => {
      try {
        await archiveList(listId);
        toast.success("List archived");
        leaveIfNeeded();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to archive list");
      }
    });
  }

  function onDelete() {
    if (
      !window.confirm(
        `Move “${listName}” to Trash? Super Admins can restore it from Settings → Trash.`,
      )
    ) {
      return;
    }
    startPending(async () => {
      try {
        await deleteList(listId);
        toast.success("List moved to Trash");
        leaveIfNeeded();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete list");
      }
    });
  }

  function onNewForm() {
    startPending(async () => {
      try {
        const r = await createFormView({ listId, name: "Form" });
        toast.success("Form created");
        router.push(`/tasks/${spaceSlug}/${listSlug}?v=${r.viewId}&view=form`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create form");
      }
    });
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={onNewForm} className="gap-2" disabled={pending}>
            <ClipboardList className="size-4" />
            New Form
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setRenameOpen(true)} className="gap-2" disabled={pending}>
            <Pencil className="size-4" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem asChild className="gap-2">
            <Link href={settingsHref}>
              <Settings className="size-4" />
              List settings
            </Link>
          </ContextMenuItem>
          <ContextMenuItem asChild className="gap-2">
            <Link href={`${settingsHref}?tab=sharing`}>
              <Share2 className="size-4" />
              Sharing &amp; Permissions
            </Link>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setAppearanceOpen(true)} className="gap-2" disabled={pending}>
            <Palette className="size-4" />
            Color &amp; Icon
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={onArchive} className="gap-2" disabled={pending}>
            <Archive className="size-4" />
            Archive
          </ContextMenuItem>
          <ContextMenuItem onSelect={onDelete} variant="destructive" className="gap-2" disabled={pending}>
            <Trash2 className="size-4" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename List</DialogTitle>
            <DialogDescription>Update the display name for this list.</DialogDescription>
          </DialogHeader>

          <form action={onRename} className="flex flex-col gap-3">
            <input type="hidden" name="listId" value={listId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`rename-list-name-${listId}`}>Name</Label>
              <Input
                id={`rename-list-name-${listId}`}
                name="name"
                defaultValue={listName}
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="self-end" disabled={pending}>
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <ColorIconDialog
        open={appearanceOpen}
        onOpenChange={setAppearanceOpen}
        kind="list"
        name={listName}
        initialIcon={listIcon}
        initialColor={listColor}
        onSave={async ({ icon, color }) => {
          await setEntityAppearance({ kind: "list", id: listId, icon, color });
          router.refresh();
        }}
      />
    </>
  );
}

/** Right-click menu on a folder row in the sidebar — owner-only actions. */
export function FolderNavContextMenu({
  children,
  folderId,
  folderName,
  folderColor,
  spaceId,
  spaceSlug,
  spaceName,
  isPrivate,
  canManage,
}: {
  children: React.ReactNode;
  folderId: string;
  folderName: string;
  folderColor?: string | null;
  spaceId: string;
  spaceSlug: string;
  spaceName: string;
  isPrivate: boolean;
  canManage: boolean;
}) {
  const [newListOpen, setNewListOpen] = useState(false);
  const [newSubfolderOpen, setNewSubfolderOpen] = useState(false);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [newFormOpen, setNewFormOpen] = useState(false);
  const [formLists, setFormLists] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [formName, setFormName] = useState("");
  const [formListId, setFormListId] = useState("");
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);
  const [sharing, setSharing] = useState<{
    members: SpaceMemberRow[];
    addableUsers: { id: string; displayName: string }[];
  } | null>(null);
  const [loading, startLoading] = useTransition();
  const [privacyPending, startPrivacyTransition] = useTransition();
  const [pending, startPending] = useTransition();
  const leaveIfNeeded = useLeaveIfOnPath([`/tasks/${spaceSlug}`]);
  const router = useRouter();

  if (!canManage) return <>{children}</>;

  function openNewForm() {
    setNewFormOpen(true);
    setFormName("");
    setFormListId("");
    startLoading(async () => {
      try {
        const rows = await getListsForFormCreate({ spaceId, folderId });
        setFormLists(rows);
        if (rows[0]) setFormListId(rows[0].id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load lists");
      }
    });
  }

  function submitNewForm(e: React.FormEvent) {
    e.preventDefault();
    if (!formListId) {
      toast.error("Choose a list for submissions");
      return;
    }
    startPending(async () => {
      try {
        const r = await createFormOnList({
          listId: formListId,
          name: formName.trim() || undefined,
        });
        setNewFormOpen(false);
        toast.success("Form created");
        router.push(`/tasks/${r.spaceSlug}/${r.listSlug}?v=${r.viewId}&view=form`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create form");
      }
    });
  }

  function openSharing() {
    setSharingOpen(true);
    startLoading(async () => {
      const data = await getFolderSharingData(folderId);
      setSharing(data);
    });
  }

  function togglePrivacy(checked: boolean) {
    startPrivacyTransition(async () => {
      const formData = new FormData();
      formData.set("folderId", folderId);
      formData.set("isPrivate", String(checked));
      await setFolderPrivacy(formData);
    });
  }

  function onArchive() {
    if (
      !window.confirm(
        `Archive “${folderName}” and everything inside it? Hidden from the sidebar (not deleted).`,
      )
    ) {
      return;
    }
    startPending(async () => {
      try {
        await archiveFolder(folderId);
        toast.success("Folder archived");
        leaveIfNeeded();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to archive folder");
      }
    });
  }

  function onDelete() {
    if (
      !window.confirm(
        `Move “${folderName}” and everything inside it to Trash? Super Admins can restore it from Settings → Trash.`,
      )
    ) {
      return;
    }
    startPending(async () => {
      try {
        await deleteFolder(folderId);
        toast.success("Folder moved to Trash");
        leaveIfNeeded();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete folder");
      }
    });
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setNewDocOpen(true)} className="gap-2" disabled={pending}>
            <FileText className="size-4" />
            New Doc
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setNewListOpen(true)} className="gap-2" disabled={pending}>
            <ListPlus className="size-4" />
            New List
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setNewSubfolderOpen(true)} className="gap-2" disabled={pending}>
            <FolderPlus className="size-4" />
            New Subfolder
          </ContextMenuItem>
          <ContextMenuItem onSelect={openNewForm} className="gap-2" disabled={pending}>
            <ClipboardList className="size-4" />
            New Form
          </ContextMenuItem>
          <ContextMenuItem onSelect={openSharing} className="gap-2" disabled={pending}>
            <Share2 className="size-4" />
            Sharing &amp; Permissions
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setAppearanceOpen(true)} className="gap-2" disabled={pending}>
            <Palette className="size-4" />
            Color
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={onArchive} className="gap-2" disabled={pending}>
            <Archive className="size-4" />
            Archive
          </ContextMenuItem>
          <ContextMenuItem onSelect={onDelete} variant="destructive" className="gap-2" disabled={pending}>
            <Trash2 className="size-4" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <ColorIconDialog
        open={appearanceOpen}
        onOpenChange={setAppearanceOpen}
        kind="folder"
        name={folderName}
        initialColor={folderColor}
        onSave={async ({ color }) => {
          await setEntityAppearance({ kind: "folder", id: folderId, icon: null, color });
          router.refresh();
        }}
      />

      <Dialog open={newFormOpen} onOpenChange={setNewFormOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Form</DialogTitle>
            <DialogDescription>
              Submissions land as tasks in a list inside this folder.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitNewForm} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`new-form-name-${folderId}`}>Form name</Label>
              <Input
                id={`new-form-name-${folderId}`}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Intake"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`new-form-list-${folderId}`}>Target list</Label>
              <select
                id={`new-form-list-${folderId}`}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={formListId}
                onChange={(e) => setFormListId(e.target.value)}
                required
                disabled={loading || formLists.length === 0}
              >
                {formLists.length === 0 ? (
                  <option value="">No lists in this folder</option>
                ) : (
                  formLists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <Button type="submit" className="self-end" disabled={pending || !formListId}>
              Create Form
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={newListOpen} onOpenChange={setNewListOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New List</DialogTitle>
            <DialogDescription>Add a list to this folder.</DialogDescription>
          </DialogHeader>

          <form action={createList} className="flex flex-col gap-3">
            <input type="hidden" name="spaceId" value={spaceId} />
            <input type="hidden" name="folderId" value={folderId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`new-list-name-${folderId}`}>Name</Label>
              <Input
                id={`new-list-name-${folderId}`}
                name="name"
                placeholder="e.g. Inspections"
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="self-end">
              Create
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={newSubfolderOpen} onOpenChange={setNewSubfolderOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Subfolder</DialogTitle>
            <DialogDescription>Add a subfolder inside this folder.</DialogDescription>
          </DialogHeader>

          <form action={createFolder} className="flex flex-col gap-3">
            <input type="hidden" name="spaceId" value={spaceId} />
            <input type="hidden" name="parentFolderId" value={folderId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`new-subfolder-name-${folderId}`}>Name</Label>
              <Input
                id={`new-subfolder-name-${folderId}`}
                name="name"
                placeholder="e.g. 2026 Projects"
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="self-end">
              Create
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={sharingOpen} onOpenChange={setSharingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sharing &amp; Permissions</DialogTitle>
            <DialogDescription>Who has access to this folder and its contents.</DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-lg border p-3">
            <Checkbox
              id={`folder-private-${folderId}`}
              checked={isPrivate}
              disabled={privacyPending}
              onCheckedChange={(checked) => togglePrivacy(checked === true)}
              className="mt-0.5"
            />
            <Label htmlFor={`folder-private-${folderId}`} className="flex flex-col gap-0.5 font-normal">
              <span className="text-sm font-medium">{isPrivate ? "Private folder" : "Public folder"}</span>
              <span className="text-xs text-muted-foreground">
                {isPrivate
                  ? "Only people added below (and space owners) have access. Nothing carries over automatically."
                  : "Access carries over from the space (or parent folder). Switch to Private to control it directly instead."}
              </span>
            </Label>
          </div>

          {loading || !sharing ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <SharingDialogBody
              idFieldName="folderId"
              idValue={folderId}
              members={sharing.members}
              addableUsers={sharing.addableUsers}
              addAction={async (formData) => {
                await addFolderMember(formData);
                setSharing(await getFolderSharingData(folderId));
              }}
              removeAction={async (formData) => {
                await removeFolderMember(formData);
                setSharing(await getFolderSharingData(folderId));
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <CreateDocFromLocationDialog
        open={newDocOpen}
        onOpenChange={setNewDocOpen}
        spaceId={spaceId}
        spaceName={spaceName}
        folderId={folderId}
        folderName={folderName}
      />
    </>
  );
}
