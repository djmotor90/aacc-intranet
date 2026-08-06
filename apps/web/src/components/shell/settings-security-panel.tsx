"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  Info,
  Plus,
  RotateCcw,
  Search,
  Shield,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_GROUPS,
  type PermissionKey,
} from "@/lib/permissions-catalog";
import { cn } from "@/lib/utils";
import {
  createCustomRole,
  deleteCustomRole,
  getPermissionRolesData,
  resetSystemRoleDefaults,
  setRolePermission,
  type PermissionRoleRow,
} from "@/modules/shell/actions/permissions";

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "border-primary bg-primary" : "border-border bg-muted",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block size-3.5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

export function SettingsSecurityPanel() {
  const [roles, setRoles] = useState<PermissionRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getPermissionRolesData();
      setRoles(data.roles);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getPermissionRolesData();
        if (!cancelled) setRoles(data.roles);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load roles");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return PERMISSION_GROUPS;
    return PERMISSION_GROUPS.map((g) => ({
      ...g,
      permissions: g.permissions.filter(
        (p) =>
          p.label.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.key.includes(q),
      ),
    })).filter((g) => g.permissions.length > 0);
  }, [search]);

  function toggle(roleId: string, permission: PermissionKey, enabled: boolean) {
    const key = `${roleId}:${permission}`;
    setBusyKey(key);
    // Optimistic
    setRoles((prev) =>
      prev.map((r) =>
        r.id === roleId
          ? {
              ...r,
              permissions: {
                ...r.permissions,
                [permission]: enabled,
                ...(permission === "manage_custom_fields" && enabled
                  ? { create_custom_fields: true, edit_custom_fields: true }
                  : {}),
              },
            }
          : r,
      ),
    );
    startTransition(async () => {
      try {
        await setRolePermission({ roleId, permission, enabled });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update permission");
        await load();
      } finally {
        setBusyKey(null);
      }
    });
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setBusyKey("create");
    startTransition(async () => {
      try {
        await createCustomRole({ name });
        setNewName("");
        setCreating(false);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create role");
      } finally {
        setBusyKey(null);
      }
    });
  }

  function handleDelete(role: PermissionRoleRow) {
    if (role.isSystem) return;
    if (!window.confirm(`Delete custom role “${role.name}”?`)) return;
    setBusyKey(`del:${role.id}`);
    startTransition(async () => {
      try {
        await deleteCustomRole(role.id);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete role");
      } finally {
        setBusyKey(null);
      }
    });
  }

  function handleReset(role: PermissionRoleRow) {
    if (!role.isSystem) return;
    if (!window.confirm(`Reset “${role.name}” permissions to defaults?`)) return;
    setBusyKey(`reset:${role.id}`);
    startTransition(async () => {
      try {
        await resetSystemRoleDefaults(role.id);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to reset role");
      } finally {
        setBusyKey(null);
      }
    });
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading security settings…</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Shield className="size-5 text-primary" />
            Security &amp; Permissions
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Control what each space role can do. System columns (Guest, Member, Admin) map to
            space / list membership. Super Admin is platform god mode and is not listed here —
            it always has full access.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!creating ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setCreating(true)}
              disabled={pending}
            >
              <Plus className="size-4" />
              Custom role
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Role name"
                className="h-8 w-44"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                disabled={!newName.trim() || busyKey === "create"}
                onClick={handleCreate}
              >
                Create
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search for action…"
          className="h-9 pl-8"
        />
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur">
            <tr className="border-b">
              <th className="sticky left-0 z-30 bg-muted/95 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
              {roles.map((role) => (
                <th
                  key={role.id}
                  className="min-w-[7.5rem] px-2 py-3 text-center align-bottom"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      {role.name}
                    </span>
                    {role.isSystem ? (
                      <span className="text-[10px] font-normal text-muted-foreground">
                        System
                      </span>
                    ) : (
                      <span className="text-[10px] font-normal text-primary">Custom</span>
                    )}
                    <div className="flex items-center gap-0.5">
                      {role.isSystem && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="size-6 p-0 text-muted-foreground"
                          title="Reset to defaults"
                          disabled={pending}
                          onClick={() => handleReset(role)}
                        >
                          <RotateCcw className="size-3" />
                        </Button>
                      )}
                      {!role.isSystem && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="size-6 p-0 text-destructive hover:text-destructive"
                          title="Delete role"
                          disabled={pending}
                          onClick={() => handleDelete(role)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredGroups.map((group) => (
              <GroupRows
                key={group.id}
                group={group}
                roles={roles}
                busyKey={busyKey}
                pending={pending}
                onToggle={toggle}
              />
            ))}
            {filteredGroups.length === 0 && (
              <tr>
                <td
                  colSpan={roles.length + 1}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  No actions match “{search}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 text-xs text-muted-foreground">
        <p className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-foreground">
          <Shield className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>
            <strong className="font-semibold">Super Admin</strong> (platform god mode) is not a
            column in this matrix. Super Admins bypass every permission check — they cannot be
            restricted here. Manage who is Super Admin via Entra access groups, not space roles.
          </span>
        </p>
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <strong className="font-medium text-foreground">Admin</strong> is the highest{" "}
            <em>space</em> role (formerly “Owner”) — full control of that space’s members and
            settings. Guest / Member / Admin columns apply when a user has that membership.
            Custom roles can be assigned later. ({ALL_PERMISSION_KEYS.length} actions)
          </span>
        </p>
      </div>
    </div>
  );
}

function GroupRows({
  group,
  roles,
  busyKey,
  pending,
  onToggle,
}: {
  group: (typeof PERMISSION_GROUPS)[number];
  roles: PermissionRoleRow[];
  busyKey: string | null;
  pending: boolean;
  onToggle: (roleId: string, permission: PermissionKey, enabled: boolean) => void;
}) {
  return (
    <>
      <tr className="border-b bg-muted/40">
        <td
          colSpan={roles.length + 1}
          className="sticky left-0 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {group.label}
        </td>
      </tr>
      {group.permissions.map((perm) => (
        <tr key={perm.key} className="border-b border-border/60 hover:bg-muted/20">
          <td className="sticky left-0 z-10 max-w-sm bg-background px-4 py-3 align-top">
            <div className="font-medium leading-snug">{perm.label}</div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {perm.description}
            </p>
          </td>
          {roles.map((role) => {
            const checked = !!role.permissions[perm.key];
            const key = `${role.id}:${perm.key}`;
            return (
              <td key={role.id} className="px-2 py-3 text-center align-middle">
                <div className="flex justify-center">
                  <Toggle
                    checked={checked}
                    disabled={pending && busyKey === key}
                    label={`${perm.label} for ${role.name}`}
                    onChange={(next) => onToggle(role.id, perm.key, next)}
                  />
                </div>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
