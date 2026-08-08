/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasXaiKey } from "@/lib/xai";
import { requireUser } from "@/lib/rbac";
import { CreateAgentForm } from "@/modules/chat/components/create-agent-form";
import { userCanCreateSuperAgent } from "@/lib/app-settings";

export const metadata: Metadata = {
  title: "Create Super Agent",
};

export default async function NewAgentPage() {
  const user = await requireUser();
  const canCreate = await userCanCreateSuperAgent(user.id);
  if (!canCreate) {
    redirect("/chat/agents");
  }
  return <CreateAgentForm xaiConfigured={hasXaiKey()} />;
}
