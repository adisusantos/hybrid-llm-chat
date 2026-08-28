import { NextResponse } from "next/server";
import { z } from "zod";
import { addMemory, getChat, listMemoriesForChat } from "@/lib/db/queries";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const chat = await getChat(id);
  if (!chat) return NextResponse.json({ error: "chat not found" }, { status: 404 });
  const rows = await listMemoriesForChat(id);
  return NextResponse.json({ memories: rows });
}

const CreateSchema = z.object({
  content: z.string().min(1).max(500),
  importance: z.number().int().min(1).max(5).default(3),
  isPinned: z.boolean().default(false),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const chat = await getChat(id);
  if (!chat) return NextResponse.json({ error: "chat not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const memId = await addMemory({
    chatId: id,
    content: parsed.data.content,
    importance: parsed.data.importance,
    isPinned: parsed.data.isPinned,
  });
  return NextResponse.json({ id: memId });
}
