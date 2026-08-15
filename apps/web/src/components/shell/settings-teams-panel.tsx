"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Pencil, Plus, Search, Trash2, UsersRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shell/user-avatar";
import { solidChipStyle } from "@/lib/color-contrast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  addTeamMember,
  createPlatformRoleMapping,
  createTeam,
  deleteRoleMapping,
  deleteTeam,
  getAdminGroupsData,
  removeTeamMember,
  updateTeam,
  type AdminGroupRow,
  type AdminEntraGroupOption,
  type AdminMappingRow,
  type AdminTeamMemberRow,
} from "@/modules/shell/actions/admin";

type TeamsData = {
  groups: AdminGroupRow[];
  mappings: AdminMappingRow[];
  availableUsers: AdminTeamMemberRow[];
  entraGroups: AdminEntraGroupOption[];
};

const EMPTY_DATA: TeamsData = { groups: [], mappings: [], availableUsers: [], entraGroups: [] };

function TeamMark({ team }: { team: AdminGroupRow }) {
  const initials = team.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-sm"
      style={solidChipStyle(team.color ?? "#007582")}
      aria-hidden
    >
      {team.icon || initials || "T"}
    </span>
  );
}

export function SettingsTeamsPanel() {
  const [data, setData] = useState<TeamsData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminGroupRow | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    try {
      setData(await getAdminGroupsData());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Teams");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.groups;
    return data.groups.filter(
      (team) =>
        team.displayName.toLowerCase().includes(q) ||
        team.alias?.toLowerCase().includes(q) ||
        team.members.some((member) => member.displayName.toLowerCase().includes(q)),
    );
  }, [data.groups, query]);

  function run(action: () => Promise<void>, success: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(success);
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Team update failed");
      }
    });
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading Teams…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <UsersRound className="size-5 text-primary" />
            <h2 className="text-xl font-semibold">Teams &amp; Groups</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Create reusable Teams for assignments, @mentions, and permissions. Team membership
            and access are managed entirely inside AACC Hub.
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> Create Team
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Teams, aliases, or members…"
          className="pl-9"
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-[minmax(13rem,1fr)_10rem_minmax(15rem,1.2fr)_5rem] gap-3 border-b bg-muted/45 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Team</span><span>Alias</span><span>Members</span><span />
        </div>
        {groups.map((team) => {
          const memberIds = new Set(team.members.map((member) => member.id));
          const addable = data.availableUsers.filter((user) => !memberIds.has(user.id));
          return (
            <div
              key={team.id}
              className="grid grid-cols-[minmax(13rem,1fr)_10rem_minmax(15rem,1.2fr)_5rem] items-center gap-3 border-b px-4 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <TeamMark team={team} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{team.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {team.description || `${team.members.length} member${team.members.length === 1 ? "" : "s"}`}
                  </p>
                </div>
              </div>
              <span className="truncate text-sm text-muted-foreground">
                @{team.alias || team.displayName.toLowerCase().replace(/\s+/g, "-")}
              </span>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {team.members.slice(0, 6).map((member) => (
                  <span key={member.id} className="group/member inline-flex items-center gap-1 rounded-full border bg-background py-0.5 pl-1 pr-1.5 text-xs">
                    <UserAvatar userId={member.id} name={member.displayName} hasPhoto={!!member.photoKey} className="size-5" />
                    <span className="max-w-24 truncate">{member.displayName}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${member.displayName} from ${team.displayName}`}
                      disabled={pending}
                      onClick={() => run(() => removeTeamMember({ teamId: team.id, userId: member.id }), "Member removed")}
                      className="rounded-full text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {team.members.length > 6 && <Badge variant="secondary">+{team.members.length - 6}</Badge>}
                {addable.length > 0 && (
                  <select
                    defaultValue=""
                    disabled={pending}
                    aria-label={`Add member to ${team.displayName}`}
                    className="h-7 max-w-36 rounded-md border bg-background px-2 text-xs"
                    onChange={(event) => {
                      const userId = event.target.value;
                      event.currentTarget.value = "";
                      if (userId) run(() => addTeamMember({ teamId: team.id, userId }), "Member added");
                    }}
                  >
                    <option value="">+ Add member</option>
                    {addable.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
                  </select>
                )}
              </div>
              <div className="flex justify-end gap-1">
                  <>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${team.displayName}`} onClick={() => setEditing(team)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${team.displayName}`}
                      className="text-destructive hover:text-destructive"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm(`Delete Team “${team.displayName}”? Team assignments and Team permissions will be removed.`)) {
                          run(() => deleteTeam(team.id), "Team deleted");
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
              </div>
            </div>
          );
        })}
        {groups.length === 0 && (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">No Teams match this search.</div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entra application access</CardTitle>
          <CardDescription>
            Entra groups only control who can enter AACC Hub and who receives Super Admin access.
            Collaborative Team membership and permissions are managed above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {data.mappings.map((mapping) => (
              <span key={mapping.id} className="inline-flex items-center gap-2 rounded-full border bg-muted/30 px-3 py-1 text-xs">
                {mapping.groupName} · {mapping.role === "admin" ? "Super Admin" : "Member"}
                <button
                  type="button"
                  aria-label={`Remove mapping for ${mapping.groupName}`}
                  onClick={() => run(async () => {
                    const formData = new FormData();
                    formData.set("id", mapping.id);
                    await deleteRoleMapping(formData);
                  }, "Mapping removed")}
                ><X className="size-3" /></button>
              </span>
            ))}
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const formData = new FormData(form);
              run(async () => { await createPlatformRoleMapping(formData); form.reset(); }, "Mapping added");
            }}
          >
            <select name="groupId" required defaultValue="" className="h-9 rounded-md border bg-background px-3 text-sm">
              <option value="" disabled>Entra group…</option>
              {data.entraGroups.map((group) => <option key={group.id} value={group.id}>{group.displayName}</option>)}
            </select>
            <select name="role" defaultValue="member" className="h-9 rounded-md border bg-background px-3 text-sm">
              <option value="member">Member</option>
              <option value="admin">Super Admin</option>
            </select>
            <Button type="submit" variant="outline" disabled={pending || data.entraGroups.length === 0}>Add mapping</Button>
          </form>
        </CardContent>
      </Card>

      <TeamEditorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create Team"
        users={data.availableUsers}
        pending={pending}
        onSubmit={(input) => run(async () => { await createTeam(input); setCreateOpen(false); }, "Team created")}
      />
      <TeamEditorDialog
        open={Boolean(editing)}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        title="Edit Team"
        team={editing}
        users={data.availableUsers}
        pending={pending}
        onSubmit={(input) => {
          if (!editing) return;
          run(async () => { await updateTeam({ ...input, id: editing.id }); setEditing(null); }, "Team updated");
        }}
      />
    </div>
  );
}

function TeamEditorDialog({
  open,
  onOpenChange,
  title,
  team,
  users,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  team?: AdminGroupRow | null;
  users: AdminTeamMemberRow[];
  pending: boolean;
  onSubmit: (input: { name: string; alias?: string; description?: string; color?: string; memberIds: string[] }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Teams can be assigned, @mentioned, and granted access throughout AACC Hub.
          </DialogDescription>
        </DialogHeader>
        <form
          key={team?.id ?? "new"}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            onSubmit({
              name: String(formData.get("name") ?? ""),
              alias: String(formData.get("alias") ?? ""),
              description: String(formData.get("description") ?? ""),
              color: String(formData.get("color") ?? "#007582"),
              memberIds: formData.getAll("memberIds").map(String),
            });
          }}
        >
          <div className="grid grid-cols-[1fr_9rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${title}-name`}>Team name</Label>
              <Input id={`${title}-name`} name="name" defaultValue={team?.displayName ?? ""} required autoFocus maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${title}-color`}>Color</Label>
              <Input id={`${title}-color`} name="color" type="color" defaultValue={team?.color ?? "#007582"} className="p-1" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${title}-alias`}>@mention alias</Label>
            <Input id={`${title}-alias`} name="alias" defaultValue={team?.alias ?? ""} placeholder="cewd-operations" maxLength={50} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${title}-description`}>Description</Label>
            <Input id={`${title}-description`} name="description" defaultValue={team?.description ?? ""} placeholder="What this Team owns or supports" maxLength={500} />
          </div>
          {!team && (
            <div className="space-y-1.5">
              <Label htmlFor={`${title}-members`}>Initial members</Label>
              <select id={`${title}-members`} name="memberIds" multiple className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm">
                {users.map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.email}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">Use Command/Ctrl-click to select multiple people.</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save Team"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
