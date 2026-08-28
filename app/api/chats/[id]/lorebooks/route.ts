import { NextResponse } from "next/server";
import { z } from "zod";
import {
  attachLorebookToChat,
  detachLorebookFromChat,
  getChat,
  listLorebooksForChat,
} from "@/lib/db/queries";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const chat = await getChat(id);
  if (!chat) return NextResponse.json({ error: "chat not found" }, { status: 404 });
  const attached = await listLorebooksForChat(id);
  return NextResponse.json({ lorebooks: attached });
}

const AttachSchema = z.object({ lorebookId: z.string().min(1) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = AttachSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    await attachLorebookToChat(id, parsed.data.lorebookId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}

const DetachSchema = z.object({ lorebookId: z.string().min(1) });

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = DetachSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  await detachLorebookFromChat(id, parsed.data.lorebookId);
  return NextResponse.json({ ok: true });
}
