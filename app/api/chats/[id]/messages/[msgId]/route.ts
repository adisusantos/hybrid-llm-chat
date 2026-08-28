import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { updateUserMessageContent } from "@/lib/db/queries";

const RequestSchema = z.object({
  content: z.string().min(1).max(32_000),
});

/**
 * PATCH /api/chats/[id]/messages/[msgId]
 *
 * Update the content of a user message (used by the "Edit / Resend" action
 * on the last user bubble). Only user messages are editable.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; msgId: string }> },
) {
  const { id: chatId, msgId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const updated = await updateUserMessageContent(chatId, msgId, parsed.data.content);
    if (!updated) {
      return NextResponse.json({ error: "user message not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
