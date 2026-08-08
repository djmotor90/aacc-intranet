/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Smarter list toggles: drop empty blocks so "1." doesn't sit on a blank line
 * above the text the user actually selected.
 */
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

function textblockIsEmpty(node: ProseMirrorNode): boolean {
  if (!node.isTextblock) return false;
  const text = node.textContent.replace(/\u00a0/g, " ").trim();
  return text.length === 0;
}

function nodeIsVisuallyEmpty(node: ProseMirrorNode): boolean {
  if (textblockIsEmpty(node)) return true;
  // Empty list item / blockquote wrappers
  if (
    (node.type.name === "listItem" ||
      node.type.name === "taskItem" ||
      node.type.name === "blockquote") &&
    node.childCount > 0
  ) {
    let allEmpty = true;
    node.forEach((child) => {
      if (!nodeIsVisuallyEmpty(child)) allEmpty = false;
    });
    return allEmpty;
  }
  return false;
}

/**
 * Before turning a selection into a list:
 * 1. Expand to full blocks
 * 2. Delete empty paragraphs in/near the selection (the usual cause of a lone "1.")
 * 3. Leave a clean multi-block selection for toggleOrderedList
 */
export function prepareSelectionForList(editor: Editor): void {
  const { state } = editor;
  const { doc, selection } = state;
  const { from, to } = selection;

  const $from = doc.resolve(from);
  const $to = doc.resolve(to);

  // Top-level block range covering the selection
  let rangeFrom = $from.before(1);
  let rangeTo = $to.after(1);
  // Clamp
  rangeFrom = Math.max(0, rangeFrom);
  rangeTo = Math.min(doc.content.size, rangeTo);

  const emptyRanges: { from: number; to: number }[] = [];
  doc.forEach((node, offset) => {
    const nodeFrom = offset;
    const nodeTo = offset + node.nodeSize;
    if (nodeTo <= rangeFrom || nodeFrom >= rangeTo) return;
    if (textblockIsEmpty(node) || nodeIsVisuallyEmpty(node)) {
      emptyRanges.push({ from: nodeFrom, to: nodeTo });
    }
  });

  // Also drop an empty block immediately above the range (often sits just
  // outside a drag-selection but still gets wrapped when focus expands).
  if (rangeFrom > 0) {
    const $before = doc.resolve(rangeFrom);
    if ($before.nodeBefore && textblockIsEmpty($before.nodeBefore)) {
      const nb = $before.nodeBefore;
      const start = rangeFrom - nb.nodeSize;
      if (!emptyRanges.some((r) => r.from === start)) {
        emptyRanges.push({ from: start, to: rangeFrom });
      }
    }
  }

  let tr = state.tr;
  for (let i = emptyRanges.length - 1; i >= 0; i--) {
    const r = emptyRanges[i]!;
    // Don't delete the only remaining block in the doc
    if (tr.doc.childCount <= 1 && emptyRanges.length >= tr.doc.childCount) continue;
    tr = tr.delete(r.from, r.to);
  }

  const mapFrom = tr.mapping.map(rangeFrom, -1);
  const mapTo = tr.mapping.map(rangeTo, 1);
  const size = tr.doc.content.size;
  const selFrom = Math.max(0, Math.min(mapFrom, size));
  const selTo = Math.max(selFrom, Math.min(mapTo, size));

  try {
    if (selFrom === selTo) {
      tr = tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(selFrom, size))));
    } else {
      tr = tr.setSelection(TextSelection.create(tr.doc, selFrom, selTo));
    }
  } catch {
    // keep previous selection mapping if any
  }

  if (tr.docChanged || !selection.eq(tr.selection)) {
    editor.view.dispatch(tr);
  }
}

/** After list toggle, remove empty list items that still produce a floating number. */
export function cleanupEmptyListItems(editor: Editor): void {
  const { state } = editor;
  const empty: { from: number; to: number }[] = [];

  state.doc.descendants((node, pos) => {
    if (node.type.name !== "listItem" && node.type.name !== "taskItem") return;
    if (nodeIsVisuallyEmpty(node)) {
      empty.push({ from: pos, to: pos + node.nodeSize });
    }
  });

  if (empty.length === 0) return;

  let tr = state.tr;
  for (let i = empty.length - 1; i >= 0; i--) {
    const r = empty[i]!;
    tr = tr.delete(r.from, r.to);
  }

  // Drop empty ordered/bullet/task lists left behind
  const emptyLists: { from: number; to: number }[] = [];
  tr.doc.descendants((node, pos) => {
    if (
      (node.type.name === "orderedList" ||
        node.type.name === "bulletList" ||
        node.type.name === "taskList") &&
      node.childCount === 0
    ) {
      emptyLists.push({ from: pos, to: pos + node.nodeSize });
    }
  });
  for (let i = emptyLists.length - 1; i >= 0; i--) {
    const r = emptyLists[i]!;
    tr = tr.delete(r.from, r.to);
  }

  if (tr.docChanged) editor.view.dispatch(tr);
}

export function toggleBulletListSmart(editor: Editor) {
  prepareSelectionForList(editor);
  editor.chain().focus().toggleBulletList().run();
  cleanupEmptyListItems(editor);
}

export function toggleOrderedListSmart(editor: Editor) {
  prepareSelectionForList(editor);
  editor.chain().focus().toggleOrderedList().run();
  cleanupEmptyListItems(editor);
}

export function toggleTaskListSmart(editor: Editor) {
  prepareSelectionForList(editor);
  editor.chain().focus().toggleTaskList().run();
  cleanupEmptyListItems(editor);
}
