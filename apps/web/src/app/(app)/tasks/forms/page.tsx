/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { ClipboardList, ExternalLink, Paperclip } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/rbac";
import { getFormsHubForUser } from "@/modules/tasks/queries";

export default async function FormsHubPage() {
  const user = await requireUser();
  const forms = await getFormsHubForUser(user);

  const publicBaseUrl =
    process.env.AUTH_URL?.replace(/\/$/, "") ||
    process.env.APP_BASE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-2">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ClipboardList className="size-6" />
          Forms Hub
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All intake forms across lists you can access. Create a form from a list&apos;s{" "}
          <strong>+ View → Form</strong>, or right-click a space/list → <strong>New Form</strong>.
        </p>
      </div>

      {forms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No forms yet. Open a list and add a Form view to start capturing requests as tasks.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link href="/tasks">Go to Tasks</Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {forms.map((form) => {
            const openHref = form.listViewId
              ? `/tasks/${form.spaceSlug}/${form.listSlug}?v=${form.listViewId}&view=form`
              : `/tasks/${form.spaceSlug}/${form.listSlug}`;
            const publicUrl = `${publicBaseUrl}/forms/${form.slug}`;
            return (
              <li
                key={form.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={openHref}
                      className="truncate font-medium hover:underline"
                    >
                      {form.title}
                    </Link>
                    <Badge variant={form.isActive ? "default" : "secondary"}>
                      {form.isActive ? "Live" : "Paused"}
                    </Badge>
                    {form.allowAttachments && (
                      <Badge variant="outline" className="gap-1 font-normal">
                        <Paperclip className="size-3" />
                        Files
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {form.spaceName} / {form.listName}
                    {" · "}
                    {form.submissionCount} submission
                    {form.submissionCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button asChild size="sm" variant="secondary">
                    <Link href={openHref}>Edit</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={publicUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-3.5" />
                      Public
                    </a>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
