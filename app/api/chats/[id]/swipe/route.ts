import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getLastUserMessageId,
  listSwipesForTurn,
  setActiveSwipe,
} from "@/lib/db/queries";

const Schema = z.object({
  direction: z.enum(["left", "right"]),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: chatId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const userMessageId = await getLastUserMessageId(chatId);
  if (!userMessageId) {
    return NextResponse.json({ error: "no messages" }, { status: 400 });
  }

  const swipes = await listSwipesForTurn(chatId, userMessageId);
  if (swipes.length === 0) {
    return NextResponse.json({ error: "no swipes" }, { status: 404 });
  }

  // Find the currently active (visible) swipe
  const activeIndex = swipes.findIndex((s) => !s.isHidden);
  if (activeIndex === -1) {
    return NextResponse.json({ error: "no active swipe" }, { status: 500 });
  }

  const nextIndex =
    parsed.data.direction === "left"
      ? Math.max(0, activeIndex - 1)
      : Math.min(swipes.length - 1, activeIndex + 1);

  if (nextIndex === activeIndex) {
    // Already at the boundary
    return NextResponse.json({
      ok: true,
      changed: false,
      currentSwipeId: swipes[activeIndex]!.id,
      currentIndex: activeIndex,
      total: swipes.length,
    });
  }

  await setActiveSwipe(chatId, userMessageId, swipes[nextIndex]!.id);

  return NextResponse.json({
    ok: true,
    changed: true,
    currentSwipeId: swipes[nextIndex]!.id,
    currentIndex: nextIndex,
    total: swipes.length,
  });
}
