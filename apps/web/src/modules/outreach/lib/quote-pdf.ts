/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { formatMoney, QUOTE_ORG, quoteTotals } from "./stages";

export type QuotePdfLine = {
  name: string;
  listPriceCents: number;
  unitPriceCents: number;
  quantity: number;
};

export type QuotePdfModel = {
  number: string;
  createdAt: Date | string;
  preparedBy: string;
  preparedPhone?: string | null;
  preparedEmail?: string | null;
  billToName?: string | null;
  shipToName?: string | null;
  shipToAddress?: string | null;
  lines: QuotePdfLine[];
  discountBps: number;
  taxCents: number;
  shippingCents: number;
};

function winAnsi(value: string) {
  return [...value].map((ch) => (ch.charCodeAt(0) <= 255 ? ch : "?")).join("");
}

function pdfString(value: string) {
  return `(${winAnsi(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
}

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function fmtDate(value: Date | string) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

export function buildQuotePdf(model: QuotePdfModel): Uint8Array {
  const totals = quoteTotals(model);
  const pages: string[] = [];
  let stream = "";
  let y = 742;

  function newPage() {
    if (stream) pages.push(stream);
    stream = "BT\n";
    y = 742;
  }

  function font(name: "/F1" | "/F2", size: number) {
    stream += `${name} ${size} Tf\n`;
  }

  function text(x: number, at: number, value: string) {
    stream += `1 0 0 1 ${x.toFixed(2)} ${at.toFixed(2)} Tm ${pdfString(value)} Tj\n`;
  }

  function ensure(space: number) {
    if (y - space < 72) {
      stream += "ET\n";
      newPage();
    }
  }

  newPage();
  font("/F2", 14);
  text(48, y, QUOTE_ORG.title);
  stream += "ET\n";
  stream += "0 0.459 0.51 rg 360 700 204 56 re f 1 1 1 rg\nBT\n";
  font("/F2", 18);
  text(422, 722, "AACC");
  stream += "ET\n0 0 0 rg\nBT\n";
  y = 680;
  font("/F1", 9);
  text(48, y, "Address");
  font("/F1", 9);
  text(130, y, QUOTE_ORG.address[0]);
  font("/F1", 9);
  text(360, y, "Created Date");
  text(460, y, fmtDate(model.createdAt));
  y -= 13;
  text(130, y, QUOTE_ORG.address[1]);
  text(360, y, "Quote Number");
  text(460, y, model.number);
  y -= 13;
  text(130, y, QUOTE_ORG.address[2]);
  y -= 22;
  font("/F1", 9);
  text(48, y, "Prepared By");
  text(130, y, model.preparedBy || "—");
  y -= 13;
  text(48, y, "Phone");
  text(130, y, model.preparedPhone || QUOTE_ORG.phone);
  y -= 13;
  text(48, y, "Email");
  text(130, y, model.preparedEmail || "—");
  y -= 22;
  text(48, y, "Bill To Name");
  text(130, y, model.billToName || "—");
  text(360, y, "Ship To Name");
  text(460, y, model.shipToName || model.billToName || "—");
  y -= 13;
  if (model.shipToAddress) {
    text(360, y, "Ship To");
    const shipLines = wrap(model.shipToAddress, 28);
    for (const line of shipLines) {
      text(460, y, line);
      y -= 13;
    }
  } else {
    y -= 8;
  }
  y -= 10;
  stream += "ET\n0.35 0.35 0.35 rg 48 " + (y - 4).toFixed(2) + " 516 16 re f 1 1 1 rg\nBT\n";
  font("/F2", 8);
  text(54, y, "Product");
  text(318, y, "List Price");
  text(392, y, "Sales Price");
  text(470, y, "Quantity");
  text(528, y, "Total Price");
  stream += "ET\n0 0 0 rg\nBT\n";
  y -= 20;
  font("/F1", 8);
  model.lines.forEach((line, index) => {
    ensure(28);
    const names = wrap(line.name, 48);
    if (index % 2 === 1) {
      stream += "ET\n0.96 0.96 0.96 rg 48 " + (y - 4 - (names.length - 1) * 11).toFixed(2) + " 516 " + (14 + (names.length - 1) * 11).toFixed(2) + " re f 0 0 0 rg\nBT\n";
      font("/F1", 8);
    }
    names.forEach((part, i) => text(54, y - i * 11, part));
    text(318, y, formatMoney(line.listPriceCents || line.unitPriceCents));
    text(392, y, formatMoney(line.unitPriceCents));
    text(478, y, line.quantity.toFixed(2));
    text(528, y, formatMoney(line.quantity * line.unitPriceCents));
    y -= 16 + (names.length - 1) * 11;
  });
  if (model.lines.length === 0) {
    text(54, y, "No products on this quote.");
    y -= 18;
  }
  y -= 16;
  ensure(80);
  const rows: [string, string][] = [
    ["Subtotal", formatMoney(totals.subtotal)],
    ["Discount", `${(totals.discountBps / 100).toFixed(2)}%`],
    ["Total Price", formatMoney(totals.total)],
    ["Grand Total", formatMoney(totals.grand)],
  ];
  for (const [label, value] of rows) {
    font("/F1", 9);
    text(392, y, label);
    font("/F2", 9);
    text(488, y, value);
    y -= 14;
  }
  stream += "ET\nBT\n";
  font("/F1", 7);
  text(48, 36, QUOTE_ORG.footer);
  stream += "ET\n";
  pages.push(stream);

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const pageIds = pages.map((_, i) => 3 + i);
  objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  const contentStart = 3 + pages.length;
  pages.forEach((_, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentStart + i} 0 R /Resources << /Font << /F1 ${contentStart + pages.length} 0 R /F2 ${contentStart + pages.length + 1} 0 R >> >> >>`,
    );
  });
  pages.forEach((content) => {
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  let out = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

export function quotePdfFileName(number: string) {
  return `Quote-${number.replace(/[^\w.-]+/g, "-")}.pdf`;
}
