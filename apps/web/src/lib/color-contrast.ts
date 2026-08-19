/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * WCAG 2.1 1.4.3 contrast helpers for user-picked colors (status, space, tags).
 */

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function parseHex(input: string | null | undefined): { r: number; g: number; b: number } | null {
  if (!input) return null;
  const raw = input.trim();
  const short = raw.match(/^#([0-9a-f]{3})$/i);
  if (short) {
    const [r, g, b] = short[1].split("").map((c) => parseInt(c + c, 16));
    return { r, g, b };
  }
  const full = raw.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
  if (full) {
    const n = full[1];
    return {
      r: parseInt(n.slice(0, 2), 16),
      g: parseInt(n.slice(2, 4), 16),
      b: parseInt(n.slice(4, 6), 16),
    };
  }
  return null;
}

function toHex({ r, g, b }: { r: number; g: number; b: number }) {
  const h = (n: number) => Math.round(clamp01(n / 255) * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function srgbChannel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: { r: number; g: number; b: number }) {
  return 0.2126 * srgbChannel(rgb.r) + 0.7152 * srgbChannel(rgb.g) + 0.0722 * srgbChannel(rgb.b);
}

export function contrastRatio(a: string, b: string): number {
  const A = parseHex(a);
  const B = parseHex(b);
  if (!A || !B) return 1;
  const L1 = luminance(A);
  const L2 = luminance(B);
  const light = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  return (light + 0.05) / (dark + 0.05);
}

function mix(
  from: { r: number; g: number; b: number },
  to: { r: number; g: number; b: number },
  amount: number,
) {
  const t = clamp01(amount);
  return {
    r: from.r + (to.r - from.r) * t,
    g: from.g + (to.g - from.g) * t,
    b: from.b + (to.b - from.b) * t,
  };
}

/** Darken or lighten `fg` until it meets `min` against `bg` (WCAG AA is 4.5). */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  const start = parseHex(fg);
  const back = parseHex(bg);
  if (!start || !back) return fg;
  if (contrastRatio(fg, bg) >= min) return fg.startsWith("#") ? fg.slice(0, 7) : fg;
  const toward = luminance(back) > 0.5 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  let lo = 0;
  let hi = 1;
  let best = start;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const candidate = mix(start, toward, mid);
    const hex = toHex(candidate);
    if (contrastRatio(hex, bg) >= min) {
      best = candidate;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return toHex(best);
}

/** Status/tag chip: tinted wash + text that stays 4.5:1 on that wash over white. */
export function tintedChipStyle(color: string, pageBg = "#ffffff"): { backgroundColor: string; color: string } {
  const rgb = parseHex(color);
  if (!rgb) return { backgroundColor: `${color}1f`, color };
  const wash = mix(parseHex(pageBg) ?? { r: 255, g: 255, b: 255 }, rgb, 0.12);
  const washHex = toHex(wash);
  return {
    backgroundColor: washHex,
    color: ensureContrast(color, washHex, 4.5),
  };
}

/** White or near-black text that meets 4.5:1 on a solid user color. */
export function onColorText(bg: string): string {
  const parsed = parseHex(bg);
  if (!parsed) return "#ffffff";
  const hex = toHex(parsed);
  const white = contrastRatio("#ffffff", hex);
  const ink = contrastRatio("#111827", hex);
  if (white >= 4.5 && white >= ink) return "#ffffff";
  if (ink >= 4.5) return "#111827";
  return ensureContrast(white >= ink ? "#ffffff" : "#111827", hex, 4.5);
}

/**
 * ClickUp-style option tag: pastel wash of the option color, with that color
 * as text (nudged to 4.5:1). The chip is only as wide as its label.
 */
export function optionTagStyle(color: string): { backgroundColor: string; color: string } {
  const rgb = parseHex(color);
  if (!rgb) return { backgroundColor: `${color}33`, color };
  const wash = mix({ r: 255, g: 255, b: 255 }, rgb, 0.24);
  const washHex = toHex(wash);
  const ink = toHex(rgb);
  return {
    backgroundColor: washHex,
    color: ensureContrast(ink, washHex, 4.5),
  };
}

/** Solid chip (tags, status pills filled with the raw color). */
export function solidChipStyle(bg: string): { backgroundColor: string; color: string } {
  const parsed = parseHex(bg);
  const backgroundColor = parsed ? toHex(parsed) : bg;
  return { backgroundColor, color: onColorText(backgroundColor) };
}
