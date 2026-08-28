import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { characters } from "@/lib/db/schema";
import { isAvatarKind, saveAvatarBuffer } from "@/lib/avatars/storage";

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const exists = await db
    .select({ id: characters.id })
    .from(characters)
    .where(eq(characters.id, id))
    .limit(1);
  if (!exists[0]) return NextResponse.json({ error: "character not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: `file must be 1 byte – ${MAX_BYTES} bytes` }, { status: 400 });
  }

  const mime = file.type.toLowerCase();
  let ext: string | null = null;
  if (mime === "image/png") ext = "png";
  else if (mime === "image/jpeg") ext = "jpg";
  else if (mime === "image/webp") ext = "webp";
  else if (mime === "image/gif") ext = "gif";

  if (!ext || !isAvatarKind(ext)) {
    return NextResponse.json(
      { error: `unsupported mime: ${mime}. Use PNG / JPEG / WebP / GIF.` },
      { status: 415 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  await saveAvatarBuffer(id, ext, buf);

  await db
    .update(characters)
    .set({ avatarPath: `${id}.${ext}`, updatedAt: new Date() })
    .where(eq(characters.id, id));

  return NextResponse.json({ ok: true, avatarPath: `${id}.${ext}` });
}
