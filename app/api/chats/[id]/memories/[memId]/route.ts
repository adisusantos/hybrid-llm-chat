import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteMemory, getChat, updateMemory } from "@/lib/db/queries";

const UpdateSchema = z.object({
  content: z.string().min(1).max(500).optional(),
  importance: z.number().int().min(1).max(5).optional(),
  isPinned: z.boolean().optional(),
});

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string; memId: string }> },
) {
  const { id, memId } = await ctx.params;
  const chat = await getChat(id);
  if (!chat) return NextResponse.json({ error: "chat not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  await updateMemory(id, memId, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; memId: string }> },
) {
  const { id, memId } = await ctx.params;
  await deleteMemory(id, memId);
  return NextResponse.json({ ok: true });
}
