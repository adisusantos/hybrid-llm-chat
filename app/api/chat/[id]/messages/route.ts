import { NextResponse } from "next/server";
import { getChat } from "@/lib/db/queries";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const chat = await getChat(id);
  if (!chat) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    chat: {
      id: chat.id,
      title: chat.title,
      characterId: chat.characterId,
      characterName: chat.character.name,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    },
    messages: chat.messages.map((m) => ({
      id: m.id,
      role: m.role,
      name: m.name,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
}
