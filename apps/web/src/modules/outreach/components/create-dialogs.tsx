"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAccount, createLead, createOpportunity, createPriceBook, createProduct, createQuoteFromOpportunity } from "../actions";
import { CONTEXT_LEVELS, formatMoney, QUOTE_STATUSES, quoteTotals } from "../lib/stages";

export function CreateLeadForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          New
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Lead</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(async () => {
              try {
                const row = await createLead({
                  firstName: String(data.get("firstName") ?? ""),
                  lastName: String(data.get("lastName") ?? ""),
                  title: String(data.get("title") ?? ""),
                  company: String(data.get("company") ?? ""),
                  email: String(data.get("email") ?? ""),
                  phone: String(data.get("phone") ?? ""),
                  source: String(data.get("source") ?? ""),
                  accountId: String(data.get("accountId") ?? "") || null,
                });
                toast.success("Lead created");
                router.push(`/outreach/leads/${row.id}`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not create lead");
              }
            });
          }}
        >
          <Field name="firstName" label="First name" required />
          <Field name="lastName" label="Last name" required />
          <Field name="title" label="Title" />
          <Field name="company" label="Company" />
          <Field name="email" label="Email" type="email" />
          <Field name="phone" label="Phone" />
          <Field name="source" label="Source" />
          <div className="grid gap-1.5">
            <Label htmlFor="accountId">Account</Label>
            <select id="accountId" name="accountId" className="h-8 rounded-md border bg-transparent px-2 text-sm">
              <option value="">None yet</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateOpportunityForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          New
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Opportunity</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(async () => {
              try {
                const row = await createOpportunity({
                  name: String(data.get("name") ?? ""),
                  accountId: String(data.get("accountId") ?? "") || null,
                  closeDate: String(data.get("closeDate") ?? "") || null,
                });
                toast.success("Opportunity created");
                router.push(`/outreach/opportunities/${row.id}`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not create opportunity");
              }
            });
          }}
        >
          <Field name="name" label="Opportunity name" required className="sm:col-span-2" />
          <div className="grid gap-1.5">
            <Label htmlFor="opp-account">Account</Label>
            <select id="opp-account" name="accountId" className="h-8 rounded-md border bg-transparent px-2 text-sm">
              <option value="">None</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <Field name="closeDate" label="Close date" type="date" />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateAccountForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          New
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Account</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(async () => {
              try {
                const row = await createAccount({
                  name: String(data.get("name") ?? ""),
                  website: String(data.get("website") ?? ""),
                  phone: String(data.get("phone") ?? ""),
                });
                toast.success("Account created");
                router.push(`/outreach/accounts/${row.id}`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not create account");
              }
            });
          }}
        >
          <Field name="name" label="Account name" required className="sm:col-span-2" />
          <Field name="website" label="Website" />
          <Field name="phone" label="Phone" />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateProductForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          New
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Product</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(async () => {
              try {
                const row = await createProduct({
                  name: String(data.get("name") ?? ""),
                  productCode: String(data.get("productCode") ?? ""),
                  family: String(data.get("family") ?? ""),
                  description: String(data.get("description") ?? ""),
                  hours: Number(data.get("hours") || 0),
                  unitPriceCents: Math.round(Number(data.get("price") || 0) * 100),
                  contextLevel: (String(data.get("contextLevel") || "none") as "none" | "light" | "full"),
                });
                toast.success("Product created");
                router.push(`/outreach/products/${row.id}`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not create product");
              }
            });
          }}
        >
          <Field name="name" label="Product name" required className="sm:col-span-2" />
          <Field name="productCode" label="Product code" />
          <Field name="family" label="Family" />
          <Field name="hours" label="Hours" type="number" />
          <Field name="price" label="List price ($)" type="number" />
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="contextLevel">Contextualization</Label>
            <select id="contextLevel" name="contextLevel" className="h-8 rounded-md border bg-transparent px-2 text-sm">
              {CONTEXT_LEVELS.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.label}
                </option>
              ))}
            </select>
          </div>
          <Field name="description" label="Description" className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreatePriceBookForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          New
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Price Book</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(async () => {
              try {
                const row = await createPriceBook({
                  name: String(data.get("name") ?? ""),
                  description: String(data.get("description") ?? ""),
                });
                toast.success("Price book created");
                router.push(`/outreach/price-books/${row.id}`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not create price book");
              }
            });
          }}
        >
          <Field name="name" label="Price book name" required />
          <Field name="description" label="Description" />
          <Button type="submit" disabled={pending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewQuoteDialog({
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [discountPct, setDiscountPct] = useState("0");
  const [tax, setTax] = useState("0");
  const [shipping, setShipping] = useState("0");
  const preview = quoteTotals({
    lines: [{ quantity: 1, unitPriceCents: lineSubtotalCents }],
    discountBps: Math.round(Number(discountPct || 0) * 100),
    taxCents: Math.round(Number(tax || 0) * 100),
    shippingCents: Math.round(Number(shipping || 0) * 100),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          New Quote
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New Quote</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(async () => {
              try {
                const row = await createQuoteFromOpportunity({
                  opportunityId,
                  name: String(data.get("name") ?? ""),
                  details: String(data.get("details") ?? ""),
                  notes: String(data.get("notes") ?? ""),
                  validUntil: String(data.get("validUntil") ?? "") || null,
                  status: String(data.get("status") || "draft") as (typeof QUOTE_STATUSES)[number]["id"],
                  discountBps: Math.round(Number(data.get("discountPct") || 0) * 100),
                  taxCents: Math.round(Number(data.get("tax") || 0) * 100),
                  shippingCents: Math.round(Number(data.get("shipping") || 0) * 100),
                  billToName: accountName,
                  shipToName: String(data.get("shipToName") ?? "") || accountName,
                  shipToAddress: String(data.get("shipToAddress") ?? ""),
                });
                toast.success("Quote drafted");
                setOpen(false);
                router.push(`/outreach/quotes/${row.id}`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not create quote");
              }
            });
          }}
        >
          <p className="text-[11px] text-muted-foreground sm:col-span-2">* = Required Information</p>
          <div className="rounded-lg border bg-muted/40 p-3 sm:col-span-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quote Information</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Quote Number</Label>
                <p className="text-sm text-muted-foreground">Assigned on save</p>
              </div>
              <Field name="validUntil" label="Expiration Date" type="date" />
              <Field name="name" label="Quote Name" required defaultValue={opportunityName} />
              <div className="grid gap-1.5">
                <Label htmlFor="quote-status">Status</Label>
                <select id="quote-status" name="status" defaultValue="draft" className="h-8 rounded-md border bg-transparent px-2 text-sm">
                  {QUOTE_STATUSES.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label>Opportunity Name</Label>
                <p className="text-sm">{opportunityName}</p>
              </div>
              <div className="grid gap-1.5 sm:row-span-2">
                <Label htmlFor="quote-notes">Description</Label>
                <textarea id="quote-notes" name="notes" rows={3} className="rounded-md border bg-transparent px-2 py-1.5 text-sm" />
              </div>
              <div className="grid gap-1.5">
                <Label>Account Name</Label>
                <p className="text-sm">{accountName || "—"}</p>
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="quote-details">Details</Label>
                <textarea id="quote-details" name="details" rows={2} className="rounded-md border bg-transparent px-2 py-1.5 text-sm" />
              </div>
              <Field name="shipToName" label="Ship To Name" defaultValue={accountName ?? ""} />
              <Field name="shipToAddress" label="Ship To" />
            </div>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3 sm:col-span-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Totals</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="discountPct">Discount (%)</Label>
                <Input
                  id="discountPct"
                  name="discountPct"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={discountPct}
                  onChange={(e) => setDiscountPct(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tax">Tax ($)</Label>
                <Input id="tax" name="tax" type="number" min={0} step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="shipping">Shipping and Handling ($)</Label>
                <Input
                  id="shipping"
                  name="shipping"
                  type="number"
                  min={0}
                  step="0.01"
                  value={shipping}
                  onChange={(e) => setShipping(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Grand Total</Label>
                <p className="text-sm font-semibold tabular-nums">{formatMoney(preview.grand)}</p>
                <p className="text-[11px] text-muted-foreground">Includes products currently on the opportunity.</p>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  className,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  className?: string;
  defaultValue?: string;
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={name}>
        {required ? <span className="text-destructive">* </span> : null}
        {label}
      </Label>
      <Input id={name} name={name} type={type} required={required} defaultValue={defaultValue} />
    </div>
  );
}
