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
import { createAccount, createLead, createOpportunity, createPriceBook, createProduct } from "../actions";
import { CONTEXT_LEVELS } from "../lib/stages";

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

function Field({
  name,
  label,
  type = "text",
  required,
  className,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} />
    </div>
  );
}
