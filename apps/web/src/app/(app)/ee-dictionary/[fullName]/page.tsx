/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { notFound } from "next/navigation";
import { EeTableDetailView } from "@/modules/ee-dictionary/components/ee-table-detail";
import { getEeTableDetail } from "@/modules/ee-dictionary/queries";

export default async function EeDictionaryTablePage(props: {
  params: Promise<{ fullName: string }>;
}) {
  const { fullName } = await props.params;
  const table = await getEeTableDetail(decodeURIComponent(fullName));
  if (!table) notFound();

  return <EeTableDetailView table={table} />;
}
