import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const KEY_PATH = path.join(process.cwd(), "data", ".image_key");
const ENV_KEY = "LLAMAROLE_IMAGE_KEY";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

/**
 * Get the 32-byte symmetric key used to encrypt generated images.
 *
 * Resolution order:
 *   1. `LLAMAROLE_IMAGE_KEY` env var (base64 of 32 random bytes)
 *   2. `data/.image_key` file (auto-generated on first run, chmod 600)
 *
 * If neither is present, a fresh key is generated, persisted, and a
 * one-time warning is logged. Setting the env var in production is
 * recommended so the key survives moves / backups cleanly.
 */
export async function getImageKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;

  // 1. Env var.
  const env = process.env[ENV_KEY];
  if (env) {
    const buf = Buffer.from(env, "base64");
    if (buf.length === KEY_BYTES) {
      cachedKey = buf;
      return buf;
    }
    console.warn(
      `[image-encryption] ${ENV_KEY} is set but not 32 bytes; ignoring.`,
    );
  }

  // 2. File on disk.
  try {
    const stored = await fs.readFile(KEY_PATH, "utf-8");
    const buf = Buffer.from(stored.trim(), "base64");
    if (buf.length === KEY_BYTES) {
      cachedKey = buf;
      return buf;
    }
  } catch {
    /* not present — fall through to generate */
  }

  // 3. Generate and persist.
  const fresh = randomBytes(KEY_BYTES);
  await fs.mkdir(path.dirname(KEY_PATH), { recursive: true });
  await fs.writeFile(KEY_PATH, fresh.toString("base64"), { mode: 0o600 });
  cachedKey = fresh;
  console.warn(
    `[image-encryption] Generated new key at ${KEY_PATH}. ` +
      `Set ${ENV_KEY} to a stable base64-encoded 32-byte key for portability.`,
  );
  return fresh;
}

/** Reset the in-memory cache. Test-only. */
export function _resetImageKeyCacheForTests(): void {
  cachedKey = null;
}

export async function encryptBuffer(plaintext: Buffer): Promise<Buffer> {
  const key = await getImageKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: IV (12) | ciphertext (N) | tag (16)
  return Buffer.concat([iv, ciphertext, tag]);
}

export async function decryptBuffer(blob: Buffer): Promise<Buffer> {
  if (blob.length < IV_BYTES + TAG_BYTES) {
    throw new Error("encrypted blob is too short");
  }
  const key = await getImageKey();
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(blob.length - TAG_BYTES);
  const ciphertext = blob.subarray(IV_BYTES, blob.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
