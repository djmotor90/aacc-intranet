"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CORE_FIELD_KEYS,
  CORE_FIELD_LABELS,
  type CoreFieldKey,
} from "@/modules/tasks/lib/required-fields";
import { setFieldRequired, setRequiredCoreFields } from "../actions";
import { cn } from "@/lib/utils";

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
          checked ? "translate-x-[18px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

export type RequiredFieldDef = {
  id: string;
  label: string;
  description?: string | null;
  type: string;
  isRequired: boolean;
  isArchived: boolean;
};

export function RequiredFieldsSettings({
  listId,
  initialCoreRequired,
  fieldDefs,
}: {
  listId: string;
  initialCoreRequired: CoreFieldKey[];
  fieldDefs: RequiredFieldDef[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [core, setCore] = useState<Set<CoreFieldKey>>(() => new Set(initialCoreRequired));
  const [custom, setCustom] = useState(() =>
    Object.fromEntries(fieldDefs.map((f) => [f.id, f.isRequired])) as Record<string, boolean>,
  );
  const [error, setError] = useState<string | null>(null);

  function toggleCore(key: CoreFieldKey, next: boolean) {
    setError(null);
    const nextSet = new Set(core);
    if (next) nextSet.add(key);
    else nextSet.delete(key);
    setCore(nextSet);
    startTransition(async () => {
      try {
        await setRequiredCoreFields({ listId, fields: [...nextSet] });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update");
        setCore(core); // revert
      }
    });
  }

  function toggleCustom(fieldId: string, next: boolean) {
    setError(null);
    setCustom((prev) => ({ ...prev, [fieldId]: next }));
    startTransition(async () => {
      try {
        await setFieldRequired({ fieldId, isRequired: next });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update");
        setCustom((prev) => ({ ...prev, [fieldId]: !next }));
      }
    });
  }

  const activeCustom = fieldDefs.filter((f) => !f.isArchived);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-sm font-semibold">Required on task creation</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Toggle which fields must be filled when someone creates a task on this list. Title is
          always required.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Default fields
        </div>
        <ul className="divide-y rounded-lg border">
          <li className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div>
              <div className="text-sm font-medium">Title</div>
              <div className="text-xs text-muted-foreground">Always required</div>
            </div>
            <Badge variant="secondary">Required</Badge>
          </li>
          {CORE_FIELD_KEYS.map((key) => (
            <li key={key} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="text-sm font-medium">{CORE_FIELD_LABELS[key]}</div>
              <Toggle
                checked={core.has(key)}
                disabled={pending}
                label={`Require ${CORE_FIELD_LABELS[key]}`}
                onChange={(next) => toggleCore(key, next)}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Custom fields
        </div>
        {activeCustom.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No custom fields yet — add one below, then mark it required here.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {activeCustom.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{f.label}</div>
                  {f.description && (
                    <div className="line-clamp-2 text-xs text-muted-foreground">
                      {f.description}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">{f.type}</div>
                </div>
                <Toggle
                  checked={!!custom[f.id]}
                  disabled={pending}
                  label={`Require ${f.label}`}
                  onChange={(next) => toggleCustom(f.id, next)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {pending && (
        <p className="text-xs text-muted-foreground">
          <Button variant="ghost" size="sm" className="pointer-events-none h-auto p-0 text-xs" disabled>
            Saving…
          </Button>
        </p>
      )}
    </div>
  );
}
