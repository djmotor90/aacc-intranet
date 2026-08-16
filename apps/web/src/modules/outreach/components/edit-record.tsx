"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteQuote,
  updateAccount,
  updateLead,
  updateOpportunity,
  updatePriceBook,
  updateProduct,
  updateQuote,
} from "../actions";
import { CONTEXT_LEVELS, type ContextLevel } from "../lib/stages";

type Placement = "header" | "details";

function EditDialog({
  objectLabel,
  title,
  placement,
  children,
  onSubmit,
}: {
  objectLabel: string;
  title: string;
  placement: Placement;
  children: ReactNode;
  onSubmit: (data: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await onSubmit(data);
        toast.success(`${objectLabel} saved`);
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Could not save ${objectLabel.toLowerCase()}`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {placement === "details" ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-primary"
            aria-label={`Edit ${objectLabel}`}
          >
            <Pencil />
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline">
            Edit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
          {children}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  name,
  label,
  type = "text",
  defaultValue,
  required,
  className,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  defaultValue?: string | null;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} type={type} required={required} defaultValue={defaultValue ?? ""} />
    </div>
  );
}

function NotesField({ id, defaultValue }: { id: string; defaultValue?: string | null }) {
  return (
    <div className="grid gap-1.5 sm:col-span-2">
      <Label htmlFor={id}>Notes</Label>
      <Textarea id={id} name="notes" rows={3} defaultValue={defaultValue ?? ""} />
    </div>
  );
}

export function EditLeadButton({
  lead,
  placement = "header",
}: {
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    title: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
    source: string | null;
    notes: string | null;
  };
  placement?: Placement;
}) {
  const prefix = `${placement}-lead-${lead.id}`;
  return (
    <EditDialog
      objectLabel="Lead"
      title="Edit Lead"
      placement={placement}
      onSubmit={async (data) => {
        await updateLead(lead.id, {
          firstName: String(data.get("firstName") ?? ""),
          lastName: String(data.get("lastName") ?? ""),
          title: String(data.get("title") ?? ""),
          company: String(data.get("company") ?? ""),
          email: String(data.get("email") ?? ""),
          phone: String(data.get("phone") ?? ""),
          source: String(data.get("source") ?? ""),
          notes: String(data.get("notes") ?? ""),
        });
      }}
    >
      <Field id={`${prefix}-firstName`} name="firstName" label="First name" required defaultValue={lead.firstName} />
      <Field id={`${prefix}-lastName`} name="lastName" label="Last name" required defaultValue={lead.lastName} />
      <Field id={`${prefix}-title`} name="title" label="Title" defaultValue={lead.title} />
      <Field id={`${prefix}-company`} name="company" label="Company" defaultValue={lead.company} />
      <Field id={`${prefix}-email`} name="email" label="Email" type="email" defaultValue={lead.email} />
      <Field id={`${prefix}-phone`} name="phone" label="Phone" defaultValue={lead.phone} />
      <Field
        id={`${prefix}-source`}
        name="source"
        label="Lead source"
        defaultValue={lead.source}
        className="sm:col-span-2"
      />
      <NotesField id={`${prefix}-notes`} defaultValue={lead.notes} />
    </EditDialog>
  );
}

export function EditOpportunityButton({
  opportunity,
  placement = "header",
}: {
  opportunity: {
    id: string;
    name: string;
    closeDate: string | null;
    description: string | null;
  };
  placement?: Placement;
}) {
  const prefix = `${placement}-opp-${opportunity.id}`;
  return (
    <EditDialog
      objectLabel="Opportunity"
      title="Edit Opportunity"
      placement={placement}
      onSubmit={async (data) => {
        await updateOpportunity(opportunity.id, {
          name: String(data.get("name") ?? ""),
          closeDate: String(data.get("closeDate") ?? "") || null,
          description: String(data.get("description") ?? ""),
        });
      }}
    >
      <Field
        id={`${prefix}-name`}
        name="name"
        label="Opportunity name"
        required
        defaultValue={opportunity.name}
        className="sm:col-span-2"
      />
      <Field
        id={`${prefix}-closeDate`}
        name="closeDate"
        label="Close date"
        type="date"
        defaultValue={opportunity.closeDate}
      />
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor={`${prefix}-description`}>Description</Label>
        <Textarea
          id={`${prefix}-description`}
          name="description"
          rows={3}
          defaultValue={opportunity.description ?? ""}
        />
      </div>
    </EditDialog>
  );
}

export function EditAccountButton({
  account,
  placement = "header",
}: {
  account: {
    id: string;
    name: string;
    website: string | null;
    phone: string | null;
    notes: string | null;
  };
  placement?: Placement;
}) {
  const prefix = `${placement}-acct-${account.id}`;
  return (
    <EditDialog
      objectLabel="Account"
      title="Edit Account"
      placement={placement}
      onSubmit={async (data) => {
        await updateAccount(account.id, {
          name: String(data.get("name") ?? ""),
          website: String(data.get("website") ?? ""),
          phone: String(data.get("phone") ?? ""),
          notes: String(data.get("notes") ?? ""),
        });
      }}
    >
      <Field
        id={`${prefix}-name`}
        name="name"
        label="Account name"
        required
        defaultValue={account.name}
        className="sm:col-span-2"
      />
      <Field id={`${prefix}-website`} name="website" label="Website" defaultValue={account.website} />
      <Field id={`${prefix}-phone`} name="phone" label="Phone" defaultValue={account.phone} />
      <NotesField id={`${prefix}-notes`} defaultValue={account.notes} />
    </EditDialog>
  );
}

export function EditQuoteButton({
  quote,
  placement = "header",
}: {
  quote: {
    id: string;
    name: string | null;
    validUntil: string | null;
    details: string | null;
    notes: string | null;
    discountBps: number;
    taxCents: number;
    shippingCents: number;
    billToName: string | null;
    shipToName: string | null;
    shipToAddress: string | null;
  };
  placement?: Placement;
}) {
  const prefix = `${placement}-quote-${quote.id}`;
  return (
    <EditDialog
      objectLabel="Quote"
      title="Edit Quote"
      placement={placement}
      onSubmit={async (data) => {
        await updateQuote(quote.id, {
          name: String(data.get("name") ?? ""),
          validUntil: String(data.get("validUntil") ?? "") || null,
          details: String(data.get("details") ?? ""),
          notes: String(data.get("notes") ?? ""),
          discountBps: Math.round(Number(data.get("discountPct") || 0) * 100),
          taxCents: Math.round(Number(data.get("tax") || 0) * 100),
          shippingCents: Math.round(Number(data.get("shipping") || 0) * 100),
          billToName: String(data.get("billToName") ?? ""),
          shipToName: String(data.get("shipToName") ?? ""),
          shipToAddress: String(data.get("shipToAddress") ?? ""),
        });
      }}
    >
      <Field id={`${prefix}-name`} name="name" label="Quote name" defaultValue={quote.name} required />
      <Field
        id={`${prefix}-validUntil`}
        name="validUntil"
        label="Expiration date"
        type="date"
        defaultValue={quote.validUntil}
      />
      <Field id={`${prefix}-billToName`} name="billToName" label="Bill to name" defaultValue={quote.billToName} />
      <Field id={`${prefix}-shipToName`} name="shipToName" label="Ship to name" defaultValue={quote.shipToName} />
      <Field
        id={`${prefix}-shipToAddress`}
        name="shipToAddress"
        label="Ship to"
        defaultValue={quote.shipToAddress}
        className="sm:col-span-2"
      />
      <Field
        id={`${prefix}-discountPct`}
        name="discountPct"
        label="Discount (%)"
        type="number"
        defaultValue={String((quote.discountBps ?? 0) / 100)}
      />
      <Field
        id={`${prefix}-tax`}
        name="tax"
        label="Tax ($)"
        type="number"
        defaultValue={String((quote.taxCents ?? 0) / 100)}
      />
      <Field
        id={`${prefix}-shipping`}
        name="shipping"
        label="Shipping ($)"
        type="number"
        defaultValue={String((quote.shippingCents ?? 0) / 100)}
      />
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor={`${prefix}-details`}>Details</Label>
        <Textarea id={`${prefix}-details`} name="details" defaultValue={quote.details ?? ""} rows={3} />
      </div>
      <NotesField id={`${prefix}-notes`} defaultValue={quote.notes} />
    </EditDialog>
  );
}

export function DeleteQuoteButton({
  quoteId,
  label,
}: {
  quoteId: string;
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete quote {label}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This removes the quote, its line items, and any saved PDFs. Hub tasks stay in Tasks; only the link to this
          quote is removed. This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
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
                  await deleteQuote(quoteId);
                  toast.success(`Deleted ${label}`);
                  router.push("/outreach/quotes");
                  router.refresh();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not delete quote");
                }
              });
            }}
          >
            {pending ? "Deleting…" : "Delete quote"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EditProductButton({
  product,
  placement = "header",
}: {
  product: {
    id: string;
    name: string;
    productCode: string | null;
    family: string | null;
    description: string | null;
    defaultHours: number;
    defaultUnitPriceCents: number;
    defaultContext: ContextLevel;
    isActive: boolean;
  };
  placement?: Placement;
}) {
  const prefix = `${placement}-product-${product.id}`;
  return (
    <EditDialog
      objectLabel="Product"
      title="Edit Product"
      placement={placement}
      onSubmit={async (data) => {
        await updateProduct(product.id, {
          name: String(data.get("name") ?? ""),
          productCode: String(data.get("productCode") ?? ""),
          family: String(data.get("family") ?? ""),
          description: String(data.get("notes") ?? data.get("description") ?? ""),
          hours: Number(data.get("hours") || 0),
          unitPriceCents: Math.round(Number(data.get("price") || 0) * 100),
          contextLevel: String(data.get("contextLevel") || "none") as ContextLevel,
          isActive: String(data.get("isActive") ?? "true") === "true",
        });
      }}
    >
      <Field id={`${prefix}-name`} name="name" label="Product name" required defaultValue={product.name} className="sm:col-span-2" />
      <Field id={`${prefix}-productCode`} name="productCode" label="Product code" defaultValue={product.productCode} />
      <Field id={`${prefix}-family`} name="family" label="Family" defaultValue={product.family} />
      <Field id={`${prefix}-hours`} name="hours" label="Hours" type="number" defaultValue={String(product.defaultHours)} />
      <Field
        id={`${prefix}-price`}
        name="price"
        label="List price ($)"
        type="number"
        defaultValue={(product.defaultUnitPriceCents / 100).toFixed(2)}
      />
      <div className="grid gap-1.5">
        <Label htmlFor={`${prefix}-context`}>Contextualization</Label>
        <select
          id={`${prefix}-context`}
          name="contextLevel"
          defaultValue={product.defaultContext}
          className="h-8 rounded-md border bg-transparent px-2 text-sm"
        >
          {CONTEXT_LEVELS.map((level) => (
            <option key={level.id} value={level.id}>
              {level.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${prefix}-active`}>Active</Label>
        <select
          id={`${prefix}-active`}
          name="isActive"
          defaultValue={product.isActive ? "true" : "false"}
          className="h-8 rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>
      <NotesField id={`${prefix}-description`} defaultValue={product.description} />
    </EditDialog>
  );
}

export function EditPriceBookButton({
  book,
  placement = "header",
}: {
  book: { id: string; name: string; description: string | null; isActive: boolean; isStandard: boolean };
  placement?: Placement;
}) {
  const prefix = `${placement}-book-${book.id}`;
  return (
    <EditDialog
      objectLabel="Price Book"
      title="Edit Price Book"
      placement={placement}
      onSubmit={async (data) => {
        await updatePriceBook(book.id, {
          name: String(data.get("name") ?? ""),
          description: String(data.get("notes") ?? ""),
          isActive: String(data.get("isActive") ?? "true") === "true",
        });
      }}
    >
      <Field id={`${prefix}-name`} name="name" label="Price book name" required defaultValue={book.name} className="sm:col-span-2" />
      <div className="grid gap-1.5">
        <Label htmlFor={`${prefix}-active`}>Active</Label>
        <select
          id={`${prefix}-active`}
          name="isActive"
          defaultValue={book.isActive ? "true" : "false"}
          className="h-8 rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>
      <NotesField id={`${prefix}-description`} defaultValue={book.description} />
    </EditDialog>
  );
}
