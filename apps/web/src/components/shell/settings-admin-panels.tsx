"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { useCallback, useEffect, useState, useTransition } from "react";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  getAdminUsersData,
  setUserMembershipRole,
  toggleUserActive,
  triggerEntraSync,
  type AdminUserRow,
  type AssignablePermissionRole,
} from "@/modules/shell/actions/admin";

export function SettingsAdminUsersPanel() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [permissionRoles, setPermissionRoles] = useState<AssignablePermissionRole[]>([]);
  const [graphConfigured, setGraphConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getAdminUsersData();
      setError(null);
      setUsers(data.users);
      setPermissionRoles(data.permissionRoles);
      setGraphConfigured(data.graphConfigured);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getAdminUsersData();
        if (cancelled) return;
        setUsers(data.users);
        setPermissionRoles(data.permissionRoles);
        setGraphConfigured(data.graphConfigured);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load users");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading users…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground">
            Assign Security &amp; Permissions roles (Guest, Member, Admin, or custom). Super Admin
            from Entra is locked (god mode). App permissions follow the selected membership role.
          </p>
          {users.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {users.filter((u) => u.isActive).length} active · {users.length} total shown
            </p>
          )}
        </div>
        <Button
          type="button"
          disabled={!graphConfigured || pending}
          onClick={() => {
            startTransition(async () => {
              await triggerEntraSync();
              // Memberships update async in the worker — poll once after a short wait.
              await new Promise((r) => setTimeout(r, 2500));
              await load();
            });
          }}
        >
          Sync from Entra ID
        </Button>
      </div>
      {!graphConfigured && (
        <p className="text-sm text-amber-600">
          Daemon credentials not configured — see docs/entra-setup.md to enable directory sync.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Membership</TableHead>
              <TableHead>Entra groups</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const busy = busyUserId === u.id || pending;
              const isSuper =
                u.isProtectedAdmin || u.platformRole === "admin" || u.roleLocked;
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <UserAvatar userId={u.id} name={u.displayName} hasPhoto={!!u.photoKey} />
                      <div>
                        <div className="font-medium">{u.displayName}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{u.department ?? "—"}</TableCell>
                  <TableCell>
                    {u.roleLocked ? (
                      <div className="flex flex-col gap-0.5">
                        <Badge variant="default">
                          {u.isProtectedAdmin ? "Super Admin ★" : "Super Admin"}
                        </Badge>
                        <span className="max-w-[14rem] text-[10px] leading-snug text-muted-foreground">
                          {u.roleLockReason ?? "Managed via Entra"} · full app access
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <select
                          className="h-8 max-w-[12rem] rounded-md border bg-transparent px-2 text-sm"
                          value={u.permissionRoleId ?? ""}
                          disabled={busy || permissionRoles.length === 0}
                          aria-label={`Membership for ${u.displayName}`}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            if (!nextId || nextId === u.permissionRoleId) return;
                            const roleName =
                              permissionRoles.find((r) => r.id === nextId)?.name ?? "role";
                            setBusyUserId(u.id);
                            startTransition(async () => {
                              try {
                                await setUserMembershipRole({
                                  userId: u.id,
                                  permissionRoleId: nextId,
                                });
                                toast.success(`Set ${u.displayName} to ${roleName}`);
                                await load();
                              } catch (err) {
                                toast.error(
                                  err instanceof Error ? err.message : "Failed to update membership",
                                );
                                await load();
                              } finally {
                                setBusyUserId(null);
                              }
                            });
                          }}
                        >
                          {permissionRoles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                              {r.isSystem ? "" : " (custom)"}
                            </option>
                          ))}
                        </select>
                        <span className="text-[10px] text-muted-foreground">
                          App permissions from Security &amp; Permissions
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.entraGroups.length > 0 ? (
                      <div className="flex max-w-[14rem] flex-wrap gap-1">
                        {u.entraGroups.map((g) => (
                          <Badge key={g} variant="outline" className="text-[10px] font-normal">
                            {g}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Not in a mapped group
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.isActive ? "outline" : "destructive"}>
                      {u.isActive ? "active" : "inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.lastSignedInAt ?? "—"}
                  </TableCell>
                  <TableCell>
                    {!u.roleLocked && (
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setBusyUserId(u.id);
                          startTransition(async () => {
                            try {
                              const fd = new FormData();
                              fd.set("id", u.id);
                              await toggleUserActive(fd);
                              toast.success(
                                u.isActive ? `Deactivated ${u.displayName}` : `Activated ${u.displayName}`,
                              );
                              await load();
                            } catch (err) {
                              toast.error(
                                err instanceof Error ? err.message : "Failed to update status",
                              );
                            } finally {
                              setBusyUserId(null);
                            }
                          });
                        }}
                      >
                        {u.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    )}
                    {u.roleLocked && isSuper && (
                      <span className="text-[10px] text-muted-foreground">Entra-managed</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export { SettingsTeamsPanel as SettingsAdminGroupsPanel } from "./settings-teams-panel";
