/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
/**
 * Display labels for roles.
 *
 * Platform (tenant) roles:
 *   - Super Admin  → god mode (platformRole === "admin" / isProtectedAdmin)
 *   - Member       → normal platform user
 *
 * Space / list membership roles (internal keys stay owner|member|guest):
 *   - Admin  → was "Owner" — highest space role, controlled by permission matrix
 *   - Member
 *   - Guest
 *
 * Super Admin is intentionally NOT a column in Security & Permissions — they
 * bypass the matrix entirely.
 */

export type PlatformRole = "admin" | "member";
export type SpaceRoleKey = "owner" | "member" | "guest";

export function platformRoleLabel(
  role: string,
  opts?: { protected?: boolean },
): string {
  if (role === "admin" || opts?.protected) {
    return opts?.protected ? "Super Admin ★" : "Super Admin";
  }
  if (role === "member") return "Member";
  return role;
}

/** Internal space role key → UI label. */
export function spaceRoleLabel(role: string): string {
  switch (role) {
    case "owner":
      return "Admin";
    case "member":
      return "Member";
    case "guest":
      return "Guest";
    default:
      return role;
  }
}

/** Short help text for membership role selects. */
export const SPACE_ROLE_OPTIONS: { value: SpaceRoleKey; label: string }[] = [
  { value: "owner", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "guest", label: "Guest" },
];
