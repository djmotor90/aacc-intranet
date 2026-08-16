"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Check } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PathBar({
  steps,
  current,
  onSelect,
  completeLabel = "Mark stage as complete",
}: {
  steps: readonly { id: string; label: string }[];
  current: string;
  onSelect: (id: string) => Promise<void>;
  completeLabel?: string;
}) {
  const [pending, startTransition] = useTransition();
  const index = Math.max(0, steps.findIndex((s) => s.id === current));
  const next = steps[index + 1];

  function go(id: string) {
    startTransition(async () => {
      try {
        await onSelect(id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not update stage");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <ol className="flex min-w-0 flex-1 flex-wrap" aria-label="Record path">
        {steps.map((step, i) => {
          const done = i < index;
          const active = i === index;
          return (
            <li key={step.id} className="flex min-w-0 flex-1">
              <button
                type="button"
                disabled={pending}
                onClick={() => go(step.id)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "relative flex min-h-9 w-full items-center justify-center gap-1 px-3 text-center text-[11px] font-semibold",
                  "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  done && "bg-success text-success-foreground",
                  active && "bg-brand-teal-deep text-white",
                  !done && !active && "bg-muted text-foreground",
                )}
                style={{
                  clipPath:
                    i === steps.length - 1
                      ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 10px 50%)"
                      : i === 0
                        ? "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)"
                        : "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)",
                }}
              >
                {done && <Check className="size-3 shrink-0" aria-hidden />}
                <span className="truncate px-0.5">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {next && (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => go(next.id)}
          className="shrink-0"
        >
          <Check className="size-3.5" aria-hidden />
          {completeLabel}
        </Button>
      )}
    </div>
  );
}
