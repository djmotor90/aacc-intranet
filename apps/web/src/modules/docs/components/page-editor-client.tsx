/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import {
  CheckCircle2,
  ChevronRight,
  FileText,
  ImageIcon,
  Link2,
  Lock,
  LockOpen,
  MoreHorizontal,
  PanelLeft,
  Settings2,
  Smile,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import {
  docToStored,
  storedToDoc,
  type StoredRichDoc,
} from "@/components/editor/doc-utils";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  setPageProtected,
  trashPage,
  updatePageBody,
  updatePageMeta,
  verifyPage,
} from "@/modules/docs/actions/pages";
import { DOC_STALE_AFTER_DAYS, pagePath } from "@/modules/docs/lib/constants";
import {
  countWordsAndChars,
  DEFAULT_DOC_PAGE_STYLES,
  fontSizeClass,
  fontStyleClass,
  loadDocPageStyles,
  pageWidthClass,
  saveDocPageStyles,
  type DocPageStyles,
} from "@/modules/docs/lib/page-styles";
import type { DocOutlineNode, DocPageDetail } from "@/modules/docs/queries";
import { cn } from "@/lib/utils";
import { useDocCollab } from "@/modules/docs/hooks/use-doc-collab";
import { CollabPresence } from "./collab-presence";
import { CreatePageDialog } from "./create-page-dialog";
import { DocPageOutline } from "./doc-page-outline";
import { PageStylesPanel } from "./page-styles-panel";

function formatLastUpdated(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return `Last updated Today at ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYest =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYest) return `Last updated Yesterday at ${time}`;
  return `Last updated ${d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} at ${time}`;
}

function MetaChip({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: typeof Link2;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || !onClick}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-violet-500/10 text-violet-700 dark:text-violet-300"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        (disabled || !onClick) && "cursor-default opacity-60 hover:bg-transparent",
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {label}
    </button>
  );
}

export function PageEditorClient({
  page,
  children,
  relatedLinks,
  outline,
  spaces,
}: {
  page: DocPageDetail;
  children?: React.ReactNode;
  relatedLinks: { key: string; label: string; href: string | null }[];
  outline: {
    docId?: string;
    rootId: string;
    rootTitle: string;
    homeSpaceId: string;
    tree: DocOutlineNode[];
    ancestors: { id: string; title: string; slug: string }[];
  } | null;
  spaces: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [updatedAt, setUpdatedAt] = useState(page.updatedAt);
  const [isProtected, setIsProtected] = useState(page.isProtected);
  const [isStale, setIsStale] = useState(page.isStale);
  const [kind, setKind] = useState(page.kind);
  const [addPageOpen, setAddPageOpen] = useState(false);
  const [pagesSheetOpen, setPagesSheetOpen] = useState(false);
  /** Desktop left pages rail — collapsible for more writing space. */
  const [pagesRailOpen, setPagesRailOpen] = useState(true);
  const [stylesOpen, setStylesOpen] = useState(true);
  const [isDesktop, setIsDesktop] = useState(false);
  const [relationsOpen, setRelationsOpen] = useState(false);
  const [styles, setStyles] = useState<DocPageStyles>(DEFAULT_DOC_PAGE_STYLES);
  const [stylesHydrated, setStylesHydrated] = useState(false);
  const [bodyText, setBodyText] = useState(() => {
    const stored = docToStored(storedToDoc(page.body as StoredRichDoc));
    return stored?.text ?? "";
  });
  const [pending, startTransition] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestBody = useRef<StoredRichDoc>(
    docToStored(storedToDoc(page.body as StoredRichDoc)),
  );

  const canEdit = page.canEdit && !(isProtected && !page.canManage);
  const { words: wordCount, chars: charCount } = countWordsAndChars(bodyText);

  // Live multiplayer — optional. Editor never blocks if collab server is down.
  const collab = useDocCollab(page.id, true);
  const collabReady = Boolean(
    collab.status === "synced" && collab.ydoc && collab.provider && collab.self,
  );
  /**
   * Editor mode is sticky per page open:
   * - Prefer collab if the server is already up within ~1s
   * - Otherwise stay local forever this visit (no mid-typing remount)
   */
  const [useCollabEditor, setUseCollabEditor] = useState(false);
  const collabWindowOpen = useRef(true);
  useEffect(() => {
    collabWindowOpen.current = true;
    setUseCollabEditor(false);
    const t = window.setTimeout(() => {
      collabWindowOpen.current = false;
    }, 1000);
    return () => window.clearTimeout(t);
  }, [page.id]);
  useEffect(() => {
    if (collabReady && collabWindowOpen.current) {
      setUseCollabEditor(true);
      collabWindowOpen.current = false;
    }
  }, [collabReady]);

  useEffect(() => {
    queueMicrotask(() => {
      setStyles(loadDocPageStyles(page.id));
      setStylesHydrated(true);
    });
  }, [page.id]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Remember pages rail preference (desktop).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("aitim.docs.pagesRailOpen");
      if (saved === "0") setPagesRailOpen(false);
      if (saved === "1") setPagesRailOpen(true);
    } catch {
      // ignore
    }
  }, []);

  function togglePagesRail() {
    setPagesRailOpen((v) => {
      const next = !v;
      try {
        window.localStorage.setItem("aitim.docs.pagesRailOpen", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  useEffect(() => {
    if (!stylesHydrated) return;
    saveDocPageStyles(page.id, styles);
  }, [page.id, styles, stylesHydrated]);

  function updateStyles(next: DocPageStyles) {
    setStyles(next);
  }

  const persistBody = useCallback(
    async (body: StoredRichDoc) => {
      // When live collab is active, the collab server persists Yjs → body.
      if (useCollabEditor) {
        setSaveState("saved");
        return;
      }
      setSaveState("saving");
      try {
        const res = await updatePageBody({
          pageId: page.id,
          body: {
            text: body?.text ?? "",
            doc: body?.doc ?? null,
          },
          expectedUpdatedAt: updatedAt,
        });
        if (!res.ok && res.conflict) {
          setSaveState("error");
          toast.error("Someone else saved this page. Reload to see their changes.");
          return;
        }
        if (res.ok) {
          setUpdatedAt(res.updatedAt);
          setSaveState("saved");
        }
      } catch (e) {
        setSaveState("error");
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    },
    [page.id, updatedAt, useCollabEditor],
  );

  function onEditorChange(payload: { text: string; doc: unknown; empty: boolean }) {
    const stored = docToStored(
      storedToDoc({ text: payload.text, doc: payload.doc } as StoredRichDoc),
    );
    latestBody.current = stored;
    setBodyText(stored?.text ?? payload.text ?? "");
    if (!canEdit) return;
    if (useCollabEditor) {
      setSaveState("saved");
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(() => {
      void persistBody(stored);
    }, 700);
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function commitTitle() {
    const next = title.trim() || "Untitled";
    if (next === page.title) return;
    startTransition(async () => {
      try {
        const res = await updatePageMeta({ pageId: page.id, title: next });
        router.replace(pagePath(res.id, res.slug));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not rename");
        setTitle(page.title);
      }
    });
  }

  function toggleWiki() {
    if (!canEdit) return;
    const next = kind === "wiki" ? "page" : "wiki";
    startTransition(async () => {
      try {
        await updatePageMeta({ pageId: page.id, kind: next });
        setKind(next);
        toast.success(next === "wiki" ? "Marked as wiki" : "Unmarked wiki");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not update");
      }
    });
  }

  const focusChrome = styles.focusPage || styles.focusBlock;

  // Viewport-locked shell: only the center document column scrolls.
  // Side rails (pages + styles) stay fixed for the full height of main.
  return (
    <div className="-mx-6 -mt-6 -mb-6 flex h-[calc(100svh-3.5rem)] overflow-hidden bg-background">
      {/* ClickUp-style left pages rail (desktop) — collapsible for writing space */}
      {outline && isDesktop && !styles.focusPage && pagesRailOpen && (
        <div className="hidden h-full min-h-0 w-[15.5rem] shrink-0 border-r lg:flex lg:flex-col">
          <DocPageOutline
            tree={outline.tree}
            activePageId={page.id}
            homeSpaceId={outline.homeSpaceId}
            docId={outline.docId ?? outline.rootId}
            canEdit={canEdit}
            spaces={spaces}
            rootTitle={outline.rootTitle}
            onCollapse={togglePagesRail}
          />
        </div>
      )}

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-opacity",
          focusChrome && "opacity-100",
        )}
      >
      {/* Top chrome — sticky within the center column scrollport */}
      <header
        className={cn(
          "z-20 flex h-12 shrink-0 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 sm:px-6",
          styles.focusPage && "opacity-0 pointer-events-none h-0 overflow-hidden border-0",
        )}
      >
        <nav className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <Link
            href="/docs"
            className="shrink-0 font-medium hover:text-foreground"
          >
            Docs
          </Link>
          {outline?.ancestors.map((a) => (
            <span key={a.id} className="inline-flex min-w-0 items-center gap-1.5">
              <ChevronRight className="size-3.5 shrink-0 opacity-50" />
              <Link
                href={pagePath(a.id, a.slug)}
                className="max-w-[8rem] truncate hover:text-foreground sm:max-w-[12rem]"
              >
                {a.title}
              </Link>
            </span>
          ))}
          <ChevronRight className="size-3.5 shrink-0 opacity-50" />
          <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-foreground">
            <FileText className="size-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
            <span className="truncate">{title || "Untitled"}</span>
          </span>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <CollabPresence
            self={collab.self}
            peers={collab.peers}
            status={collab.status}
            error={collab.error}
          />
          {!useCollabEditor && (
            <span
              className={cn(
                "mr-1 hidden text-[11px] sm:inline",
                saveState === "saving" && "text-muted-foreground",
                saveState === "saved" && "text-emerald-600 dark:text-emerald-400",
                saveState === "error" && "text-destructive",
                saveState === "idle" && "text-transparent",
              )}
            >
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : saveState === "error"
                    ? "Save error"
                    : "·"}
            </span>
          )}

          {/* Pages — desktop toggles rail; mobile opens sheet */}
          {outline && (
            <>
              <Button
                type="button"
                size="sm"
                variant={pagesRailOpen && isDesktop ? "secondary" : "ghost"}
                className={cn("hidden gap-1.5 lg:inline-flex")}
                onClick={() => togglePagesRail()}
                title={pagesRailOpen ? "Hide pages panel" : "Show pages panel"}
              >
                <PanelLeft className="size-3.5" />
                <span className="hidden sm:inline">Pages</span>
              </Button>
              <Sheet open={pagesSheetOpen} onOpenChange={setPagesSheetOpen}>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={cn("gap-1.5 lg:hidden")}
                  >
                    <PanelLeft className="size-3.5" />
                    <span className="hidden sm:inline">Pages</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[min(100%,18rem)] p-0 sm:max-w-none">
                  <DocPageOutline
                    tree={outline.tree}
                    activePageId={page.id}
                    homeSpaceId={outline.homeSpaceId}
                    docId={outline.docId ?? outline.rootId}
                    canEdit={canEdit}
                    spaces={spaces}
                    rootTitle={outline.rootTitle}
                    embedded
                  />
                </SheetContent>
              </Sheet>
            </>
          )}

          <Button
            type="button"
            size="sm"
            variant={stylesOpen ? "secondary" : "ghost"}
            className="gap-1.5"
            onClick={() => setStylesOpen((v) => !v)}
          >
            <Settings2 className="size-3.5" />
            <span className="hidden sm:inline">Styles</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="icon" variant="ghost" className="size-8">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  void navigator.clipboard.writeText(
                    window.location.origin + pagePath(page.id, page.slug),
                  );
                  toast.success("Link copied");
                }}
              >
                <Link2 className="size-4" />
                Copy link
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem
                  onClick={() => {
                    startTransition(async () => {
                      try {
                        await verifyPage(page.id);
                        setIsStale(false);
                        toast.success("Marked as verified");
                        router.refresh();
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Could not verify",
                        );
                      }
                    });
                  }}
                >
                  <CheckCircle2 className="size-4" />
                  Mark verified
                </DropdownMenuItem>
              )}
              {page.canManage && (
                <DropdownMenuItem
                  onClick={() => {
                    startTransition(async () => {
                      try {
                        await setPageProtected(page.id, !isProtected);
                        setIsProtected(!isProtected);
                        toast.success(
                          isProtected ? "Page unlocked" : "Page protected",
                        );
                        router.refresh();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Failed");
                      }
                    });
                  }}
                >
                  {isProtected ? (
                    <LockOpen className="size-4" />
                  ) : (
                    <Lock className="size-4" />
                  )}
                  {isProtected ? "Unlock page" : "Protect page"}
                </DropdownMenuItem>
              )}
              {page.canManage && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      startTransition(async () => {
                        try {
                          await trashPage(page.id);
                          toast.success("Moved to trash");
                          router.push("/docs");
                          router.refresh();
                        } catch (e) {
                          toast.error(
                            e instanceof Error ? e.message : "Could not trash",
                          );
                        }
                      });
                    }}
                  >
                    <Trash2 className="size-4" />
                    Move to trash
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {(isProtected || isStale) && (
        <div
          className={cn(
            "mx-auto w-full space-y-2 px-4 pt-4 sm:px-6",
            pageWidthClass(styles.pageWidth),
          )}
        >
          {isProtected && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
              <Lock className="size-4 shrink-0" />
              This page is protected. Only admins and managers can edit it.
            </div>
          )}
          {isStale && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-950 dark:text-orange-100">
              <span>
                Not verified in the last {DOC_STALE_AFTER_DAYS} days.
              </span>
              {canEdit && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      try {
                        await verifyPage(page.id);
                        setIsStale(false);
                        toast.success("Marked as verified");
                        router.refresh();
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Could not verify",
                        );
                      }
                    });
                  }}
                >
                  Mark verified
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Scrollable document canvas only */}
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div
        className={cn(
          "relative mx-auto w-full px-4 pb-20 pt-6 sm:px-8 sm:pt-10",
          pageWidthClass(styles.pageWidth),
          fontStyleClass(styles.fontStyle),
          fontSizeClass(styles.fontSize),
          styles.focusBlock && "[&_.aitim-editor>*:not(:hover):not(:focus-within)]:opacity-40",
        )}
      >
        {styles.showCover && (
          <div className="mb-6 flex h-36 items-center justify-center rounded-xl border border-dashed bg-muted/40 text-sm text-muted-foreground">
            Cover image (coming soon)
          </div>
        )}

        {/* Secondary actions (ClickUp page toolbar) */}
        {!styles.focusPage && (
          <div className="mb-4 flex flex-wrap items-center gap-0.5">
            <MetaChip
              icon={Link2}
              label={
                relatedLinks.length > 0
                  ? `${relatedLinks.length} linked`
                  : "Link Task or Doc"
              }
              onClick={() => setRelationsOpen(true)}
              active={relatedLinks.length > 0}
            />
            <MetaChip
              icon={CheckCircle2}
              label={kind === "wiki" ? "Wiki" : "Mark Wiki"}
              onClick={canEdit ? toggleWiki : undefined}
              active={kind === "wiki"}
              disabled={!canEdit}
            />
            <MetaChip
              icon={Smile}
              label="Add icon"
              onClick={() =>
                updateStyles({ ...styles, showIconTitle: true })
              }
            />
            <MetaChip
              icon={ImageIcon}
              label="Add cover"
              onClick={() => updateStyles({ ...styles, showCover: true })}
              active={styles.showCover}
            />
            <MetaChip
              icon={Settings2}
              label="Page styles"
              onClick={() => setStylesOpen(true)}
              active={stylesOpen}
            />
          </div>
        )}

        {/* Title */}
        {styles.showIconTitle && (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            disabled={!canEdit || pending}
            className="w-full bg-transparent font-bold leading-tight tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40 disabled:opacity-70"
            placeholder="Untitled"
          />
        )}

        {styles.showSubtitle && (
          <p className="mt-2 text-sm text-muted-foreground">
            {page.spaceName}
            {kind === "wiki" ? " · Wiki" : ""}
          </p>
        )}

        {/* Author + last updated */}
        {(styles.showOwners || styles.showLastModified || styles.showContributors) && (
          <div className="mt-4 mb-8 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {styles.showOwners &&
              (page.ownerId ? (
                <span className="inline-flex items-center gap-2">
                  <UserAvatar
                    userId={page.ownerId}
                    name={page.ownerName ?? "Owner"}
                    hasPhoto={!!page.ownerPhotoKey}
                    photoVersion={page.ownerPhotoKey}
                    className="size-6"
                  />
                  <span className="font-medium text-foreground">
                    {page.ownerName ?? "Unknown"}
                  </span>
                </span>
              ) : (
                <span className="font-medium text-foreground">{page.spaceName}</span>
              ))}
            {styles.showOwners && styles.showLastModified && (
              <span className="text-muted-foreground/50">·</span>
            )}
            {styles.showLastModified && (
              <span>{formatLastUpdated(updatedAt)}</span>
            )}
            {styles.showContributors && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <span className="text-xs">Contributors soon</span>
              </>
            )}
            {isProtected && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                  <Lock className="size-3" /> Protected
                </span>
              </>
            )}
          </div>
        )}
        {!styles.showOwners && !styles.showLastModified && (
          <div className="mb-6" />
        )}

        {/* Body — opens immediately; multiplayer only if collab server is already up. */}
        <div className="min-w-0 pb-16">
          {useCollabEditor ? (
            <RichTextEditor
              key={`collab-${page.id}`}
              variant="minimal"
              editable={canEdit}
              expandable
              expandTitle={title}
              pageId={page.id}
              initialContent={page.body as StoredRichDoc}
              collaboration={{
                document: collab.ydoc!,
                provider: collab.provider,
                user: {
                  id: collab.self!.id,
                  name: collab.self!.name,
                  color: collab.self!.color,
                },
              }}
              onChange={onEditorChange}
              placeholder="Type / for commands, or start writing…"
              className="border-0 bg-transparent shadow-none"
              editorClassName="min-h-[50vh] pl-0! pr-0! py-0!"
            />
          ) : (
            <RichTextEditor
              key={`local-${page.id}`}
              variant="minimal"
              editable={canEdit}
              expandable
              expandTitle={title}
              pageId={page.id}
              initialContent={page.body as StoredRichDoc}
              onChange={onEditorChange}
              placeholder="Type / for commands, or start writing…"
              className="border-0 bg-transparent shadow-none"
              editorClassName="min-h-[50vh] pl-0! pr-0! py-0!"
            />
          )}
        </div>

        {/* Related work (compact footer) */}
        {(relatedLinks.length > 0 || children) && !styles.focusPage && (
          <div className="border-t pt-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Related work
            </h2>
            {relatedLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No linked work yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {relatedLinks.map((l) => (
                  <li key={l.key}>
                    {l.href ? (
                      <Link
                        href={l.href}
                        className="block truncate rounded-md py-1 text-sm text-primary hover:underline"
                      >
                        {l.label}
                      </Link>
                    ) : (
                      <span className="block truncate py-1 text-sm text-muted-foreground">
                        {l.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {children}
          </div>
        )}
      </div>
      </div>

      <CreatePageDialog
        open={addPageOpen}
        onOpenChange={setAddPageOpen}
        spaces={spaces}
        defaultSpaceId={page.homeSpaceId}
        parentPageId={page.id}
        docId={outline?.docId ?? outline?.rootId}
        dialogTitle="Add page"
      />

      <Sheet open={relationsOpen} onOpenChange={setRelationsOpen}>
        <SheetContent side="right" className="w-[min(100%,22rem)] sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Relationships</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2 px-1">
            {relatedLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No linked tasks or locations yet. Create a doc from a task or
                space to auto-link it.
              </p>
            ) : (
              relatedLinks.map((l) =>
                l.href ? (
                  <Link
                    key={l.key}
                    href={l.href}
                    className="block rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => setRelationsOpen(false)}
                  >
                    {l.label}
                  </Link>
                ) : (
                  <div
                    key={l.key}
                    className="rounded-lg border px-3 py-2 text-sm text-muted-foreground"
                  >
                    {l.label}
                  </div>
                ),
              )
            )}
          </div>
        </SheetContent>
      </Sheet>
      </div>

      {/* Right Page Styles rail — fixed height, internal scroll only */}
      {stylesOpen && isDesktop && (
        <div className="hidden h-full min-h-0 w-[17.5rem] shrink-0 lg:flex lg:flex-col">
          <PageStylesPanel
            styles={styles}
            onChange={updateStyles}
            onClose={() => setStylesOpen(false)}
            wordCount={wordCount}
            charCount={charCount}
            onOpenSubpages={() => {
              setPagesSheetOpen(true);
            }}
            onOpenRelationships={() => setRelationsOpen(true)}
          />
        </div>
      )}

      {/* Mobile / tablet styles sheet */}
      <Sheet
        open={stylesOpen && !isDesktop}
        onOpenChange={(o) => {
          if (!isDesktop) setStylesOpen(o);
        }}
      >
        <SheetContent
          side="right"
          className="w-[min(100%,20rem)] p-0 sm:max-w-none"
          showCloseButton={false}
        >
          <PageStylesPanel
            styles={styles}
            onChange={updateStyles}
            onClose={() => setStylesOpen(false)}
            wordCount={wordCount}
            charCount={charCount}
            onOpenSubpages={() => {
              setStylesOpen(false);
              setPagesSheetOpen(true);
            }}
            onOpenRelationships={() => {
              setStylesOpen(false);
              setRelationsOpen(true);
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
