/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PublicFormClient } from "@/modules/tasks/components/public-form-client";
import { parseFormTheme } from "@/modules/tasks/lib/form-types";
import { getFormBySlug } from "@/modules/tasks/queries";
import { MAIN_CONTENT_ID } from "@/components/a11y";
import { cn } from "@/lib/utils";

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const form = await getFormBySlug(slug);
  if (!form) return { title: "Form" };
  return {
    title: form.title,
    description: form.introMd?.slice(0, 160) || "Submit a request",
    robots: { index: false, follow: false },
  };
}

export default async function PublicFormPage(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const form = await getFormBySlug(slug);
  if (!form) notFound();

  const theme = parseFormTheme(
    "theme" in form ? (form as { theme?: unknown }).theme : {},
  );

  const embed =
    sp.embed === "1" ||
    sp.embed === "true" ||
    (Array.isArray(sp.embed) && (sp.embed[0] === "1" || sp.embed[0] === "true"));

  return (
    <main
      id={MAIN_CONTENT_ID}
      tabIndex={-1}
      className={cn("min-h-screen outline-none", embed && "min-h-0")}
      style={{
        background: embed ? "transparent" : theme.backgroundColor,
        color: theme.textColor,
      }}
    >
      <div
        className={cn(
          "mx-auto flex w-full justify-center px-4",
          embed ? "py-3 sm:py-4" : "py-10 sm:py-16",
        )}
      >
        <Suspense fallback={<div className="h-40 w-full max-w-lg animate-pulse rounded-xl bg-black/5" />}>
          <PublicFormClient
            slug={form.slug}
            title={form.title}
            introMd={form.introMd}
            fields={form.fields}
            successMessage={form.successMessage}
            isActive={form.isActive}
            allowAttachments={form.allowAttachments}
            maxAttachments={form.maxAttachments}
            theme={theme}
            embed={embed}
          />
        </Suspense>
      </div>
    </main>
  );
}
