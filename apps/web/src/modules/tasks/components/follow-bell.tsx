"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Bell, BellOff, Check, Search } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { addTaskFollowerFor, removeTaskFollowerFor, setTaskFollowing } from "../actions";
import type { TaskFollowerRow } from "../queries";

function formatRelativeTime(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

type CandidateUser = { id: string; displayName: string; photoKey: string | null };

export function FollowBell({
  taskId,
  currentUserId,
  currentUserName,
  currentUserPhotoKey,
  initialFollowers,
  candidateUsers,
  canManageOthers,
}: {
  taskId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserPhotoKey: string | null;
  initialFollowers: TaskFollowerRow[];
  /** Everyone with list access — "People" section offers the ones not already following. */
  candidateUsers: CandidateUser[];
  canManageOthers: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [followers, setFollowers] = useState(initialFollowers);
  const [query, setQuery] = useState("");

  const isFollowing = followers.some((f) => f.userId === currentUserId);

  function setSelf(following: boolean) {
    if (following === isFollowing) return;
    startTransition(async () => {
      try {
        await setTaskFollowing(taskId, following);
        setFollowers((cur) =>
          following
            ? [
                {
                  userId: currentUserId,
                  displayName: currentUserName,
                  photoKey: currentUserPhotoKey,
                  createdAt: new Date(),
                },
                ...cur,
              ]
            : cur.filter((f) => f.userId !== currentUserId),
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update");
      }
    });
  }

  function addFollower(u: CandidateUser) {
    startTransition(async () => {
      try {
        const row = await addTaskFollowerFor(taskId, u.id);
        setFollowers((cur) => (cur.some((f) => f.userId === u.id) ? cur : [row, ...cur]));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to add follower");
      }
    });
  }

  function removeFollower(userId: string) {
    if (userId === currentUserId) {
      setSelf(false);
      return;
    }
    startTransition(async () => {
      try {
        await removeTaskFollowerFor(taskId, userId);
        setFollowers((cur) => cur.filter((f) => f.userId !== userId));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to remove follower");
      }
    });
  }

  const q = query.trim().toLowerCase();
  const filteredFollowers = useMemo(
    () => followers.filter((f) => f.displayName.toLowerCase().includes(q)),
    [followers, q],
  );
  const followerIds = useMemo(() => new Set(followers.map((f) => f.userId)), [followers]);
  const addable = useMemo(
    () =>
      candidateUsers.filter(
        (u) => !followerIds.has(u.id) && u.displayName.toLowerCase().includes(q),
      ),
    [candidateUsers, followerIds, q],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative text-muted-foreground", isFollowing && "text-primary")}
          aria-label="Followers"
          title="Followers"
        >
          {isFollowing ? <Bell className="size-4" /> : <BellOff className="size-4" />}
          {followers.length > 0 && (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {followers.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <button
          type="button"
          disabled={pending}
          onClick={() => setSelf(true)}
          className={cn(
            "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-muted",
            isFollowing && "bg-muted/60",
          )}
        >
          <span className="flex items-center justify-between gap-2 text-sm font-medium">
            <span className="flex items-center gap-2">
              <Bell className="size-4" />
              Follow
            </span>
            {isFollowing && <Check className="size-4 text-primary" />}
          </span>
          <span className="text-xs text-muted-foreground">
            Notify me on all activity for this task.
          </span>
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setSelf(false)}
          className={cn(
            "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-muted",
            !isFollowing && "bg-muted/60",
          )}
        >
          <span className="flex items-center justify-between gap-2 text-sm font-medium">
            <span className="flex items-center gap-2">
              <BellOff className="size-4" />
              Unfollow
            </span>
            {!isFollowing && <Check className="size-4 text-primary" />}
          </span>
          <span className="text-xs text-muted-foreground">
            Notify me only on @mentions or assignment.
          </span>
        </button>

        <div className="border-t border-border p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Followers…"
              className="h-9 pl-8"
            />
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto px-1.5 pb-2">
          {filteredFollowers.length > 0 && (
            <>
              <p className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
                {followers.length} follower{followers.length === 1 ? "" : "s"}
              </p>
              {filteredFollowers.map((f) => {
                const isMe = f.userId === currentUserId;
                return (
                  <button
                    key={f.userId}
                    type="button"
                    disabled={pending || (!isMe && !canManageOthers)}
                    onClick={() => removeFollower(f.userId)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left",
                      isMe ? "bg-muted/60" : "hover:bg-muted",
                      !isMe && !canManageOthers && "cursor-default",
                    )}
                  >
                    <UserAvatar
                      userId={f.userId}
                      name={f.displayName}
                      hasPhoto={!!f.photoKey}
                      className={cn("size-8", isMe && "ring-2 ring-primary")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {isMe ? "Me" : f.displayName}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatRelativeTime(f.createdAt)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </>
          )}

          {addable.length > 0 && (
            <>
              <p className="px-1.5 py-1 text-xs font-medium text-muted-foreground">People</p>
              {addable.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  disabled={pending || !canManageOthers}
                  onClick={() => addFollower(u)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left",
                    canManageOthers && "hover:bg-muted",
                    !canManageOthers && "cursor-default opacity-60",
                  )}
                >
                  <UserAvatar userId={u.id} name={u.displayName} hasPhoto={!!u.photoKey} className="size-8" />
                  <span className="truncate text-sm">{u.displayName}</span>
                </button>
              ))}
            </>
          )}

          {filteredFollowers.length === 0 && addable.length === 0 && (
            <p className="px-1.5 py-3 text-center text-xs text-muted-foreground">No matches</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
