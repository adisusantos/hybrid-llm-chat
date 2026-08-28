import "server-only";
import path from "node:path";
import fs from "node:fs/promises";
import { decryptBuffer, encryptBuffer } from "./encryption";

const IMAGE_DIR = path.join(process.cwd(), "data", "images");

export type StoredImage = {
  absPath: string;
  relPath: string; // relative to data/, e.g. "images/<chatId>/<file>.png"
};

export async function ensureImageDir(chatId: string): Promise<string> {
  const dir = path.join(IMAGE_DIR, chatId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Save a generated image buffer to disk. The bytes are encrypted with
 * AES-256-GCM at rest (see lib/images/encryption.ts) so opening the file
 * outside the app yields ciphertext.
 */
export async function saveImage(opts: {
  chatId: string;
  filename: string;
  buffer: Buffer;
}): Promise<StoredImage> {
  const dir = await ensureImageDir(opts.chatId);
  const absPath = path.join(dir, opts.filename);
  const encrypted = await encryptBuffer(opts.buffer);
  await fs.writeFile(absPath, encrypted);
  return {
    absPath,
    relPath: `images/${opts.chatId}/${opts.filename}`,
  };
}

export async function deleteImageFile(relPath: string): Promise<void> {
  const abs = path.join(process.cwd(), "data", relPath);
  try {
    await fs.unlink(abs);
  } catch {
    /* already gone */
  }
}

export async function readImageFile(relPath: string): Promise<Buffer> {
  // Refuse paths that escape data/images.
  const abs = path.join(process.cwd(), "data", relPath);
  if (!abs.startsWith(path.join(process.cwd(), "data", "images"))) {
    throw new Error("invalid image path");
  }
  const encrypted = await fs.readFile(abs);
  return decryptBuffer(encrypted);
}

export const IMAGE_REL_PREFIX = "images/";
