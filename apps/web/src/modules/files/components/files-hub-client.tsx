"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  ChevronRight,
  File,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  LayoutGrid,
  List,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Star,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition, type DragEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL } from "@/lib/upload-limits";
import { cn } from "@/lib/utils";
import {
  createDriveFolder,
  listMoveTargets,
  moveDriveFile,
  moveDriveFolder,
  renameDriveFile,
  renameDriveFolder,
  restoreDriveFile,
  restoreDriveFolder,
  toggleDriveStar,
  trashDriveFile,
  trashDriveFolder,
} from "../actions";
import { fileKind, formatBytes } from "../lib/icons";
import type { DriveFileItem, DriveFolderItem, DriveSection, TaskFileItem } from "../queries";

type ViewMode = "list" | "grid";

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startToday.getTime() - startThat.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function FileGlyph({ mime, name, size = "sm" }: { mime: string; name: string; size?: "sm" | "lg" }) {
  const kind = fileKind(mime, name);
  const cls = size === "lg" ? "size-8" : "size-4";
  if (kind === "image") return <ImageIcon className={cn(cls, "text-emerald-600")} />;
  if (kind === "pdf") return <FileText className={cn(cls, "text-red-600")} />;
  if (kind === "sheet") return <FileSpreadsheet className={cn(cls, "text-green-700")} />;
  if (kind === "doc") return <FileText className={cn(cls, "text-sky-600")} />;
  return <File className={cn(cls, "text-muted-foreground")} />;
}

const FILTERS: { id: DriveSection; label: string }[] = [
  { id: "all", label: "All" },
  { id: "recent", label: "Recent" },
  { id: "starred", label: "Starred" },
  { id: "tasks", label: "Task files" },
  { id: "trash", label: "Trash" },
];

type PreviewTarget = {
  kind: "drive" | "task";
  id: string;
  fileName: string;
  mimeType: string;
};

function previewUrl(file: PreviewTarget, download = false) {
  const base = file.kind === "drive" ? `/api/files/${file.id}` : `/api/attachments/${file.id}`;
  return download ? `${base}?download=1` : base;
}

function groupTaskFiles(files: TaskFileItem[]) {
  const order: string[] = [];
  const map = new Map<
    string,
    { taskNumber: string; taskTitle: string; spaceName: string; files: TaskFileItem[] }
  >();
  for (const file of files) {
    const key = String(file.taskNumber);
    let group = map.get(key);
    if (!group) {
      group = {
        taskNumber: key,
        taskTitle: file.taskTitle,
        spaceName: file.spaceName,
        files: [],
      };
      map.set(key, group);
      order.push(key);
    }
    group.files.push(file);
  }
  return order.map((key) => map.get(key)!);
}

export function FilesHubClient({
  section,
  folders,
  files,
  taskFiles,
  breadcrumbs,
  currentFolderId,
  currentFolderSpaceId,
  spaces,
}: {
  section: DriveSection;
  folders: DriveFolderItem[];
  files: DriveFileItem[];
  taskFiles: TaskFileItem[];
  breadcrumbs: { id: string; name: string }[];
  currentFolderId: string | null;
  currentFolderSpaceId: string | null;
  spaces: { id: string; name: string }[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [surfaceOver, setSurfaceOver] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderSpaceId, setFolderSpaceId] = useState(currentFolderSpaceId || spaces[0]?.id || "");
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [renaming, setRenaming] = useState<{ kind: "file" | "folder"; id: string; name: string } | null>(null);
  const [moving, setMoving] = useState<{ kind: "file" | "folder"; id: string; spaceId: string } | null>(null);
  const [moveTargets, setMoveTargets] = useState<{ id: string; name: string }[]>([]);
  const [moveDest, setMoveDest] = useState("__root__");

  const needle = q.trim().toLowerCase();
  const visibleFolders = useMemo(
    () => folders.filter((f) => !needle || f.name.toLowerCase().includes(needle)),
    [folders, needle],
  );
  const visibleFiles = useMemo(
    () => files.filter((f) => !needle || f.fileName.toLowerCase().includes(needle)),
    [files, needle],
  );
  const visibleTaskFiles = useMemo(
    () =>
      taskFiles.filter(
        (f) =>
          !needle ||
          `${f.fileName} ${f.taskTitle} ${f.taskNumber} ${f.spaceName}`.toLowerCase().includes(needle),
      ),
    [taskFiles, needle],
  );

  function go(next: { section?: DriveSection; folder?: string | null }) {
    const params = new URLSearchParams();
    const sec = next.section ?? section;
    if (sec !== "all") params.set("section", sec);
    const folder = next.folder === undefined ? currentFolderId : next.folder;
    if (sec === "all" && folder) params.set("folder", folder);
    const qs = params.toString();
    router.push(qs ? `/files?${qs}` : "/files");
  }

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  async function uploadFiles(fileList: File[]) {
    if (fileList.length === 0) return;
    const spaceId = currentFolderSpaceId || folderSpaceId;
    if (!spaceId) {
      toast.error("Pick a space so the team can find this file");
      return;
    }
    setUploading(true);
    try {
      for (const file of fileList) {
        if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error(`${file.name}: too large (max ${MAX_ATTACHMENT_LABEL})`);
        }
        const data = new FormData();
        data.set("file", file);
        data.set("spaceId", spaceId);
        if (currentFolderId) data.set("folderId", currentFolderId);
        const res = await fetch("/api/files", { method: "POST", body: data });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Upload failed");
        }
      }
      toast.success(fileList.length === 1 ? "Uploaded" : `Uploaded ${fileList.length} files`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDropFiles(e: DragEvent) {
    e.preventDefault();
    setSurfaceOver(false);
    if (section !== "all") return;
    const dropped = [...e.dataTransfer.files];
    if (dropped.length > 0) void uploadFiles(dropped);
  }

  const taskGroups = useMemo(() => groupTaskFiles(visibleTaskFiles), [visibleTaskFiles]);
  const isLibrary = section === "all";
  const heading =
    section === "tasks"
      ? "Task files"
      : section === "starred"
        ? "Starred"
        : section === "recent"
          ? "Recent"
          : section === "trash"
            ? "Trash"
            : "All Files";
  const intro =
    section === "tasks"
      ? "Files people added on tasks. They stay on the task — this list is only for finding them."
      : "Shared folders for the team. Anyone with space access can open them. Drop files anywhere to upload (" +
        MAX_ATTACHMENT_LABEL +
        " max).";

  const empty = section === "tasks" ? visibleTaskFiles.length === 0 : visibleFolders.length === 0 && visibleFiles.length === 0;

  return (
    <div
      className={cn("mx-auto flex w-full max-w-6xl flex-col gap-5", surfaceOver && "ring-2 ring-primary/30 rounded-2xl")}
      onDragOver={(e) => {
        if (section !== "all") return;
        if ([...e.dataTransfer.types].includes("Files")) {
          e.preventDefault();
          setSurfaceOver(true);
        }
      }}
      onDragLeave={() => setSurfaceOver(false)}
      onDrop={onDropFiles}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
        </div>
        {isLibrary && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="gap-1.5" onClick={() => setCreatingFolder(true)}>
              <FolderPlus className="size-3.5" />
              New folder
            </Button>
            <Button type="button" className="gap-1.5" disabled={uploading || spaces.length === 0} onClick={() => inputRef.current?.click()}>
              <Upload className="size-3.5" />
              {uploading ? "Uploading…" : "Upload"}
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => void uploadFiles([...(e.target.files ?? [])])}
            />
          </div>
        )}
      </div>

      <nav aria-label="Folder path" className="flex flex-wrap items-center gap-0.5 text-sm">
        {section === "tasks" ? (
          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium">
            <Paperclip className="size-3.5 text-muted-foreground" />
            Task files
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => go({ section: "all", folder: null })}
              className={cn(
                "rounded-md px-2 py-1 font-medium transition-colors hover:bg-muted",
                !currentFolderId && section === "all" ? "text-foreground" : "text-muted-foreground",
              )}
            >
              All Files
            </button>
            {section === "all" &&
              breadcrumbs.map((crumb) => (
                <span key={crumb.id} className="flex items-center gap-0.5">
                  <ChevronRight className="size-3.5 text-muted-foreground/60" />
                  <button type="button" className="rounded-md px-2 py-1 font-medium hover:bg-muted" onClick={() => go({ folder: crumb.id })}>
                    {crumb.name}
                  </button>
                </span>
              ))}
          </>
        )}
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">Search files</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={section === "tasks" ? "Search files or tasks" : "Search files"}
            className="h-9 pl-8"
          />
        </label>
        {FILTERS.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={section === item.id ? "default" : "outline"}
            className="gap-1.5"
            onClick={() => go({ section: item.id, folder: item.id === "all" ? currentFolderId : null })}
          >
            {item.id === "tasks" && <Paperclip className="size-3.5" />}
            {item.label}
          </Button>
        ))}
        <div className="ml-auto flex gap-1">
          <Button type="button" size="icon-sm" variant={view === "grid" ? "secondary" : "ghost"} aria-label="Grid" onClick={() => setView("grid")}>
            <LayoutGrid className="size-3.5" />
          </Button>
          <Button type="button" size="icon-sm" variant={view === "list" ? "secondary" : "ghost"} aria-label="List" onClick={() => setView("list")}>
            <List className="size-3.5" />
          </Button>
        </div>
      </div>

      <div>
        {empty ? (
          <div className="rounded-2xl border border-dashed p-12 text-center">
            {section === "tasks" ? (
              <Paperclip className="mx-auto size-10 text-muted-foreground" />
            ) : (
              <Folder className="mx-auto size-10 fill-amber-400/80 text-amber-500" />
            )}
            <p className="mt-3 font-medium">
              {section === "tasks"
                ? "No task files yet"
                : section === "starred"
                  ? "No starred files yet"
                  : section === "trash"
                    ? "Trash is empty"
                    : currentFolderId
                      ? "This folder is empty"
                      : "No shared files yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {section === "tasks"
                ? "When someone adds a file on a task you can open, it will show up here — still stored on that task."
                : section === "all"
                  ? "Create a folder for a space, or upload a file the whole team can use."
                  : "Shared files from this view will show up here."}
            </p>
            {section === "all" && (
              <Button type="button" className="mt-4" variant="outline" onClick={() => inputRef.current?.click()}>
                <Plus className="size-3.5" />
                Upload files
              </Button>
            )}
          </div>
        ) : section === "tasks" ? (
          view === "grid" ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visibleTaskFiles.map((file) => (
                <div
                  key={file.id}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setPreview({
                      kind: "task",
                      id: file.id,
                      fileName: file.fileName,
                      mimeType: file.mimeType,
                    })
                  }
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    setPreview({
                      kind: "task",
                      id: file.id,
                      fileName: file.fileName,
                      mimeType: file.mimeType,
                    })
                  }
                  className="group relative flex flex-col items-center gap-2 rounded-2xl border border-border bg-background p-3 text-center hover:shadow-sm"
                >
                  <span className="flex size-12 items-center justify-center rounded-xl bg-muted">
                    <FileGlyph mime={file.mimeType} name={file.fileName} size="lg" />
                  </span>
                  <span className="line-clamp-2 text-xs font-medium">{file.fileName}</span>
                  <Link
                    href={`/tasks/task/${file.taskNumber}`}
                    className="line-clamp-1 text-[10px] font-medium text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {String(file.taskNumber)}
                  </Link>
                  <span className="line-clamp-1 text-[10px] text-muted-foreground">{file.spaceName}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 flex flex-col gap-5">
              {taskGroups.map((group) => (
                <section key={group.taskNumber} className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-2">
                    <Link
                      href={`/tasks/task/${group.taskNumber}`}
                      className="font-mono text-xs font-semibold text-primary hover:underline"
                    >
                      {group.taskNumber}
                    </Link>
                    <span className="min-w-0 truncate text-sm font-medium">{group.taskTitle}</span>
                    <span className="text-[11px] text-muted-foreground">{group.spaceName}</span>
                  </div>
                  <ul className="grid gap-0.5">
                    {group.files.map((file) => (
                      <li key={file.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() =>
                            setPreview({
                              kind: "task",
                              id: file.id,
                              fileName: file.fileName,
                              mimeType: file.mimeType,
                            })
                          }
                        >
                          <FileGlyph mime={file.mimeType} name={file.fileName} />
                          <span className="truncate font-medium">{file.fileName}</span>
                        </button>
                        <span className="hidden w-24 text-xs text-muted-foreground sm:block">
                          {formatBytes(file.sizeBytes)}
                        </span>
                        <span className="hidden w-20 text-xs text-muted-foreground sm:block">
                          {formatRelativeDate(file.updatedAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )
        ) : view === "grid" ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleFolders.map((folder) => (
              <div
                key={folder.id}
                role="button"
                tabIndex={0}
                onDoubleClick={() => go({ folder: folder.id })}
                onKeyDown={(e) => e.key === "Enter" && go({ folder: folder.id })}
                className="group relative flex flex-col items-center gap-2 rounded-2xl border border-border bg-background p-3 text-center hover:shadow-sm"
              >
                <div className="absolute right-1.5 top-1.5">
                  <ItemMenu
                    items={
                      section === "trash"
                        ? [{ label: "Restore", onSelect: () => run(() => restoreDriveFolder(folder.id)) }]
                        : [
                            { label: "Open", onSelect: () => go({ folder: folder.id }) },
                            { label: "Rename", onSelect: () => setRenaming({ kind: "folder", id: folder.id, name: folder.name }) },
                            {
                              label: "Move to…",
                              onSelect: () => {
                                setMoving({ kind: "folder", id: folder.id, spaceId: folder.homeSpaceId });
                                startTransition(async () => setMoveTargets(await listMoveTargets(folder.homeSpaceId)));
                              },
                            },
                            { label: "Move to trash", destructive: true, onSelect: () => run(() => trashDriveFolder(folder.id)) },
                          ]
                    }
                  />
                </div>
                <Folder className="size-12 fill-amber-400/85 text-amber-500" strokeWidth={1.25} />
                <span className="line-clamp-2 text-xs font-medium">{folder.name}</span>
                <span className="line-clamp-1 text-[10px] text-muted-foreground">{folder.spaceName}</span>
              </div>
            ))}
            {visibleFiles.map((file) => (
              <div
                key={file.id}
                role="button"
                tabIndex={0}
                onDoubleClick={() =>
                  setPreview({ kind: "drive", id: file.id, fileName: file.fileName, mimeType: file.mimeType })
                }
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  setPreview({ kind: "drive", id: file.id, fileName: file.fileName, mimeType: file.mimeType })
                }
                className="group relative flex flex-col items-center gap-2 rounded-2xl border border-border bg-background p-3 text-center hover:shadow-sm"
              >
                <div className="absolute right-1.5 top-1.5">
                  <FileMenu
                    file={file}
                    trash={section === "trash"}
                    onPreview={() =>
                      setPreview({ kind: "drive", id: file.id, fileName: file.fileName, mimeType: file.mimeType })
                    }
                    onRename={() => setRenaming({ kind: "file", id: file.id, name: file.fileName })}
                    onMove={() => {
                      setMoving({ kind: "file", id: file.id, spaceId: file.homeSpaceId });
                      startTransition(async () => setMoveTargets(await listMoveTargets(file.homeSpaceId)));
                    }}
                    onRun={run}
                  />
                </div>
                <span className="flex size-12 items-center justify-center rounded-xl bg-muted">
                  <FileGlyph mime={file.mimeType} name={file.fileName} size="lg" />
                </span>
                <span className="line-clamp-2 text-xs font-medium">{file.fileName}</span>
                <span className="line-clamp-1 text-[10px] text-muted-foreground">{file.spaceName}</span>
                <span className="text-[10px] text-muted-foreground">{formatBytes(file.sizeBytes)}</span>
              </div>
            ))}
          </div>
        ) : (
          <ul className="mt-4 grid gap-1">
            {visibleFolders.map((folder) => (
              <li key={folder.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => go({ folder: folder.id })}>
                  <Folder className="size-4 fill-amber-400/85 text-amber-500" />
                  <span className="truncate font-medium">{folder.name}</span>
                </button>
                <span className="hidden w-28 text-xs text-muted-foreground sm:block">{folder.spaceName}</span>
                <span className="hidden w-20 text-xs text-muted-foreground sm:block">{formatRelativeDate(folder.updatedAt)}</span>
              </li>
            ))}
            {visibleFiles.map((file) => (
              <li key={file.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() =>
                    setPreview({ kind: "drive", id: file.id, fileName: file.fileName, mimeType: file.mimeType })
                  }
                >
                  <FileGlyph mime={file.mimeType} name={file.fileName} />
                  <span className="truncate font-medium">{file.fileName}</span>
                  {file.starred && <Star className="size-3 fill-amber-400 text-amber-500" />}
                </button>
                <span className="hidden w-24 text-xs text-muted-foreground sm:block">{formatBytes(file.sizeBytes)}</span>
                <span className="hidden w-20 text-xs text-muted-foreground sm:block">{formatRelativeDate(file.updatedAt)}</span>
                <FileMenu
                  file={file}
                  trash={section === "trash"}
                  onPreview={() =>
                    setPreview({ kind: "drive", id: file.id, fileName: file.fileName, mimeType: file.mimeType })
                  }
                  onRename={() => setRenaming({ kind: "file", id: file.id, name: file.fileName })}
                  onMove={() => {
                    setMoving({ kind: "file", id: file.id, spaceId: file.homeSpaceId });
                    startTransition(async () => setMoveTargets(await listMoveTargets(file.homeSpaceId)));
                  }}
                  onRun={run}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={creatingFolder} onOpenChange={setCreatingFolder}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="folder-name">Name</Label>
              <Input id="folder-name" value={folderName} onChange={(e) => setFolderName(e.target.value)} />
            </div>
            {!currentFolderId && (
              <div className="grid gap-1.5">
                <Label htmlFor="folder-space">Shared in space</Label>
                <select
                  id="folder-space"
                  value={folderSpaceId}
                  onChange={(e) => setFolderSpaceId(e.target.value)}
                  className="h-8 rounded-md border bg-transparent px-2 text-sm"
                >
                  {spaces.map((space) => (
                    <option key={space.id} value={space.id}>
                      {space.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreatingFolder(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || !folderName.trim() || !folderSpaceId}
              onClick={() =>
                run(async () => {
                  await createDriveFolder({
                    name: folderName,
                    homeSpaceId: currentFolderSpaceId || folderSpaceId,
                    parentFolderId: currentFolderId,
                  });
                  toast.success("Folder created");
                  setCreatingFolder(false);
                  setFolderName("");
                })
              }
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(renaming)} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <Input value={renaming?.name ?? ""} onChange={(e) => setRenaming((cur) => (cur ? { ...cur, name: e.target.value } : cur))} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || !renaming?.name.trim()}
              onClick={() => {
                if (!renaming) return;
                run(async () => {
                  if (renaming.kind === "folder") await renameDriveFolder(renaming.id, renaming.name);
                  else await renameDriveFile(renaming.id, renaming.name);
                  toast.success("Renamed");
                  setRenaming(null);
                });
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(moving)} onOpenChange={(open) => !open && setMoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move to folder</DialogTitle>
          </DialogHeader>
          <select value={moveDest} onChange={(e) => setMoveDest(e.target.value)} className="h-8 rounded-md border bg-transparent px-2 text-sm">
            <option value="__root__">All Files</option>
            {moveTargets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMoving(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || !moving}
              onClick={() => {
                if (!moving) return;
                const dest = moveDest === "__root__" ? null : moveDest;
                run(async () => {
                  if (moving.kind === "folder") await moveDriveFolder(moving.id, dest);
                  else await moveDriveFile(moving.id, dest);
                  toast.success("Moved");
                  setMoving(null);
                });
              }}
            >
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="truncate">{preview?.fileName}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="min-h-[50vh] flex-1 overflow-auto bg-muted/40 p-4">
              {fileKind(preview.mimeType, preview.fileName) === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl(preview)} alt={preview.fileName} className="mx-auto max-h-[70vh] max-w-full object-contain" />
              ) : fileKind(preview.mimeType, preview.fileName) === "pdf" ? (
                <iframe title={preview.fileName} src={previewUrl(preview)} className="h-[70vh] w-full rounded-md bg-white" />
              ) : (
                <p className="text-center text-sm text-muted-foreground">Preview isn’t available. Download the file instead.</p>
              )}
            </div>
          )}
          <DialogFooter className="m-0">
            {preview && (
              <Button asChild>
                <a href={previewUrl(preview, true)}>Download</a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ItemMenu({
  items,
}: {
  items: { label: string; onSelect: () => void; destructive?: boolean }[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon-sm" variant="ghost" className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100" aria-label="More">
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem key={item.label} className={cn(item.destructive && "text-destructive")} onSelect={item.onSelect}>
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FileMenu({
  file,
  trash,
  onPreview,
  onRename,
  onMove,
  onRun,
}: {
  file: DriveFileItem;
  trash: boolean;
  onPreview: () => void;
  onRename: () => void;
  onMove: () => void;
  onRun: (fn: () => Promise<unknown>) => void;
}) {
  return (
    <ItemMenu
      items={
        trash
          ? [{ label: "Restore", onSelect: () => onRun(() => restoreDriveFile(file.id)) }]
          : [
              { label: "Open", onSelect: onPreview },
              { label: file.starred ? "Unstar" : "Star", onSelect: () => onRun(() => toggleDriveStar(file.id)) },
              { label: "Rename", onSelect: onRename },
              { label: "Move to…", onSelect: onMove },
              {
                label: "Copy link",
                onSelect: async () => {
                  await navigator.clipboard.writeText(`${window.location.origin}/api/files/${file.id}`);
                },
              },
              { label: "Move to trash", destructive: true, onSelect: () => onRun(() => trashDriveFile(file.id)) },
            ]
      }
    />
  );
}
