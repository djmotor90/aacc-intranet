"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Eye, EyeOff, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSecret, getSecretForEdit, updateSecret } from "../actions";
import { SECRET_CATEGORY_TEMPLATES, SECRET_FIELD_TYPES, type SecretFieldInput } from "../lib/secret-fields";
import type { SecretCategoryRow } from "../queries";

const FIELD_TYPE_LABELS: Record<(typeof SECRET_FIELD_TYPES)[number], string> = {
  text: "Text",
  password: "Password",
  url: "URL",
  email: "Email",
  phone: "Phone",
  textarea: "Notes",
  date: "Date",
};

function newField(): SecretFieldInput {
  return { id: crypto.randomUUID(), label: "", type: "text", sensitive: false, value: "" };
}

function templateFields(categoryName: string | undefined): SecretFieldInput[] {
  const template = categoryName ? SECRET_CATEGORY_TEMPLATES[categoryName] : undefined;
  if (!template) return [newField()];
  return template.map((f) => ({ ...f, id: crypto.randomUUID(), value: "" }));
}

function FieldRow({
  field,
  onChange,
  onRemove,
}: {
  field: SecretFieldInput;
  onChange: (next: SecretFieldInput) => void;
  onRemove: () => void;
}) {
  const [showValue, setShowValue] = useState(!field.sensitive);

  return (
    <div className="flex flex-col gap-1.5 rounded-md border p-2.5">
      <div className="flex items-center gap-2">
        <Input
          value={field.label}
          onChange={(e) => onChange({ ...field, label: e.target.value })}
          placeholder="Field label"
          className="h-8 flex-1"
        />
        <select
          value={field.type}
          onChange={(e) => onChange({ ...field, type: e.target.value as SecretFieldInput["type"] })}
          className="h-8 rounded-md border bg-transparent px-2 text-xs"
        >
          {SECRET_FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {FIELD_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={field.sensitive}
            onChange={(e) => {
              const sensitive = e.target.checked;
              onChange({ ...field, sensitive });
              setShowValue(!sensitive);
            }}
          />
          Sensitive
        </label>
        <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={onRemove} aria-label="Remove field">
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>
      <div className="flex items-center gap-1.5">
        {field.type === "textarea" ? (
          <Textarea
            value={field.value}
            onChange={(e) => onChange({ ...field, value: e.target.value })}
            rows={2}
            className="text-sm"
          />
        ) : (
          <Input
            type={field.sensitive && !showValue ? "password" : field.type === "date" ? "date" : "text"}
            value={field.value}
            onChange={(e) => onChange({ ...field, value: e.target.value })}
            placeholder="Value"
            className="h-8"
          />
        )}
        {field.sensitive && field.type !== "textarea" && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => setShowValue((v) => !v)}
            aria-label={showValue ? "Hide value" : "Show value"}
          >
            {showValue ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </Button>
        )}
      </div>
    </div>
  );
}

export function SecretDialog({
  taskId,
  categories,
  secretId,
  trigger,
}: {
  taskId: string;
  categories: SecretCategoryRow[];
  /** Omit to create a new secret; pass an existing id to edit it. */
  secretId?: string;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [fields, setFields] = useState<SecretFieldInput[]>(() => templateFields(categories[0]?.name));

  const isEdit = !!secretId;

  // Reset (create) or load (edit) the form each time the dialog opens.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    if (!isEdit) {
      setTitle("");
      setCategoryId(categories[0]?.id ?? "");
      setFields(templateFields(categories[0]?.name));
      return;
    }
    setLoading(true);
    setError(null);
    getSecretForEdit(secretId!)
      .then((detail) => {
        setTitle(detail.title);
        setCategoryId(detail.categoryId);
        setFields(detail.fields);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load secret"))
      .finally(() => setLoading(false));
  }

  function onCategoryChange(next: string) {
    setCategoryId(next);
    if (!isEdit && fields.every((f) => !f.label && !f.value)) {
      const category = categories.find((c) => c.id === next);
      setFields(templateFields(category?.name));
    }
  }

  function submit() {
    const trimmedTitle = title.trim();
    const cleanFields = fields
      .map((f) => ({ ...f, label: f.label.trim() }))
      .filter((f) => f.label.length > 0);
    if (!trimmedTitle || !categoryId || cleanFields.length === 0) {
      setError("Title, category, and at least one labeled field are required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        if (isEdit) {
          await updateSecret({ secretId: secretId!, categoryId, title: trimmedTitle, fields: cleanFields });
        } else {
          await createSecret({ taskId, categoryId, title: trimmedTitle, fields: cleanFields });
        }
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save secret");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit secret" : "Add secret"}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="secret-title">Title</Label>
                <Input
                  id="secret-title"
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. TMS Password"
                  maxLength={150}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="secret-category">Category</Label>
                <select
                  id="secret-category"
                  value={categoryId}
                  onChange={(e) => onCategoryChange(e.target.value)}
                  className="h-9 rounded-md border bg-transparent px-3 text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Fields</Label>
              {fields.map((f) => (
                <FieldRow
                  key={f.id}
                  field={f}
                  onChange={(next) => setFields((cur) => cur.map((x) => (x.id === f.id ? next : x)))}
                  onRemove={() => setFields((cur) => cur.filter((x) => x.id !== f.id))}
                />
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start gap-1"
                onClick={() => setFields((cur) => [...cur, newField()])}
              >
                <Plus className="size-3.5" /> Add field
              </Button>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add secret"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
