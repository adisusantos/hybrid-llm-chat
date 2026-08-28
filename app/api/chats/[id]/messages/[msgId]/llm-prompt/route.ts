import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { messages } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { buildLlmPrompt } from "@/lib/imagegen/llm-prompt";
import { getChat } from "@/lib/db/queries";

const Schema = z.object({});

const REQUEST_TIMEOUT_MS = 60_000;

/** Run `fn` with a timeout. Throws on timeout. */
async function withTimeout<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`llama-server timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Retry once on transient errors (timeout, empty JSON). */
async function buildWithRetry(
  appearance: string,
  lastAssistantMsg: string,
): Promise<Awaited<ReturnType<typeof buildLlmPrompt>>> {
  const attempts = 2;
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await withTimeout(REQUEST_TIMEOUT_MS, () =>
        buildLlmPrompt({ appearance, lastAssistantMsg }),
      );
    } catch (err) {
      lastErr = err;
      // Don't sleep on the final attempt.
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  throw lastErr;
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; msgId: string }> },
) {
  const { id: chatId, msgId } = await ctx.params;
  Schema.parse({}); // body optional

  // Find target assistant message
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.id, msgId)))
    .limit(1);
  const target = rows[0];
  if (!target) return NextResponse.json({ error: "message not found" }, { status: 404 });
  if (target.role !== "assistant")
    return NextResponse.json(
      { error: "only assistant messages can be visualized" },
      { status: 400 },
    );

  const chat = await getChat(chatId);
  if (!chat) return NextResponse.json({ error: "chat not found" }, { status: 404 });

  try {
    const fields = await buildWithRetry(chat.character.appearance, target.content);
    return NextResponse.json({ fields });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Distinguish timeout from parse failure for the user's benefit.
    const isTimeout = /timed out/i.test(msg);
    const isParse = /JSON|parse/i.test(msg);
    const userMsg = isTimeout
      ? "llama-server didn't respond in time. The model may still be loading — try again in a few seconds."
      : isParse
        ? "llama-server returned an unparseable response. The model may not support structured JSON output, or its first response was incomplete. Try again — the second request usually succeeds once the model is warm."
        : `llama-prompt failed: ${msg}`;
    return NextResponse.json({ error: userMsg }, { status: 502 });
  }
}
