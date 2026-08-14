"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EeTableDetail } from "../queries";
import { AutoHighlight } from "./search-highlight";

export function EeTableDetailView({ table }: { table: EeTableDetail }) {
  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{table.schemaName}</p>
        <h1 className="font-mono text-xl font-semibold">
          <AutoHighlight text={table.fullName} />
        </h1>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
          Columns ({table.columns.length})
        </h2>
        {table.columns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No column data for this entry.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Nulls?</TableHead>
                <TableHead>Comments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.columns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-sm">
                    <AutoHighlight text={c.name} />
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    <AutoHighlight text={c.dataType} />
                  </TableCell>
                  <TableCell>
                    {c.nullable ? (
                      <span className="text-muted-foreground">Yes</span>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">No</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.comment ? <AutoHighlight text={c.comment} /> : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {table.indexes.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Indexes ({table.indexes.length})
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Index Name</TableHead>
                <TableHead>Unique</TableHead>
                <TableHead>Clustered</TableHead>
                <TableHead>Fields</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.indexes.map((ix) => (
                <TableRow key={ix.id}>
                  <TableCell className="font-mono text-sm">
                    <AutoHighlight text={ix.name} />
                  </TableCell>
                  <TableCell>{ix.isUnique ? "Yes" : "No"}</TableCell>
                  <TableCell>{ix.isClustered ? "Yes" : "No"}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    <AutoHighlight text={ix.fields} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
