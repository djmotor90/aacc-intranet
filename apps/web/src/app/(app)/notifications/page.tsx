/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { getNotificationsInbox } from "@/modules/shell/actions/notifications";
import { NotificationsPageClient } from "@/components/shell/notifications-page-client";

export default async function NotificationsPage() {
  const data = await getNotificationsInbox({ filter: "all", limit: 100 });
  return <NotificationsPageClient initial={data} />;
}
