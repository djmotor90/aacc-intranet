"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Plus, UsersRound } from "lucide-react";
import { useState, useTransition } from "react";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CORE_FIELD_LABELS,
  type CoreFieldKey,
  isCoreFieldRequired,
} from "@/modules/tasks/lib/required-fields";
import { createTask } from "../actions";
import {
  AssigneeAvatarStack,
  type TeamAssigneeOption,
  type UserOption as AssigneeUserOption,
} from "./assignee-select";
import { CustomFieldInput, type FieldDefLike, type UserOption } from "./custom-field-input";

export type SpaceTagOption = { id: string; name: string; color: string | null };

export type AssigneeOption = UserOption & { photoKey?: string | null };

function ReqMark() {
  return <span className="text-destructive">*</span>;
}

/** Form-friendly assignee picker matching task-detail AssigneeSelect UX. */
function FormAssigneePicker({
  users,
  teams,
  required,
  resetKey,
}: {
  users: AssigneeOption[];
  teams: TeamAssigneeOption[];
  required?: boolean;
  /** Change this to clear selection (e.g. after successful create). */
  resetKey: number;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  // Clear selection when resetKey changes (adjust-state-during-render).
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setSelectedIds([]);
    setSelectedTeamIds([]);
  }

  function toggle(userId: string) {
    setSelectedIds((cur) =>
      cur.includes(userId) ? cur.filter((id) => id !== userId) : [...cur, userId],
    );
  }

  function toggleTeam(teamId: string) {
    setSelectedTeamIds((cur) =>
      cur.includes(teamId) ? cur.filter((id) => id !== teamId) : [...cur, teamId],
    );
  }

  const byId = new Map(users.map((u) => [u.id, u]));
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((u): u is AssigneeOption => !!u)
    .map(
      (u): AssigneeUserOption => ({
        id: u.id,
        displayName: u.displayName,
        photoKey: u.photoKey ?? null,
      }),
    );
  const unselected = users.filter((u) => !selectedIds.includes(u.id));
  const selectedTeams = teams.filter((team) => selectedTeamIds.includes(team.id));
  const unselectedTeams = teams.filter((team) => !selectedTeamIds.includes(team.id));

  return (
    <>
      {selectedIds.map((id) => (
        <input key={id} type="hidden" name="assignees" value={id} />
      ))}
      {selectedTeamIds.map((id) => (
        <input key={id} type="hidden" name="teamAssignees" value={id} />
      ))}
      {/* HTML required on a multi-value field: force validation when empty */}
      {required && selectedIds.length === 0 && selectedTeamIds.length === 0 && (
        <input
          tabIndex={-1}
          className="sr-only"
          required
          value=""
          onChange={() => {}}
          aria-hidden
        />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={
              selected.length === 0 && selectedTeams.length === 0
                ? "Add assignee"
                : `Assignees: ${[...selectedTeams, ...selected].map((item) => item.displayName).join(", ")}`
            }
            className="inline-flex h-9 items-center rounded-md border border-input bg-background px-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <AssigneeAvatarStack
              users={selected}
              teams={selectedTeams}
              size="md"
              emptyLabel="Add assignee"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 min-w-[14rem]">
          {teams.length > 0 && (
            <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Teams
            </div>
          )}
          {[...selectedTeams, ...unselectedTeams].map((team) => (
            <DropdownMenuCheckboxItem
              key={`team:${team.id}`}
              checked={selectedTeamIds.includes(team.id)}
              onCheckedChange={() => toggleTeam(team.id)}
              onSelect={(event) => event.preventDefault()}
              className="gap-2 py-1.5"
            >
              <span
                className="inline-flex size-6 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: team.color ?? "#007582" }}
              >
                <UsersRound className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate">{team.displayName}</span>
              {team.alias && <span className="text-xs text-muted-foreground">@{team.alias}</span>}
            </DropdownMenuCheckboxItem>
          ))}
          {teams.length > 0 && users.length > 0 && <DropdownMenuSeparator />}
          {users.length > 0 && (
            <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              People
            </div>
          )}
          {selected.map((u) => (
            <DropdownMenuCheckboxItem
              key={u.id}
              checked
              onCheckedChange={() => toggle(u.id)}
              onSelect={(event) => event.preventDefault()}
              className="gap-2 py-1.5"
            >
              <UserAvatar
                userId={u.id}
                name={u.displayName}
                hasPhoto={!!u.photoKey}
                className="size-6"
              />
              <span className="truncate">{u.displayName}</span>
            </DropdownMenuCheckboxItem>
          ))}
          {selected.length > 0 && unselected.length > 0 && <DropdownMenuSeparator />}
          {unselected.map((u) => (
            <DropdownMenuCheckboxItem
              key={u.id}
              checked={false}
              onCheckedChange={() => toggle(u.id)}
              onSelect={(event) => event.preventDefault()}
              className="gap-2 py-1.5"
            >
              <UserAvatar
                userId={u.id}
                name={u.displayName}
                hasPhoto={!!u.photoKey}
                className="size-6"
              />
              <span className="truncate">{u.displayName}</span>
            </DropdownMenuCheckboxItem>
          ))}
          {users.length === 0 && teams.length === 0 && (
            <div className="px-2 py-3 text-sm text-muted-foreground">No assignees available</div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export function NewTaskDialog({
  listId,
  fieldDefs,
  users,
  teams = [],
  requiredCoreFields = [],
  spaceTags = [],
}: {
  listId: string;
  fieldDefs: FieldDefLike[];
  users: AssigneeOption[];
  teams?: TeamAssigneeOption[];
  requiredCoreFields?: CoreFieldKey[];
  spaceTags?: SpaceTagOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [formKey, setFormKey] = useState(0);

  const req = (key: CoreFieldKey) => isCoreFieldRequired(requiredCoreFields, key);
  const showTags = spaceTags.length > 0 || req("tags");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setFormKey((k) => k + 1);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <form
          key={formKey}
          className="flex flex-col gap-4"
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              try {
                await createTask(formData);
                setOpen(false);
                setFormKey((k) => k + 1);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to create task");
              }
            });
          }}
        >
          <input type="hidden" name="listId" value={listId} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">
              Title <ReqMark />
            </Label>
            <Input id="title" name="title" required autoFocus />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">
              {CORE_FIELD_LABELS.description} {req("description") && <ReqMark />}
            </Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              required={req("description")}
              placeholder={req("description") ? "Required…" : "Optional description…"}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priority">
                {CORE_FIELD_LABELS.priority} {req("priority") && <ReqMark />}
              </Label>
              <select
                id="priority"
                name="priority"
                required={req("priority")}
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
                defaultValue=""
              >
                <option value="">{req("priority") ? "Select…" : "—"}</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dueDate">
                {CORE_FIELD_LABELS.dueDate} {req("dueDate") && <ReqMark />}
              </Label>
              <Input id="dueDate" name="dueDate" type="date" required={req("dueDate")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startDate">
                {CORE_FIELD_LABELS.startDate} {req("startDate") && <ReqMark />}
              </Label>
              <Input id="startDate" name="startDate" type="date" required={req("startDate")} />
            </div>
          </div>

          <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3">
            <Label className="text-muted-foreground">
              {CORE_FIELD_LABELS.assignees} {req("assignees") && <ReqMark />}
            </Label>
            <div className="min-w-0">
              <FormAssigneePicker
                users={users}
                teams={teams}
                required={req("assignees")}
                resetKey={formKey}
              />
            </div>
          </div>

          {showTags && (
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3">
              <Label htmlFor="tags" className="pt-2 text-muted-foreground">
                {CORE_FIELD_LABELS.tags} {req("tags") && <ReqMark />}
              </Label>
              <select
                id="tags"
                name="tags"
                multiple
                required={req("tags")}
                className="min-h-16 rounded-md border bg-transparent px-3 py-2 text-sm"
              >
                {spaceTags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {fieldDefs.map((def) => (
            <CustomFieldInput key={def.id} def={def} users={users} />
          ))}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create task"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
