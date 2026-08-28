import "server-only";
import { NextResponse } from "next/server";
import { deleteLastTurn } from "@/lib/db/queries";

/**
 * DELETE /api/chats/[id]/last-turn
 *
 * Hard-delete the most recent turn: the last user message + every assistant
 * swipe generated for it (including hidden ones). Also cleans up any
 * generated images attached to those messages.
 *
 * Returns 200 with the IDs that were removed. Returns 404 if the chat has no
 * user messages (nothing to delete).
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: chatId } = await ctx.params;

  try {
    const result = await deleteLastTurn(chatId);
    return NextResponse.json({
      ok: true,
      deletedUserId: result.deletedUserId,
      deletedAssistantIds: result.deletedAssistantIds,
      deletedImageIds: result.deletedImageIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "no user message to delete") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
