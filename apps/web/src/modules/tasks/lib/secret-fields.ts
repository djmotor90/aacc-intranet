/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { z } from "zod";

/**
 * Types/constants shared by client components and server code. Deliberately
 * has no `@aitim/db` or crypto imports — those pull in `pg` (Node-only),
 * which breaks the browser bundle if a client component imports this
 * indirectly. Server-only DB access lives in `./secrets.ts`.
 */

export const SECRET_FIELD_TYPES = [
  "text",
  "password",
  "url",
  "email",
  "phone",
  "textarea",
  "date",
] as const;
export type SecretFieldType = (typeof SECRET_FIELD_TYPES)[number];

/** One field's shape + value, as submitted from the Add/Edit Secret dialog. */
export const secretFieldSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().min(1).max(100),
  type: z.enum(SECRET_FIELD_TYPES),
  sensitive: z.boolean(),
  value: z.string().max(5000),
});
export type SecretFieldInput = z.infer<typeof secretFieldSchema>;

/** Field metadata only — no value. Persisted as `secrets.fieldsSchema` (never encrypted). */
export type SecretFieldMeta = Omit<SecretFieldInput, "value">;

/** Seeded into a list's `secretCategories` the first time Secrets is enabled. */
export const DEFAULT_SECRET_CATEGORIES = [
  { name: "Logins", color: "#3b82f6" },
  { name: "Passwords", color: "#ef4444" },
  { name: "Banking", color: "#22c55e" },
  { name: "Insurance", color: "#8b5cf6" },
  { name: "Email", color: "#f97316" },
  { name: "Other", color: "#64748b" },
] as const;

/** Field templates offered when a category is picked in the Add Secret dialog. */
export const SECRET_CATEGORY_TEMPLATES: Record<string, Omit<SecretFieldMeta, "id">[]> = {
  Logins: [
    { label: "Username", type: "text", sensitive: false },
    { label: "Password", type: "password", sensitive: true },
    { label: "URL", type: "url", sensitive: false },
  ],
  Passwords: [{ label: "Password", type: "password", sensitive: true }],
  Banking: [
    { label: "Bank name", type: "text", sensitive: false },
    { label: "Account number", type: "password", sensitive: true },
    { label: "Routing number", type: "password", sensitive: true },
  ],
  Insurance: [
    { label: "Provider", type: "text", sensitive: false },
    { label: "Policy number", type: "text", sensitive: false },
    { label: "Expiry date", type: "date", sensitive: false },
  ],
  Email: [
    { label: "Email", type: "email", sensitive: false },
    { label: "Password", type: "password", sensitive: true },
  ],
  Other: [{ label: "Value", type: "text", sensitive: false }],
};

/** A field as shown before "Reveal" — sensitive values are stripped, never sent to the client. */
export type RedactedSecretField = SecretFieldMeta & { value: string | null };

export interface SecretRow {
  id: string;
  taskId: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  title: string;
  fields: RedactedSecretField[];
  updatedAt: Date;
  updatedByName: string | null;
}
