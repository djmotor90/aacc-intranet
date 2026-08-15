"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  AtSign,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Code2,
  Eye,
  EyeOff,
  GitBranch,
  Hash,
  Heading1,
  Link2,
  ListChecks,
  Mail,
  Paperclip,
  Phone,
  Plus,
  Settings2,
  TextCursorInput,
  ToggleLeft,
  Trash2,
  Type,
  Users,
  AlignLeft,
  ExternalLink,
  ImageIcon,
  Info,
  Palette,
  Sparkles,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ensureContrast, solidChipStyle, tintedChipStyle } from "@/lib/color-contrast";
import { cn } from "@/lib/utils";
import {
  clearFormLogo,
  ensureListFileCustomField,
  regenerateFormSlug,
  updateFormFields,
  updateFormSettings,
  uploadFormLogo,
} from "../actions";
import {
  DEFAULT_FORM_THEME,
  embedIframeSnippet,
  fieldPrefillKey,
  formRadiusClass,
  formThemeCssVars,
  formWidthClass,
  FORM_CONDITION_OPS,
  FORM_CORE_TARGETS,
  FORM_LOGO_POSITIONS,
  FORM_RADIUS,
  FORM_WIDTHS,
  isDisplayField,
  parseDefaultAssigneeIds,
  parseFormFields,
  parseFormTheme,
  visibleFormFields,
  type FormConditionOp,
  type FormCoreTarget,
  type FormField,
  type FormFieldType,
  type FormTheme,
} from "../lib/form-types";
import type { PublicFormRow } from "../queries";

type FieldDefOption = {
  id: string;
  label: string;
  type: string;
  options?: unknown;
  isArchived?: boolean;
};

type StatusOption = { id: string; name: string; color: string };
type UserOption = { id: string; displayName: string };

const CORE_LABELS: Record<FormCoreTarget, string> = {
  title: "Task name",
  description: "Description",
  priority: "Priority",
  due_date: "Due date",
};

const OP_LABELS: Record<FormConditionOp, string> = {
  eq: "equals",
  neq: "does not equal",
  contains: "contains",
  empty: "is empty",
  not_empty: "is not empty",
};

const TYPE_META: Record<
  FormFieldType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  text: { label: "Short text", icon: Type },
  textarea: { label: "Long text", icon: AlignLeft },
  email: { label: "Email", icon: Mail },
  number: { label: "Number", icon: Hash },
  date: { label: "Date", icon: Calendar },
  dropdown: { label: "Dropdown", icon: ListChecks },
  checkbox: { label: "Checkbox", icon: ToggleLeft },
  url: { label: "URL", icon: Link2 },
  phone: { label: "Phone", icon: Phone },
  file: { label: "Files", icon: Paperclip },
  heading: { label: "Heading", icon: Heading1 },
  paragraph: { label: "Instructions", icon: Info },
};

function mapSummary(field: FormField, fieldDefs: FieldDefOption[]): string {
  if (isDisplayField(field)) {
    return field.type === "heading" ? "Section heading" : "Instructions only";
  }
  if (field.mapTo.kind === "core") return CORE_LABELS[field.mapTo.target];
  const mapTo = field.mapTo;
  if (mapTo.kind === "custom_field") {
    const d = fieldDefs.find((x) => x.id === mapTo.definitionId);
    return d ? d.label : "Custom field";
  }
  return "—";
}

function SegmentedTabs({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { id: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-full border border-border/80 bg-muted/50 p-1 shadow-sm">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "rounded-full px-4 py-1.5 text-xs font-medium transition-all",
            value === item.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Avoid `disabled={false}` which hydrates as `null` vs boolean on some React builds.
 * Only pass the attribute when true.
 */
function isDisabled(condition: boolean): true | undefined {
  return condition ? true : undefined;
}

function ShowWhenEditor({
  field,
  fields,
  pending,
  onChange,
  onValueDraft,
  onValueBlur,
}: {
  field: FormField;
  fields: FormField[];
  pending: boolean;
  onChange: (showWhen: FormField["showWhen"]) => void;
  onValueDraft: (value: string) => void;
  onValueBlur: () => void;
}) {
  return (
    <div>
      <Label className="mb-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
        <GitBranch className="size-3" />
        Show only when
      </Label>
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          className="h-8 max-w-[11rem] rounded-lg border border-input bg-background px-2 text-xs"
          value={field.showWhen?.fieldId ?? ""}
          disabled={pending}
          onChange={(e) => {
            const fieldId = e.target.value;
            if (!fieldId) {
              onChange(null);
              return;
            }
            onChange({
              fieldId,
              op: field.showWhen?.op ?? "eq",
              value: field.showWhen?.value ?? "",
            });
          }}
        >
          <option value="">Always show</option>
          {fields
            .filter((f) => f.id !== field.id && !isDisplayField(f))
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
        </select>
        {field.showWhen && (
          <>
            <select
              className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
              value={field.showWhen.op}
              disabled={pending}
              onChange={(e) =>
                onChange({
                  ...field.showWhen!,
                  op: e.target.value as FormConditionOp,
                })
              }
            >
              {FORM_CONDITION_OPS.map((op) => (
                <option key={op} value={op}>
                  {OP_LABELS[op]}
                </option>
              ))}
            </select>
            {field.showWhen.op !== "empty" && field.showWhen.op !== "not_empty" && (
              <Input
                className="h-8 w-28 bg-background text-xs"
                value={field.showWhen.value ?? ""}
                placeholder="value"
                disabled={pending}
                onChange={(e) => onValueDraft(e.target.value)}
                onBlur={onValueBlur}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function FormViewPanel({
  form,
  fieldDefs,
  statuses,
  users,
  submissionCount,
  canEdit,
  publicBaseUrl,
}: {
  form: PublicFormRow;
  fieldDefs: FieldDefOption[];
  statuses: StatusOption[];
  users: UserOption[];
  submissionCount: number;
  canEdit: boolean;
  publicBaseUrl: string;
}) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(form.title);
  const [introMd, setIntroMd] = useState(form.introMd ?? "");
  const [successMessage, setSuccessMessage] = useState(
    form.successMessage ?? "Thanks — we received your request.",
  );
  const [isActive, setIsActive] = useState(form.isActive);
  const [notifyRole, setNotifyRole] = useState<"owner" | "member">(
    form.notifySpaceRole === "member" ? "member" : "owner",
  );
  const [defaultStatusId, setDefaultStatusId] = useState(form.defaultStatusId ?? "");
  const [defaultAssigneeIds, setDefaultAssigneeIds] = useState<string[]>(() =>
    parseDefaultAssigneeIds(form.defaultAssigneeIds),
  );
  const [allowAttachments, setAllowAttachments] = useState(form.allowAttachments);
  const [maxAttachments, setMaxAttachments] = useState(form.maxAttachments ?? 5);
  const [fields, setFields] = useState<FormField[]>(() => parseFormFields(form.fields));
  const [theme, setTheme] = useState<FormTheme>(() => parseFormTheme(form.theme));
  const [slug, setSlug] = useState(form.slug);
  const [tab, setTab] = useState<"build" | "preview" | "share">("build");
  const [railTab, setRailTab] = useState<"fields" | "settings" | "design">("fields");
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const publicUrl = `${publicBaseUrl.replace(/\/$/, "")}/forms/${slug}`;
  const embedCode = embedIframeSnippet(publicUrl);
  const logoSrc = theme.logoObjectKey
    ? `/api/forms/${encodeURIComponent(slug)}/logo?v=${encodeURIComponent(theme.logoObjectKey)}`
    : theme.logoUrl || null;

  function saveTheme(patch: Partial<FormTheme>) {
    const next = parseFormTheme({ ...theme, ...patch });
    setTheme(next);
    startTransition(async () => {
      try {
        await updateFormSettings({ formId: form.id, theme: next });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save design");
      }
    });
  }

  const activeDefs = useMemo(
    () => fieldDefs.filter((d) => !d.isArchived),
    [fieldDefs],
  );

  /** Stable for SSR + client — which core targets are already on the form. */
  const coreTargetsPresent = useMemo(() => {
    const set = new Set<FormCoreTarget>();
    for (const f of fields) {
      if (f.mapTo.kind === "core") set.add(f.mapTo.target);
    }
    return set;
  }, [fields]);

  const customFieldIdsPresent = useMemo(() => {
    const set = new Set<string>();
    for (const f of fields) {
      if (f.mapTo.kind === "custom_field") set.add(f.mapTo.definitionId);
    }
    return set;
  }, [fields]);

  function saveSettings(patch?: Partial<Parameters<typeof updateFormSettings>[0]>) {
    startTransition(async () => {
      try {
        await updateFormSettings({
          formId: form.id,
          title,
          introMd: introMd || null,
          successMessage: successMessage || null,
          isActive,
          notifySpaceRole: notifyRole,
          defaultStatusId: defaultStatusId || null,
          defaultAssigneeIds,
          allowAttachments,
          maxAttachments,
          ...patch,
        });
        toast.success("Saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  function saveFields(next: FormField[]) {
    setFields(next);
    startTransition(async () => {
      try {
        await updateFormFields(form.id, next);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save questions");
      }
    });
  }

  function addCoreQuestion(target: FormCoreTarget) {
    // Avoid duplicate cores (e.g. two titles).
    if (
      fields.some(
        (f) => f.mapTo.kind === "core" && f.mapTo.target === target,
      )
    ) {
      toast.message(`${CORE_LABELS[target]} is already on this form`);
      return;
    }
    const type: FormFieldType =
      target === "description"
        ? "textarea"
        : target === "due_date"
          ? "date"
          : target === "priority"
            ? "dropdown"
            : "text";
    const field: FormField = {
      id: crypto.randomUUID(),
      label: CORE_LABELS[target],
      type,
      required: target === "title",
      mapTo: { kind: "core", target },
      ...(target === "priority"
        ? {
            options: [
              { id: "urgent", label: "Urgent" },
              { id: "high", label: "High" },
              { id: "normal", label: "Normal" },
              { id: "low", label: "Low" },
            ],
          }
        : {}),
    };
    const next = [...fields, field];
    saveFields(next);
    setSelectedId(field.id);
    setExpandedId(null);
  }

  function addDisplayBlock(kind: "heading" | "paragraph") {
    const field: FormField = {
      id: crypto.randomUUID(),
      label:
        kind === "heading"
          ? "Section title"
          : "Add instructions or notes for the person filling this form…",
      type: kind,
      required: false,
      mapTo: { kind: "display" },
    };
    const next = [...fields, field];
    saveFields(next);
    setSelectedId(field.id);
    setExpandedId(field.id);
  }

  function addCustomQuestion(def: FieldDefOption) {
    if (
      fields.some(
        (f) =>
          f.mapTo.kind === "custom_field" && f.mapTo.definitionId === def.id,
      )
    ) {
      toast.message(`“${def.label}” is already on this form`);
      return;
    }
    const typeMap: Record<string, FormFieldType> = {
      text: "text",
      textarea: "textarea",
      email: "email",
      number: "number",
      date: "date",
      dropdown: "dropdown",
      multi_select: "dropdown",
      checkbox: "checkbox",
      url: "url",
      phone: "phone",
      color: "dropdown",
      user: "text",
      file: "file",
    };
    const type = typeMap[def.type] ?? "text";
    const rawOpts = Array.isArray(def.options) ? def.options : [];
    const opts = rawOpts
      .filter((o): o is { id: string; label: string } =>
        Boolean(o && typeof o === "object" && "id" in o && "label" in o),
      )
      .map((o) => ({ id: String(o.id), label: String(o.label) }));
    const field: FormField = {
      id: crypto.randomUUID(),
      label: def.label,
      type,
      required: false,
      mapTo: { kind: "custom_field", definitionId: def.id },
      ...(opts.length > 0 && type !== "file" ? { options: opts } : {}),
    };
    const next = [...fields, field];
    saveFields(next);
    setSelectedId(field.id);
  }

  /** Ensure a Files custom field exists on the list, then add the form question. */
  function addFileQuestion() {
    startTransition(async () => {
      try {
        const { definitionId, created } = await ensureListFileCustomField({
          listId: form.listId,
          label: "Files",
        });
        if (
          fields.some(
            (f) =>
              f.mapTo.kind === "custom_field" &&
              f.mapTo.definitionId === definitionId,
          )
        ) {
          toast.message("Files question is already on this form");
          return;
        }
        const field: FormField = {
          id: crypto.randomUUID(),
          label: "Files",
          type: "file",
          required: false,
          mapTo: { kind: "custom_field", definitionId },
        };
        saveFields([...fields, field]);
        setSelectedId(field.id);
        toast.success(
          created
            ? "Added Files field to the list and form"
            : "Added Files question",
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not add file field");
      }
    });
  }

  function patchField(id: string, patch: Partial<FormField>, persist = false) {
    setFields((prev) => {
      const next = prev.map((f) => (f.id === id ? { ...f, ...patch } : f));
      if (persist) {
        // Defer so we don't call startTransition during render of setState updater.
        queueMicrotask(() => saveFields(next));
      }
      return next;
    });
  }

  function persistFieldsNow() {
    setFields((prev) => {
      queueMicrotask(() => saveFields(prev));
      return prev;
    });
  }

  function removeField(id: string) {
    const next = fields
      .filter((f) => f.id !== id)
      .map((f) => (f.showWhen?.fieldId === id ? { ...f, showWhen: null } : f));
    if (!next.some((f) => f.mapTo.kind === "core" && f.mapTo.target === "title")) {
      toast.error("Keep at least one question mapped to the task title");
      return;
    }
    saveFields(next);
    if (selectedId === id) setSelectedId(null);
  }

  function moveField(id: string, dir: -1 | 1) {
    const idx = fields.findIndex((f) => f.id === id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[idx], next[j]] = [next[j], next[idx]];
    saveFields(next);
  }

  function copyText(text: string, kind: "link" | "embed") {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(kind);
      toast.success(kind === "link" ? "Link copied" : "Embed code copied");
      setTimeout(() => setCopied(null), 1500);
    });
  }

  function regenSlug() {
    startTransition(async () => {
      try {
        const r = await regenerateFormSlug(form.id);
        setSlug(r.slug);
        toast.success("New public link generated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not regenerate link");
      }
    });
  }

  function toggleAssignee(userId: string) {
    setDefaultAssigneeIds((prev) => {
      const next = prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId];
      startTransition(async () => {
        try {
          await updateFormSettings({ formId: form.id, defaultAssigneeIds: next });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Failed");
        }
      });
      return next;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Top chrome ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={!canEdit || pending}
            onClick={() => {
              const v = !isActive;
              setIsActive(v);
              startTransition(async () => {
                try {
                  await updateFormSettings({ formId: form.id, isActive: v });
                  toast.success(v ? "Form is live" : "Form paused");
                } catch {
                  setIsActive(!v);
                }
              });
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
              isActive
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                isActive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50",
              )}
            />
            {isActive ? "Live" : "Paused"}
          </button>
          <span className="text-xs text-muted-foreground">
            {submissionCount} response{submissionCount === 1 ? "" : "s"}
          </span>
        </div>

        <SegmentedTabs
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          items={[
            { id: "build", label: "Build" },
            { id: "preview", label: "Preview" },
            { id: "share", label: "Share" },
          ]}
        />
      </div>

      {/* ── Build ── */}
      {tab === "build" && (
        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1fr_280px] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border/80 lg:bg-muted/20">
          {/* Canvas */}
          <div className="min-h-0 overflow-y-auto lg:border-r lg:border-border/60">
            <div className="mx-auto flex max-w-xl flex-col gap-4 px-3 py-5 sm:px-6">
              {/* Form header card */}
              <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
                <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="size-3.5" />
                  Form
                </div>
                <input
                  value={title}
                  disabled={!canEdit || pending}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => canEdit && saveSettings()}
                  placeholder="Untitled form"
                  className="w-full border-0 bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/40"
                />
                <textarea
                  value={introMd}
                  disabled={!canEdit || pending}
                  onChange={(e) => setIntroMd(e.target.value)}
                  onBlur={() => canEdit && saveSettings()}
                  placeholder="Add a short description for people filling this out…"
                  rows={2}
                  className="mt-2 w-full resize-none border-0 bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/45"
                />
              </div>

              {/* Questions */}
              <div className="flex flex-col gap-3">
                {fields.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
                    <TextCursorInput className="mx-auto mb-3 size-8 text-muted-foreground/50" />
                    <p className="text-sm font-medium">No questions yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Pick a field from the panel on the right to start building.
                    </p>
                  </div>
                )}

                {fields.map((field, index) => {
                  const meta = TYPE_META[field.type] ?? TYPE_META.text;
                  const Icon = meta.icon;
                  const selected = selectedId === field.id;
                  const expanded = expandedId === field.id;
                  const display = isDisplayField(field);
                  const questionNumber = fields
                    .slice(0, index + 1)
                    .filter((f) => !isDisplayField(f)).length;

                  return (
                    <div
                      key={field.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(field.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setSelectedId(field.id);
                      }}
                      className={cn(
                        "group relative rounded-2xl border p-4 shadow-sm transition-all",
                        display
                          ? "border-dashed border-amber-500/30 bg-amber-500/[0.04]"
                          : "bg-card",
                        selected
                          ? display
                            ? "border-amber-500/50 ring-2 ring-amber-500/15"
                            : "border-primary/50 ring-2 ring-primary/15"
                          : display
                            ? "hover:border-amber-500/45"
                            : "border-border/80 hover:border-border hover:shadow-md",
                      )}
                    >
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center gap-1 pt-0.5">
                          <span
                            className={cn(
                              "flex size-7 items-center justify-center rounded-lg text-xs font-semibold",
                              display
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {display ? (
                              <Icon className="size-3.5" />
                            ) : (
                              questionNumber
                            )}
                          </span>
                          {canEdit && (
                            <div className="flex flex-col opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                type="button"
                                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                                disabled={index === 0 || pending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveField(field.id, -1);
                                }}
                                aria-label="Move up"
                              >
                                <ChevronUp className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                                disabled={index === fields.length - 1 || pending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveField(field.id, 1);
                                }}
                                aria-label="Move down"
                              >
                                <ChevronDown className="size-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            {display && field.type === "paragraph" ? (
                              <textarea
                                value={field.label}
                                disabled={!canEdit || pending}
                                onChange={(e) =>
                                  patchField(field.id, { label: e.target.value })
                                }
                                onBlur={() => canEdit && persistFieldsNow()}
                                onClick={(e) => e.stopPropagation()}
                                rows={3}
                                className="w-full resize-y border-0 bg-transparent text-sm leading-relaxed text-muted-foreground outline-none placeholder:text-muted-foreground/40"
                                placeholder="Write instructions people will see here…"
                              />
                            ) : (
                              <input
                                value={field.label}
                                disabled={!canEdit || pending}
                                onChange={(e) =>
                                  patchField(field.id, { label: e.target.value })
                                }
                                onBlur={() => canEdit && persistFieldsNow()}
                                onClick={(e) => e.stopPropagation()}
                                className={cn(
                                  "w-full border-0 bg-transparent outline-none placeholder:text-muted-foreground/40",
                                  display && field.type === "heading"
                                    ? "text-lg font-semibold tracking-tight"
                                    : "text-[15px] font-medium",
                                )}
                                placeholder={
                                  display && field.type === "heading"
                                    ? "Section heading"
                                    : "Question"
                                }
                              />
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeField(field.id);
                                }}
                                aria-label="Delete"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Input preview only for real questions */}
                          {!display && (
                            <div className="pointer-events-none rounded-xl border border-dashed border-border/70 bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground/70">
                              {field.type === "textarea" ? (
                                <span className="block h-10">Long answer…</span>
                              ) : field.type === "checkbox" ? (
                                <span className="inline-flex items-center gap-2">
                                  <span className="size-4 rounded border border-border bg-background" />
                                  Yes / No
                                </span>
                              ) : field.type === "dropdown" ? (
                                <span className="inline-flex items-center gap-1">
                                  Choose an option…
                                  <ChevronDown className="size-3.5" />
                                </span>
                              ) : field.type === "file" ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <Paperclip className="size-3.5" />
                                  Upload files…
                                </span>
                              ) : (
                                <span>
                                  {field.type === "email"
                                    ? "name@example.com"
                                    : field.type === "date"
                                      ? "Select date"
                                      : field.type === "number"
                                        ? "0"
                                        : "Short answer…"}
                                </span>
                              )}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                                display
                                  ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              <Icon className="size-3" />
                              {meta.label}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {display ? "· not submitted" : `→ ${mapSummary(field, activeDefs)}`}
                            </span>
                            {!display && field.required && (
                              <Badge variant="secondary" className="h-5 text-[10px]">
                                Required
                              </Badge>
                            )}
                            {!display && field.hidden && (
                              <Badge variant="outline" className="h-5 gap-0.5 text-[10px]">
                                <EyeOff className="size-2.5" />
                                Hidden
                              </Badge>
                            )}
                            {field.showWhen && (
                              <Badge variant="outline" className="h-5 gap-0.5 text-[10px]">
                                <GitBranch className="size-2.5" />
                                Logic
                              </Badge>
                            )}
                          </div>

                          {canEdit && !display && (
                            <div
                              className="flex flex-wrap items-center gap-3 border-t border-border/50 pt-2.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                                <input
                                  type="checkbox"
                                  className="size-3.5 rounded border-input accent-primary"
                                  checked={Boolean(field.required)}
                                  disabled={pending}
                                  onChange={(e) =>
                                    patchField(field.id, { required: e.target.checked }, true)
                                  }
                                />
                                Required
                              </label>
                              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                                <input
                                  type="checkbox"
                                  className="size-3.5 rounded border-input accent-primary"
                                  checked={Boolean(field.hidden)}
                                  disabled={pending}
                                  onChange={(e) =>
                                    patchField(field.id, { hidden: e.target.checked }, true)
                                  }
                                />
                                Hidden
                              </label>
                              <button
                                type="button"
                                className={cn(
                                  "inline-flex items-center gap-1 text-xs font-medium transition-colors",
                                  expanded
                                    ? "text-primary"
                                    : "text-muted-foreground hover:text-foreground",
                                )}
                                onClick={() =>
                                  setExpandedId(expanded ? null : field.id)
                                }
                              >
                                <Settings2 className="size-3" />
                                Advanced
                                {expanded ? (
                                  <ChevronUp className="size-3" />
                                ) : (
                                  <ChevronDown className="size-3" />
                                )}
                              </button>
                            </div>
                          )}

                          {canEdit && display && (
                            <div
                              className="flex flex-wrap items-center gap-3 border-t border-border/40 pt-2.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className={cn(
                                  "inline-flex items-center gap-1 text-xs font-medium transition-colors",
                                  expanded
                                    ? "text-primary"
                                    : "text-muted-foreground hover:text-foreground",
                                )}
                                onClick={() =>
                                  setExpandedId(expanded ? null : field.id)
                                }
                              >
                                <GitBranch className="size-3" />
                                Conditional show
                                {expanded ? (
                                  <ChevronUp className="size-3" />
                                ) : (
                                  <ChevronDown className="size-3" />
                                )}
                              </button>
                            </div>
                          )}

                          {expanded && canEdit && !display && (
                            <div
                              className="space-y-3 rounded-xl bg-muted/40 p-3"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div>
                                <Label className="text-[11px] text-muted-foreground">
                                  Help text
                                </Label>
                                <Input
                                  value={field.help ?? ""}
                                  className="mt-1 h-8 bg-background text-sm"
                                  placeholder="Shown under the question"
                                  disabled={pending}
                                  onChange={(e) =>
                                    patchField(field.id, { help: e.target.value })
                                  }
                                  onBlur={() => persistFieldsNow()}
                                />
                              </div>
                              <div>
                                <Label className="text-[11px] text-muted-foreground">
                                  Prefill key{" "}
                                  <span className="font-normal opacity-70">
                                    (?key=value in URL)
                                  </span>
                                </Label>
                                <Input
                                  value={field.prefillKey ?? ""}
                                  className="mt-1 h-8 bg-background font-mono text-xs"
                                  placeholder={field.id.slice(0, 8) + "…"}
                                  disabled={pending}
                                  onChange={(e) =>
                                    patchField(field.id, {
                                      prefillKey: e.target.value || undefined,
                                    })
                                  }
                                  onBlur={() => persistFieldsNow()}
                                />
                              </div>
                              <ShowWhenEditor
                                field={field}
                                fields={fields}
                                pending={pending}
                                onChange={(showWhen) =>
                                  patchField(field.id, { showWhen }, true)
                                }
                                onValueDraft={(value) =>
                                  patchField(field.id, {
                                    showWhen: field.showWhen
                                      ? { ...field.showWhen, value }
                                      : null,
                                  })
                                }
                                onValueBlur={() => persistFieldsNow()}
                              />
                            </div>
                          )}

                          {expanded && canEdit && display && (
                            <div
                              className="rounded-xl bg-muted/40 p-3"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ShowWhenEditor
                                field={field}
                                fields={fields}
                                pending={pending}
                                onChange={(showWhen) =>
                                  patchField(field.id, { showWhen }, true)
                                }
                                onValueDraft={(value) =>
                                  patchField(field.id, {
                                    showWhen: field.showWhen
                                      ? { ...field.showWhen, value }
                                      : null,
                                  })
                                }
                                onValueBlur={() => persistFieldsNow()}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>

          {/* Right rail: Fields | Settings | Design */}
          <aside className="flex max-h-[50vh] flex-col overflow-hidden border-t border-border/60 bg-card lg:max-h-none lg:border-t-0">
            <div className="border-b border-border/60 p-2">
              <div className="grid grid-cols-3 gap-0.5 rounded-xl bg-muted/60 p-0.5">
                {(
                  [
                    ["fields", "Fields"],
                    ["settings", "Settings"],
                    ["design", "Design"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setRailTab(id)}
                    className={cn(
                      "rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors",
                      railTab === id
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
              {railTab === "fields" && (
              <>
              <div>
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Content
                </p>
                <div className="grid grid-cols-1 gap-1">
                  <button
                    type="button"
                    disabled={isDisabled(!canEdit || pending)}
                    onClick={() => addDisplayBlock("heading")}
                    className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400">
                      <Heading1 className="size-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">Heading</span>
                      <span className="block text-[10px] text-muted-foreground">
                        Section title between questions
                      </span>
                    </span>
                    <Plus className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    disabled={isDisabled(!canEdit || pending)}
                    onClick={() => addDisplayBlock("paragraph")}
                    className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400">
                      <Info className="size-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">Instructions</span>
                      <span className="block text-[10px] text-muted-foreground">
                        Text block — not saved as a field
                      </span>
                    </span>
                    <Plus className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </div>
              </div>

              <div>
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Files
                </p>
                <button
                  type="button"
                  disabled={isDisabled(!canEdit || pending)}
                  onClick={() => addFileQuestion()}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-400">
                    <Paperclip className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">File upload</span>
                    <span className="block text-[10px] text-muted-foreground">
                      Maps to a Files custom field in AACC Hub
                    </span>
                  </span>
                  <Plus className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </div>

              <div>
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Task fields
                </p>
                <div className="grid grid-cols-1 gap-1">
                  {FORM_CORE_TARGETS.map((target) => {
                    const typeHint =
                      target === "description"
                        ? "textarea"
                        : target === "due_date"
                          ? "date"
                          : target === "priority"
                            ? "dropdown"
                            : "text";
                    const Icon = TYPE_META[typeHint].icon;
                    const already = coreTargetsPresent.has(target);
                    // Prefer canEdit + already for SSR stability; pending only after interaction
                    // would cause disabled false/null vs true hydration mismatches.
                    return (
                      <button
                        key={target}
                        type="button"
                        disabled={isDisabled(!canEdit || already)}
                        onClick={() => {
                          if (pending) return;
                          addCoreQuestion(target);
                        }}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50",
                          pending && "pointer-events-none opacity-60",
                        )}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="size-3.5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {CORE_LABELS[target]}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            {already ? "Already added" : TYPE_META[typeHint].label}
                          </span>
                        </span>
                        <Plus className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeDefs.length > 0 && (
                <div>
                  <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Custom fields
                  </p>
                  <div className="grid grid-cols-1 gap-1">
                    {activeDefs.map((def) => {
                      const typeKey = (
                        def.type in TYPE_META ? def.type : "text"
                      ) as FormFieldType;
                      const Icon = TYPE_META[typeKey]?.icon ?? Type;
                      const already = customFieldIdsPresent.has(def.id);
                      return (
                        <button
                          key={def.id}
                          type="button"
                          disabled={isDisabled(!canEdit || already)}
                          onClick={() => {
                            if (pending) return;
                            addCustomQuestion(def);
                          }}
                          className={cn(
                            "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50",
                            pending && "pointer-events-none opacity-60",
                          )}
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            <Icon className="size-3.5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{def.label}</span>
                            {already && (
                              <span className="block text-[10px] text-muted-foreground">
                                Already added
                              </span>
                            )}
                          </span>
                          <Plus className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              </>
              )}

              {railTab === "settings" && (
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      After submit
                    </p>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Default status</Label>
                        <select
                          className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                          value={defaultStatusId}
                          disabled={!canEdit || pending}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDefaultStatusId(v);
                            startTransition(async () => {
                              try {
                                await updateFormSettings({
                                  formId: form.id,
                                  defaultStatusId: v || null,
                                });
                              } catch (err) {
                                toast.error(
                                  err instanceof Error ? err.message : "Failed",
                                );
                              }
                            });
                          }}
                        >
                          <option value="">List default</option>
                          {statuses.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Notify</Label>
                        <select
                          className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                          value={notifyRole}
                          disabled={!canEdit || pending}
                          onChange={(e) => {
                            const v =
                              e.target.value === "member" ? "member" : "owner";
                            setNotifyRole(v);
                            startTransition(async () => {
                              try {
                                await updateFormSettings({
                                  formId: form.id,
                                  notifySpaceRole: v,
                                });
                              } catch (err) {
                                toast.error(
                                  err instanceof Error ? err.message : "Failed",
                                );
                              }
                            });
                          }}
                        >
                          <option value="owner">Space owners</option>
                          <option value="member">Owners &amp; members</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Success message</Label>
                        <Textarea
                          value={successMessage}
                          disabled={!canEdit || pending}
                          rows={2}
                          className="text-sm"
                          onChange={(e) => setSuccessMessage(e.target.value)}
                          onBlur={() => canEdit && saveSettings()}
                        />
                      </div>
                    </div>
                  </div>

                  {canEdit && (
                    <div>
                      <Label className="mb-1.5 flex items-center gap-1.5 text-xs">
                        <Users className="size-3" />
                        Default assignees
                      </Label>
                      <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                        {users.length === 0 ? (
                          <p className="px-1 py-2 text-xs text-muted-foreground">
                            No users available
                          </p>
                        ) : (
                          users.map((u) => (
                            <label
                              key={u.id}
                              className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-muted/60"
                            >
                              <input
                                type="checkbox"
                                className="size-3.5 accent-primary"
                                checked={defaultAssigneeIds.includes(u.id)}
                                disabled={pending}
                                onChange={() => toggleAssignee(u.id)}
                              />
                              <span className="truncate">{u.displayName}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 rounded-xl border border-border/70 p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={allowAttachments}
                        disabled={!canEdit || pending}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setAllowAttachments(v);
                          startTransition(async () => {
                            try {
                              await updateFormSettings({
                                formId: form.id,
                                allowAttachments: v,
                              });
                            } catch {
                              setAllowAttachments(!v);
                            }
                          });
                        }}
                      />
                      <Paperclip className="size-3.5 text-muted-foreground" />
                      Extra unmapped attachments
                    </label>
                    <p className="text-[10px] leading-snug text-muted-foreground">
                      Prefer a Files question (maps to a custom field). This is a fallback bucket.
                    </p>
                    {allowAttachments && (
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        Max
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          className="h-8 w-14"
                          value={maxAttachments}
                          disabled={!canEdit || pending}
                          onChange={(e) =>
                            setMaxAttachments(Number(e.target.value) || 5)
                          }
                          onBlur={() => {
                            if (!canEdit) return;
                            startTransition(async () => {
                              try {
                                await updateFormSettings({
                                  formId: form.id,
                                  maxAttachments,
                                });
                              } catch (err) {
                                toast.error(
                                  err instanceof Error ? err.message : "Failed",
                                );
                              }
                            });
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}

              {railTab === "design" && (
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 flex items-center gap-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Palette className="size-3" />
                      Colors
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ["primaryColor", "Accent / button"],
                          ["backgroundColor", "Page background"],
                          ["cardColor", "Card"],
                          ["textColor", "Text"],
                          ["mutedColor", "Muted text"],
                        ] as const
                      ).map(([key, label]) => (
                        <label
                          key={key}
                          className="flex flex-col gap-1 rounded-xl border border-border/70 p-2"
                        >
                          <span className="text-[10px] text-muted-foreground">{label}</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                              value={theme[key]}
                              disabled={!canEdit || pending}
                              onChange={(e) =>
                                setTheme((t) => ({ ...t, [key]: e.target.value }))
                              }
                              onBlur={(e) =>
                                canEdit && saveTheme({ [key]: e.target.value })
                              }
                            />
                            <Input
                              value={theme[key]}
                              disabled={!canEdit || pending}
                              className="h-8 font-mono text-[11px]"
                              onChange={(e) =>
                                setTheme((t) => ({ ...t, [key]: e.target.value }))
                              }
                              onBlur={(e) =>
                                canEdit && saveTheme({ [key]: e.target.value })
                              }
                            />
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Layout
                    </p>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Form width</Label>
                        <div className="grid grid-cols-3 gap-1">
                          {FORM_WIDTHS.map((w) => (
                            <button
                              key={w}
                              type="button"
                              disabled={!canEdit || pending}
                              onClick={() => saveTheme({ width: w })}
                              className={cn(
                                "rounded-lg border px-2 py-1.5 text-xs font-medium capitalize",
                                theme.width === w
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground hover:bg-muted",
                              )}
                            >
                              {w === "sm" ? "Narrow" : w === "md" ? "Medium" : "Wide"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Corners</Label>
                        <div className="grid grid-cols-3 gap-1">
                          {FORM_RADIUS.map((r) => (
                            <button
                              key={r}
                              type="button"
                              disabled={!canEdit || pending}
                              onClick={() => saveTheme({ radius: r })}
                              className={cn(
                                "rounded-lg border px-2 py-1.5 text-xs font-medium",
                                theme.radius === r
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground hover:bg-muted",
                              )}
                            >
                              {r === "md" ? "Soft" : r === "xl" ? "Round" : "Pill"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 flex items-center gap-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <ImageIcon className="size-3" />
                      Logo
                    </p>
                    {logoSrc ? (
                      <div className="mb-2 flex items-center justify-center rounded-xl border border-border/70 bg-muted/30 p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logoSrc}
                          alt="Form logo"
                          className="max-h-16 max-w-full object-contain"
                        />
                      </div>
                    ) : (
                      <p className="mb-2 text-[11px] text-muted-foreground">
                        No logo yet — upload or paste a URL.
                      </p>
                    )}
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Position</Label>
                        <div className="grid grid-cols-3 gap-1">
                          {FORM_LOGO_POSITIONS.map((p) => (
                            <button
                              key={p}
                              type="button"
                              disabled={!canEdit || pending}
                              onClick={() => saveTheme({ logoPosition: p })}
                              className={cn(
                                "rounded-lg border px-2 py-1.5 text-xs font-medium capitalize",
                                theme.logoPosition === p
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground hover:bg-muted",
                              )}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                      {canEdit && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-xs">Upload logo</Label>
                            <Input
                              type="file"
                              accept="image/*"
                              className="h-9 text-xs"
                              disabled={pending}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const fd = new FormData();
                                fd.set("logo", file);
                                startTransition(async () => {
                                  try {
                                    const r = await uploadFormLogo(form.id, fd);
                                    setTheme((t) => ({
                                      ...t,
                                      logoObjectKey: r.logoObjectKey,
                                      logoUrl: null,
                                    }));
                                    toast.success("Logo uploaded");
                                  } catch (err) {
                                    toast.error(
                                      err instanceof Error
                                        ? err.message
                                        : "Upload failed",
                                    );
                                  }
                                });
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Or image URL</Label>
                            <Input
                              value={theme.logoUrl ?? ""}
                              placeholder="https://…"
                              className="h-8 text-xs"
                              disabled={pending}
                              onChange={(e) =>
                                setTheme((t) => ({
                                  ...t,
                                  logoUrl: e.target.value,
                                  logoObjectKey: null,
                                }))
                              }
                              onBlur={(e) =>
                                saveTheme({
                                  logoUrl: e.target.value.trim() || null,
                                  logoObjectKey: null,
                                })
                              }
                            />
                          </div>
                          {(theme.logoObjectKey || theme.logoUrl) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="w-full text-destructive"
                              disabled={pending}
                              onClick={() => {
                                startTransition(async () => {
                                  try {
                                    await clearFormLogo(form.id);
                                    setTheme((t) => ({
                                      ...t,
                                      logoObjectKey: null,
                                      logoUrl: null,
                                    }));
                                    toast.success("Logo removed");
                                  } catch (err) {
                                    toast.error(
                                      err instanceof Error
                                        ? err.message
                                        : "Failed",
                                    );
                                  }
                                });
                              }}
                            >
                              Remove logo
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Submit button label</Label>
                      <Input
                        value={theme.submitLabel}
                        disabled={!canEdit || pending}
                        className="h-8 text-sm"
                        onChange={(e) =>
                          setTheme((t) => ({ ...t, submitLabel: e.target.value }))
                        }
                        onBlur={(e) =>
                          canEdit &&
                          saveTheme({
                            submitLabel: e.target.value || DEFAULT_FORM_THEME.submitLabel,
                          })
                        }
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-primary"
                        checked={theme.showBranding}
                        disabled={!canEdit || pending}
                        onChange={(e) =>
                          saveTheme({ showBranding: e.target.checked })
                        }
                      />
                      Show “Powered by AACC Hub” footer
                    </label>
                    {canEdit && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled={pending}
                        onClick={() => saveTheme({ ...DEFAULT_FORM_THEME })}
                      >
                        Reset to defaults
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ── Preview ── */}
      {tab === "preview" && (
        <div
          className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto rounded-2xl border border-border/80 px-4 py-8"
          style={{
            ...formThemeCssVars(theme),
            background: theme.backgroundColor,
          }}
        >
          <p className="mb-4 text-xs font-medium uppercase tracking-wider"
            style={{ color: ensureContrast(theme.mutedColor, theme.backgroundColor) }}
          >
            Public form preview
          </p>
          <div className={cn("w-full", formWidthClass(theme.width))}>
            <FormPreview
              title={title}
              introMd={introMd}
              fields={fields}
              allowAttachments={allowAttachments}
              maxAttachments={maxAttachments}
              theme={theme}
              logoSrc={logoSrc}
              disabled
            />
          </div>
        </div>
      )}

      {/* ── Share ── */}
      {tab === "share" && (
        <div className="mx-auto grid w-full max-w-2xl gap-4 py-2">
          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Link2 className="size-4 text-primary" />
              Public link
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Share this URL — each submission creates a task in this list.
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={publicUrl}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => copyText(publicUrl, "link")}
                aria-label={copied === "link" ? "Link copied" : "Copy public form link"}
              >
                {copied === "link" ? (
                  <Check className="size-4" />
                ) : (
                  <ClipboardCopy className="size-4" />
                )}
              </Button>
              <Button type="button" variant="outline" size="icon" className="shrink-0" asChild>
                <a href={publicUrl} target="_blank" rel="noreferrer" aria-label="Open public form in a new tab">
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            </div>
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={regenSlug}
                disabled={pending}
              >
                Generate new link
              </Button>
            )}
          </div>

          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Code2 className="size-4 text-primary" />
              Embed
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Paste into a site or SharePoint page. Uses a compact{" "}
              <code className="rounded bg-muted px-1 text-[11px]">?embed=1</code> layout.
            </p>
            <Textarea
              readOnly
              value={embedCode}
              rows={3}
              className="font-mono text-[11px]"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 gap-1.5"
              onClick={() => copyText(embedCode, "embed")}
            >
              {copied === "embed" ? (
                <Check className="size-3.5" />
              ) : (
                <ClipboardCopy className="size-3.5" />
              )}
              Copy embed code
            </Button>
          </div>

          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <AtSign className="size-4 text-primary" />
              Prefill from URL
            </div>
            <p className="text-sm text-muted-foreground">
              Append query params to pre-fill fields, including hidden ones:
            </p>
            <code className="mt-2 block rounded-xl bg-muted px-3 py-2 font-mono text-xs">
              {publicUrl}?
              {fields[0] ? fieldPrefillKey(fields[0]) : "key"}=value
            </code>
            {fields.some((f) => f.hidden) && (
              <ul className="mt-3 space-y-1.5">
                {fields
                  .filter((f) => f.hidden)
                  .map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <EyeOff className="size-3 shrink-0" />
                      <span className="font-medium text-foreground">{f.label}</span>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                        {fieldPrefillKey(f)}
                      </code>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <div
            className={cn(
              "flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm",
              isActive
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300"
                : "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            {isActive ? (
              <>
                <Eye className="size-4" /> Accepting submissions
              </>
            ) : (
              <>
                <EyeOff className="size-4" /> Paused — public page shows inactive
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export type FormSubmitFile = { fieldId: string | null; file: File };

export function FormPreview({
  title,
  introMd,
  fields,
  disabled,
  initialValues,
  allowAttachments,
  maxAttachments = 5,
  theme: themeProp,
  logoSrc,
  onSubmit,
  submitting,
  success,
  successMessage,
}: {
  title: string;
  introMd?: string | null;
  fields: FormField[];
  disabled?: boolean;
  initialValues?: Record<string, string>;
  allowAttachments?: boolean;
  maxAttachments?: number;
  theme?: FormTheme;
  logoSrc?: string | null;
  onSubmit?: (answers: Record<string, unknown>, files: FormSubmitFile[]) => void;
  submitting?: boolean;
  success?: boolean;
  successMessage?: string | null;
}) {
  const theme = themeProp ?? DEFAULT_FORM_THEME;
  const radiusCls = formRadiusClass(theme.radius);
  const [values, setValues] = useState<Record<string, string | boolean>>(() => {
    const init: Record<string, string | boolean> = {};
    if (initialValues) {
      for (const [k, v] of Object.entries(initialValues)) {
        init[k] = v;
      }
    }
    return init;
  });
  /** fieldId → selected files for file-type questions */
  const [filesByField, setFilesByField] = useState<Record<string, File[]>>({});
  /** Form-level attachments (optional global toggle) */
  const [generalFiles, setGeneralFiles] = useState<File[]>([]);

  const visible = useMemo(
    () => visibleFormFields(fields, values),
    [fields, values],
  );

  if (success) {
    return (
      <div
        className={cn("border p-10 text-center shadow-lg", radiusCls)}
        style={{
          background: theme.cardColor,
          color: theme.textColor,
          borderColor: `${theme.mutedColor}33`,
        }}
      >
        <div
          className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full"
          style={tintedChipStyle(theme.primaryColor, theme.cardColor)}
        >
          <Check className="size-7" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">Submitted</h2>
        <p className="mt-2 text-sm" style={{ color: ensureContrast(theme.mutedColor, theme.cardColor) }}>
          {successMessage || "Thanks — we received your request."}
        </p>
      </div>
    );
  }

  return (
    <form
      className={cn("space-y-5 border p-6 shadow-lg sm:p-8", radiusCls)}
      style={{
        background: theme.cardColor,
        color: theme.textColor,
        borderColor: `${theme.mutedColor}33`,
        ...formThemeCssVars(theme),
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (disabled || !onSubmit) return;
        const answers: Record<string, unknown> = { ...values };
        for (const f of fields) {
          if (f.hidden && answers[f.id] === undefined && initialValues?.[f.id] != null) {
            answers[f.id] = initialValues[f.id];
          }
        }
        for (const f of visible) {
          if (f.type === "file") continue;
          if (answers[f.id] === undefined) {
            answers[f.id] = f.type === "checkbox" ? false : "";
          }
        }
        // Client-side required file check
        for (const f of visible) {
          if (f.type === "file" && f.required) {
            const n = (filesByField[f.id] ?? []).length;
            if (n === 0) {
              toast.error(`"${f.label}" requires at least one file`);
              return;
            }
          }
        }
        const packed: FormSubmitFile[] = [];
        for (const [fieldId, list] of Object.entries(filesByField)) {
          for (const file of list) packed.push({ fieldId, file });
        }
        for (const file of generalFiles) packed.push({ fieldId: null, file });
        onSubmit(answers, packed);
      }}
    >
      {logoSrc ? (
        <div
          className={cn(
            "flex",
            theme.logoPosition === "left" && "justify-start",
            theme.logoPosition === "center" && "justify-center",
            theme.logoPosition === "right" && "justify-end",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt=""
            className="max-h-14 max-w-[200px] object-contain"
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {introMd ? (
          <p
            className="whitespace-pre-wrap text-sm leading-relaxed"
            style={{ color: ensureContrast(theme.mutedColor, theme.cardColor) }}
          >
            {introMd}
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        {visible.map((field) => {
          if (isDisplayField(field)) {
            if (field.type === "heading") {
              return (
                <div key={field.id} className="pt-1">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    {field.label}
                  </h2>
                </div>
              );
            }
            return (
              <div
                key={field.id}
                className="rounded-xl border border-border/60 bg-muted/30 px-3.5 py-3 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap"
              >
                {field.label}
              </div>
            );
          }

          if (field.type === "file") {
            const selected = filesByField[field.id] ?? [];
            return (
              <div key={field.id} className="flex flex-col gap-1.5">
                <Label htmlFor={`pf-${field.id}`} className="text-sm font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <Paperclip className="size-3.5" />
                    {field.label}
                    {field.required ? (
                      <span className="text-destructive"> *</span>
                    ) : null}
                  </span>
                </Label>
                {field.help ? (
                  <p className="text-xs text-muted-foreground">{field.help}</p>
                ) : null}
                <Input
                  id={`pf-${field.id}`}
                  type="file"
                  multiple
                  className="h-10 rounded-xl"
                  disabled={disabled || submitting}
                  onChange={(e) => {
                    const list = Array.from(e.target.files ?? []);
                    setFilesByField((prev) => ({ ...prev, [field.id]: list }));
                  }}
                />
                {selected.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selected.length} file{selected.length === 1 ? "" : "s"} selected
                    {selected.length <= 3
                      ? `: ${selected.map((f) => f.name).join(", ")}`
                      : ""}
                  </p>
                )}
              </div>
            );
          }

          return (
            <div key={field.id} className="flex flex-col gap-1.5">
              <Label htmlFor={`pf-${field.id}`} className="text-sm font-medium">
                {field.label}
                {field.required ? (
                  <span className="text-destructive"> *</span>
                ) : null}
              </Label>
              {field.help ? (
                <p className="text-xs text-muted-foreground">{field.help}</p>
              ) : null}
              {field.type === "textarea" ? (
                <Textarea
                  id={`pf-${field.id}`}
                  required={field.required}
                  disabled={disabled || submitting}
                  rows={4}
                  className="rounded-xl"
                  value={String(values[field.id] ?? "")}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [field.id]: e.target.value }))
                  }
                />
              ) : field.type === "checkbox" ? (
                <label className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 text-sm">
                  <input
                    id={`pf-${field.id}`}
                    type="checkbox"
                    className="size-4 accent-primary"
                    disabled={disabled || submitting}
                    checked={Boolean(values[field.id])}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [field.id]: e.target.checked }))
                    }
                  />
                  {field.label}
                </label>
              ) : field.type === "dropdown" ? (
                <select
                  id={`pf-${field.id}`}
                  required={field.required}
                  disabled={disabled || submitting}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  value={String(values[field.id] ?? "")}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [field.id]: e.target.value }))
                  }
                >
                  <option value="">Select…</option>
                  {(field.options ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={`pf-${field.id}`}
                  className="h-10 rounded-xl"
                  type={
                    field.type === "email"
                      ? "email"
                      : field.type === "number"
                        ? "number"
                        : field.type === "date"
                          ? "date"
                          : field.type === "url"
                            ? "url"
                            : "text"
                  }
                  required={field.required}
                  disabled={disabled || submitting}
                  value={String(values[field.id] ?? "")}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [field.id]: e.target.value }))
                  }
                />
              )}
            </div>
          );
        })}
      </div>

      {allowAttachments && !disabled && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pf-files" className="text-sm font-medium">
            <span className="inline-flex items-center gap-1.5">
              <Paperclip className="size-3.5" />
              Extra attachments
            </span>
          </Label>
          <Input
            id="pf-files"
            type="file"
            multiple
            className="h-10 rounded-xl"
            disabled={submitting}
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              if (list.length > maxAttachments) {
                toast.error(`Max ${maxAttachments} files`);
                setGeneralFiles(list.slice(0, maxAttachments));
              } else {
                setGeneralFiles(list);
              }
            }}
          />
          {generalFiles.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {generalFiles.length} extra file
              {generalFiles.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
      )}
      {allowAttachments && disabled && (
        <p className="text-xs text-muted-foreground">
          <Paperclip className="mr-1 inline size-3" />
          Extra attachments enabled (max {maxAttachments})
        </p>
      )}

      {!disabled && (
        <button
          type="submit"
          disabled={submitting}
          className={cn(
            "h-11 w-full text-sm font-semibold shadow-sm transition-opacity disabled:opacity-60",
            formRadiusClass(theme.radius === "2xl" ? "xl" : "md"),
          )}
          style={solidChipStyle(theme.primaryColor)}
        >
          {submitting ? "Submitting…" : theme.submitLabel || "Submit"}
        </button>
      )}
      {disabled && (
        <p className="text-center text-xs" style={{ color: ensureContrast(theme.mutedColor, theme.cardColor) }}>
          Preview only — responses won&apos;t be saved
        </p>
      )}
    </form>
  );
}
