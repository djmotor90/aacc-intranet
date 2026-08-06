# Client provisioning checklist

Client folder: copy of `_template` → `deploy/clients/<clientId>/`

## Before go-live

- [ ] `client.json` filled (domain, admin email, Entra IDs, buckets)
- [ ] Entra web app + daemon app registered ([docs/entra-setup.md](../../../docs/entra-setup.md))
- [ ] Redirect URI: `https://<domain>/api/auth/callback/microsoft-entra-id`
- [ ] Postgres database created + migrations applied
- [ ] `pnpm db:seed:baseline` with `CLIENT_ADMIN_EMAIL`
- [ ] S3 / MinIO buckets created (attachments + photos)
- [ ] Coolify / host env vars set from rendered `.env` ([docs/coolify.md](../../../docs/coolify.md))
- [ ] First Super Admin can sign in (protected admin or Entra mapping)
- [ ] Optional: collab process + `NEXT_PUBLIC_COLLAB_URL` if multiplayer docs needed
- [ ] Turnstile keys for public forms (production keys, not test)
- [ ] `AUTH_SECRET` and `SECRETS_ENCRYPTION_KEY` stored in password manager  
      **Never rotate secrets encryption key** without re-encrypting vault data

## Secrets storage

Store real secrets **outside git** (1Password / Coolify encrypted env / Vault).  
This folder should only hold `client.json` (non-secret) and `NOTES.md`.

## After go-live

- [ ] Entra group → role mappings configured in Admin
- [ ] Spaces / lists created for the client
- [ ] Backup schedule for Postgres (provider snapshots)
- [ ] Document support contact in `client.json` → `contact`
