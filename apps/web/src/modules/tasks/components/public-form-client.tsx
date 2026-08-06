"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  answersFromSearchParams,
  formWidthClass,
  parseFormFields,
  parseFormTheme,
  type FormTheme,
} from "../lib/form-types";
import { FormPreview, type FormSubmitFile } from "./form-view-panel";
import { cn } from "@/lib/utils";

export function PublicFormClient({
  slug,
  title,
  introMd,
  fields,
  successMessage,
  isActive,
  allowAttachments,
  maxAttachments,
  theme: themeRaw,
  embed,
}: {
  slug: string;
  title: string;
  introMd: string | null;
  fields: unknown;
  successMessage: string | null;
  isActive: boolean;
  allowAttachments: boolean;
  maxAttachments: number;
  theme?: unknown;
  embed?: boolean;
}) {
  const searchParams = useSearchParams();
  const allFields = useMemo(() => parseFormFields(fields), [fields]);
  const theme: FormTheme = useMemo(() => parseFormTheme(themeRaw), [themeRaw]);
  const prefill = useMemo(
    () => answersFromSearchParams(allFields, searchParams),
    [allFields, searchParams],
  );

  const logoSrc = theme.logoObjectKey
    ? `/api/forms/${encodeURIComponent(slug)}/logo?v=${encodeURIComponent(theme.logoObjectKey)}`
    : theme.logoUrl || null;

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [taskNumber, setTaskNumber] = useState<string | null>(null);

  if (!isActive) {
    return (
      <div
        className={cn("border p-8 text-center shadow-sm", formWidthClass(theme.width))}
        style={{
          background: theme.cardColor,
          color: theme.textColor,
          borderColor: `${theme.mutedColor}33`,
          borderRadius: theme.radius === "md" ? 12 : theme.radius === "xl" ? 16 : 24,
        }}
      >
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm" style={{ color: theme.mutedColor }}>
          This form is not accepting submissions right now.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("w-full", formWidthClass(theme.width), embed ? "" : "space-y-3")}>
      <FormPreview
        title={title}
        introMd={introMd}
        fields={allFields}
        initialValues={prefill}
        allowAttachments={allowAttachments}
        maxAttachments={maxAttachments}
        theme={theme}
        logoSrc={logoSrc}
        submitting={submitting}
        success={success}
        successMessage={
          taskNumber
            ? `${successMessage || "Thanks — we received your request."} (Ref: ${taskNumber})`
            : successMessage
        }
        onSubmit={async (answers, files: FormSubmitFile[]) => {
          setSubmitting(true);
          try {
            let res: Response;
            if (files.length > 0) {
              const fd = new FormData();
              fd.set("answers", JSON.stringify(answers));
              for (const { fieldId, file } of files) {
                if (fieldId) {
                  fd.append(`file_${fieldId}`, file, file.name);
                } else {
                  fd.append("file", file, file.name);
                }
              }
              res = await fetch(`/api/forms/${encodeURIComponent(slug)}/submit`, {
                method: "POST",
                body: fd,
              });
            } else {
              res = await fetch(`/api/forms/${encodeURIComponent(slug)}/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answers }),
              });
            }
            const data = (await res.json()) as {
              ok?: boolean;
              error?: string;
              taskNumber?: string;
            };
            if (!res.ok || !data.ok) {
              toast.error(data.error || "Submission failed");
              return;
            }
            setTaskNumber(data.taskNumber ?? null);
            setSuccess(true);
          } catch {
            toast.error("Network error — try again");
          } finally {
            setSubmitting(false);
          }
        }}
      />
      {!embed && theme.showBranding && (
        <p
          className="mt-6 text-center text-[11px]"
          style={{ color: theme.mutedColor }}
        >
          Powered by AITIM Intranet
        </p>
      )}
    </div>
  );
}
