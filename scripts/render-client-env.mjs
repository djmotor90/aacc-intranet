/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Render deploy/clients/<id>/.env.template → stdout or --out file.
 *
 * Usage:
 *   node scripts/render-client-env.mjs deploy/clients/acme-corp
 *   node scripts/render-client-env.mjs deploy/clients/acme-corp --out .env.acme
 *   node scripts/render-client-env.mjs deploy/clients/acme-corp --generate-secrets
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function usage() {
  console.error(`Usage: node scripts/render-client-env.mjs <client-dir> [--out path] [--generate-secrets]

  client-dir   e.g. deploy/clients/acme-corp (must contain client.json + .env.template)
  --out        write file instead of stdout
  --generate-secrets  fill AUTH_SECRET / SECRETS / COLLAB with openssl-style random values
`);
  process.exit(1);
}

function secret() {
  return randomBytes(32).toString("base64");
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) usage();

  const clientDir = resolve(root, args[0]);
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 ? resolve(root, args[outIdx + 1] ?? "") : null;
  const genSecrets = args.includes("--generate-secrets");

  const configPath = join(clientDir, "client.json");
  const localTemplate = join(clientDir, ".env.template");
  const sharedTemplate = join(root, "deploy/clients/_template/.env.template");
  const templatePath = existsSync(localTemplate) ? localTemplate : sharedTemplate;
  if (!existsSync(configPath)) {
    console.error(`Missing ${configPath}`);
    process.exit(1);
  }
  if (!existsSync(templatePath)) {
    console.error(`Missing .env.template (checked client dir and _template)`);
    process.exit(1);
  }

  const client = JSON.parse(readFileSync(configPath, "utf8"));
  const template = readFileSync(templatePath, "utf8");

  const domain = client.primaryDomain || "localhost:3000";
  const https = !domain.includes("localhost");
  const base = `${https ? "https" : "http"}://${domain}`;

  const map = {
    PRIMARY_DOMAIN: domain,
    DATABASE_URL:
      process.env.DATABASE_URL ||
      `postgres://aacc_hub:CHANGE_ME@localhost:5432/${client.database?.name || "aacc_hub"}`,
    AUTH_SECRET: genSecrets ? secret() : process.env.AUTH_SECRET || "CHANGE_ME_openssl_rand_base64_32",
    ENTRA_TENANT_ID: client.auth?.entraTenantId || "",
    ENTRA_WEB_CLIENT_ID: client.auth?.webAppClientId || "",
    ENTRA_WEB_CLIENT_SECRET: process.env.ENTRA_WEB_CLIENT_SECRET || "CHANGE_ME",
    ENTRA_DAEMON_CLIENT_ID: client.auth?.daemonClientId || "",
    ENTRA_DAEMON_CLIENT_SECRET: process.env.ENTRA_DAEMON_CLIENT_SECRET || "CHANGE_ME",
    MAIL_TRANSPORT: client.mail?.transport || "graph",
    SMTP_HOST: process.env.SMTP_HOST || "localhost",
    SMTP_PORT: process.env.SMTP_PORT || "1025",
    GRAPH_SENDER_UPN: client.mail?.senderUpn || "",
    S3_ENDPOINT: client.storage?.endpoint || "",
    S3_REGION: client.storage?.region || "us-west-1",
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || "CHANGE_ME",
    S3_SECRET_KEY: process.env.S3_SECRET_KEY || "CHANGE_ME",
    S3_BUCKET_ATTACHMENTS: client.storage?.bucketAttachments || `${client.slug}-attachments`,
    S3_BUCKET_PHOTOS: client.storage?.bucketPhotos || `${client.slug}-photos`,
    S3_FORCE_PATH_STYLE:
      client.storage?.endpoint?.includes("localhost") || client.storage?.endpoint?.includes("minio")
        ? "true"
        : "false",
    TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY || "",
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY || "",
    SECRETS_ENCRYPTION_KEY: genSecrets
      ? secret()
      : process.env.SECRETS_ENCRYPTION_KEY || "CHANGE_ME_openssl_rand_base64_32",
    COLLAB_PUBLIC_WS_URL:
      client.collab?.enabled === false
        ? "off"
        : client.collab?.publicWsUrl || (https ? `wss://${domain}/collab` : "ws://localhost:1234"),
    COLLAB_PORT: process.env.COLLAB_PORT || "1234",
    COLLAB_TOKEN_SECRET: genSecrets
      ? secret()
      : process.env.COLLAB_TOKEN_SECRET || process.env.AUTH_SECRET || "CHANGE_ME",
    CLIENT_ADMIN_EMAIL: client.admin?.email || "",
    CLIENT_ADMIN_NAME: client.admin?.displayName || "Platform Admin",
    CLIENT_DISPLAY_NAME: client.displayName || client.clientId || "",
  };

  // Also allow APP_BASE_URL style from domain
  let rendered = template;
  for (const [key, value] of Object.entries(map)) {
    rendered = rendered.replaceAll(`{{${key}}}`, String(value ?? ""));
  }

  // Leftover placeholders
  const leftovers = [...rendered.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((m) => m[1]);
  if (leftovers.length) {
    console.error("Warning: unreplaced placeholders:", [...new Set(leftovers)].join(", "));
  }

  // Helpful header
  const header = `# Generated for client: ${client.clientId} (${client.displayName})
# Domain: ${base}
# Do not commit secrets. Generated: ${new Date().toISOString()}
#
`;

  const output = header + rendered;

  if (outPath) {
    writeFileSync(outPath, output, "utf8");
    console.error(`Wrote ${outPath}`);
  } else {
    process.stdout.write(output);
  }
}

main();
