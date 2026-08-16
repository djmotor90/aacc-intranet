"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { updateQuoteStatus } from "../actions";
import { QUOTE_STATUSES, type QuoteStatus } from "../lib/stages";

export function QuoteStatusSelect({ quoteId, status }: { quoteId: string; status: QuoteStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="grid max-w-xs gap-1.5 text-sm">
      <span className="text-xs text-muted-foreground">Quote status</span>
      <select
        value={status}
        disabled={pending}
        className="h-8 rounded-md border bg-transparent px-2"
        onChange={(e) => {
          startTransition(async () => {
            await updateQuoteStatus(quoteId, e.target.value as QuoteStatus);
            router.refresh();
          });
        }}
      >
        {QUOTE_STATUSES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
