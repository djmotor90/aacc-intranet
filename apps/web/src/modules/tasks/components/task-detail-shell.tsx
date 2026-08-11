"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { cn } from "@/lib/utils";

const VISIBLE_KEY = "aitim:task-detail-activity-visible";
const WIDTH_KEY = "aitim:task-detail-activity-width";
const CHANGE_EVENT = "aitim:task-detail-activity-visible-change";

const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 280;
/** Cap at half the viewport (or 720px on huge screens). */
const MAX_FRACTION = 0.5;
const MAX_PX_CAP = 720;

function readVisible(): string {
  try {
    return window.localStorage.getItem(VISIBLE_KEY) ?? "true";
  } catch {
    return "true";
  }
}

function subscribeVisible(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function maxWidthPx(): number {
  if (typeof window === "undefined") return MAX_PX_CAP;
  return Math.min(MAX_PX_CAP, Math.floor(window.innerWidth * MAX_FRACTION));
}

function loadWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  try {
    const raw = window.localStorage.getItem(WIDTH_KEY);
    const n = raw ? Number(raw) : DEFAULT_WIDTH;
    if (!Number.isFinite(n)) return DEFAULT_WIDTH;
    return Math.max(MIN_WIDTH, Math.min(maxWidthPx(), n));
  } catch {
    return DEFAULT_WIDTH;
  }
}

/**
 * AACC Hub task detail layout:
 *  ┌─ toolbar (breadcrumb full width ··· ⋯ far right) ─────────────┐
 *  ├─ main content ──────────────────────┬─ Activity panel ─────────┤
 *  └─────────────────────────────────────┴──────────────────────────┘
 */
export function TaskDetailShell({
  toolbar,
  children,
  activity,
}: {
  /**
   * Top chrome spanning the full shell (left: space/list path; right: plain ⋯).
   * Kept above both columns so the breadcrumb isn’t squeezed by Activity.
   */
  toolbar?: ReactNode;
  children: ReactNode;
  /** Full activity panel content (e.g. ActivityPanel with its own Card chrome). */
  activity: ReactNode;
}) {
  const saved = useSyncExternalStore(subscribeVisible, readVisible, () => "true");
  const open = saved === "true";

  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [hydrated, setHydrated] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    // Defer out of the effect body: hydrating from localStorage is an external
    // sync, and setState directly in the effect body triggers cascading renders.
    queueMicrotask(() => {
      setWidth(loadWidth());
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      // ignore
    }
  }, [width, hydrated]);

  useEffect(() => {
    function onResize() {
      setWidth((w) => Math.min(w, maxWidthPx()));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function toggle() {
    const next = !open;
    try {
      window.localStorage.setItem(VISIBLE_KEY, String(next));
    } catch {
      // storage unavailable
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!open) return;
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: width };
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [open, width],
  );

  function onResizePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const delta = dragRef.current.startX - e.clientX;
    const next = dragRef.current.startWidth + delta;
    const max = maxWidthPx();
    setWidth(Math.max(MIN_WIDTH, Math.min(max, next)));
  }

  function onResizePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  const panelWidth = open ? width : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Full-width top bar: path left, actions right. */}
      {toolbar != null && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/70 pb-2.5 pr-1">
          <div className="min-w-0 flex-1">{toolbar}</div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ── center ── */}
        <div className="min-w-0 flex-1 overflow-y-auto pr-4 pt-3 sm:pr-6">{children}</div>

        {/* ── right activity ── */}
        <div className="relative flex h-full shrink-0">
          <div className="absolute inset-y-0 left-0 z-0 border-l" />

          {/* When closed: thin edge control to re-open (below top toolbar) */}
          {!open && (
            <button
              type="button"
              onClick={toggle}
              aria-label="Show activity"
              title="Show activity"
              className={cn(
                "absolute top-3 left-0 z-20 -translate-x-full",
                "flex h-8 w-8 items-center justify-center rounded-l-md",
                "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <PanelRightOpen className="size-4" />
            </button>
          )}

          {open && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize activity panel"
              onPointerDown={onResizePointerDown}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={onResizePointerUp}
              className={cn(
                "absolute inset-y-0 left-0 z-20 w-1.5 -translate-x-1/2 cursor-col-resize touch-none",
                "hover:bg-primary/25 active:bg-primary/35",
                dragging && "bg-primary/35",
              )}
            />
          )}

          <div
            className={cn(
              "h-full overflow-hidden",
              !dragging && "transition-[width,opacity] duration-200 ease-out",
              open ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            style={{ width: panelWidth }}
          >
            <aside
              className="flex h-full flex-col pl-4 pr-1"
              style={{ width: open ? width : DEFAULT_WIDTH }}
            >
              {/* Activity panel header chrome. */}
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 py-2 pl-1 pr-0.5">
                <span className="text-sm font-semibold tracking-tight">Activity</span>
                <button
                  type="button"
                  onClick={toggle}
                  aria-label="Hide activity"
                  title="Hide activity"
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <PanelRightClose className="size-4" />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">{activity}</div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
