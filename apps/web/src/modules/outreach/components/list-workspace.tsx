"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";

export function ListWorkspace({
  objectLabel,
  viewName,
  icon,
  iconClass,
  count,
  actions,
  searchPlaceholder = "Search this list…",
  columns,
  rows,
}: {
  objectLabel: string;
  viewName: string;
  icon: ReactNode;
  iconClass: string;
  count: number;
  actions?: ReactNode;
  searchPlaceholder?: string;
  columns: { key: string; label: string; className?: string }[];
  rows: { id: string; href: string; searchText: string; cells: Record<string, ReactNode> }[];
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => row.searchText.toLowerCase().includes(needle));
  }, [q, rows]);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <span className={iconClass}>{icon}</span>
          <div>
            <p className="text-[11px] text-muted-foreground">{objectLabel}</p>
            <h1 className="text-lg font-bold text-foreground">{viewName}</h1>
            <p className="text-[11px] text-muted-foreground">
              {q
                ? `${filtered.length} of ${count} item${count === 1 ? "" : "s"} · Filtered`
                : `${count} item${count === 1 ? "" : "s"} · Sorted by name`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <label className="relative">
            <span className="sr-only">{searchPlaceholder}</span>
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 w-full max-w-56 pl-7 text-sm"
            />
          </label>
        </div>
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="bg-muted text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2"> </th>
              {columns.map((col) => (
                <th key={col.key} className={`px-3 py-2 ${col.className ?? ""}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={row.id} className="border-t border-border hover:bg-secondary/70">
                <td className="px-3 py-2 text-[11px] text-muted-foreground">{i + 1}</td>
                {columns.map((col, ci) => (
                  <td key={col.key} className="px-3 py-2">
                    {ci === 0 ? (
                      <Link href={row.href} className="font-medium text-primary hover:underline">
                        {row.cells[col.key]}
                      </Link>
                    ) : (
                      row.cells[col.key]
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-16 text-center text-sm text-muted-foreground">
                  No items to display.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
