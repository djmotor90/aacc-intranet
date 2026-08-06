"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  Landmark,
  Lock,
  Mail,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type MouseEvent, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { deleteSecret, deleteSecretCategory, revealSecretField } from "../actions";
import type { RedactedSecretField, SecretRow } from "../lib/secret-fields";
import type { SecretCategoryRow } from "../queries";
import { AddSecretCategoryDialog } from "./secret-category-manager";
import { SecretDialog } from "./secret-dialog";

const PAGE_SIZE = 8;

const CATEGORY_ICONS: Record<string, typeof Lock> = {
  Logins: UserRound,
  Passwords: KeyRound,
  Banking: Landmark,
  Insurance: Shield,
  Email: Mail,
};

function CategoryIcon({ name }: { name: string }) {
  const Icon = CATEGORY_ICONS[name] ?? Lock;
  return <Icon className="size-4" />;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function FieldValueRow({ secretId, field }: { secretId: string; field: RedactedSecretField }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    if (revealed !== null) {
      setRevealed(null);
      return;
    }
    startTransition(async () => {
      try {
        const { value } = await revealSecretField({ secretId, fieldId: field.id });
        setRevealed(value);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to reveal value");
      }
    });
  }

  const display =
    field.sensitive
      ? revealed !== null
        ? revealed
        : "•".repeat(12)
      : (field.value ?? "—");

  return (
    <div className="flex min-w-0 items-start justify-between gap-3 rounded-md border bg-background/60 px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {field.label || "Field"}
        </p>
        {field.type === "url" && !field.sensitive && field.value ? (
          <a
            href={field.value}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 block truncate text-sm text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {field.value}
          </a>
        ) : (
          <p
            className={cn(
              "mt-0.5 break-all text-sm",
              field.sensitive && revealed === null && "font-mono tracking-wider text-muted-foreground",
              field.sensitive && revealed !== null && "font-mono",
            )}
          >
            {display || "—"}
          </p>
        )}
      </div>
      {field.sensitive && (
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          aria-label={revealed !== null ? `Hide ${field.label}` : `Reveal ${field.label}`}
        >
          {revealed !== null ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {pending ? "…" : revealed !== null ? "Hide" : "Reveal"}
        </button>
      )}
    </div>
  );
}

export function SecretsPanel({
  listId,
  taskId,
  categories,
  secrets,
}: {
  listId: string;
  taskId: string;
  categories: SecretCategoryRow[];
  secrets: SecretRow[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  /** Expanded secret shows every field with reveal controls. */
  const [openSecretId, setOpenSecretId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of secrets) m.set(s.categoryId, (m.get(s.categoryId) ?? 0) + 1);
    return m;
  }, [secrets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return secrets.filter((s) => {
      if (selectedCategoryId && s.categoryId !== selectedCategoryId) return false;
      if (!q) return true;
      if (s.title.toLowerCase().includes(q)) return true;
      return s.fields.some((f) => !f.sensitive && f.value?.toLowerCase().includes(q));
    });
  }, [secrets, selectedCategoryId, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  function selectCategory(id: string | null) {
    setSelectedCategoryId(id);
    setPage(1);
  }

  function removeSecret(id: string) {
    if (!window.confirm("Delete this secret? This cannot be undone.")) return;
    startTransition(async () => {
      try {
        await deleteSecret(id);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete secret");
      }
    });
  }

  function removeCategory(id: string) {
    startTransition(async () => {
      try {
        await deleteSecretCategory(id);
        if (selectedCategoryId === id) selectCategory(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete category");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            <Lock className="size-4" />
          </span>
          <div>
            <p className="text-base font-semibold">Secrets</p>
            <p className="text-xs text-muted-foreground">
              Sensitive information visible only to authorized staff.
            </p>
          </div>
        </div>
        <SecretDialog
          taskId={taskId}
          categories={categories}
          trigger={
            <Button size="sm" disabled={categories.length === 0}>
              <Plus className="size-4" /> Add Secret
            </Button>
          }
        />
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search secrets…"
          className="h-9 pl-8"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr]">
        {/* categories sidebar */}
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => selectCategory(null)}
            className={cn(
              "flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
              selectedCategoryId === null && "bg-muted font-medium",
            )}
          >
            All Items
            <span className="text-xs text-muted-foreground">{secrets.length}</span>
          </button>
          {categories.map((c) => (
            <div key={c.id} className="group/cat flex items-center">
              <button
                type="button"
                onClick={() => selectCategory(c.id)}
                className={cn(
                  "flex flex-1 items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  selectedCategoryId === c.id && "bg-muted font-medium",
                )}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="text-xs text-muted-foreground">{counts.get(c.id) ?? 0}</span>
              </button>
              <button
                type="button"
                onClick={() => removeCategory(c.id)}
                title="Delete category"
                aria-label={`Delete category ${c.name}`}
                className="hidden size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-muted hover:text-destructive group-hover/cat:opacity-100 sm:flex"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
          <AddSecretCategoryDialog listId={listId} onCreated={() => router.refresh()} />
        </div>

        {/* item list — click a card to open all fields and Reveal */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-2">
            {pageItems.map((s) => {
              const isOpen = openSecretId === s.id;
              const preview = s.fields.find((f) => f.sensitive || f.value);
              return (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-lg border bg-card transition-colors",
                    isOpen ? "border-primary/40 shadow-sm" : "hover:border-border/80 hover:bg-muted/20",
                  )}
                >
                  <div className="flex items-start gap-2 p-3">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                      onClick={() => setOpenSecretId(isOpen ? null : s.id)}
                      aria-expanded={isOpen}
                    >
                      <span
                        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md"
                        style={{ backgroundColor: `${s.categoryColor}1f`, color: s.categoryColor }}
                      >
                        <CategoryIcon name={s.categoryName} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold">{s.title}</span>
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{ backgroundColor: `${s.categoryColor}1f`, color: s.categoryColor }}
                          >
                            {s.categoryName}
                          </span>
                        </span>
                        {!isOpen && preview && (
                          <span className="mt-1 block truncate text-xs text-muted-foreground">
                            {preview.sensitive
                              ? `${preview.label}: ••••••••  (click to open & reveal)`
                              : `${preview.label}: ${preview.value ?? "—"}`}
                          </span>
                        )}
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          Updated {formatDate(s.updatedAt)}
                          {s.updatedByName && ` · ${s.updatedByName}`}
                          {!isOpen && " · click to view"}
                        </span>
                      </span>
                      {isOpen ? (
                        <ChevronLeft className="mt-1 size-4 shrink-0 -rotate-90 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <SecretDialog
                        taskId={taskId}
                        categories={categories}
                        secretId={s.id}
                        trigger={
                          <button
                            type="button"
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={`Edit ${s.title}`}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        }
                      />
                      <button
                        type="button"
                        onClick={() => removeSecret(s.id)}
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                        aria-label={`Delete ${s.title}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="space-y-2 border-t px-3 py-3">
                      {s.fields.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No fields on this secret.</p>
                      ) : (
                        s.fields.map((f) => (
                          <FieldValueRow key={f.id} secretId={s.id} field={f} />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {pageItems.length === 0 && (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                {secrets.length === 0
                  ? "No secrets yet — add one to get started."
                  : "No secrets match your search."}
              </div>
            )}
          </div>

          {filtered.length > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {(clampedPage - 1) * PAGE_SIZE + 1}–{Math.min(clampedPage * PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length} item{filtered.length === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={clampedPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <span>
                  {clampedPage} / {pageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={clampedPage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
