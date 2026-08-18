/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { requireUser } from "@/lib/rbac";
import { FormsHubClient } from "@/modules/tasks/components/forms-hub-client";
import { getFormsHubForUser, listFormDestinations } from "@/modules/tasks/queries";

export default async function FormsHubPage() {
  const user = await requireUser();
  const [forms, destinations] = await Promise.all([
    getFormsHubForUser(user),
    listFormDestinations(user),
  ]);
  const publicBaseUrl =
    process.env.AUTH_URL?.replace(/\/$/, "") ||
    process.env.APP_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";

  return <FormsHubClient forms={forms} destinations={destinations} publicBaseUrl={publicBaseUrl} />;
}
