/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * App-wide WCAG 2.1 AA helpers (Section 508 / ADA Title II).
 * Pages should put primary content in an element with id={MAIN_CONTENT_ID}.
 */
export { MAIN_CONTENT_ID } from "./constants";
export { LiveAnnouncer, announce } from "./live-announcer";
export { SkipLink } from "./skip-link";
