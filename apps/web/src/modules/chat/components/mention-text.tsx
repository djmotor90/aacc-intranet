/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  MENTION_TOKEN_RE,
  mentionChipLabel,
  mentionChipPrefix,
  parseInstructionSegments,
  type AgentMentionType,
} from "../lib/agent-mentions";
import { textLooksLikeMarkdown } from "../lib/body";
import { markdownToDoc } from "../lib/markdown-to-doc";
import { RichDocView } from "@/components/editor/rich-doc-view";

const CHIP_CLASS: Record<AgentMentionType, string> = {
  user: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
  task: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-200",
  space:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  doc: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
  folder:
    "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100",
};

const CHIP_CLASS_ON_PRIMARY: Record<AgentMentionType, string> = {
  user: "border-white/30 bg-white/15 text-primary-foreground",
  task: "border-white/30 bg-white/15 text-primary-foreground",
  space: "border-white/30 bg-white/15 text-primary-foreground",
  doc: "border-white/30 bg-white/15 text-primary-foreground",
  folder: "border-white/30 bg-white/15 text-primary-foreground",
};

function hrefFor(type: AgentMentionType, id: string): string | null {
  switch (type) {
    case "doc":
      return `/docs/p/${id}`;
    case "task":
      return null;
    default:
      return null;
  }
}

function MentionChip({
  type,
  id,
  label,
  onPrimary,
}: {
  type: AgentMentionType;
  id: string;
  label: string;
  onPrimary?: boolean;
}) {
  const href = hrefFor(type, id);
  const className = cn(
    "inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 align-baseline text-[12px] font-medium leading-tight shadow-sm",
    onPrimary ? CHIP_CLASS_ON_PRIMARY[type] : CHIP_CLASS[type],
  );
  const inner = (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
        {mentionChipPrefix(type)}
      </span>
      <span className="truncate">{mentionChipLabel(type, label)}</span>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={cn(className, "hover:underline")}
        onClick={(e) => e.stopPropagation()}
      >
        {inner}
      </Link>
    );
  }
  return <span className={className}>{inner}</span>;
}

/** Lightweight inline markdown (bold/italic/code) for text between chips. */
function InlineMarkdown({ text, onPrimary }: { text: string; onPrimary?: boolean }) {
  if (!text) return null;
  // Multi-line / block markdown → TipTap view
  if (textLooksLikeMarkdown(text) && (text.includes("\n") || /^#{1,4}\s|^\s*[-*+]\s/m.test(text))) {
    return (
      <span
        className={cn(
          "inline-block w-full [&_.ProseMirror]:p-0",
          onPrimary && "[&_*]:text-primary-foreground",
        )}
      >
        <RichDocView content={markdownToDoc(text)} />
      </span>
    );
  }

  // Single-line: bold / italic / code only
  const nodes: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*]+)\*|_([^_]+)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    }
    if (m[2] !== undefined || m[3] !== undefined) {
      nodes.push(
        <strong key={key++} className="font-semibold">
          {m[2] ?? m[3]}
        </strong>,
      );
    } else if (m[4] !== undefined) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10"
        >
          {m[4]}
        </code>,
      );
    } else if (m[5] !== undefined || m[6] !== undefined) {
      nodes.push(<em key={key++}>{m[5] ?? m[6]}</em>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(<span key={key++}>{text.slice(last)}</span>);
  return <>{nodes.length ? nodes : text}</>;
}

/** Render plain text with structured @{type:id|label} tokens as pretty chips. */
export function MentionText({
  text,
  onPrimary,
  className,
}: {
  text: string;
  onPrimary?: boolean;
  className?: string;
}) {
  const hasTokens = new RegExp(MENTION_TOKEN_RE.source, "i").test(text);
  if (!hasTokens) {
    if (textLooksLikeMarkdown(text)) {
      return (
        <div
          className={cn(
            "prose prose-sm max-w-none dark:prose-invert prose-p:my-1",
            onPrimary && "[&_*]:text-primary-foreground",
            className,
          )}
        >
          <RichDocView content={markdownToDoc(text)} />
        </div>
      );
    }
    return <p className={cn("whitespace-pre-wrap", className)}>{text}</p>;
  }

  const segments = parseInstructionSegments(text);
  return (
    <div className={cn("whitespace-pre-wrap break-words", className)}>
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          return <InlineMarkdown key={i} text={seg.text} onPrimary={onPrimary} />;
        }
        return (
          <MentionChip
            key={i}
            type={seg.type}
            id={seg.id}
            label={seg.label}
            onPrimary={onPrimary}
          />
        );
      })}
    </div>
  );
}

/** Strip tokens to labels for storage / LLM cleanup. */
export function stripMentionTokens(text: string): string {
  return text.replace(MENTION_TOKEN_RE, (_m, _type, _id, label: string) => String(label));
}
