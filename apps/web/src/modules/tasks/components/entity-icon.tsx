/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Folder, List, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sidebar icon/emoji for spaces, folders, and lists.
 * Renders the emoji alone (no colored circle). Color tints the fallback glyph only.
 */
export function EntityIcon({
  icon,
  color,
  fallback = "space",
  size = "sm",
  className,
}: {
  icon?: string | null;
  color?: string | null;
  fallback?: "space" | "folder" | "list";
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  // Folders never use custom emoji — only a colored folder glyph.
  const emoji = fallback === "folder" ? null : icon?.trim() || null;
  const tint = color?.trim() || undefined;

  const box =
    size === "xs"
      ? "size-4 text-sm"
      : size === "sm"
        ? "size-5 text-base"
        : size === "md"
          ? "size-7 text-xl"
          : "size-12 text-4xl";

  const lucideSize =
    size === "xs" ? "size-3.5" : size === "sm" ? "size-4" : size === "md" ? "size-5" : "size-8";

  let FallbackIcon: LucideIcon = List;
  if (fallback === "folder") FallbackIcon = Folder;
  if (fallback === "space") FallbackIcon = List;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center leading-none",
        box,
        className,
      )}
      aria-hidden
    >
      {emoji ? (
        <span className="select-none leading-none">{emoji}</span>
      ) : (
        <FallbackIcon
          className={cn(lucideSize, !tint && "text-muted-foreground")}
          style={tint ? { color: tint } : undefined}
          strokeWidth={2}
        />
      )}
    </span>
  );
}

export const APPEARANCE_COLORS = [
  "#007582",
  "#BE5513",
  "#64748b",
  "#ef4444",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#8b5cf6",
  "#ec4899",
  "#a855f7",
  "#06b6d4",
  "#84cc16",
] as const;

/** Curated emoji set similar to ClickUp’s Color & Icon picker. */
export const APPEARANCE_EMOJIS = [
  "🚀",
  "⭐",
  "🔥",
  "💡",
  "🎯",
  "📌",
  "🏠",
  "🏢",
  "💼",
  "📁",
  "📂",
  "📋",
  "✅",
  "📝",
  "📊",
  "📈",
  "🛠️",
  "⚙️",
  "🔒",
  "🔑",
  "👥",
  "👤",
  "💬",
  "📣",
  "🎨",
  "🧩",
  "🧠",
  "💻",
  "📱",
  "🌐",
  "🛒",
  "💰",
  "📦",
  "🚚",
  "🏗️",
  "🦺",
  "⚠️",
  "🛡️",
  "❤️",
  "💚",
  "💙",
  "💜",
  "🧡",
  "💛",
  "✨",
  "🌟",
  "🎉",
  "🏆",
  "📅",
  "⏰",
  "🔍",
  "📎",
  "🏷️",
  "🌈",
  "🌊",
  "🌴",
  "🍀",
  "🐶",
  "🐱",
  "🦊",
] as const;
