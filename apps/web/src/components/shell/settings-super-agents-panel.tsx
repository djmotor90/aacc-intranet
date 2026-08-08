/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import { Bot } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  getSuperAgentSettingsPanelData,
  saveSuperAgentAppSettings,
} from "@/modules/shell/actions/app-settings";

export function SettingsSuperAgentsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [allowGroupCreate, setAllowGroupCreate] = useState(false);
  const [createGroupIds, setCreateGroupIds] = useState<string[]>([]);
  const [groups, setGroups] = useState<{ id: string; displayName: string }[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getSuperAgentSettingsPanelData();
      setAllowGroupCreate(data.settings.allowGroupCreate);
      setCreateGroupIds(data.settings.createGroupIds);
      setGroups(data.groups);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleGroup(id: string) {
    setCreateGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setSaved(false);
  }

  function onSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveSuperAgentAppSettings({
        allowGroupCreate,
        createGroupIds: allowGroupCreate ? createGroupIds : [],
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAllowGroupCreate(res.settings.allowGroupCreate);
      setCreateGroupIds(res.settings.createGroupIds);
      setSaved(true);
    });
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading Super Agent settings…</p>;
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <Bot className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Super Agents</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Control who can create Super Agents. Platform Super Admins can always create them.
        </p>
      </div>

      <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">
              Allow selected groups to create Super Agents
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              When on, members of the groups below can open Create Agent and build new Super Agents.
              When off, only Super Admins can create.
            </span>
          </span>
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={allowGroupCreate}
            onChange={(e) => {
              setAllowGroupCreate(e.target.checked);
              setSaved(false);
            }}
          />
        </label>

        {allowGroupCreate && (
          <div>
            <Label className="text-sm">Groups that may create</Label>
            {groups.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No Entra groups synced yet. Sync directory under Users, or map groups under Groups
                &amp; Roles.
              </p>
            ) : (
              <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-xl border p-2">
                {groups.map((g) => {
                  const on = createGroupIds.includes(g.id);
                  return (
                    <li key={g.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted/60",
                          on && "bg-primary/5",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleGroup(g.id)}
                        />
                        <span className="truncate font-medium">{g.displayName}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {allowGroupCreate && createGroupIds.length === 0 && groups.length > 0 && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                Toggle is on but no groups are selected — only Super Admins can create until you
                pick at least one group.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 border-t pt-4">
          <Button
            type="button"
            onClick={onSave}
            className={cn(pending && "pointer-events-none opacity-50")}
          >
            {pending ? "Saving…" : "Save settings"}
          </Button>
          {saved && <span className="text-sm text-emerald-600">Saved</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </section>
    </div>
  );
}
