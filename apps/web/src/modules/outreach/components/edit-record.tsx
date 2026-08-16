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
import { updateAccount, updateLead, updateOpportunity, updateQuote } from "../actions";

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
      <DialogContent className="sm:max-w-lg">
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
    validUntil: string | null;
    notes: string | null;
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
          validUntil: String(data.get("validUntil") ?? "") || null,
          notes: String(data.get("notes") ?? ""),
        });
      }}
    >
      <Field
        id={`${prefix}-validUntil`}
        name="validUntil"
        label="Valid until"
        type="date"
        defaultValue={quote.validUntil}
      />
      <NotesField id={`${prefix}-notes`} defaultValue={quote.notes} />
    </EditDialog>
  );
}
