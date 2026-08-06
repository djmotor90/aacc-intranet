/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { notFound } from "next/navigation";
import { PageEditorClient } from "@/modules/docs/components/page-editor-client";
import {
  getDocOutlineForPage,
  getPageForUser,
  listPageLinks,
  listSpacesForDocs,
  resolveLinkLabels,
} from "@/modules/docs/queries";
import { requireUser } from "@/lib/rbac";

export default async function DocPageView({
  params,
}: {
  params: Promise<{ pageId: string; slug?: string[] }>;
}) {
  const user = await requireUser();
  const { pageId } = await params;
  const page = await getPageForUser(user, pageId);
  if (!page) notFound();

  const [links, outline, spaces] = await Promise.all([
    listPageLinks(page.id),
    getDocOutlineForPage(user, page.id),
    listSpacesForDocs(user),
  ]);
  const labels = await resolveLinkLabels(user, links);
  const relatedLinks = links.map((l) => {
    const key = `${l.targetType}:${l.targetId}`;
    const resolved = labels[key];
    return {
      key,
      label: resolved?.label ?? `${l.targetType} ${l.targetId.slice(0, 8)}`,
      href: resolved?.href ?? null,
    };
  });

  return (
    <PageEditorClient
      page={page}
      relatedLinks={relatedLinks}
      outline={outline}
      spaces={spaces.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
