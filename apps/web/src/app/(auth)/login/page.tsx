/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { auth, signIn } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to AACC Operations Hub with your work account",
  openGraph: {
    title: "AACC Operations Hub",
    description: "A shared workspace for AACC workflows, knowledge, and collaboration.",
  },
};

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/");

  const devAuth = process.env.DEV_AUTH === "true" && process.env.NODE_ENV !== "production";
  const entraEnabled = Boolean(
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER?.trim() ||
      process.env.AUTH_MICROSOFT_ENTRA_ID_ID?.trim(),
  );

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-brand-aqua/35 p-4 dark:bg-background">
      <div className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-16 size-80 rounded-full bg-brand-orange/15 blur-3xl" />
      <div className="absolute inset-x-0 top-0 h-2 bg-primary">
        <div className="ml-auto h-full w-1/4 bg-brand-orange" />
      </div>
      <Card className="relative w-full max-w-md border-primary/15 bg-card/95 shadow-2xl shadow-brand-teal-deep/15 backdrop-blur">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-full max-w-[260px] rounded-md bg-white p-3 shadow-sm ring-1 ring-black/5">
            <Image
              src="/brand/aacc-logo.jpg"
              alt="Anne Arundel Community College"
              width={1263}
              height={715}
              className="h-auto w-full"
              priority
            />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary">Operations Hub</p>
          <CardTitle className="mt-1 text-2xl">Welcome back</CardTitle>
          <CardDescription>
            {entraEnabled
              ? "Sign in with your work account"
              : devAuth
                ? "Local development sign-in"
                : "Sign in"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {entraEnabled && (
            <form
              action={async () => {
                "use server";
                await signIn("microsoft-entra-id", { redirectTo: "/" });
              }}
            >
              <Button type="submit" className="w-full">
                <svg className="mr-2 size-4" viewBox="0 0 21 21" aria-hidden>
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
                Continue with Microsoft
              </Button>
            </form>
          )}

          {devAuth && (
            <form
              className={`flex flex-col gap-2 ${entraEnabled ? "border-t pt-4" : ""}`}
              action={async (formData: FormData) => {
                "use server";
                await signIn("dev", {
                  email: String(formData.get("email") ?? ""),
                  password: String(formData.get("password") ?? ""),
                  redirectTo: "/",
                });
              }}
            >
              <Input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="you@aacc.edu"
                required
              />
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Password"
              />
              <Button type="submit" variant={entraEnabled ? "secondary" : "default"} className="w-full">
                Sign in
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
