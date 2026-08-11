"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { UserRound } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { UserAvatar } from "@/components/shell/user-avatar";
import { useUserProfile } from "@/components/shell/user-profile-context";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Avatar that shows a hover card with “View profile”, opening the right-side
 * public AACC Hub profile sheet.
 */
export function ProfileAvatar({
  userId,
  name,
  hasPhoto,
  photoVersion,
  className,
  /** When true, avatar itself is not a focusable button (parent handles clicks). */
  hoverOnly = false,
}: {
  userId: string;
  name: string;
  hasPhoto?: boolean;
  photoVersion?: string | null;
  className?: string;
  hoverOnly?: boolean;
}) {
  const { openProfile } = useUserProfile();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const openNow = () => {
    clearCloseTimer();
    setOpen(true);
  };
  const closeSoon = () => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  // Hovering an avatar mid-scroll fires mouseenter without a matching
  // mouseleave (the popover repositions under a stationary cursor), so a
  // hover-opened popover must also close on any scroll or it gets stuck open.
  useEffect(() => {
    if (!open) return;
    const handleScroll = () => {
      clearCloseTimer();
      setOpen(false);
    };
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", handleScroll, { capture: true });
  }, [open]);

  useEffect(() => clearCloseTimer, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring",
            hoverOnly && "pointer-events-auto",
          )}
          aria-label={`${name} — view profile`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openNow();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseEnter={openNow}
          onMouseLeave={closeSoon}
        >
          <UserAvatar
            userId={userId}
            name={name}
            hasPhoto={hasPhoto}
            photoVersion={photoVersion}
            className={className}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-56 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
      >
        <div className="flex items-center gap-2.5">
          <UserAvatar
            userId={userId}
            name={name}
            hasPhoto={hasPhoto}
            photoVersion={photoVersion}
            className="size-10"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{name}</div>
            <div className="text-[11px] text-muted-foreground">Intranet profile</div>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-3 w-full gap-1.5"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            openProfile(userId);
          }}
        >
          <UserRound className="size-3.5" />
          View profile
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** Compact “Profile” control for dropdown rows (assignee picker). */
export function ProfileMenuButton({
  userId,
  className,
}: {
  userId: string;
  className?: string;
}) {
  const { openProfile } = useUserProfile();
  return (
    <button
      type="button"
      title="View profile"
      aria-label="View profile"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/row:opacity-100 focus-visible:opacity-100",
        className,
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openProfile(userId);
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <UserRound className="size-3.5" />
    </button>
  );
}

export function ProfileAvatarStack({
  users,
  max = 3,
  size = "sm",
  emptyLabel = "Unassigned",
  className,
  empty,
}: {
  users: { id: string; displayName: string; photoKey: string | null }[];
  max?: number;
  size?: "sm" | "md";
  emptyLabel?: string;
  className?: string;
  empty?: ReactNode;
}) {
  const avatarClass = size === "sm" ? "size-6" : "size-7";
  if (users.length === 0) {
    return (
      empty ?? (
        <span className="text-xs text-muted-foreground" title={emptyLabel}>
          —
        </span>
      )
    );
  }
  const visible = users.slice(0, max);
  const extra = users.length - visible.length;
  return (
    <span className={cn("inline-flex items-center", className)}>
      <span className="flex items-center -space-x-1.5">
        {visible.map((u) => (
          <ProfileAvatar
            key={u.id}
            userId={u.id}
            name={u.displayName}
            hasPhoto={!!u.photoKey}
            photoVersion={u.photoKey}
            className={cn(avatarClass, "ring-2 ring-background")}
          />
        ))}
        {extra > 0 && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-background",
              size === "sm" ? "size-6 text-[10px]" : "size-7 text-[11px]",
            )}
          >
            +{extra}
          </span>
        )}
      </span>
    </span>
  );
}
