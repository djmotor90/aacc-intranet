"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { UsersRound, UserPlus } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import {
  ProfileAvatar,
  ProfileMenuButton,
} from "@/components/shell/profile-avatar";
import { UserAvatar } from "@/components/shell/user-avatar";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getAssignableTeamsForTask, toggleAssignee, toggleTeamAssignee } from "../actions";

export interface UserOption {
  id: string;
  displayName: string;
  photoKey: string | null;
}

export interface TeamAssigneeOption {
  id: string;
  displayName: string;
  alias: string | null;
  color: string | null;
  icon: string | null;
  memberCount: number;
}

const SIZE = {
  sm: { avatar: "size-6", ring: "ring-2", empty: "size-6", icon: "size-3", plus: "size-4 text-[10px]" },
  md: { avatar: "size-7", ring: "ring-2", empty: "size-7", icon: "size-3.5", plus: "size-5 text-[11px]" },
} as const;

/**
 * Overlapping circular avatars used as the closed state of
 * the assignee picker and as read-only display in the table.
 */
export function AssigneeAvatarStack({
  users,
  teams = [],
  max = 3,
  size = "sm",
  emptyLabel = "Unassigned",
  className,
  /**
   * When false, render plain avatars (e.g. inside AssigneeSelect trigger —
   * avoids nested buttons). Profile still available via picker row hover.
   */
  enableProfile = true,
}: {
  users: UserOption[];
  teams?: TeamAssigneeOption[];
  max?: number;
  size?: keyof typeof SIZE;
  emptyLabel?: string;
  className?: string;
  enableProfile?: boolean;
}) {
  const s = SIZE[size];
  if (users.length === 0 && teams.length === 0) {
    return (
      <span
        title={emptyLabel}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 bg-muted/40 text-muted-foreground",
          s.empty,
          className,
        )}
      >
        <UserPlus className={s.icon} />
      </span>
    );
  }

  const entries = [
    ...teams.map((team) => ({ kind: "team" as const, value: team })),
    ...users.map((user) => ({ kind: "user" as const, value: user })),
  ];
  const visible = entries.slice(0, max);
  const extra = entries.length - visible.length;

  return (
    <span
      className={cn("inline-flex items-center", className)}
      title={entries.map((entry) => entry.value.displayName).join(", ")}
    >
      <span className="flex items-center -space-x-1.5">
        {visible.map((entry) =>
          entry.kind === "team" ? (
            <span
              key={`team:${entry.value.id}`}
              className={cn(
                s.avatar,
                s.ring,
                "inline-flex items-center justify-center rounded-full text-white ring-background",
              )}
              style={{ backgroundColor: entry.value.color ?? "#007582" }}
              title={`${entry.value.displayName} Team`}
            >
              <UsersRound className={s.icon} />
            </span>
          ) : enableProfile ? (
            <ProfileAvatar
              key={`user:${entry.value.id}`}
              userId={entry.value.id}
              name={entry.value.displayName}
              hasPhoto={!!entry.value.photoKey}
              photoVersion={entry.value.photoKey}
              className={cn(s.avatar, s.ring, "ring-background")}
            />
          ) : (
            <UserAvatar
              key={`user:${entry.value.id}`}
              userId={entry.value.id}
              name={entry.value.displayName}
              hasPhoto={!!entry.value.photoKey}
              className={cn(s.avatar, s.ring, "ring-background")}
            />
          ),
        )}
        {extra > 0 && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-background",
              s.plus,
              s.ring,
            )}
          >
            +{extra}
          </span>
        )}
      </span>
    </span>
  );
}

export function AssigneeSelect({
  taskId,
  users,
  selectedUsers,
  selectedTeams = [],
  disabled,
  size = "md",
  className,
}: {
  taskId: string;
  /** Assignable candidates — typically active users only. */
  users: UserOption[];
  /**
   * Currently-assigned users with their real display data. Kept separate from
   * `users` so someone assigned while active (then later deactivated) still
   * shows up correctly instead of silently disappearing from the picker.
   */
  selectedUsers: UserOption[];
  selectedTeams?: TeamAssigneeOption[];
  disabled?: boolean;
  /** Avatar size: `sm` for table rows, `md` for task detail. */
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const selectedIds = selectedUsers.map((u) => u.id);
  const [pending, startTransition] = useTransition();
  const [teams, setTeams] = useState<TeamAssigneeOption[]>(selectedTeams);
  const [optimisticSelectedIds, toggleOptimistic] = useOptimistic(
    selectedIds,
    (current, userId: string) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
  );
  const [optimisticSelectedTeamIds, toggleTeamOptimistic] = useOptimistic(
    selectedTeams.map((team) => team.id),
    (current, groupId: string) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId],
  );
  const byId = new Map([...users, ...selectedUsers].map((u) => [u.id, u]));
  const selected = optimisticSelectedIds
    .map((id) => byId.get(id))
    .filter((u): u is UserOption => !!u);
  const unselected = users.filter((u) => !optimisticSelectedIds.includes(u.id));
  const teamById = new Map([...teams, ...selectedTeams].map((team) => [team.id, team]));
  const selectedTeamRows = optimisticSelectedTeamIds
    .map((id) => teamById.get(id))
    .filter((team): team is TeamAssigneeOption => Boolean(team));
  const unselectedTeams = teams.filter((team) => !optimisticSelectedTeamIds.includes(team.id));

  function toggle(userId: string) {
    if (disabled) return;
    startTransition(async () => {
      toggleOptimistic(userId);
      const formData = new FormData();
      formData.set("taskId", taskId);
      formData.set("userId", userId);
      await toggleAssignee(formData);
    });
  }

  function toggleTeam(groupId: string) {
    if (disabled) return;
    startTransition(async () => {
      toggleTeamOptimistic(groupId);
      const formData = new FormData();
      formData.set("taskId", taskId);
      formData.set("groupId", groupId);
      await toggleTeamAssignee(formData);
    });
  }

  if (disabled) {
    return (
      <div className={cn("inline-flex items-center", className)}>
        <AssigneeAvatarStack
          users={selected}
          teams={selectedTeamRows}
          size={size}
          emptyLabel="Unassigned"
          enableProfile
        />
      </div>
    );
  }

  const stack = (
    <AssigneeAvatarStack
      users={selected}
      teams={selectedTeamRows}
      size={size}
      emptyLabel="Add assignee"
      enableProfile={false}
    />
  );

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) return;
        startTransition(async () => {
          try {
            setTeams(await getAssignableTeamsForTask(taskId));
          } catch {
            // Keep already-selected Teams visible if candidate loading fails.
          }
        });
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-label={
            selected.length === 0
              ? "Add assignee"
              : `Assignees: ${selected.map((u) => u.displayName).join(", ")}`
          }
          className={cn(
            "inline-flex h-7 items-center rounded-md px-0.5 transition-colors",
            "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:pointer-events-none disabled:opacity-60",
            className,
          )}
        >
          {stack}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 min-w-[15rem]">
        {(selectedTeamRows.length > 0 || unselectedTeams.length > 0) && (
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Teams
          </div>
        )}
        {selectedTeamRows.map((team) => (
          <DropdownMenuCheckboxItem
            key={`team:${team.id}`}
            checked
            onCheckedChange={() => toggleTeam(team.id)}
            onSelect={(event) => event.preventDefault()}
            className="gap-2 py-1.5"
          >
            <span className="flex size-6 items-center justify-center rounded-full text-white" style={{ backgroundColor: team.color ?? "#007582" }}>
              <UsersRound className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate">{team.displayName}</span>
            {team.alias && <span className="text-xs text-muted-foreground">@{team.alias}</span>}
          </DropdownMenuCheckboxItem>
        ))}
        {unselectedTeams.map((team) => (
          <DropdownMenuCheckboxItem
            key={`team:${team.id}`}
            checked={false}
            onCheckedChange={() => toggleTeam(team.id)}
            onSelect={(event) => event.preventDefault()}
            className="gap-2 py-1.5"
          >
            <span className="flex size-6 items-center justify-center rounded-full text-white" style={{ backgroundColor: team.color ?? "#007582" }}>
              <UsersRound className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate">{team.displayName}</span>
            {team.alias && <span className="text-xs text-muted-foreground">@{team.alias}</span>}
          </DropdownMenuCheckboxItem>
        ))}
        {(selectedTeamRows.length > 0 || unselectedTeams.length > 0) && <DropdownMenuSeparator />}
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          People
        </div>
        {selected.map((u) => (
          <div key={u.id} className="group/row flex items-center pr-1">
            <DropdownMenuCheckboxItem
              checked
              onCheckedChange={() => toggle(u.id)}
              onSelect={(event) => event.preventDefault()}
              className="min-w-0 flex-1 gap-2 py-1.5"
            >
              <UserAvatar
                userId={u.id}
                name={u.displayName}
                hasPhoto={!!u.photoKey}
                className="size-6"
              />
              <span className="truncate">{u.displayName}</span>
            </DropdownMenuCheckboxItem>
            <ProfileMenuButton userId={u.id} />
          </div>
        ))}
        {selected.length > 0 && unselected.length > 0 && <DropdownMenuSeparator />}
        {unselected.map((u) => (
          <div key={u.id} className="group/row flex items-center pr-1">
            <DropdownMenuCheckboxItem
              checked={false}
              onCheckedChange={() => toggle(u.id)}
              onSelect={(event) => event.preventDefault()}
              className="min-w-0 flex-1 gap-2 py-1.5"
            >
              <UserAvatar
                userId={u.id}
                name={u.displayName}
                hasPhoto={!!u.photoKey}
                className="size-6"
              />
              <span className="truncate">{u.displayName}</span>
            </DropdownMenuCheckboxItem>
            <ProfileMenuButton userId={u.id} />
          </div>
        ))}
        {users.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">No users available</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
