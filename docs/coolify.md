# Coolify Deployment

One Coolify project, four resources on a shared network:

| Resource | Type | Notes |
|---|---|---|
| `postgres` | Coolify PostgreSQL **18** (or 16+) | Persistent volume; enable scheduled backups. **pgvector** optional — not used by the app yet |
| `minio` | Coolify MinIO | Create buckets `attachments`, `photos`; keep console internal |
| `intranet-web` | App (Dockerfile) | Build from repo; default CMD runs migrations then the server |
| `intranet-worker` | App (same Dockerfile) | Override start command: `node dist/worker.js`; no public domain |

## Web service

The production `Dockerfile` lives at the **repo root**, so Coolify works with
all defaults:

| Setting | Value |
|---|---|
| Build Pack | `Dockerfile` |
| Base Directory | *(empty — defaults to repo root)* |
| Dockerfile Location | *(empty — defaults to `Dockerfile`)* |

- **Domain:** `intranet.<your-domain>` (Coolify/Traefik handles TLS)
- **Healthcheck:** `GET /api/health`
- **Port:** 3000

The local equivalent is `docker build .` from the repo root.

## Environment variables (both services)

```
APP_BASE_URL=https://intranet.<your-domain>
DATABASE_URL=postgres://...   # internal Coolify postgres URL
DATABASE_POOL_MIN=1
DATABASE_POOL_MAX=10
DATABASE_CONNECT_TIMEOUT_MS=15000
PGBOSS_POOL_MAX=3
PGBOSS_CONNECT_TIMEOUT_MS=30000
AUTH_URL=https://intranet.<your-domain>   # MUST match public domain; pins OAuth redirect_uri
AUTH_SECRET=                  # openssl rand -base64 32
AUTH_TRUST_HOST=true
AUTH_MICROSOFT_ENTRA_ID_ID=
AUTH_MICROSOFT_ENTRA_ID_SECRET=
AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<tenant>/v2.0
ENTRA_TENANT_ID=
DAEMON_CLIENT_ID=
DAEMON_CLIENT_SECRET=
MAIL_TRANSPORT=graph
GRAPH_SENDER_UPN=intranet@<your-domain>
S3_ENDPOINT=http://minio:9000   # internal service URL
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET_ATTACHMENTS=attachments
S3_BUCKET_PHOTOS=photos
S3_FORCE_PATH_STYLE=true
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

Keep the web database pool and pg-boss pool separate. The defaults above use at
most 10 application connections plus 3 queue connections per service. Page reads
fail over to a fresh attempt after 15 seconds, while queue workers allow 30 seconds
for PostgreSQL or the container network to return during a restart. Increasing
these pools can make a reconnect storm worse; raise them only after checking
`pg_stat_activity` and the database's `max_connections`.

## Troubleshooting: SSE timing and database connection errors

A successful `/api/sse` request shown as taking 20–30 seconds is expected: it is
a live event stream and the duration is how long the connection stayed open. If
the same log window also shows failed Drizzle queries and pg-boss reports
`timeout exceeded when trying to connect` for several queues, treat those lines
as one shared PostgreSQL or container-network interruption—not as separate queue
failures. Check the Postgres health, resource usage, container restarts, network,
`pg_stat_activity`, and `max_connections` before changing pool sizes.

## Troubleshooting: OAuthCallbackError with container hostname

If `/login?error=OAuthCallbackError` shows a callback URL containing the
container ID instead of your domain (e.g. `https://8d202286fcb1:3000/...`),
the request reached Auth.js without a proper `Host` / `X-Forwarded-Host`
header. Two fixes:

1. **Set `AUTH_URL`** to your public domain (see env vars above). Auth.js
   v5 uses this as the canonical URL and ignores the headers entirely.
2. **Verify Coolify's proxy is in front of the service** — the `Domains`
   field must be attached, and the service must be on the same Docker
   network as Traefik. A quick test: `curl -H 'Host: intranet.<domain>'
   http://<service-ip>:3000/api/health` should return 200.

## Migrations

Run automatically by the web container entrypoint (`docker/entrypoint.sh`) before the
server starts. Drizzle's migrator takes a Postgres advisory lock, so restarts and
multiple replicas are safe.

## SSE

The app sends `X-Accel-Buffering: no` on event streams; Traefik defaults work as-is.
