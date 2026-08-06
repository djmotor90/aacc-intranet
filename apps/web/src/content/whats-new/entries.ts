/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Curated product changelog. Newest entries first is optional — the feed
 * helpers sort by publishedAt. Prefer appending new objects at the top for
 * human readability when editing.
 *
 * When you ship a user-visible change (any AI or human), add an entry here.
 * See docs/whats-new.md.
 */

import type { WhatsNewFeed } from "./types";

export const whatsNewFeed: WhatsNewFeed = {
  schemaVersion: 1,
  entries: [
    {
      id: "2026-08-05-docs-all-docs-hub",
      date: "2026-08-05",
      publishedAt: "2026-08-05T22:00:00.000Z",
      kind: "improved",
      module: "shell",
      title: "All Docs hub — like ClickUp, without the sidebar tree",
      body: "Docs now opens a table of every root doc (name, location, updated, sharing). Nested pages and multi-level subpages live inside the open document outline — not under the main nav. Templates for Project Overview, Meeting Notes, and Wiki are on the hub.",
      href: "/docs",
      tags: ["docs", "hub", "wiki"],
    },
    {
      id: "2026-08-05-docs-tree-embeds",
      date: "2026-08-05",
      publishedAt: "2026-08-05T18:00:00.000Z",
      kind: "improved",
      module: "shell",
      title: "Live task embeds in Docs",
      body: "In any page, type / and choose Task to embed a live chip with number, title, and status that opens the task.",
      href: "/docs",
      tags: ["docs", "embeds"],
    },
    {
      id: "2026-08-05-docs-module",
      date: "2026-08-05",
      publishedAt: "2026-08-05T12:00:00.000Z",
      kind: "new",
      module: "shell",
      title: "Docs — knowledge pages next to your work",
      body: "Create SOPs, meeting notes, and wikis from the Docs hub or directly on a task. Pages live in a space, nest as subpages, support protect + verify for freshness, and link back to tasks so knowledge stays with the work.",
      href: "/docs",
      tags: ["docs", "wiki", "knowledge"],
    },
    {
      id: "2026-08-04-whats-new-header",
      date: "2026-08-04",
      publishedAt: "2026-08-04T12:00:00.000Z",
      kind: "new",
      module: "shell",
      title: '"What\'s New" updates in the header',
      body: "A megaphone icon in the top bar now shows what changed after each update, so you always know what's new since your last visit.",
      tags: ["changelog", "onboarding"],
    },
  ],
};
