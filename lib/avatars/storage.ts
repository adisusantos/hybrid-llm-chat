import "server-only";
import path from "node:path";
import fs from "node:fs/promises";

const AVATAR_DIR = path.join(process.cwd(), "data", "avatars");

export type AvatarKind = "png" | "jpg" | "jpeg" | "webp" | "gif";

export const ACCEPTED_AVATAR_EXTENSIONS: readonly AvatarKind[] = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
];

const MIME_BY_EXT: Record<AvatarKind, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export function isAvatarKind(value: string): value is AvatarKind {
  return (ACCEPTED_AVATAR_EXTENSIONS as readonly string[]).includes(value.toLowerCase());
}

export function mimeFor(ext: AvatarKind): string {
  return MIME_BY_EXT[ext];
}

export async function ensureAvatarDir(): Promise<void> {
  await fs.mkdir(AVATAR_DIR, { recursive: true });
}

function pathFor(characterId: string, ext: AvatarKind): string {
  return path.join(AVATAR_DIR, `${characterId}.${ext}`);
}

/**
 * Persist a base64-encoded avatar (typically from a V3 JSON asset URI).
 * Returns the file extension actually saved (chosen from the data URL MIME).
 */
export async function saveBase64Avatar(
  characterId: string,
  dataUri: string,
): Promise<AvatarKind | null> {
  const match = /^data:image\/([a-zA-Z+.-]+);base64,(.+)$/.exec(dataUri);
  if (!match) return null;
  const rawExt = match[1]!.toLowerCase();
  // Normalize jpeg -> jpg
  const ext: AvatarKind = rawExt === "jpeg" ? "jpg" : (rawExt as AvatarKind);
  if (!isAvatarKind(ext)) return null;

  await ensureAvatarDir();
  // Clean up other formats so we don't have a stale .png alongside the new .jpg.
  for (const other of ACCEPTED_AVATAR_EXTENSIONS) {
    if (other === ext) continue;
    try {
      await fs.unlink(pathFor(characterId, other));
    } catch {
      // not found, fine
    }
  }
  const buf = Buffer.from(match[2]!, "base64");
  await fs.writeFile(pathFor(characterId, ext), buf);
  return ext;
}

/**
 * Persist a raw avatar buffer (from multipart upload).
 * Removes any other avatar files for this character first to avoid stale formats.
 */
export async function saveAvatarBuffer(
  characterId: string,
  ext: AvatarKind,
  buf: Buffer,
): Promise<void> {
  await ensureAvatarDir();
  for (const other of ACCEPTED_AVATAR_EXTENSIONS) {
    if (other === ext) continue;
    try {
      await fs.unlink(pathFor(characterId, other));
    } catch {
      // not found, fine
    }
  }
  await fs.writeFile(pathFor(characterId, ext), buf);
}

/**
 * Locate an existing avatar file for the given character. Returns null if none.
 */
export async function findAvatar(characterId: string): Promise<{ ext: AvatarKind; absPath: string } | null> {
  for (const ext of ACCEPTED_AVATAR_EXTENSIONS) {
    const abs = pathFor(characterId, ext);
    try {
      await fs.access(abs);
      return { ext, absPath: abs };
    } catch {
      // not found, try next
    }
  }
  return null;
}

export async function deleteAvatar(characterId: string): Promise<void> {
  const found = await findAvatar(characterId);
  if (found) await fs.unlink(found.absPath);
}

export { AVATAR_DIR };
