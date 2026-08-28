import { NextResponse } from "next/server";
import { getGeneratedImage, deleteGeneratedImage } from "@/lib/db/queries";
import { readImageFile } from "@/lib/images/storage";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  const row = await getGeneratedImage(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const buf = await readImageFile(row.filePath);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
        "Content-Length": String(buf.byteLength),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  await deleteGeneratedImage(id);
  return NextResponse.json({ ok: true });
}
