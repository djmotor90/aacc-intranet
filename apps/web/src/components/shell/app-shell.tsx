"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { ChevronLeft, ChevronRight, Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { MAIN_CONTENT_ID } from "@/components/a11y";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/modules/types";
import { PresenceHeartbeat } from "./presence-heartbeat";
import { SidebarNav, type TaskNavTreeItem } from "./sidebar-nav";
import { UserProfileProvider } from "./user-profile-context";

const STORAGE_KEY = "aitim:sidebar";
const DEFAULT_WIDTH = 224; // ~w-56
const COLLAPSED_WIDTH = 56;
/** Dragging below this snaps to icon-only rail. */
const COLLAPSE_SNAP = 88;
/** Smallest expanded width before snap. */
const MIN_EXPANDED = 160;
/** Cap width so the work area always has room. */
const MAX_FRACTION = 0.3;
const MAX_PX_CAP = 420;

type Stored = { width: number; collapsed: boolean };

function loadStored(): Stored {
  if (typeof window === "undefined") {
    return { width: DEFAULT_WIDTH, collapsed: false };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { width: DEFAULT_WIDTH, collapsed: false };
    const parsed = JSON.parse(raw) as Partial<Stored>;
    const width =
      typeof parsed.width === "number" && Number.isFinite(parsed.width)
        ? parsed.width
        : DEFAULT_WIDTH;
    return {
      width: Math.max(MIN_EXPANDED, Math.min(MAX_PX_CAP, width)),
      collapsed: parsed.collapsed === true,
    };
  } catch {
    return { width: DEFAULT_WIDTH, collapsed: false };
  }
}

function maxWidthPx(): number {
  if (typeof window === "undefined") return MAX_PX_CAP;
  return Math.min(MAX_PX_CAP, Math.floor(window.innerWidth * MAX_FRACTION));
}

/** List table/board/grid need one bounded pane so the table can scroll vertically. */
function isTaskListWorkspacePath(pathname: string): boolean {
  const match = pathname.match(/^\/tasks\/([^/]+)\/([^/]+)(?:\/(.*))?$/);
  if (!match) return false;
  const [, space, second, rest] = match;
  if (space === "task" || space === "forms" || space === "trash" || space === "timesheet") {
    return false;
  }
  if (second === "folder") return false;
  if (rest === "settings" || rest?.startsWith("settings/")) return false;
  return true;
}

export function AppShell({
  items,
  taskNavTree,
  isAdmin,
  header,
  children,
}: {
  items: NavItem[];
  taskNavTree: TaskNavTreeItem[];
  isAdmin: boolean;
  header: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  /** Chat is a fixed pane app — only the message list should scroll, not the whole shell. */
  // Chat threads are full-bleed fixed panes; agent builder pages use normal scroll + padding.
  const fullBleedMain =
    pathname === "/chat" ||
    (pathname.startsWith("/chat/") && !pathname.startsWith("/chat/agents")) ||
    isTaskListWorkspacePath(pathname);
  // `width` is the user's preferred width — only an explicit drag or the
  // expand/collapse toggle should change (and persist) it. A shrunk viewport
  // must never overwrite this preference, or it stays shrunk forever once the
  // window widens back out (it's saved to localStorage, so it'd follow the
  // user to their next, wider session too).
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Live viewport cap, recomputed on resize — purely a render-time clamp, never persisted.
  const [viewportMax, setViewportMax] = useState(MAX_PX_CAP);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Off-canvas nav is a one-shot overlay — never carry it open across a navigation.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    // Defer out of the effect body: hydrating from localStorage is an external
    // sync, and setState directly in the effect body triggers cascading renders.
    queueMicrotask(() => {
      const s = loadStored();
      setWidth(s.width);
      setCollapsed(s.collapsed);
      setViewportMax(maxWidthPx());
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ width, collapsed } satisfies Stored),
      );
    } catch {
      // ignore
    }
  }, [width, collapsed, hydrated]);

  useEffect(() => {
    function onResize() {
      setViewportMax(maxWidthPx());
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const expand = useCallback(() => {
    setCollapsed(false);
    setWidth((w) => Math.max(MIN_EXPANDED, Math.min(w || DEFAULT_WIDTH, maxWidthPx())));
  }, []);

  const collapse = useCallback(() => {
    setCollapsed(true);
  }, []);

  function onResizePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    // Only resize when expanded — collapsed edge is not a drag target above the button.
    if (collapsed) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onResizePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const delta = e.clientX - dragRef.current.startX;
    const next = dragRef.current.startWidth + delta;
    const max = maxWidthPx();
    if (next < COLLAPSE_SNAP) {
      setWidth(Math.max(COLLAPSED_WIDTH, next));
      return;
    }
    setWidth(Math.min(max, Math.max(MIN_EXPANDED, next)));
  }

  function onResizePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const delta = e.clientX - dragRef.current.startX;
    const next = dragRef.current.startWidth + delta;
    dragRef.current = null;
    setDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (next < COLLAPSE_SNAP) {
      setCollapsed(true);
      setWidth(DEFAULT_WIDTH);
      return;
    }
    setWidth(Math.min(maxWidthPx(), Math.max(MIN_EXPANDED, next)));
  }

  const railWidth = collapsed ? COLLAPSED_WIDTH : Math.min(width, viewportMax);

  return (
    <UserProfileProvider>
    <PresenceHeartbeat />
    <div className="flex h-svh overflow-hidden">
      <aside
        className={cn(
          "relative hidden h-full shrink-0 flex-col border-r bg-sidebar md:flex",
          !dragging && "transition-[width] duration-150 ease-out",
        )}
        style={{ width: railWidth }}
        data-collapsed={collapsed || undefined}
        aria-label="Workspace"
      >
        {/* Brand */}
        <div
          className={cn(
            "relative flex shrink-0 items-center border-b border-sidebar-border bg-sidebar",
            "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-brand-orange",
            collapsed ? "h-14 justify-center px-1" : "h-28 px-4 py-3",
          )}
        >
          <Link
            href="/"
            className={cn(
              "rounded-md font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              collapsed ? "text-base" : "w-full",
            )}
            title="AACC Hub"
          >
            {collapsed ? (
              <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                A
                <span className="sr-only">AACC Hub home</span>
              </span>
            ) : (
              <span className="flex w-full flex-col items-center gap-1.5">
                <span className="block w-full overflow-hidden rounded-sm bg-white px-2 py-1 shadow-sm ring-1 ring-black/5">
                  <Image
                    src="/brand/aacc-logo.jpg"
                    alt="Anne Arundel Community College"
                    width={1263}
                    height={715}
                    className="mx-auto h-16 w-auto max-w-full"
                    priority
                  />
                </span>
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                  AACC Hub
                </span>
              </span>
            )}
          </Link>
        </div>

        {/* Nav scroll area */}
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overflow-x-hidden",
            collapsed ? "px-1.5 py-2" : "p-3",
          )}
        >
          <SidebarNav
            items={items}
            taskNavTree={taskNavTree}
            isAdmin={isAdmin}
            collapsed={collapsed}
          />
        </div>

        {/* Resize strip along the edge (does not cover the bottom toggle) */}
        {!collapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuemin={MIN_EXPANDED}
            aria-valuemax={MAX_PX_CAP}
            aria-valuenow={Math.round(width)}
            tabIndex={0}
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerUp}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                setWidth((w) => Math.max(MIN_EXPANDED, w - 16));
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                setWidth((w) => Math.min(maxWidthPx(), w + 16));
              } else if (e.key === "Home") {
                e.preventDefault();
                setWidth(MIN_EXPANDED);
              } else if (e.key === "End") {
                e.preventDefault();
                setWidth(maxWidthPx());
              }
            }}
            className={cn(
              "absolute bottom-12 top-0 right-0 z-20 w-1.5 translate-x-1/2 cursor-col-resize touch-none",
              "hover:bg-primary/25 active:bg-primary/35",
              "focus-visible:bg-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              dragging && "bg-primary/35",
            )}
          />
        )}

        {/* Bottom edge toggle — real button, click only (no drag) */}
        <div className="pointer-events-none absolute bottom-3 right-0 z-30 flex translate-x-1/2 justify-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (collapsed) expand();
              else collapse();
            }}
            onPointerDown={(e) => {
              // Never start a resize from the toggle.
              e.stopPropagation();
            }}
            className={cn(
              "pointer-events-auto flex h-8 w-5 items-center justify-center rounded-full",
              "border border-border bg-background text-muted-foreground shadow-sm",
              "transition-colors hover:border-primary/50 hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronLeft className="size-3.5" />
            )}
          </button>
        </div>
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-4/5 max-w-xs gap-0 p-0 md:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Workspace navigation</SheetTitle>
          </SheetHeader>
          <div className="flex h-full flex-col">
            <div
              className={cn(
                "relative flex h-28 shrink-0 items-center border-b border-sidebar-border bg-sidebar px-4 py-3",
                "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-brand-orange",
              )}
            >
              <Link
                href="/"
                className="w-full rounded-md font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                title="AACC Hub"
              >
                <span className="flex w-full flex-col items-center gap-1.5">
                  <span className="block w-full overflow-hidden rounded-sm bg-white px-2 py-1 shadow-sm ring-1 ring-black/5">
                    <Image
                      src="/brand/aacc-logo.jpg"
                      alt="Anne Arundel Community College"
                      width={1263}
                      height={715}
                      className="mx-auto h-16 w-auto max-w-full"
                      priority
                    />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                    AACC Hub
                  </span>
                </span>
              </Link>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-sidebar p-3">
              <SidebarNav
                items={items}
                taskNavTree={taskNavTree}
                isAdmin={isAdmin}
                collapsed={false}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-t-[3px] border-t-primary bg-background px-4 py-1 sm:px-6"
          aria-label="Application"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>
          <div className="flex flex-1 items-center justify-end">{header}</div>
        </header>
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className={cn(
            "min-h-0 min-w-0 flex-1 bg-background outline-none",
            fullBleedMain
              ? "flex flex-col overflow-hidden p-0"
              : "overflow-x-auto overflow-y-auto p-6",
          )}
        >
          {children}
        </main>
      </div>
    </div>
    </UserProfileProvider>
  );
}
