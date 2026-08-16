"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { FileText, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteQuotePdf, saveQuotePdf } from "../actions";
import type { QuotePdfModel } from "../lib/quote-pdf";
import { QuoteDocument } from "./quote-document";

export function CreateQuotePdfButton({ quoteId, model }: { quoteId: string; model: QuotePdfModel }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileText className="size-3.5" />
        Create PDF
      </Button>
      <QuotePdfDialog quoteId={quoteId} model={model} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function QuotePdfDialog({
  quoteId,
  model,
  open,
  onOpenChange,
}: {
  quoteId: string;
  model: QuotePdfModel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>PDF Preview</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto bg-[#e8e8e8] p-4">
          <div className="mx-auto max-w-[52rem]">
            <QuoteDocument model={model} />
          </div>
        </div>
        <DialogFooter className="m-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                try {
                  const saved = await saveQuotePdf(quoteId);
                  toast.success(`Saved ${saved.fileName} to this quote`);
                  onOpenChange(false);
                  router.refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not save PDF");
                }
              });
            }}
          >
            Save to Quote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QuotePdfList({
  pdfs,
}: {
  pdfs: { id: string; fileName: string; createdAt: Date; createdByName: string | null }[];
}) {
  if (pdfs.length === 0) {
    return <p className="text-sm text-muted-foreground">No PDFs yet. Use Create PDF to preview and save one.</p>;
  }
  return (
    <ul className="grid gap-1 text-sm">
      {pdfs.map((pdf) => (
        <QuotePdfRow key={pdf.id} pdf={pdf} />
      ))}
    </ul>
  );
}

function QuotePdfRow({
  pdf,
}: {
  pdf: { id: string; fileName: string; createdAt: Date; createdByName: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <li className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <a
          href={`/api/outreach/quote-pdfs/${pdf.id}`}
          className="text-primary hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          {pdf.fileName}
        </a>
        <span className="text-muted-foreground">
          {" "}
          · {pdf.createdByName ?? "Unknown"} · {pdf.createdAt.toLocaleDateString()}
        </span>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Delete ${pdf.fileName}`}
          onClick={() => setOpen(true)}
        >
          <Trash2 className="size-3.5" />
        </Button>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {pdf.fileName}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This removes the saved PDF from the quote. This cannot be undone.</p>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  try {
                    await deleteQuotePdf(pdf.id);
                    toast.success(`Deleted ${pdf.fileName}`);
                    setOpen(false);
                    router.refresh();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not delete PDF");
                  }
                });
              }}
            >
              {pending ? "Deleting…" : "Delete PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
