/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { formatMoney, QUOTE_ORG, quoteTotals } from "../lib/stages";
import type { QuotePdfModel } from "../lib/quote-pdf";

function fmtDate(value: Date | string) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

export function QuoteDocument({ model }: { model: QuotePdfModel }) {
  const totals = quoteTotals(model);
  return (
    <article className="bg-white px-8 py-8 text-[#222] shadow-sm">
      <header className="flex items-start justify-between gap-6">
        <h1 className="max-w-[20rem] text-[15px] font-bold uppercase tracking-wide">{QUOTE_ORG.title}</h1>
        <div className="flex h-16 w-52 items-center justify-center rounded-sm bg-brand-teal text-xl font-bold tracking-wide text-white">
          AACC
        </div>
      </header>

      <div className="mt-8 grid gap-x-8 gap-y-4 text-[12px] sm:grid-cols-2">
        <div className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
          <span className="text-[#555]">Address</span>
          <div>
            {QUOTE_ORG.address.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <span className="text-[#555]">Prepared By</span>
          <span>{model.preparedBy || "—"}</span>
          <span className="text-[#555]">Phone</span>
          <span>{model.preparedPhone || QUOTE_ORG.phone}</span>
          <span className="text-[#555]">Email</span>
          <span>{model.preparedEmail || "—"}</span>
          <span className="text-[#555]">Bill To Name</span>
          <span>{model.billToName || "—"}</span>
        </div>
        <div className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1">
          <span className="text-[#555]">Created Date</span>
          <span>{fmtDate(model.createdAt)}</span>
          <span className="text-[#555]">Quote Number</span>
          <span>{model.number}</span>
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span className="text-[#555]">Ship To Name</span>
          <span>{model.shipToName || model.billToName || "—"}</span>
          <span className="text-[#555]">Ship To</span>
          <span className="whitespace-pre-wrap">{model.shipToAddress || "—"}</span>
        </div>
      </div>

      <table className="mt-8 w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-[#5d5d5d] text-left text-white">
            <th className="px-2 py-1.5 font-semibold">Product</th>
            <th className="w-24 px-2 py-1.5 text-right font-semibold">List Price</th>
            <th className="w-24 px-2 py-1.5 text-right font-semibold">Sales Price</th>
            <th className="w-20 px-2 py-1.5 text-right font-semibold">Quantity</th>
            <th className="w-24 px-2 py-1.5 text-right font-semibold">Total Price</th>
          </tr>
        </thead>
        <tbody>
          {model.lines.map((line, i) => (
            <tr key={`${line.name}-${i}`} className={i % 2 ? "bg-[#f3f3f3]" : "bg-white"}>
              <td className="px-2 py-1.5">{line.name}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(line.listPriceCents || line.unitPriceCents)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(line.unitPriceCents)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{line.quantity.toFixed(2)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(line.quantity * line.unitPriceCents)}</td>
            </tr>
          ))}
          {model.lines.length === 0 && (
            <tr>
              <td colSpan={5} className="px-2 py-4 text-[#666]">
                No products on this quote.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <dl className="ml-auto mt-6 grid w-64 grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[12px]">
        <dt>Subtotal</dt>
        <dd className="text-right tabular-nums">{formatMoney(totals.subtotal)}</dd>
        <dt>Discount</dt>
        <dd className="text-right tabular-nums">{(totals.discountBps / 100).toFixed(2)}%</dd>
        <dt>Total Price</dt>
        <dd className="text-right tabular-nums">{formatMoney(totals.total)}</dd>
        <dt className="font-semibold">Grand Total</dt>
        <dd className="text-right font-semibold tabular-nums">{formatMoney(totals.grand)}</dd>
      </dl>

      <p className="mt-16 text-center text-[10px] text-[#555]">{QUOTE_ORG.footer}</p>
    </article>
  );
}
