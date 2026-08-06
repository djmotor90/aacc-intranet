# What's New (product changelog)

In-app megaphone in the header shows curated product updates — not a raw git log.

## Why a file, not only commits

| Source | Role |
|--------|------|
| `apps/web/src/content/whats-new/entries.ts` | **User-facing** copy (New / Fixed / Improved) |
| Git commits | Engineering history |
| AI chat memory | Not shared across Grok / Claude / GPT |

Every human or AI agent that ships a **user-visible** change must append an entry to the feed file.

## Where things live

| Path | Purpose |
|------|---------|
| `apps/web/src/content/whats-new/types.ts` | Schema (`WhatsNewEntry`, audience, modules) |
| `apps/web/src/content/whats-new/entries.ts` | **Edit this** when shipping |
| `apps/web/src/content/whats-new/index.ts` | Loaders / grouping / unseen helpers |
| `apps/web/src/lib/whats-new-storage.ts` | Client seen-state (localStorage v1) |
| `apps/web/src/components/shell/whats-new-*.tsx` | Header button + dialog UI |

## Entry checklist (required fields)

```ts
{
  id: "2026-08-04-short-kebab-slug", // stable forever; never reuse
  date: "2026-08-04",                 // YYYY-MM-DD shown in UI
  publishedAt: "2026-08-04T12:00:00.000Z", // unseen cursor (ISO)
  kind: "new" | "fixed" | "improved",
  title: "Short product headline",
  body: "One to three plain-language sentences.",
  // optional:
  href: "/tasks",           // in-app path
  module: "tasks",          // shell | tasks | forms | directory | admin | platform
  audience: "all",          // all | admin | internal
  hidden: false,            // soft-hide without deleting
  tags: ["search"],
}
```

### Kind guide

- **new** — net-new capability or surface
- **fixed** — bug or incorrect behavior users hit
- **improved** — faster / clearer / less friction (no new capability)

### Do write an entry when

- Users can see or use the change without reading code
- UX copy, workflow, pricing/display, permissions, nav, forms, etc. change

### Skip entries for

- Pure refactors, typing, deps, CI, internal renames
- Unreleased work (`audience: "internal"` or wait until ship)
- Hotfixes that only reverse a bad deploy with no lasting user story

## Multi-AI / multi-tool rule

Shared instruction lives in root **`AGENTS.md`** (also linked from `apps/web/AGENTS.md` / `CLAUDE.md`).

Any agent (Grok, Claude, GPT, Cursor, etc.) must:

1. Ship the feature/fix.
2. **Append** an entry to `entries.ts` in the same change when the work is user-visible.
3. Keep `id` unique; put newest entries near the top of the array for human editors.

## Seen-state (users)

- v1: `localStorage` key `aitim:whats-new:seen` stores `acknowledgedThrough` (max `publishedAt` dismissed).
- Returning users: unseen = entries with `publishedAt > acknowledgedThrough`.
- First visit (no seen-state): only the last **45 days** count as unseen (so a history backfill does not spam the badge). Full history is still available when opening the dialog after catch-up.
- Dialog auto-opens once per tab session when there are unseen items.
- **Got it** advances the cursor through all currently visible feed entries (max `publishedAt`).

### Future (designed for, not required now)

- Persist the same `WhatsNewSeenState` shape on the user row / prefs table for multi-device sync (`load`/`save` in `whats-new-storage.ts` only).
- Serve `getWhatsNewFeed()` from DB/admin instead of the static file (keep types + `schemaVersion`).
- Filter by `module` or role in digests / emails.
- Optional deep-link route `/whats-new` reusing `WhatsNewDialog` list layout.
- Optional CI: PRs labeled `user-facing` must touch `entries.ts`.

## Git still matters

Use clear commits for engineers. Optionally mention the entry id in the commit body:

```
feat(shell): add What's New header feed

whats-new: 2026-08-04-whats-new-header
```

Do **not** dump commit subjects into the product UI.
