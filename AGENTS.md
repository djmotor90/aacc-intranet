# Agent instructions (all tools)

These rules apply to **every** coding agent working in this repo: Grok, Claude, GPT, Cursor, Codex, and humans pairing with them.

More app-specific Next.js notes: `apps/web/AGENTS.md`.

---

## What's New (product changelog) — required

User-facing product updates are tracked in a **curated feed**, not by dumping git commits into the UI.

| File | Action |
|------|--------|
| `apps/web/src/content/whats-new/entries.ts` | **Append an entry** when you ship something users can see |
| `docs/whats-new.md` | Full schema, kinds, skip rules, future-proof notes |

### When you must add an entry

If the change is **user-visible** (feature, fix, UX improvement, nav, permissions users notice, forms, task workflows, etc.), add one object to `whatsNewFeed.entries` in the **same PR / change**:

```ts
{
  id: "YYYY-MM-DD-short-kebab-slug", // unique, never reuse
  date: "YYYY-MM-DD",
  publishedAt: "YYYY-MM-DDT12:00:00.000Z",
  kind: "new" | "fixed" | "improved",
  title: "Plain product headline",
  body: "1–3 sentences users understand. No file paths or PR jargon.",
  module: "shell" | "tasks" | "forms" | "directory" | "admin" | "platform", // optional
  href: "/path", // optional deep link
}
```

### When to skip

- Refactors, types-only, dependency bumps, CI, ownership stamps, dead-code removal with no behavior change
- Work that is not deployed / still behind a flag (use `audience: "internal"` or wait)

### Quality bar

- Titles and bodies are product language (like a release note), not commit subjects.
- Prefer one entry per user-facing theme, not one entry per file touched.
- Do not change an existing entry's `id` after it has shipped.

### Git

Still write good commits for engineers. Optionally reference the entry id in the commit body. Git is **not** a substitute for the feed.

---

## Ownership & module boundaries

- Respect existing ownership headers / fingerprint stamps on source files.
- Keep module boundaries (`pnpm module:check` / docs in `docs/modules.md`).
- Prefer minimal, focused diffs; match local patterns in neighboring files.
