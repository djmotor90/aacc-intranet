# Docs module

Page-first knowledge base (better ClickUp Docs model). Product plan: research + phases in the session plan; this file is the **implementation map**.

## Model

- Everything is a **`doc_pages`** row (optional `kind: page | wiki` is display only).
- Nesting via `parent_page_id`.
- **Home space** (`home_space_id`) = ACL boundary (existing space membership).
- **Graph links** via `doc_links` → space | folder | list | task.
- Body: TipTap hybrid `{ text, doc }` (same as task descriptions).
- Attachments: `doc_attachments` + `/api/docs/...` (not task attachments).

## Key paths

| Area | Path |
|------|------|
| Schema | `packages/db/src/schema/docs.ts` |
| Migration | `packages/db/migrations/0033_docs_pages.sql` |
| Module | `apps/web/src/modules/docs/` |
| Hub | `/docs` |
| Page | `/docs/p/[pageId]/[[...slug]]` |
| Permissions | `create_docs`, `edit_docs`, `manage_docs` in `permissions-catalog.ts` |

## Create from anywhere

- Docs hub **New page**
- Task detail **Linked docs → New** (auto-links to task)
- Same `createPage` server action for all entry points

## Freshness & protect

- `verified_at` + **Mark verified**; stale after 90 days (`DOC_STALE_AFTER_DAYS`)
- `is_protected` blocks normal editors; manage_docs / space owner / Super Admin unlock

## Module boundaries

- `modules/docs` must not import `modules/tasks`
- Task page **App Router** composes `LinkedPagesPanel` from docs

## All Docs hub (ClickUp + Drive-style)

- Sidebar: **Docs** is a single nav item (no global page tree)
- `/docs` = **All Docs** hub with **folders** (Drive-style) + docs table
- `doc_folders` nest via `parent_folder_id`; docs sit in a folder via `doc_pages.folder_id` (whole `doc_id` moves together)
- Browse: breadcrumbs, open folder (`?folder=`), New folder, Move to…, rename/delete folder
- Columns: Name (+ lock, links, page count), Location (space), Updated, Sharing (owner)
- Templates: Project Overview, Meeting Notes, Wiki (shown at hub root)

## In-doc page / subpage / multi-subpage

- Equal peer pages share a `doc_id` (`parent_page_id` null = top-level in doc)
- Nested subpages via `parent_page_id` (unlimited depth)
- `getDocOutlineForPage` → left **Pages** outline on the open doc
- Folder structure is **hub organization**; page nesting is **inside a doc**

## Task embeds

- TipTap node `taskEmbed` + slash **Task**
- Live chip resolves number → title/status via `resolveTaskForEmbed`

## Live multiplayer (Yjs + Hocuspocus)

- Collab server: `apps/web/src/collab/server.ts` — `pnpm collab:dev` (port `COLLAB_PORT`, default **1234**)
- Token API: `POST /api/docs/collab-token` `{ pageId }` (session-auth, short-lived HMAC token)
- Client: `useDocCollab` + TipTap `Collaboration` + `CollaborationCaret` (remote carets / selections)
- Persistence: Yjs binary → `doc_pages.ydoc_state`; JSON mirror → `doc_pages.body` for non-collab readers
- Env: `AUTH_SECRET` (or `COLLAB_TOKEN_SECRET`), optional `NEXT_PUBLIC_COLLAB_URL=ws://localhost:1234`
- Presence chip in page chrome (Live + avatars of people in the doc)

## Phases remaining

- 1.5: favorites, page embeds, backlinks, export MD
- 2: revisions, last-viewed column, tags, comments
- 3: AI assists
