"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addOpportunityLine,
  addQuoteLine,
  removeOpportunityLine,
  removeQuoteLine,
  updateOpportunityLine,
  updateQuoteLine,
} from "../actions";
import { CONTEXT_LEVELS, formatMoney, lineTotalCents, quoteTotals, type ContextLevel } from "../lib/stages";

type Line = {
  id: string;
  name: string;
  quantity: number;
  hours: number;
  unitPriceCents: number;
  contextLevel: ContextLevel;
};

type LineDraft = {
  name: string;
  quantity: number;
  hours: number;
  unitPriceCents: number;
  contextLevel: ContextLevel;
};

export function OpportunityLines({
  opportunityId,
  lines,
  catalog,
}: {
  opportunityId: string;
  lines: Line[];
  catalog: { id: string; name: string; defaultHours: number; defaultUnitPriceCents: number; defaultContext: ContextLevel }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const total = lines.reduce((sum, line) => sum + lineTotalCents(line.quantity, line.unitPriceCents), 0);

  return (
    <section aria-labelledby="products-heading">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="products-heading" className="sr-only">
          Products ({lines.length})
        </h2>
        <span className="text-sm font-medium tabular-nums">{formatMoney(total)}</span>
      </div>
      <LineTable
        lines={lines}
        pending={pending}
        onRemove={(id) => {
          startTransition(async () => {
            await removeOpportunityLine(id);
            router.refresh();
          });
        }}
        onSave={(id, input) => {
          startTransition(async () => {
            try {
              await updateOpportunityLine(id, input);
              router.refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not update product");
            }
          });
        }}
      />
      <AddLine
        catalog={catalog}
        pending={pending}
        onAdd={(input) => {
          startTransition(async () => {
            try {
              await addOpportunityLine({ opportunityId, ...input });
              router.refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not add product");
            }
          });
        }}
      />
    </section>
  );
}

export function QuoteLinesEditor({
  quoteId,
  lines,
  catalog,
  totals,
}: {
  quoteId: string;
  lines: Line[];
  catalog: { id: string; name: string; defaultHours: number; defaultUnitPriceCents: number; defaultContext: ContextLevel }[];
  totals?: ReturnType<typeof quoteTotals>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const total = totals?.grand ?? lines.reduce((sum, line) => sum + lineTotalCents(line.quantity, line.unitPriceCents), 0);
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="sr-only">Quote line items</h2>
        <span className="text-sm font-medium tabular-nums">{formatMoney(total)}</span>
      </div>
      <LineTable
        lines={lines}
        pending={pending}
        onRemove={(id) => {
          startTransition(async () => {
            await removeQuoteLine(id);
            router.refresh();
          });
        }}
        onSave={(id, input) => {
          startTransition(async () => {
            try {
              await updateQuoteLine(id, input);
              router.refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not update line");
            }
          });
        }}
      />
      <AddLine
        catalog={catalog}
        pending={pending}
        onAdd={(input) => {
          startTransition(async () => {
            await addQuoteLine({ quoteId, ...input });
            router.refresh();
          });
        }}
      />
    </section>
  );
}

function LineTable({
  lines,
  pending,
  onRemove,
  onSave,
}: {
  lines: Line[];
  pending: boolean;
  onRemove: (id: string) => void;
  onSave: (id: string, input: LineDraft) => void;
}) {
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[48rem] text-left text-sm">
        <thead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Product</th>
            <th className="w-20 py-1.5 pr-3 font-medium">Hours</th>
            <th className="w-44 py-1.5 pr-3 font-medium">Contextualization</th>
            <th className="w-28 py-1.5 pr-3 font-medium">Sales Price</th>
            <th className="w-20 py-1.5 pr-3 font-medium">Quantity</th>
            <th className="w-28 py-1.5 pr-3 font-medium">Subtotal</th>
            <th className="w-10 py-1.5 font-medium"> </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <EditableLineRow key={line.id} line={line} pending={pending} onRemove={onRemove} onSave={onSave} />
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={7} className="py-4 text-muted-foreground">
                No products yet. Add a catalog item below, then edit hours, price, or contextualization on the line.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function EditableLineRow({
  line,
  pending,
  onRemove,
  onSave,
}: {
  line: Line;
  pending: boolean;
  onRemove: (id: string) => void;
  onSave: (id: string, input: LineDraft) => void;
}) {
  function commit(next: Partial<LineDraft>) {
    const draft: LineDraft = {
      name: next.name ?? line.name,
      quantity: next.quantity ?? line.quantity,
      hours: next.hours ?? line.hours,
      unitPriceCents: next.unitPriceCents ?? line.unitPriceCents,
      contextLevel: next.contextLevel ?? line.contextLevel,
    };
    if (
      draft.name === line.name &&
      draft.quantity === line.quantity &&
      draft.hours === line.hours &&
      draft.unitPriceCents === line.unitPriceCents &&
      draft.contextLevel === line.contextLevel
    ) {
      return;
    }
    onSave(line.id, draft);
  }

  return (
    <tr className="border-t border-border">
      <td className="py-1.5 pr-3">
        <Input
          key={`${line.id}-name-${line.name}`}
          defaultValue={line.name}
          aria-label={`Product name for ${line.name}`}
          className="h-8 min-w-[12rem]"
          disabled={pending}
          onBlur={(e) => commit({ name: e.target.value })}
        />
      </td>
      <td className="py-1.5 pr-3">
        <Input
          key={`${line.id}-hours-${line.hours}`}
          type="number"
          min={0}
          defaultValue={line.hours}
          aria-label={`Hours for ${line.name}`}
          className="h-8 w-20"
          disabled={pending}
          onBlur={(e) => commit({ hours: Number(e.target.value || 0) })}
        />
      </td>
      <td className="py-1.5 pr-3">
        <select
          value={line.contextLevel}
          aria-label={`Contextualization for ${line.name}`}
          disabled={pending}
          className="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
          onChange={(e) => commit({ contextLevel: e.target.value as ContextLevel })}
        >
          {CONTEXT_LEVELS.map((level) => (
            <option key={level.id} value={level.id}>
              {level.label}
            </option>
          ))}
        </select>
      </td>
      <td className="py-1.5 pr-3">
        <Input
          key={`${line.id}-price-${line.unitPriceCents}`}
          type="number"
          min={0}
          step="0.01"
          defaultValue={(line.unitPriceCents / 100).toFixed(2)}
          aria-label={`Sales price for ${line.name}`}
          className="h-8 w-28"
          disabled={pending}
          onBlur={(e) => commit({ unitPriceCents: Math.round(Number(e.target.value || 0) * 100) })}
        />
      </td>
      <td className="py-1.5 pr-3">
        <Input
          key={`${line.id}-qty-${line.quantity}`}
          type="number"
          min={1}
          defaultValue={line.quantity}
          aria-label={`Quantity for ${line.name}`}
          className="h-8 w-20"
          disabled={pending}
          onBlur={(e) => commit({ quantity: Number(e.target.value || 1) })}
        />
      </td>
      <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums">
        {formatMoney(lineTotalCents(line.quantity, line.unitPriceCents))}
      </td>
      <td className="py-1.5 text-right">
        <button
          type="button"
          disabled={pending}
          aria-label={`Remove ${line.name}`}
          className="rounded-full p-1 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(line.id)}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </td>
    </tr>
  );
}

function AddLine({
  catalog,
  pending,
  onAdd,
}: {
  catalog: { id: string; name: string; defaultHours: number; defaultUnitPriceCents: number; defaultContext: ContextLevel }[];
  pending: boolean;
  onAdd: (input: {
    catalogItemId?: string | null;
    name: string;
    quantity: number;
    hours: number;
    unitPriceCents: number;
    contextLevel: ContextLevel;
  }) => void;
}) {
  return (
    <form
      className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const catalogId = String(data.get("catalogItemId") ?? "");
        const item = catalog.find((c) => c.id === catalogId);
        const name = String(data.get("name") ?? "") || item?.name || "";
        onAdd({
          catalogItemId: catalogId || null,
          name,
          quantity: Number(data.get("quantity") || 1),
          hours: Number(data.get("hours") || item?.defaultHours || 0),
          unitPriceCents: String(data.get("price") ?? "").trim()
            ? Math.round(Number(data.get("price")) * 100)
            : (item?.defaultUnitPriceCents ?? 0),
          contextLevel: (String(data.get("contextLevel") || item?.defaultContext || "none") as ContextLevel),
        });
        e.currentTarget.reset();
      }}
    >
      <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
        Catalog item
        <select name="catalogItemId" className="h-8 rounded-md border bg-transparent px-2 text-sm font-normal text-foreground" aria-label="Catalog item" defaultValue="">
          <option value="">Custom line</option>
          {catalog.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
        Name
        <Input name="name" placeholder="Name" aria-label="Line name" />
      </label>
      <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
        Contextualization
        <select name="contextLevel" className="h-8 rounded-md border bg-transparent px-2 text-sm font-normal text-foreground" aria-label="Contextualization" defaultValue="none">
          {CONTEXT_LEVELS.map((level) => (
            <option key={level.id} value={level.id}>
              {level.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
        Quantity
        <Input name="quantity" type="number" min={1} defaultValue={1} aria-label="Quantity" />
      </label>
      <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
        Hours
        <Input name="hours" type="number" min={0} placeholder="Hours" aria-label="Hours" />
      </label>
      <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
        Unit $
        <Input name="price" type="number" min={0} step="0.01" placeholder="Unit $" aria-label="Unit price" />
      </label>
      <Button type="submit" size="sm" disabled={pending} className="w-fit self-end">
        Add line
      </Button>
    </form>
  );
}
