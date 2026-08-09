"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { JSONContent } from "@tiptap/react";
import { Minus, Plus } from "lucide-react";
import { storedToDoc, type StoredRichDoc } from "@/components/editor/doc-utils";
import { RichDocView } from "@/components/editor/rich-doc-view";

type DiffBlock = { key: string; node: JSONContent };
type DiffRow = { kind: "same" | "removed" | "added"; block: DiffBlock };

const NON_VISUAL_ATTRS = new Set(["uploadId"]);

/** Build a stable visual signature instead of comparing raw TipTap JSON.
 * Collaboration round-trips may add null/default attrs or reorder object
 * keys without changing anything the reader sees. */
function visualValue(value: unknown): unknown {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => visualValue(item))
      .filter((item) => item !== undefined);
    return normalized.length ? normalized : undefined;
  }
  if (typeof value !== "object") {
    return typeof value === "string" ? value.replace(/\r\n/g, "\n") : value;
  }
  const normalized = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(
        ([key, entry]) =>
          entry != null &&
          !NON_VISUAL_ATTRS.has(key) &&
          !(key === "textAlign" && entry === "left") &&
          !(key === "start" && entry === 1) &&
          !((key === "colspan" || key === "rowspan") && entry === 1),
      )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, visualValue(entry)])
      .filter(([, entry]) => entry !== undefined),
  );
  return Object.keys(normalized).length ? normalized : undefined;
}

function visualKey(node: JSONContent): string {
  return JSON.stringify(visualValue(node));
}

function blocksFromDoc(content: StoredRichDoc): DiffBlock[] {
  const doc = storedToDoc(content);
  return (doc.content ?? []).map((node) => ({
    // Include marks, attributes, and nested content so formatting-only edits
    // and images inside lists/tables count as real changes.
    key: visualKey(node),
    node,
  }));
}

/** Small, dependency-free LCS diff for revision review. */
function diffBlocks(previous: DiffBlock[], current: DiffBlock[]): DiffRow[] {
  const rows = Array.from({ length: previous.length + 1 }, () => Array<number>(current.length + 1).fill(0));
  for (let i = previous.length - 1; i >= 0; i--) for (let j = current.length - 1; j >= 0; j--) {
    rows[i]![j] = previous[i]!.key === current[j]!.key ? rows[i + 1]![j + 1]! + 1 : Math.max(rows[i + 1]![j]!, rows[i]![j + 1]!);
  }
  const output: DiffRow[] = [];
  let i = 0; let j = 0;
  while (i < previous.length || j < current.length) {
    if (i < previous.length && j < current.length && previous[i]!.key === current[j]!.key) { output.push({ kind: "same", block: previous[i++]! }); j++; }
    else if (j < current.length && (i === previous.length || rows[i]![j + 1]! >= rows[i + 1]![j]!)) output.push({ kind: "added", block: current[j++]! });
    else output.push({ kind: "removed", block: previous[i++]! });
  }
  return output;
}

export function DocRevisionDiff({ previous, current }: { previous: StoredRichDoc; current: StoredRichDoc }) {
  const rows = diffBlocks(blocksFromDoc(previous), blocksFromDoc(current));
  const changed = rows.filter((row) => row.kind !== "same");
  const shown = changed.length ? rows.filter((row) => row.kind !== "same") : rows;
  return (
    <div className="overflow-hidden rounded-2xl border border-[#007582]/20 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#007582]/15 bg-[#eaf5f5] px-4 py-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#006570]">Formatted changes</p><p className="mt-0.5 text-xs text-[#557075]">{changed.length ? `${changed.length} changed block${changed.length === 1 ? "" : "s"}` : "No content changes"}</p></div>
        <span className="text-xs text-[#557075]">− removed · + added</span>
      </div>
      <div className="max-h-[58svh] overflow-auto p-3">
        {shown.map((row, index) => {
          const tone = row.kind === "added" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : row.kind === "removed" ? "border-red-200 bg-red-50 text-red-950" : "border-transparent text-[#557075]";
          return <div key={`${row.kind}-${row.block.key}-${index}`} className={`mb-1 flex gap-3 rounded-lg border px-3 py-2 ${tone}`}>
            <span className="mt-1.5 flex size-5 shrink-0 items-center justify-center rounded font-mono text-xs font-bold">{row.kind === "added" ? <Plus className="size-3.5" /> : row.kind === "removed" ? <Minus className="size-3.5" /> : null}</span>
            <RichDocView content={{ type: "doc", content: [row.block.node] }} className="min-w-0 flex-1 text-inherit [&_.aitim-editor-image]:max-w-full" />
          </div>;
        })}
      </div>
    </div>
  );
}
