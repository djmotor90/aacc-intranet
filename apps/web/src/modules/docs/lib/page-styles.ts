/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */

/** Page presentation preferences (client-persisted for now). */
export type DocFontStyle = "system" | "serif" | "mono";
export type DocFontSize = "small" | "default" | "large";
export type DocPageWidth = "default" | "full";

export type DocPageStyles = {
  fontStyle: DocFontStyle;
  fontSize: DocFontSize;
  pageWidth: DocPageWidth;
  showCover: boolean;
  showIconTitle: boolean;
  showOwners: boolean;
  showContributors: boolean;
  showSubtitle: boolean;
  showLastModified: boolean;
  showPageOutline: boolean;
  focusBlock: boolean;
  focusPage: boolean;
};

export const DEFAULT_DOC_PAGE_STYLES: DocPageStyles = {
  fontStyle: "system",
  fontSize: "default",
  pageWidth: "default",
  showCover: false,
  showIconTitle: true,
  showOwners: true,
  showContributors: false,
  showSubtitle: false,
  showLastModified: true,
  showPageOutline: false,
  focusBlock: false,
  focusPage: false,
};

const KEY_PREFIX = "aitim:doc-page-style:";

export function loadDocPageStyles(pageId: string): DocPageStyles {
  if (typeof window === "undefined") return { ...DEFAULT_DOC_PAGE_STYLES };
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + pageId);
    if (!raw) return { ...DEFAULT_DOC_PAGE_STYLES };
    const parsed = JSON.parse(raw) as Partial<DocPageStyles>;
    return { ...DEFAULT_DOC_PAGE_STYLES, ...parsed };
  } catch {
    return { ...DEFAULT_DOC_PAGE_STYLES };
  }
}

export function saveDocPageStyles(pageId: string, styles: DocPageStyles): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_PREFIX + pageId, JSON.stringify(styles));
  } catch {
    // ignore quota
  }
}

export function countWordsAndChars(text: string): { words: number; chars: number } {
  const trimmed = text.replace(/\s+/g, " ").trim();
  const chars = text.length;
  const words = trimmed ? trimmed.split(" ").filter(Boolean).length : 0;
  return { words, chars };
}

export function fontStyleClass(style: DocFontStyle): string {
  if (style === "serif") return "font-serif";
  if (style === "mono") return "font-mono";
  return "font-sans";
}

export function fontSizeClass(size: DocFontSize): string {
  if (size === "small") return "text-[13px] leading-relaxed [&_h1]:text-2xl [&_input]:text-[1.75rem]";
  if (size === "large") return "text-base leading-relaxed sm:text-lg [&_h1]:text-4xl [&_input]:text-[2.75rem]";
  return "text-[15px] leading-relaxed [&_h1]:text-3xl [&_input]:text-[2.5rem]";
}

export function pageWidthClass(width: DocPageWidth): string {
  return width === "full" ? "max-w-5xl" : "max-w-3xl";
}
