/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { decryptWithKey, encryptWithKey, type EncryptedBlob } from "@aitim/shared";

let cachedKey: Buffer | null = null;

/**
 * Encryption key for the Secrets vault (AES-256-GCM), read from
 * `SECRETS_ENCRYPTION_KEY` (base64, 32 bytes — generate with
 * `openssl rand -base64 32`).
 *
 * There is no key-rotation support: changing or losing this value makes
 * every existing encrypted secret permanently unreadable. Back it up like
 * any other production credential.
 */
function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add it to .env.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `SECRETS_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Generate one with \`openssl rand -base64 32\`.`,
    );
  }
  cachedKey = key;
  return key;
}

export function encryptSecretValues(values: Record<string, string>): EncryptedBlob {
  return encryptWithKey(JSON.stringify(values), getEncryptionKey());
}

export function decryptSecretValues(blob: EncryptedBlob): Record<string, string> {
  return JSON.parse(decryptWithKey(blob, getEncryptionKey()));
}
