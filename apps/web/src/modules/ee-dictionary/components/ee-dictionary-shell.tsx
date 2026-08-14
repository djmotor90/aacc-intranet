"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Search, Table2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { EeSearchIndexEntry } from "../queries";
import { EeSearchQueryProvider, Highlighted } from "./search-highlight";

interface Match {
  entry: EeSearchIndexEntry;
  /** Column names that matched the query (empty when only the table name matched). */
  matchedColumns: string[];
}

function filterIndex(index: EeSearchIndexEntry[], query: string): Match[] {
  const q = query.trim().toLowerCase();
  if (!q) return index.map((entry) => ({ entry, matchedColumns: [] }));

  const results: Match[] = [];
  for (const entry of index) {
    const tableHit = entry.fullName.toLowerCase().includes(q);
    const matchedColumns = entry.columnNames.filter((c) => c.toLowerCase().includes(q));
    if (tableHit || matchedColumns.length > 0) {
      results.push({ entry, matchedColumns });
    }
  }
  return results;
}

export function EeDictionaryShell({
  index,
  children,
}: {
  index: EeSearchIndexEntry[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  const matches = useMemo(() => filterIndex(index, query), [index, query]);
  const activeFullName = decodeURIComponent(pathname.split("/ee-dictionary/")[1] ?? "");

  return (
    <div className="flex h-full min-h-0 flex-1 gap-4">
      <div className="flex w-80 shrink-0 flex-col gap-2 border-r pr-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tables & columns…"
            className="pl-8"
            autoFocus
          />
        </div>
        <p className="px-1 text-xs text-muted-foreground">
          {matches.length} of {index.length} tables
        </p>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {matches.length === 0 && (
            <p className="px-1 py-4 text-center text-sm text-muted-foreground">No matches.</p>
          )}
          {matches.map(({ entry, matchedColumns }) => {
            const active = entry.fullName === activeFullName;
            return (
              <Link
                key={entry.id}
                href={`/ee-dictionary/${encodeURIComponent(entry.fullName)}`}
                className={cn(
                  "flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                  active && "bg-muted font-medium",
                )}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Table2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <Highlighted text={entry.fullName} query={query} />
                </span>
                {matchedColumns.length > 0 && (
                  <span className="truncate pl-5 text-xs text-muted-foreground">
                    matched:{" "}
                    {matchedColumns.slice(0, 4).map((c, i) => (
                      <span key={c}>
                        {i > 0 && ", "}
                        <Highlighted text={c} query={query} />
                      </span>
                    ))}
                    {matchedColumns.length > 4 && ` +${matchedColumns.length - 4}`}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EeSearchQueryProvider query={query}>{children}</EeSearchQueryProvider>
      </div>
    </div>
  );
}
