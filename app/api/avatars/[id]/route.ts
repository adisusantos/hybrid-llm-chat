import { NextResponse } from "next/server";
import {
  findAvatar,
  isAvatarKind,
  mimeFor,
} from "@/lib/avatars/storage";
import fs from "node:fs/promises";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // Sanity: ids are uuids or our seeded slug — reject path traversal.
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const found = await findAvatar(id);
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });

  const buf = await fs.readFile(found.absPath);
  // Note: we don't validate that the extension list maps to `isAvatarKind`
  // because `findAvatar` already filters through ACCEPTED_AVATAR_EXTENSIONS.
  const mime = isAvatarKind(found.ext) ? mimeFor(found.ext) : "application/octet-stream";

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=300",
      "Content-Length": String(buf.byteLength),
    },
  });
}
