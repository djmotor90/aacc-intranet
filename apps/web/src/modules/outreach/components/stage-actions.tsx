"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { convertLead, createQuoteFromOpportunity, updateLeadStatus, updateOpportunityStage } from "../actions";
import { PathBar } from "./path-bar";
import { LEAD_STATUSES, OPP_STAGES, type LeadStatus, type OppStage } from "../lib/stages";

export function LeadPath({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const router = useRouter();
  return (
    <PathBar
      steps={LEAD_STATUSES}
      current={status}
      onSelect={async (id) => {
        await updateLeadStatus(leadId, id as LeadStatus);
        router.refresh();
      }}
      completeLabel="Mark Status as Complete"
    />
  );
}

export function ConvertLeadButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          try {
            const { opportunityId } = await convertLead(leadId);
            toast.success("Lead converted");
            router.push(`/outreach/opportunities/${opportunityId}`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not convert lead");
          }
        });
      }}
    >
      Convert
    </Button>
  );
}

export function OpportunityPath({ opportunityId, stage }: { opportunityId: string; stage: OppStage }) {
  const router = useRouter();
  return (
    <PathBar
      steps={OPP_STAGES}
      current={stage}
      onSelect={async (id) => {
        await updateOpportunityStage(opportunityId, id as OppStage);
        router.refresh();
      }}
    />
  );
}

export function BuildQuoteButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          try {
            const quote = await createQuoteFromOpportunity(opportunityId);
            toast.success("Quote drafted");
            router.push(`/outreach/quotes/${quote.id}`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not build quote");
          }
        });
      }}
    >
      New Quote
    </Button>
  );
}
