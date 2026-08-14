/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { EeDictionaryShell } from "@/modules/ee-dictionary/components/ee-dictionary-shell";
import { getEeSearchIndex } from "@/modules/ee-dictionary/queries";

export default async function EeDictionaryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (user.platformRole !== "admin") notFound();

  const index = await getEeSearchIndex();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="mb-3">
        <h1 className="text-xl font-semibold">EE Data Dictionary</h1>
        <p className="text-sm text-muted-foreground">
          Lifelong Learning Extended Education — SQL Server schema reference
        </p>
      </div>
      <EeDictionaryShell index={index}>{children}</EeDictionaryShell>
    </div>
  );
}
