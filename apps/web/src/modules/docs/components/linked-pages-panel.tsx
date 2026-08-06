/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { pagePath } from "@/modules/docs/lib/constants";
import type { DocPageListItem } from "@/modules/docs/queries";
import { CreatePageDialog } from "./create-page-dialog";

/**
 * Mounted from App Router on task/list pages (composition bridge).
 * Does not import tasks module internals.
 */
export function LinkedPagesPanel({
  pages,
  spaces,
  defaultSpaceId,
  linkTargetType,
  linkTargetId,
  title = "Docs",
}: {
  pages: DocPageListItem[];
  spaces: { id: string; name: string }[];
  defaultSpaceId?: string;
  linkTargetType: "space" | "folder" | "list" | "task";
  linkTargetId: string;
  title?: string;
}) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <FileText className="size-4 text-muted-foreground" />
          {title}
        </h2>
        <CreatePageDialog
          spaces={spaces}
          defaultSpaceId={defaultSpaceId}
          linkTargetType={linkTargetType}
          linkTargetId={linkTargetId}
          trigger={
            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs">
              <Plus className="size-3.5" />
              New
            </Button>
          }
        />
      </div>
      {pages.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          No linked pages. Create a runbook or SOP for this work.
        </p>
      ) : (
        <ul className="divide-y">
          {pages.map((p) => (
            <li key={p.id}>
              <Link
                href={pagePath(p.id, p.slug)}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/60"
              >
                <span className="text-base leading-none">{p.icon ?? "📄"}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
                {p.isStale && (
                  <span className="shrink-0 text-[10px] font-medium uppercase text-amber-700 dark:text-amber-300">
                    Stale
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
