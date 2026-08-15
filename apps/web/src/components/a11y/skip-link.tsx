/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { MAIN_CONTENT_ID } from "./constants";

/** First focusable control on every page — WCAG 2.4.1 Bypass Blocks. */
export function SkipLink({
  href = `#${MAIN_CONTENT_ID}`,
  children = "Skip to main content",
}: {
  href?: string;
  children?: string;
}) {
  return (
    <a href={href} className="skip-link">
      {children}
    </a>
  );
}
