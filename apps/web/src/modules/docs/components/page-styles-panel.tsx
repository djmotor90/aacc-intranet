/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import {
  ChevronRight,
  Clock,
  FileText,
  ImageIcon,
  Link2,
  ListTree,
  PanelLeftClose,
  Smile,
  Type,
  Users,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  DocFontSize,
  DocFontStyle,
  DocPageStyles,
  DocPageWidth,
} from "@/modules/docs/lib/page-styles";

function Segmented<T extends string>({
  value,
  onChange,
  options,
  columns = 3,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; sublabel?: string }[];
  columns?: 2 | 3;
}) {
  return (
    <div
      className={cn(
        "grid gap-1.5",
        columns === 2 ? "grid-cols-2" : "grid-cols-3",
      )}
    >
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2.5 text-center transition-colors",
              active
                ? "border-violet-300 bg-violet-100/80 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200"
                : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span className="text-sm font-semibold leading-none">{o.label}</span>
            {o.sublabel && (
              <span className="text-[11px] font-medium opacity-80">{o.sublabel}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  checked,
  onCheckedChange,
}: {
  icon: typeof Type;
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className="flex w-full items-center gap-2.5 rounded-md px-1 py-2 text-left text-sm transition-colors hover:bg-muted/50"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-foreground">{label}</span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-violet-600" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform",
            checked ? "left-4" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

function NavRow({
  icon: Icon,
  label,
  trailing,
  onClick,
}: {
  icon: typeof Type;
  label: string;
  trailing?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-1 py-2 text-left text-sm transition-colors",
        onClick
          ? "hover:bg-muted/50"
          : "cursor-default opacity-70",
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">{label}</span>
      {trailing && (
        <span className="text-xs text-muted-foreground">{trailing}</span>
      )}
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
    </button>
  );
}

export function PageStylesPanel({
  styles,
  onChange,
  onClose,
  wordCount,
  charCount,
  onOpenSubpages,
  onOpenRelationships,
}: {
  styles: DocPageStyles;
  onChange: (next: DocPageStyles) => void;
  onClose: () => void;
  wordCount: number;
  charCount: number;
  onOpenSubpages?: () => void;
  onOpenRelationships?: () => void;
}) {
  function patch(partial: Partial<DocPageStyles>) {
    onChange({ ...styles, ...partial });
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden border-l bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <h2 className="text-sm font-semibold">Page Styles</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close page styles"
          title="Close"
        >
          <PanelLeftClose className="size-4 rotate-180" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <section className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Font style</p>
          <Segmented<DocFontStyle>
            value={styles.fontStyle}
            onChange={(fontStyle) => patch({ fontStyle })}
            options={[
              { id: "system", label: "Aa", sublabel: "System" },
              { id: "serif", label: "Ss", sublabel: "Serif" },
              { id: "mono", label: "øø", sublabel: "Mono" },
            ]}
          />
        </section>

        <section className="mt-5 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Font size</p>
          <Segmented<DocFontSize>
            value={styles.fontSize}
            onChange={(fontSize) => patch({ fontSize })}
            options={[
              { id: "small", label: "Aa≡", sublabel: "Small" },
              { id: "default", label: "Aa≡", sublabel: "Default" },
              { id: "large", label: "Aa≡", sublabel: "Large" },
            ]}
          />
        </section>

        <section className="mt-5 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Page width</p>
          <Segmented<DocPageWidth>
            value={styles.pageWidth}
            onChange={(pageWidth) => patch({ pageWidth })}
            columns={2}
            options={[
              { id: "default", label: "Default" },
              { id: "full", label: "Full width" },
            ]}
          />
        </section>

        <div className="my-5 border-t" />

        <section>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Header</p>
          <ToggleRow
            icon={ImageIcon}
            label="Cover image"
            checked={styles.showCover}
            onCheckedChange={(showCover) => patch({ showCover })}
          />
          <ToggleRow
            icon={Smile}
            label="Page icon & title"
            checked={styles.showIconTitle}
            onCheckedChange={(showIconTitle) => patch({ showIconTitle })}
          />
          <ToggleRow
            icon={UserRound}
            label="Owners"
            checked={styles.showOwners}
            onCheckedChange={(showOwners) => patch({ showOwners })}
          />
          <ToggleRow
            icon={Users}
            label="Contributors"
            checked={styles.showContributors}
            onCheckedChange={(showContributors) => patch({ showContributors })}
          />
          <ToggleRow
            icon={Type}
            label="Subtitle"
            checked={styles.showSubtitle}
            onCheckedChange={(showSubtitle) => patch({ showSubtitle })}
          />
          <ToggleRow
            icon={Clock}
            label="Last modified"
            checked={styles.showLastModified}
            onCheckedChange={(showLastModified) => patch({ showLastModified })}
          />
        </section>

        <section className="mt-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Sections</p>
          <NavRow
            icon={FileText}
            label="Subpages"
            trailing="Table"
            onClick={onOpenSubpages}
          />
          <NavRow
            icon={Link2}
            label="Relationships"
            trailing="Dialog"
            onClick={onOpenRelationships}
          />
          <ToggleRow
            icon={ListTree}
            label="Page outline"
            checked={styles.showPageOutline}
            onCheckedChange={(showPageOutline) => patch({ showPageOutline })}
          />
        </section>

        <section className="mt-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Focus mode</p>
          <ToggleRow
            icon={ListTree}
            label="Block"
            checked={styles.focusBlock}
            onCheckedChange={(focusBlock) =>
              patch({ focusBlock, focusPage: focusBlock ? false : styles.focusPage })
            }
          />
          <ToggleRow
            icon={FileText}
            label="Page"
            checked={styles.focusPage}
            onCheckedChange={(focusPage) =>
              patch({ focusPage, focusBlock: focusPage ? false : styles.focusBlock })
            }
          />
        </section>

        <section className="mt-4 border-t pt-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Stats</p>
          <div className="flex items-center justify-between py-1.5 text-sm">
            <span>Word count</span>
            <span className="tabular-nums text-muted-foreground">{wordCount}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 text-sm">
            <span>Characters</span>
            <span className="tabular-nums text-muted-foreground">{charCount}</span>
          </div>
        </section>
      </div>
    </aside>
  );
}
