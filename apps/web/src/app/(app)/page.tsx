/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, users } from "@aitim/db";
import { count, eq } from "drizzle-orm";
import { ArrowRight, FileText, ListChecks, Users as UsersIcon } from "lucide-react";
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
    <div className="mx-auto max-w-5xl">
      <section className="relative mb-7 overflow-hidden rounded-2xl bg-brand-teal-deep px-6 py-8 text-white shadow-lg shadow-brand-teal-deep/15 sm:px-8">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-brand-orange" />
        <div className="absolute -right-16 -top-24 size-72 rounded-full border-[44px] border-white/5" />
        <p className="relative mb-2 text-xs font-bold uppercase tracking-[0.24em] text-brand-aqua">
          AACC Operations Hub
        </p>
        <h1 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">
          Welcome, {user.name?.split(" ")[0]}
        </h1>
        <p className="relative mt-3 max-w-2xl text-sm leading-6 text-white/75 sm:text-base">
          Coordinate work, find trusted knowledge, and keep college operations moving in one
          shared workspace.
        </p>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/tasks" className="group">
          <Card className="h-full border-t-4 border-t-primary transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
            <CardHeader>
              <div className="mb-1 flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ListChecks className="size-5" />
                </span>
                <ArrowRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
              <CardTitle>Tasks</CardTitle>
              <CardDescription>Coordinate requests, projects, and operational work</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/docs" className="group">
          <Card className="h-full border-t-4 border-t-brand-orange transition-all hover:-translate-y-0.5 hover:border-brand-orange/40 hover:shadow-md">
            <CardHeader>
              <div className="mb-1 flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-brand-orange">
                  <FileText className="size-5" />
                </span>
                <ArrowRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
              <CardTitle>Docs</CardTitle>
              <CardDescription>Find and build shared knowledge connected to the work</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/directory" className="group">
          <Card className="h-full border-t-4 border-t-brand-teal-deep transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
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
