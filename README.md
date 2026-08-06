# AACC Operations Hub

> **Proprietary software** — Copyright © 2024–2026 **Kim Gurinov** (Gurver).  
> All rights reserved. See [`LICENSE`](./LICENSE), [`COPYRIGHT`](./COPYRIGHT), and [`NOTICE`](./NOTICE).  
> Author: Kim Gurinov · `kurinov@gurver.org` · `kim@gurver.com` · [gurver.com](https://gurver.com)  
> Code fingerprint: `GURVER-KG-AITIM-2026-7F3C9E2A` · stamp: `kg@gurver::aitim-intranet`

An internal operations platform for Anne Arundel Community College: one shared
workspace for workflows, requests, projects, knowledge, documents, and team
coordination. Microsoft Entra ID SSO and modular architecture support secure,
department-aware growth across AACC.

Current modules include Tasks (Spaces → Folders → Lists → Tasks, custom fields,
table/board/form views, public request intake) and Docs (collaborative knowledge
pages, task links, protection, verification, and shared editing).

### Ownership tooling

```bash
pnpm ownership:stamp    # add headers to any unstamped source files
pnpm ownership:verify   # CI check: core markers + every source file header
pnpm ownership:hooks    # enable git pre-commit auto-stamp (also runs on install)
```

New/changed files under `apps/`, `packages/`, and `scripts/` get the proprietary
header on commit via `.githooks/pre-commit`. CI runs `pnpm ownership:verify` on
every push/PR to `main`.

## Stack

Next.js 16 (App Router) · PostgreSQL 18 · Drizzle ORM · Auth.js v5 (Entra ID) ·
pg-boss · MinIO · Tailwind v4 + shadcn/ui · deployed on Coolify.

Local Docker uses `postgres:18-alpine` (`docker/docker-compose.dev.yml`).  
**pgvector** is not required today (no embedding columns yet); safe to enable on the
server for future AI/search work without changing app code until we add vectors.

## Development

```bash
pnpm install
cp .env.example .env   # fill in Entra credentials
pnpm db:migrate
pnpm db:seed

# One command — starts Docker infra (detached), then web + worker
pnpm dev:all          # http://localhost:3000  (Ctrl-C stops web/worker; infra stays up)
```

Logs are prefixed by service: `[web]`, `[worker]`. Infra runs detached so a Next.js
port conflict or crash does **not** tear down Postgres/MinIO/Mailpit.

### Granular scripts

```bash
pnpm dev:infra:up    # postgres + minio + mailpit  (detached, waits until healthy)
pnpm dev:infra       # same stack, foreground logs
pnpm dev:app         # Next.js + worker only
pnpm dev             # Next.js only                → http://localhost:3000
pnpm worker:dev      # background worker          (sync, emails, due-soon)
```

- Mailpit UI (captured dev email): http://localhost:8025
- MinIO console: http://localhost:9001 (aitim / aitim-dev-secret)
- `pnpm dev:infra:down` to stop and remove the dev containers
- If `pnpm dev:all` says port 3000 is in use: `kill $(lsof -tiTCP:3000 -sTCP:LISTEN)`

## Structure

```
apps/web             Next.js app (shell + modules in src/modules/*)
packages/db          Drizzle schema, migrations, seed
packages/shared      Zod schemas, custom-field type registry
deploy/              New-client bootstrap (config templates, checklist)
docker/              docker-compose.dev.yml (postgres, minio, mailpit)
docs/                entra-setup.md, coolify.md
Dockerfile           production build (Coolify-compatible defaults)
entrypoint.sh        production entrypoint (runs migrations then server)
```

## New client / production database

Schema is versioned in `packages/db/migrations` (source of truth).  
Client config templates live under `deploy/clients/`.

```bash
# 1. Copy template
cp -R deploy/clients/_template deploy/clients/acme-corp
# edit client.json

# 2. Render env (optional --generate-secrets)
pnpm client:env deploy/clients/acme-corp --generate-secrets --out .env.acme

# 3. Create DB + migrate (admin URL on stdin)
printf '%s' 'postgres://admin:…@host:5432/postgres' \
  | node scripts/setup-external-db.mjs acme_intranet

# 4. Baseline seed (modules, roles, break-glass admin)
DATABASE_URL='postgres://…/acme_intranet' \
  CLIENT_ADMIN_EMAIL=admin@acme.com \
  pnpm db:seed:baseline

# Or one-shot migrate + baseline:
DATABASE_URL='…' pnpm client:bootstrap deploy/clients/acme-corp
```

Full guide: [deploy/README.md](deploy/README.md).

## Docs

- [New client deploy / bootstrap](deploy/README.md)
- [Entra ID app registration setup](docs/entra-setup.md)
- [Coolify deployment](docs/coolify.md) — works with all default settings
- [What's New product changelog](docs/whats-new.md) — in-app megaphone feed (edit `apps/web/src/content/whats-new/entries.ts`)
- [Docs module](docs/docs-module.md) — knowledge pages / wiki (hub at `/docs`)
- [Agent instructions](AGENTS.md) — shared rules for Grok / Claude / GPT / Cursor
