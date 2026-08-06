/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedBlob {
  /** base64 */
  iv: string;
  /** base64, GCM auth tag */
  tag: string;
  /** base64 */
  ciphertext: string;
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * Pure AES-256-GCM helpers, key-agnostic — callers supply a 32-byte key
 * (see `apps/web/src/lib/secrets-crypto.ts` for the env-backed key used by
 * the Secrets vault feature).
 */
export function encryptWithKey(plaintext: string, key: Buffer): EncryptedBlob {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptWithKey(blob: EncryptedBlob, key: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(blob.iv, "base64"));
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
