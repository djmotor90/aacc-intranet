# Deploy & new-client bootstrap

Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).  
Use this folder when spinning the intranet for a **new client** (or a fresh environment).

## What lives here

```
deploy/
  README.md                 ← this file
  clients/
    _template/              ← copy this for each client
      client.json           ← identity + bootstrap options
      .env.template         ← env file with {{PLACEHOLDERS}}
      NOTES.md              ← checklist / secrets location
    example-demo/           ← non-secret example (safe to commit)
  backups/                  ← optional local dumps (gitignored contents)
    .gitkeep
```

**Database schema** is versioned as Drizzle migrations in `packages/db/migrations/` — that is the source of truth, not a dump file.  
**Baseline data** (modules, roles, break-glass admin) is applied by `pnpm db:seed:baseline`.

**Postgres version:** target **18** (dev Docker image `postgres:18-alpine`). 16+ is fine.  
**pgvector:** not used by current schema/code. If the host has `CREATE EXTENSION vector`, leave it installed for future semantic search / AI — no migration depends on it today.

## New client in 10 minutes

### 1. Create a client folder

```bash
cp -R deploy/clients/_template deploy/clients/acme-corp
# edit deploy/clients/acme-corp/client.json
# fill secrets offline — never commit real .env files
```

### 2. Render env for that client

```bash
# writes .env.acme-corp at repo root (gitignored if you name it carefully)
# or pipe into your secrets store
node scripts/render-client-env.mjs deploy/clients/acme-corp
```

Copy the rendered file to the server / Coolify env UI as needed.  
Generate secrets:

```bash
openssl rand -base64 32   # AUTH_SECRET, SECRETS_ENCRYPTION_KEY
```

### 3. Create database + migrate + baseline seed

With an **admin** Postgres URL (can create databases):

```bash
# creates DB if missing, runs all migrations
printf '%s' 'postgres://admin:pass@host:5432/postgres' \
  | node scripts/setup-external-db.mjs acme_intranet

# apply baseline (modules, roles, optional admin user)
DATABASE_URL='postgres://app:pass@host:5432/acme_intranet' \
  pnpm db:seed:baseline
```

Or one-shot (migrations + baseline on existing `DATABASE_URL`):

```bash
export DATABASE_URL='postgres://…/acme_intranet'
pnpm db:migrate
pnpm db:seed:baseline
```

Optional overrides for the baseline admin:

```bash
CLIENT_ADMIN_EMAIL=admin@acme.com \
CLIENT_ADMIN_NAME='Acme Admin' \
pnpm db:seed:baseline
```

### 4. Deploy the app

- Point Coolify / Docker at the repo
- Set the rendered env vars (see `docs/coolify.md`)
- Ensure buckets exist for `S3_BUCKET_ATTACHMENTS` and `S3_BUCKET_PHOTOS`
- Production entrypoint already runs migrations on boot (`entrypoint.sh`)

### 5. Post-deploy checklist

See `deploy/clients/_template/NOTES.md`.

## Schema backup (optional)

To archive a **schema-only** SQL snapshot for audit / offline review (not a substitute for migrations):

```bash
# requires pg_dump on PATH
DATABASE_URL='postgres://…' node scripts/dump-schema-backup.mjs
# → deploy/backups/schema-YYYYMMDD-HHMMSS.sql
```

Restore is still done via **migrations** on a clean database. Dumps are documentation/backup only.

## What baseline seed creates

| Item | Purpose |
|------|---------|
| Module `tasks` | Tasks workspace app |
| Module `docs` | Docs entry (nav also from code registry) |
| Roles `guest` / `member` / `admin` | Permission matrix defaults |
| User from `CLIENT_ADMIN_EMAIL` | Break-glass Super Admin (`isProtectedAdmin`) |

It does **not** create demo spaces/tasks (use `pnpm db:seed` / `db:seed:sample` for local demos only).

## Multiplayer (docs collab)

Optional process per environment:

```bash
pnpm collab:dev   # or collab:start in prod
```

Set `NEXT_PUBLIC_COLLAB_URL` / `COLLAB_PORT` in the client env template.
