/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
/**
 * Barrel — re-exports every domain's server actions so existing imports
 * (`from "../actions"` / `from "@/modules/tasks/actions"`) keep working
 * unchanged. The old monolithic actions.ts has been fully split into one
 * file per domain below plus shared.ts for cross-domain helpers.
 */
export * from "./lists";
export * from "./folders";
export * from "./spaces";
export * from "./space-members";
export * from "./list-members";
export * from "./statuses";
export * from "./custom-fields";
export * from "./tasks";
export * from "./follow";
export * from "./tags";
export * from "./secrets";
export * from "./comments";
export * from "./attachments";
export * from "./views";
export * from "./forms";
export * from "./task-types";
export * from "./checklists";
export * from "./time-entries";
export * from "./bulk";
