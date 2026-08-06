"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { setListSecretsEnabled } from "../actions";

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
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "border-primary bg-primary" : "border-border bg-muted",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block size-3.5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-4.5" : "translate-x-0.75",
        )}
      />
    </button>
  );
}

/**
 * List setting: turn the Secrets vault tab on/off for tasks in this list.
 * Off by default (opt-in, unlike Subtasks — this holds sensitive data).
 *
 * Disable strategy (no data loss): turning off only blocks creating *new*
 * secrets. Existing ones stay linked, openable, and editable for anyone
 * with access.
 */
export function SecretsSettings({
  listId,
  initialEnabled,
  existingSecretCount,
}: {
  listId: string;
  initialEnabled: boolean;
  existingSecretCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);

  function toggle(next: boolean) {
    setError(null);

    if (!next && existingSecretCount > 0) {
      const ok = window.confirm(
        `This list has ${existingSecretCount} existing secret${existingSecretCount === 1 ? "" : "s"}.\n\n` +
          `They will NOT be deleted — people with access can still open and edit them.\n\n` +
          `Only creating new secrets will be disabled. Continue?`,
      );
      if (!ok) return;
    }

    const prev = enabled;
    setEnabled(next);
    startTransition(async () => {
      try {
        await setListSecretsEnabled({ listId, enabled: next });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update");
        setEnabled(prev);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            <Lock className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Secrets</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {enabled
                ? "Space owners and granted people can store logins, passwords, and other sensitive info on tasks in this list."
                : "Creating new secrets is off. Existing ones stay available to people with access."}
            </p>
            {existingSecretCount > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {existingSecretCount} existing secret
                {existingSecretCount === 1 ? "" : "s"} on this list
                {!enabled && " — still visible to people with access"}
              </p>
            )}
          </div>
        </div>
        <Toggle
          checked={enabled}
          disabled={pending}
          onChange={toggle}
          label={enabled ? "Disable secrets" : "Enable secrets"}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
