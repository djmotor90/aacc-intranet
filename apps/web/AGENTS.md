<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Web app agent notes

Also read the **repo-root** [`AGENTS.md`](../../AGENTS.md) (shared by Grok, Claude, GPT, Cursor, etc.).

## What's New feed

When shipping **user-visible** work in this app, append an entry to:

`src/content/whats-new/entries.ts`

Schema and rules: [`docs/whats-new.md`](../../docs/whats-new.md).

UI: header megaphone (`src/components/shell/whats-new-button.tsx`).
