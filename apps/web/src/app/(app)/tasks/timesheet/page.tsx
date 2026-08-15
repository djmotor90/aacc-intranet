/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { requireUser } from "@/lib/rbac";
import { TimesheetPage } from "@/modules/tasks/components/timesheet-page";
import { startOfLocalWeek } from "@/modules/tasks/lib/time";
import { getUserTimeEntries } from "@/modules/tasks/queries";

export default async function MyTimesheetRoute() {
  const user = await requireUser();
  const from = startOfLocalWeek();
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  const entries = await getUserTimeEntries(user.id, from, to);
  return (
    <div className="p-6">
      <TimesheetPage initialEntries={entries} initialFrom={from.toISOString()} />
    </div>
  );
}
