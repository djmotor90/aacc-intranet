/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, eeDbColumns, eeDbIndexes, eeDbTables, withDbRetry } from "@aitim/db";
import { asc, eq } from "drizzle-orm";
import { cache } from "react";

export interface EeSearchIndexEntry {
  id: string;
  fullName: string;
  schemaName: string;
  tableName: string;
  columnNames: string[];
}

/**
 * Full search index — table names + their column names — sent to the client
 * once for instant local filtering (mirrors the Word Navigation pane's feel).
 * ~906 tables / ~9.5k columns, small enough to preload wholesale.
 */
export const getEeSearchIndex = cache(async (): Promise<EeSearchIndexEntry[]> => {
  const [tables, columns] = await withDbRetry(
    () =>
      Promise.all([
        db
          .select({
            id: eeDbTables.id,
            fullName: eeDbTables.fullName,
            schemaName: eeDbTables.schemaName,
            tableName: eeDbTables.tableName,
          })
          .from(eeDbTables)
          .orderBy(asc(eeDbTables.position)),
        db
          .select({ tableId: eeDbColumns.tableId, name: eeDbColumns.name })
          .from(eeDbColumns)
          .orderBy(asc(eeDbColumns.position)),
      ]),
    { attempts: 3, baseDelayMs: 300 },
  );

  const columnsByTable = new Map<string, string[]>();
  for (const c of columns) {
    const list = columnsByTable.get(c.tableId) ?? [];
    list.push(c.name);
    columnsByTable.set(c.tableId, list);
  }

  return tables.map((t) => ({
    ...t,
    columnNames: columnsByTable.get(t.id) ?? [],
  }));
});

export interface EeColumnRow {
  id: string;
  name: string;
  dataType: string;
  nullable: boolean;
  comment: string | null;
}

export interface EeIndexRow {
  id: string;
  name: string;
  isUnique: boolean;
  isClustered: boolean;
  fields: string;
}

export interface EeTableDetail {
  id: string;
  fullName: string;
  schemaName: string;
  tableName: string;
  columns: EeColumnRow[];
  indexes: EeIndexRow[];
}

export async function getEeTableDetail(fullName: string): Promise<EeTableDetail | null> {
  return withDbRetry(async () => {
    const [table] = await db.select().from(eeDbTables).where(eq(eeDbTables.fullName, fullName));
    if (!table) return null;

    const [columns, indexes] = await Promise.all([
      db
        .select({
          id: eeDbColumns.id,
          name: eeDbColumns.name,
          dataType: eeDbColumns.dataType,
          nullable: eeDbColumns.nullable,
          comment: eeDbColumns.comment,
        })
        .from(eeDbColumns)
        .where(eq(eeDbColumns.tableId, table.id))
        .orderBy(asc(eeDbColumns.position)),
      db
        .select({
          id: eeDbIndexes.id,
          name: eeDbIndexes.name,
          isUnique: eeDbIndexes.isUnique,
          isClustered: eeDbIndexes.isClustered,
          fields: eeDbIndexes.fields,
        })
        .from(eeDbIndexes)
        .where(eq(eeDbIndexes.tableId, table.id))
        .orderBy(asc(eeDbIndexes.position)),
    ]);

    return {
      id: table.id,
      fullName: table.fullName,
      schemaName: table.schemaName,
      tableName: table.tableName,
      columns,
      indexes,
    };
  }, { attempts: 3, baseDelayMs: 300 });
}
