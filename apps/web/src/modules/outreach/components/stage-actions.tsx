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
import { convertLead, updateLeadStatus, updateOpportunityStage, updateQuoteStatus } from "../actions";
import { PathBar } from "./path-bar";
import { LEAD_STATUSES, OPP_STAGES, QUOTE_STATUSES, type LeadStatus, type OppStage, type QuoteStatus } from "../lib/stages";
import { NewQuoteDialog } from "./create-dialogs";

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

export function BuildQuoteButton({
  opportunityId,
  opportunityName,
  accountName,
  lineSubtotalCents,
}: {
  opportunityId: string;
  opportunityName: string;
  accountName: string | null;
  lineSubtotalCents: number;
}) {
  return (
    <NewQuoteDialog
      opportunityId={opportunityId}
      opportunityName={opportunityName}
      accountName={accountName}
      lineSubtotalCents={lineSubtotalCents}
    />
  );
}

export function QuotePath({ quoteId, status }: { quoteId: string; status: QuoteStatus }) {
  const router = useRouter();
  return (
    <PathBar
      steps={QUOTE_STATUSES}
      current={status}
      onSelect={async (id) => {
        await updateQuoteStatus(quoteId, id as QuoteStatus);
        router.refresh();
      }}
      completeLabel="Mark Status as Complete"
    />
  );
}
