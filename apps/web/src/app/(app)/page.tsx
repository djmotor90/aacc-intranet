/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, users } from "@aitim/db";
import { count, eq } from "drizzle-orm";
import { ArrowRight, ListChecks, Users as UsersIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/rbac";

export default async function HomePage() {
  const user = await requireUser();
  const [{ value: userCount }] = await db
    .select({ value: count() })
    .from(users)
    .where(eq(users.isActive, true));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold">Welcome, {user.name?.split(" ")[0]}</h1>
      <p className="mb-6 text-muted-foreground">AITIM Group Intranet</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/tasks" className="group">
          <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/50">
            <CardHeader>
              <div className="mb-1 flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ListChecks className="size-5" />
                </span>
                <ArrowRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
              <CardTitle>Tasks</CardTitle>
              <CardDescription>Safety department customer requests</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/directory" className="group">
          <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/50">
            <CardHeader>
              <div className="mb-1 flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <UsersIcon className="size-5" />
                </span>
                <ArrowRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
              <CardTitle>Directory</CardTitle>
              <CardDescription>{userCount} active colleagues</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
