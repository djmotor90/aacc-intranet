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
  Download,
  ExternalLink,
  FileArchive,
  FileAudio,
  FileCode,
  FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  LayoutGrid,
  List,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Presentation,
  RotateCcw,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_LABEL,
} from "@/lib/upload-limits";
import { cn } from "@/lib/utils";
import {
  createAttachmentFolder,
  deleteAttachment,
  deleteAttachmentFolder,
  moveAttachment,
  moveAttachmentFolder,
  renameAttachmentFolder,
} from "../actions";

const MIME_ATTACHMENT = "application/x-aitim-attachment";
const MIME_FOLDER = "application/x-aitim-folder";
const VIEW_STORAGE_KEY = "aitim:attachments-view";

export type AttachmentRow = {
  id: string;
  folderId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploaderId: string | null;
  uploaderName: string | null;
};

export type AttachmentFolderRow = {
  id: string;
  parentFolderId: string | null;
  name: string;
};

type ViewMode = "grid" | "list";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hasOsFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes("Files");
}

function isImageMime(mime: string, name: string): boolean {
  if (mime.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp|heic|avif)$/i.test(name);
}

/** Google Drive–style colored type icon for a file. */
function FileTypeVisual({
  mimeType,
  fileName,
  attachmentId,
  size = "lg",
}: {
  mimeType: string;
  fileName: string;
  attachmentId: string;
  size?: "sm" | "lg";
}) {
  const iconClass = size === "lg" ? "size-10" : "size-4";
  const boxClass =
    size === "lg"
      ? "flex size-16 items-center justify-center rounded-xl"
      : "flex size-8 items-center justify-center rounded-md";

  if (isImageMime(mimeType, fileName)) {
    if (size === "lg") {
      return (
        <div className="relative flex size-20 items-center justify-center overflow-hidden rounded-xl bg-muted ring-1 ring-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/attachments/${attachmentId}`}
            alt=""
            className="size-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              const fallback = (e.target as HTMLImageElement).nextElementSibling;
              if (fallback instanceof HTMLElement) fallback.classList.remove("hidden");
            }}
          />
          <div className={cn(boxClass, "hidden absolute inset-0 bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-300")}>
            <FileImage className={iconClass} />
          </div>
        </div>
      );
    }
    return (
      <span className={cn(boxClass, "bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-300")}>
        <FileImage className={iconClass} />
      </span>
    );
  }

  const lower = fileName.toLowerCase();
  let Icon = FileIcon;
  let tone = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    Icon = FileText;
    tone = "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300";
  } else if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    /\.(xlsx?|csv|ods)$/i.test(lower)
  ) {
    Icon = FileSpreadsheet;
    tone = "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  } else if (
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint") ||
    /\.(pptx?|key|odp)$/i.test(lower)
  ) {
    Icon = Presentation;
    tone = "bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300";
  } else if (
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    /\.(docx?|rtf|odt|txt|md)$/i.test(lower)
  ) {
    Icon = FileText;
    tone = "bg-brand-aqua/70 text-brand-teal-deep dark:bg-primary/20 dark:text-primary";
  } else if (mimeType.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi)$/i.test(lower)) {
    Icon = FileVideo;
    tone = "bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-300";
  } else if (mimeType.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac)$/i.test(lower)) {
    Icon = FileAudio;
    tone = "bg-pink-100 text-pink-600 dark:bg-pink-950 dark:text-pink-300";
  } else if (
    mimeType.includes("zip") ||
    mimeType.includes("compressed") ||
    /\.(zip|rar|7z|tar|gz)$/i.test(lower)
  ) {
    Icon = FileArchive;
    tone = "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  } else if (
    mimeType.includes("json") ||
    mimeType.includes("javascript") ||
    mimeType.includes("typescript") ||
    /\.(js|ts|tsx|jsx|py|go|rs|java|css|html|json|yml|yaml|sh)$/i.test(lower)
  ) {
    Icon = FileCode;
    tone = "bg-brand-orange/10 text-brand-orange dark:bg-brand-orange/20";
  }

  return (
    <span className={cn(boxClass, tone)}>
      <Icon className={iconClass} strokeWidth={1.5} />
    </span>
  );
}

function FolderVisual({ size = "lg" }: { size?: "sm" | "lg" }) {
  if (size === "lg") {
    return (
      <span className="flex size-20 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/40">
        <Folder className="size-12 fill-amber-400 text-amber-500 dark:fill-amber-500/80 dark:text-amber-400" strokeWidth={1} />
      </span>
    );
  }
  return (
    <span className="flex size-8 items-center justify-center rounded-md bg-amber-50 dark:bg-amber-950/40">
      <Folder className="size-4 fill-amber-400 text-amber-500" strokeWidth={1.25} />
    </span>
  );
}

export function AttachmentBrowser({
  taskId,
  attachments,
  folders,
  currentUserId,
  canEdit,
  isPlatformAdmin,
}: {
  taskId: string;
  attachments: AttachmentRow[];
  folders: AttachmentFolderRow[];
  currentUserId: string;
  canEdit: boolean;
  isPlatformAdmin: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<ViewMode>("grid");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [surfaceDragOver, setSurfaceDragOver] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<string | "current" | null>(null);
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** In-app image lightbox (with explicit close control). */
  const [preview, setPreview] = useState<AttachmentRow | null>(null);
  const [zoom, setZoom] = useState(1);
  /** Natural pixel size of the previewed image (for real scrollable zoom). */
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  /** Scrollport size — used to pad the canvas so every edge of a zoomed image is reachable. */
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [panning, setPanning] = useState(false);

  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 5;
  const ZOOM_STEP = 0.25;
  const EDGE_PAD = 24; // always keep a little room past each edge when scrolling

  useEffect(() => {
    // Deferred: hydrating the view preference from localStorage is an external
    // sync, and setState directly in the effect body triggers cascading renders.
    queueMicrotask(() => {
      try {
        const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
        if (saved === "list" || saved === "grid") setView(saved);
      } catch {
        // ignore
      }
    });
  }, []);

  // Reset zoom / size whenever a different image is opened / closed. Deferred:
  // setState directly in the effect body triggers cascading renders, and the
  // pan ref can't be touched during render.
  useEffect(() => {
    queueMicrotask(() => {
      setZoom(1);
      setNaturalSize(null);
      panRef.current = null;
      setPanning(false);
    });
  }, [preview?.id]);

  // Track the scrollport so we can center small images with padding (not flex,
  // which clips top/left when content overflows).
  useEffect(() => {
    const el = previewScrollRef.current;
    if (!el || !preview) return;
    const measure = () => setViewport({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [preview?.id]);

  function clampZoom(value: number) {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
  }

  function zoomBy(delta: number) {
    const el = previewScrollRef.current;
    const prevZoom = zoom;
    const next = clampZoom(prevZoom + delta);
    if (next === prevZoom) return;

    // Keep the visual center under the crosshair when zoom changes
    if (el && prevZoom > 0) {
      const cx = el.scrollLeft + el.clientWidth / 2;
      const cy = el.scrollTop + el.clientHeight / 2;
      const ratio = next / prevZoom;
      setZoom(next);
      requestAnimationFrame(() => {
        el.scrollLeft = cx * ratio - el.clientWidth / 2;
        el.scrollTop = cy * ratio - el.clientHeight / 2;
      });
    } else {
      setZoom(next);
    }
  }

  /** Display size at 100% that fits the lightbox viewport. */
  const fitSize = useMemo(() => {
    if (!naturalSize) return null;
    const maxW =
      viewport.w > 0
        ? Math.max(120, viewport.w - EDGE_PAD * 2)
        : typeof window !== "undefined"
          ? Math.min(window.innerWidth * 0.9, 1040)
          : 1040;
    const maxH =
      viewport.h > 0
        ? Math.max(120, viewport.h - EDGE_PAD * 2)
        : typeof window !== "undefined"
          ? Math.min(window.innerHeight * 0.72, 780)
          : 780;
    const scale = Math.min(1, maxW / naturalSize.w, maxH / naturalSize.h);
    return {
      w: Math.max(1, Math.round(naturalSize.w * scale)),
      h: Math.max(1, Math.round(naturalSize.h * scale)),
    };
  }, [naturalSize, viewport.w, viewport.h]);

  /** Layout size grows with zoom so the overflow container can scroll/pan. */
  const displaySize = useMemo(() => {
    if (!fitSize) return null;
    return {
      w: Math.round(fitSize.w * zoom),
      h: Math.round(fitSize.h * zoom),
    };
  }, [fitSize, zoom]);

  /**
   * Symmetric padding around the image:
   * - when smaller than the viewport → centers it
   * - when larger → keeps EDGE_PAD so every corner is still scroll-reachable
   * (flexbox centering would clip top/left overflow — do not use it here)
   */
  const canvasPad = useMemo(() => {
    if (!displaySize || viewport.w <= 0 || viewport.h <= 0) {
      return { x: EDGE_PAD, y: EDGE_PAD };
    }
    return {
      x: Math.max(EDGE_PAD, Math.floor((viewport.w - displaySize.w) / 2)),
      y: Math.max(EDGE_PAD, Math.floor((viewport.h - displaySize.h) / 2)),
    };
  }, [displaySize, viewport.w, viewport.h]);

  const canPan = useMemo(() => {
    if (!displaySize || viewport.w <= 0) return zoom > 1;
    return (
      displaySize.w + canvasPad.x * 2 > viewport.w + 1 ||
      displaySize.h + canvasPad.y * 2 > viewport.h + 1
    );
  }, [displaySize, canvasPad, viewport, zoom]);

  function openAttachment(file: AttachmentRow) {
    if (isImageMime(file.mimeType, file.fileName)) {
      setZoom(1);
      setNaturalSize(null);
      setPreview(file);
      return;
    }
    window.open(`/api/attachments/${file.id}`, "_blank", "noopener,noreferrer");
  }

  function closePreview() {
    setPreview(null);
    setZoom(1);
    setNaturalSize(null);
  }

  function onPreviewPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!canPan) return;
    const el = previewScrollRef.current;
    if (!el) return;
    // Only left button / primary touch
    if (e.button !== 0) return;
    panRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
    setPanning(true);
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPreviewPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    const el = previewScrollRef.current;
    if (!pan?.active || !el) return;
    const dx = e.clientX - pan.startX;
    const dy = e.clientY - pan.startY;
    el.scrollLeft = pan.scrollLeft - dx;
    el.scrollTop = pan.scrollTop - dy;
  }

  function onPreviewPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const el = previewScrollRef.current;
    if (panRef.current?.active && el) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    panRef.current = null;
    setPanning(false);
  }

  function setViewPersist(next: ViewMode) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, AttachmentFolderRow[]>();
    for (const f of folders) {
      const arr = map.get(f.parentFolderId) ?? [];
      arr.push(f);
      map.set(f.parentFolderId, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [folders]);

  const filesByFolder = useMemo(() => {
    const map = new Map<string | null, AttachmentRow[]>();
    for (const a of attachments) {
      const arr = map.get(a.folderId) ?? [];
      arr.push(a);
      map.set(a.folderId, arr);
    }
    return map;
  }, [attachments]);

  // If current folder was deleted, bounce to root (adjust during render —
  // converges immediately since the condition goes false).
  if (currentFolderId && !folderById.has(currentFolderId)) {
    setCurrentFolderId(null);
  }

  const breadcrumbs = useMemo(() => {
    const trail: AttachmentFolderRow[] = [];
    let cur = currentFolderId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const f = folderById.get(cur);
      if (!f) break;
      trail.unshift(f);
      cur = f.parentFolderId;
    }
    return trail;
  }, [currentFolderId, folderById]);

  const visibleFolders = childrenByParent.get(currentFolderId) ?? [];
  const visibleFiles = filesByFolder.get(currentFolderId) ?? [];
  const isEmpty = visibleFolders.length === 0 && visibleFiles.length === 0;

  const refresh = useCallback(() => router.refresh(), [router]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setError(null);
      setPending(true);
      try {
        await fn();
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setPending(false);
      }
    },
    [refresh],
  );

  const uploadFiles = useCallback(
    async (files: File[], folderId: string | null) => {
      if (files.length === 0) return;
      setError(null);
      setPending(true);
      try {
        for (const file of files) {
          if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
            throw new Error(`${file.name}: too large (max ${MAX_ATTACHMENT_LABEL})`);
          }
          const formData = new FormData();
          formData.set("file", file);
          if (folderId) formData.set("folderId", folderId);
          const res = await fetch(`/api/tasks/${taskId}/attachments`, {
            method: "POST",
            body: formData,
          });
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(data.error ?? `Upload failed (${res.status})`);
          }
        }
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setPending(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [taskId, refresh],
  );

  function canDeleteFile(a: AttachmentRow) {
    return isPlatformAdmin || canEdit || a.uploaderId === currentUserId;
  }

  function onDragStartAttachment(e: DragEvent, id: string) {
    if (!canEdit) return;
    e.dataTransfer.setData(MIME_ATTACHMENT, id);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragStartFolder(e: DragEvent, id: string) {
    if (!canEdit) return;
    e.dataTransfer.setData(MIME_FOLDER, id);
    e.dataTransfer.effectAllowed = "move";
  }

  function acceptDropTarget(e: DragEvent, target: string | "current") {
    if (!canEdit) return false;
    const types = Array.from(e.dataTransfer.types);
    if (types.includes(MIME_ATTACHMENT) || types.includes(MIME_FOLDER) || types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = types.includes("Files") ? "copy" : "move";
      setDropTargetId(target);
      return true;
    }
    return false;
  }

  async function handleDropOn(e: DragEvent, targetFolderId: string | null) {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetId(null);
    setSurfaceDragOver(false);
    if (!canEdit) return;

    const osFiles = Array.from(e.dataTransfer.files ?? []);
    if (osFiles.length > 0) {
      await uploadFiles(osFiles, targetFolderId);
      return;
    }

    const attachmentId = e.dataTransfer.getData(MIME_ATTACHMENT);
    if (attachmentId) {
      await run(() => moveAttachment({ attachmentId, folderId: targetFolderId }));
      return;
    }

    const folderId = e.dataTransfer.getData(MIME_FOLDER);
    if (folderId) {
      if (targetFolderId === folderId) return;
      await run(() => moveAttachmentFolder({ folderId, parentFolderId: targetFolderId }));
    }
  }

  async function submitNewFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    await run(() =>
      createAttachmentFolder({
        taskId,
        name,
        parentFolderId: currentFolderId,
      }),
    );
    setCreating(false);
    setNewFolderName("");
  }

  async function submitRename() {
    if (!renamingId || !renameValue.trim()) return;
    await run(() => renameAttachmentFolder({ folderId: renamingId, name: renameValue.trim() }));
    setRenamingId(null);
    setRenameValue("");
  }

  function ItemMenu({
    children,
    items,
  }: {
    children: ReactNode;
    items: { label: string; destructive?: boolean; onSelect: () => void; disabled?: boolean }[];
  }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-7 shrink-0 p-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
            aria-label="More actions"
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {items.map((item, i) => (
            <DropdownMenuItem
              key={i}
              disabled={item.disabled || pending}
              className={item.destructive ? "text-destructive focus:text-destructive" : undefined}
              onSelect={(e) => {
                e.preventDefault();
                item.onSelect();
              }}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function FolderTile({ folder }: { folder: AttachmentFolderRow }) {
    const isDrop = dropTargetId === folder.id;
    const isSelected = selectedId === `folder:${folder.id}`;
    const isRenaming = renamingId === folder.id;

    return (
      <div
        role="button"
        tabIndex={0}
        draggable={canEdit}
        onDragStart={(e) => onDragStartFolder(e, folder.id)}
        onDragOver={(e) => acceptDropTarget(e, folder.id)}
        onDragLeave={() => setDropTargetId((cur) => (cur === folder.id ? null : cur))}
        onDrop={(e) => void handleDropOn(e, folder.id)}
        onClick={() => setSelectedId(`folder:${folder.id}`)}
        onDoubleClick={() => {
          if (isRenaming) return;
          setCurrentFolderId(folder.id);
          setSelectedId(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setCurrentFolderId(folder.id);
            setSelectedId(null);
          }
        }}
        className={cn(
          "group relative flex flex-col items-center gap-2 rounded-2xl border bg-card p-3 text-center transition-all",
          "hover:bg-muted/50 hover:shadow-sm",
          isSelected && "border-primary/50 bg-primary/5 ring-2 ring-primary/20",
          isDrop && "border-primary bg-primary/10 ring-2 ring-primary/40",
          !isSelected && !isDrop && "border-border/80",
          canEdit && "cursor-grab active:cursor-grabbing",
        )}
      >
        {canEdit && (
          <div className="absolute right-1.5 top-1.5">
            <ItemMenu
              items={[
                {
                  label: "Open",
                  onSelect: () => setCurrentFolderId(folder.id),
                },
                {
                  label: "Rename",
                  onSelect: () => {
                    setRenamingId(folder.id);
                    setRenameValue(folder.name);
                  },
                },
                {
                  label: "Upload here",
                  onSelect: () => {
                    // temporary upload target via current folder navigation + click
                    setCurrentFolderId(folder.id);
                    setTimeout(() => fileInputRef.current?.click(), 0);
                  },
                },
                {
                  label: "Delete folder",
                  destructive: true,
                  onSelect: () => {
                    if (
                      !window.confirm(
                        `Delete folder “${folder.name}”? Files and subfolders move to the parent folder.`,
                      )
                    ) {
                      return;
                    }
                    void run(() => deleteAttachmentFolder(folder.id));
                  },
                },
              ]}
            >
              <MoreHorizontal className="size-3.5" />
            </ItemMenu>
          </div>
        )}
        <FolderVisual size="lg" />
        {isRenaming ? (
          <form
            className="w-full"
            onSubmit={(e) => {
              e.preventDefault();
              void submitRename();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="h-7 text-center text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setRenamingId(null);
                  setRenameValue("");
                }
              }}
              onBlur={() => void submitRename()}
            />
          </form>
        ) : (
          <span className="line-clamp-2 w-full wrap-break-word text-xs font-medium leading-snug">
            {folder.name}
          </span>
        )}
      </div>
    );
  }

  function FileTile({ file }: { file: AttachmentRow }) {
    const isSelected = selectedId === `file:${file.id}`;

    return (
      <div
        role="button"
        tabIndex={0}
        draggable={canEdit}
        onDragStart={(e) => onDragStartAttachment(e, file.id)}
        onClick={() => setSelectedId(`file:${file.id}`)}
        onDoubleClick={() => openAttachment(file)}
        onKeyDown={(e) => {
          if (e.key === "Enter") openAttachment(file);
        }}
        className={cn(
          "group relative flex flex-col items-center gap-2 rounded-2xl border bg-card p-3 text-center transition-all",
          "hover:bg-muted/50 hover:shadow-sm",
          isSelected && "border-primary/50 bg-primary/5 ring-2 ring-primary/20",
          !isSelected && "border-border/80",
          canEdit && "cursor-grab active:cursor-grabbing",
        )}
      >
        {(canEdit || canDeleteFile(file)) && (
          <div className="absolute right-1.5 top-1.5">
            <ItemMenu
              items={[
                {
                  label: isImageMime(file.mimeType, file.fileName) ? "Preview" : "Open",
                  onSelect: () => openAttachment(file),
                },
                {
                  label: "Open in new tab",
                  onSelect: () => {
                    window.open(`/api/attachments/${file.id}`, "_blank", "noopener,noreferrer");
                  },
                },
                ...(canDeleteFile(file)
                  ? [
                      {
                        label: "Delete",
                        destructive: true as const,
                        onSelect: () => {
                          if (!window.confirm(`Delete “${file.fileName}”?`)) return;
                          const fd = new FormData();
                          fd.set("attachmentId", file.id);
                          void run(() => deleteAttachment(fd));
                        },
                      },
                    ]
                  : []),
              ]}
            >
              <MoreHorizontal className="size-3.5" />
            </ItemMenu>
          </div>
        )}
        <FileTypeVisual
          mimeType={file.mimeType}
          fileName={file.fileName}
          attachmentId={file.id}
          size="lg"
        />
        <div className="w-full min-w-0">
          <div className="line-clamp-2 wrap-break-word text-xs font-medium leading-snug" title={file.fileName}>
            {file.fileName}
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{formatBytes(file.sizeBytes)}</div>
        </div>
      </div>
    );
  }

  function FolderListRow({ folder }: { folder: AttachmentFolderRow }) {
    const isDrop = dropTargetId === folder.id;
    const isRenaming = renamingId === folder.id;

    return (
      <li
        draggable={canEdit}
        onDragStart={(e) => onDragStartFolder(e, folder.id)}
        onDragOver={(e) => acceptDropTarget(e, folder.id)}
        onDragLeave={() => setDropTargetId((cur) => (cur === folder.id ? null : cur))}
        onDrop={(e) => void handleDropOn(e, folder.id)}
        className={cn(
          "group flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm transition-colors",
          isDrop
            ? "border-primary bg-primary/10"
            : "border-transparent hover:border-border hover:bg-muted/40",
          canEdit && "cursor-grab active:cursor-grabbing",
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setCurrentFolderId(folder.id)}
        >
          <FolderVisual size="sm" />
          {isRenaming ? (
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="h-7"
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitRename();
                }
                if (e.key === "Escape") {
                  setRenamingId(null);
                  setRenameValue("");
                }
              }}
              onBlur={() => void submitRename()}
            />
          ) : (
            <span className="truncate font-medium">{folder.name}</span>
          )}
        </button>
        {canEdit && !isRenaming && (
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-7 p-0"
              aria-label="Rename"
              onClick={() => {
                setRenamingId(folder.id);
                setRenameValue(folder.name);
              }}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-7 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label="Delete folder"
              disabled={pending}
              onClick={() => {
                if (
                  !window.confirm(
                    `Delete folder “${folder.name}”? Files and subfolders move to the parent folder.`,
                  )
                ) {
                  return;
                }
                void run(() => deleteAttachmentFolder(folder.id));
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </li>
    );
  }

  function FileListRow({ file }: { file: AttachmentRow }) {
    return (
      <li
        draggable={canEdit}
        onDragStart={(e) => onDragStartAttachment(e, file.id)}
        className={cn(
          "group flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sm hover:border-border hover:bg-muted/40",
          canEdit && "cursor-grab active:cursor-grabbing",
        )}
      >
        <FileTypeVisual
          mimeType={file.mimeType}
          fileName={file.fileName}
          attachmentId={file.id}
          size="sm"
        />
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left font-medium text-primary hover:underline"
          onClick={() => openAttachment(file)}
        >
          {file.fileName}
        </button>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatBytes(file.sizeBytes)}
          {file.uploaderName ? ` · ${file.uploaderName}` : ""}
        </span>
        {canDeleteFile(file) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-7 shrink-0 p-0 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={pending}
            aria-label={`Delete ${file.fileName}`}
            onClick={() => {
              if (!window.confirm(`Delete “${file.fileName}”?`)) return;
              const fd = new FormData();
              fd.set("attachmentId", file.id);
              void run(() => deleteAttachment(fd));
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            void uploadFiles(Array.from(e.target.files ?? []), currentFolderId);
          }}
        />
        {canEdit && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => fileInputRef.current?.click()}
            >
              {pending ? (
                <>
                  <Upload className="size-4 animate-pulse" /> Uploading…
                </>
              ) : (
                <>
                  <Paperclip className="size-4" /> Attach files
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setCreating(true);
                setNewFolderName("");
              }}
            >
              <FolderPlus className="size-4" /> New folder
            </Button>
          </>
        )}

        <div className="ml-auto inline-flex rounded-lg border p-0.5">
          <button
            type="button"
            onClick={() => setViewPersist("list")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              view === "list"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-pressed={view === "list"}
            title="List view"
          >
            <List className="size-3.5" />
            List
          </button>
          <button
            type="button"
            onClick={() => setViewPersist("grid")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              view === "grid"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-pressed={view === "grid"}
            title="Icon view"
          >
            <LayoutGrid className="size-3.5" />
            Icons
          </button>
        </div>
      </div>

      {/* Breadcrumbs — Drive-style path */}
      <nav aria-label="Folder path" className="flex flex-wrap items-center gap-0.5 text-sm">
        <button
          type="button"
          onClick={() => setCurrentFolderId(null)}
          className={cn(
            "rounded-md px-2 py-1 font-medium transition-colors hover:bg-muted",
            currentFolderId === null ? "text-foreground" : "text-muted-foreground",
          )}
        >
          Attachments
        </button>
        {breadcrumbs.map((crumb) => (
          <span key={crumb.id} className="flex items-center gap-0.5">
            <ChevronRight className="size-3.5 text-muted-foreground/60" />
            <button
              type="button"
              onClick={() => setCurrentFolderId(crumb.id)}
              className={cn(
                "rounded-md px-2 py-1 font-medium transition-colors hover:bg-muted",
                currentFolderId === crumb.id ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>

      {creating && (
        <div className="flex items-center gap-2">
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            className="h-8 max-w-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setCreating(false);
                setNewFolderName("");
              }
              if (e.key === "Enter") {
                e.preventDefault();
                void submitNewFolder();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={pending || !newFolderName.trim()}
            onClick={() => void submitNewFolder()}
          >
            Create
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setCreating(false);
              setNewFolderName("");
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Content surface */}
      <div
        className={cn(
          "min-h-35 rounded-xl border border-dashed p-3 transition-colors",
          surfaceDragOver || dropTargetId === "current"
            ? "border-primary bg-primary/5 ring-2 ring-primary/25"
            : "border-border bg-muted/10",
        )}
        onDragOver={(e) => {
          if (!canEdit) return;
          if (hasOsFiles(e) || acceptDropTarget(e, "current")) {
            e.preventDefault();
            if (hasOsFiles(e)) setSurfaceDragOver(true);
          }
        }}
        onDragLeave={() => {
          setSurfaceDragOver(false);
          setDropTargetId((cur) => (cur === "current" ? null : cur));
        }}
        onDrop={(e) => void handleDropOn(e, currentFolderId)}
      >
        {canEdit && (
          <p className="mb-3 text-xs text-muted-foreground">
            Drop files here to upload · drag items onto a folder to move them
          </p>
        )}

        {isEmpty && !creating ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Folder className="size-10 text-muted-foreground/40" strokeWidth={1.25} />
            <p className="text-sm">
              {canEdit
                ? "This folder is empty — drop files here or use Attach files."
                : "This folder is empty."}
            </p>
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {visibleFolders.map((f) => (
              <FolderTile key={f.id} folder={f} />
            ))}
            {visibleFiles.map((a) => (
              <FileTile key={a.id} file={a} />
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {visibleFolders.map((f) => (
              <FolderListRow key={f.id} folder={f} />
            ))}
            {visibleFiles.map((a) => (
              <FileListRow key={a.id} file={a} />
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Image lightbox — zoom, explicit X close (backdrop / Esc also close) */}
      <Dialog open={preview !== null} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            "flex max-h-[min(92vh,920px)] w-[min(96vw,1100px)] max-w-none flex-col gap-0 overflow-hidden border-0 bg-zinc-950 p-0 text-zinc-50 shadow-2xl sm:max-w-none",
            "ring-1 ring-white/10",
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === "+" || e.key === "=") {
              e.preventDefault();
              zoomBy(ZOOM_STEP);
            } else if (e.key === "-" || e.key === "_") {
              e.preventDefault();
              zoomBy(-ZOOM_STEP);
            } else if (e.key === "0") {
              e.preventDefault();
              setZoom(1);
            }
          }}
        >
          <DialogTitle className="sr-only">{preview?.fileName ?? "Image preview"}</DialogTitle>
          <DialogDescription className="sr-only">
            Full-size image preview. Use zoom controls, scroll wheel to zoom, Escape to close.
          </DialogDescription>

          <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2.5 sm:gap-3 sm:px-4">
            <div className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
              {preview?.fileName}
            </div>

            {/* Zoom controls */}
            <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/10 p-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-zinc-100 hover:bg-white/15 hover:text-white"
                aria-label="Zoom out"
                title="Zoom out (−)"
                disabled={zoom <= ZOOM_MIN}
                onClick={() => zoomBy(-ZOOM_STEP)}
              >
                <ZoomOut className="size-4" />
              </Button>
              <button
                type="button"
                className="min-w-13 rounded-md px-1 py-1 text-center text-xs font-medium tabular-nums text-zinc-100 hover:bg-white/10"
                title="Reset zoom (0)"
                aria-label={`Zoom ${Math.round(zoom * 100)} percent. Click to reset.`}
                onClick={() => {
                  setZoom(1);
                  const el = previewScrollRef.current;
                  if (el) {
                    requestAnimationFrame(() => {
                      el.scrollLeft = 0;
                      el.scrollTop = 0;
                    });
                  }
                }}
              >
                {Math.round(zoom * 100)}%
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-zinc-100 hover:bg-white/15 hover:text-white"
                aria-label="Zoom in"
                title="Zoom in (+)"
                disabled={zoom >= ZOOM_MAX}
                onClick={() => zoomBy(ZOOM_STEP)}
              >
                <ZoomIn className="size-4" />
              </Button>
              {zoom !== 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-zinc-100 hover:bg-white/15 hover:text-white"
                  aria-label="Reset zoom"
                  title="Reset zoom"
                  onClick={() => {
                    setZoom(1);
                    const el = previewScrollRef.current;
                    if (el) {
                      requestAnimationFrame(() => {
                        el.scrollLeft = 0;
                        el.scrollTop = 0;
                      });
                    }
                  }}
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              )}
            </div>

            {preview && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-1.5 text-zinc-200 hover:bg-white/10 hover:text-white"
                  asChild
                >
                  <a
                    href={`/api/attachments/${preview.id}`}
                    download={preview.fileName}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download className="size-4" />
                    <span className="hidden sm:inline">Download</span>
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="hidden shrink-0 gap-1.5 text-zinc-200 hover:bg-white/10 hover:text-white sm:inline-flex"
                  asChild
                >
                  <a
                    href={`/api/attachments/${preview.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="size-4" />
                    <span className="hidden sm:inline">New tab</span>
                  </a>
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="size-9 shrink-0 rounded-full bg-white text-zinc-900 shadow-md hover:bg-zinc-100"
              aria-label="Close preview"
              title="Close"
              onClick={closePreview}
            >
              <X className="size-5" strokeWidth={2.5} />
            </Button>
          </div>

          <div
            ref={previewScrollRef}
            className={cn(
              "min-h-0 flex-1 overflow-auto overscroll-contain",
              canPan ? (panning ? "cursor-grabbing" : "cursor-grab") : "cursor-default",
            )}
            onPointerDown={onPreviewPointerDown}
            onPointerMove={onPreviewPointerMove}
            onPointerUp={onPreviewPointerUp}
            onPointerCancel={onPreviewPointerUp}
            onWheel={(e) => {
              // Pinch-zoom trackpads send ctrlKey; also allow Alt+wheel
              if (e.ctrlKey || e.metaKey || e.altKey) {
                e.preventDefault();
                const direction = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
                zoomBy(direction);
              }
            }}
          >
            {/*
              Canvas uses padding (not flex centering) so when the image is larger
              than the viewport every edge — including top/left — stays scrollable.
            */}
            {preview && (
              <div
                style={{
                  boxSizing: "content-box",
                  width: displaySize?.w ?? "auto",
                  height: displaySize?.h ?? "auto",
                  padding: `${canvasPad.y}px ${canvasPad.x}px`,
                }}
                onClick={(e) => {
                  // Close only when clicking the padded chrome at fit zoom
                  if (e.target === e.currentTarget && zoom <= 1 && !canPan) closePreview();
                }}
              >
                <div
                  className="relative shadow-lg"
                  style={
                    displaySize
                      ? { width: displaySize.w, height: displaySize.h }
                      : { maxWidth: "min(90vw, 1040px)", maxHeight: "min(72vh, 780px)" }
                  }
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (zoom === 1) zoomBy(1); // → 2x, keeps center via zoomBy
                    else {
                      setZoom(1);
                      const el = previewScrollRef.current;
                      if (el) {
                        requestAnimationFrame(() => {
                          el.scrollLeft = 0;
                          el.scrollTop = 0;
                        });
                      }
                    }
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/attachments/${preview.id}`}
                    alt={preview.fileName}
                    className="block size-full select-none object-contain"
                    draggable={false}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      if (img.naturalWidth && img.naturalHeight) {
                        setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
