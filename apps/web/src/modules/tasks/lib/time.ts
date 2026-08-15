/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */

/** Default daily capacity shown as 0h/8h in the tracker (ClickUp-style). */
export const DEFAULT_DAILY_CAPACITY_SECONDS = 8 * 60 * 60;

export const TIME_TRACKER_CHANGED_EVENT = "aitim:time-tracker-changed";

export function notifyTimeTrackerChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TIME_TRACKER_CHANGED_EVENT));
}

export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function elapsedSeconds(startedAt: Date | string, now = Date.now()): number {
  const start = startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((now - start) / 1000));
}

export function entryDurationSeconds(entry: {
  startedAt: Date | string;
  endedAt: Date | string | null;
  durationSeconds: number;
}, now = Date.now()): number {
  if (entry.endedAt) return Math.max(0, entry.durationSeconds);
  return elapsedSeconds(entry.startedAt, now);
}

/** Compact label: `45m`, `1h`, `1h 20m`, `0h`. */
export function formatDuration(totalSeconds: number, opts?: { zero?: string }): string {
  const zero = opts?.zero ?? "0h";
  const sec = Math.max(0, Math.floor(totalSeconds));
  if (sec === 0) return zero;
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds && !hours && minutes < 5) parts.push(`${seconds}s`);
  if (parts.length === 0) return zero;
  return parts.join(" ");
}

/** Running-timer display: `0:12:34`. */
export function formatTimerClock(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Parse ClickUp-style duration input.
 * Accepts `3h 20m`, `3h20m`, `1.5h`, `45m`, `90`, `3:20`, `1h 10m 5s`.
 */
export function parseDurationInput(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  const colon = text.match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (colon) {
    const h = Number(colon[1]);
    const m = Number(colon[2]);
    const s = colon[3] ? Number(colon[3]) : 0;
    return h * 3600 + m * 60 + s;
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0) return null;
    // Bare numbers are minutes (ClickUp treats "90" as 90 minutes).
    return Math.round(n * 60);
  }

  const token = /(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)|(?:(\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?)|(?:(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?)/g;
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = token.exec(text))) {
    matched = true;
    if (m[1]) hours += Number(m[1]);
    if (m[2]) minutes += Number(m[2]);
    if (m[3]) seconds += Number(m[3]);
  }
  if (!matched) return null;
  const total = Math.round(hours * 3600 + minutes * 60 + seconds);
  return total >= 0 ? total : null;
}

export function formatDateHeading(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatTimeOfDay(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatTimeRange(start: Date, end: Date | null): string {
  const left = `${formatDateHeading(start)}  ${formatTimeOfDay(start)}`;
  if (!end) return `${left} – running`;
  const sameDay = start.toDateString() === end.toDateString();
  const right = sameDay ? formatTimeOfDay(end) : `${formatDateHeading(end)}  ${formatTimeOfDay(end)}`;
  return `${left} – ${right}`;
}

export function formatTimeZoneLabel(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const offset = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const short = tz.split("/").pop()?.replaceAll("_", " ") ?? tz;
  return offset ? `${short} (${offset})` : short;
}

export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function startOfLocalDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfLocalDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfLocalWeek(date = new Date()): Date {
  const d = startOfLocalDay(date);
  const day = d.getDay(); // 0 Sun
  d.setDate(d.getDate() - day);
  return d;
}

export function normalizeTimeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const tag = item.trim().slice(0, 40);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.slice(0, 12);
}
