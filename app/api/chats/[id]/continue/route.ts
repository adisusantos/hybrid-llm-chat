import "server-only";
import { appendMessage } from "@/lib/db/queries";
import {
  buildChatPrompt,
  appendAssistantMessage,
} from "@/lib/llama/prompt-builder";
import { streamChat } from "@/lib/llama/client";
import {
  detectIncompleteAssistantReply,
  stripModelMetaComments,
} from "@/lib/llama/output-diagnostics";

type StreamEvent =
  | { type: "context_truncated"; droppedCount: number; totalTokens: number; maxPromptTokens: number }
  | { type: "delta"; content: string }
  | { type: "response_truncated"; finishReason: string }
  | { type: "response_debug"; finishReason: string; incomplete: boolean; reasons: string[] }
  | { type: "done"; messageId: string; finishReason: string }
  | { type: "error"; message: string };

function sse(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: chatId } = await ctx.params;

  // Save a hidden user nudge so it's part of the context but never shown in UI
  const continuePrompt =
    "[OOC: Continue the story from exactly where you left off. Do not repeat anything already written. Pick up seamlessly from the last beat.]";

  await appendMessage({
    chatId,
    role: "user",
    content: continuePrompt,
    name: "User",
    // isHidden is not in appendMessage opts — we'll update it right after
  });

  // Mark it hidden by fetching and updating — simpler: re-use appendMessage
  // then immediately hide via a direct DB update. But appendMessage doesn't
  // expose isHidden. We'll add a thin wrapper here using the DB client directly.
  const { db } = await import("@/lib/db/client");
  const { messages: messagesTable } = await import("@/lib/db/schema");
  const { desc, eq } = await import("drizzle-orm");

  // Find the message we just inserted (it's the latest user message)
  const [lastMsg] = await db
    .select({ id: messagesTable.id })
    .from(messagesTable)
    .where(eq(messagesTable.chatId, chatId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(1);

  if (lastMsg) {
    await db
      .update(messagesTable)
      .set({ isHidden: true })
      .where(eq(messagesTable.id, lastMsg.id));
  }

  // Now build prompt — the hidden message IS in the DB but filtered out
  // from getChat (isHidden = false filter), so we need to include it manually.
  const { chat, messages, sampler, slidingWindow } = await buildChatPrompt(chatId);

  // Append the nudge to the messages array for the model (in-memory only,
  // it's already saved hidden in DB so context is consistent on next turn)
  const messagesWithNudge = [
    ...messages,
    { role: "user" as const, content: continuePrompt, name: "User" },
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (slidingWindow.truncated) {
          controller.enqueue(
            encoder.encode(
              sse({
                type: "context_truncated",
                droppedCount: slidingWindow.droppedCount,
                totalTokens: slidingWindow.totalTokens,
                maxPromptTokens: slidingWindow.maxPromptTokens,
              }),
            ),
          );
        }

        let accumulated = "";
        const handle = streamChat(messagesWithNudge, { sampler });

        for await (const chunk of handle) {
          if (chunk.type === "delta") {
            accumulated += chunk.content;
            controller.enqueue(
              encoder.encode(sse({ type: "delta", content: chunk.content })),
            );
          } else if (chunk.type === "done") {
            const wasTruncated = chunk.finishReason === "length";
            const rawContent = wasTruncated
              ? `${accumulated.trimEnd()}\n\n[Response truncated: generation hit the output token limit.]`
              : accumulated;
            const finalContent = stripModelMetaComments(
              rawContent,
              chat.character.name,
            );
            const diagnostics = detectIncompleteAssistantReply(finalContent);

            let assistantMessageId = "";
            if (finalContent.trim().length > 0) {
              assistantMessageId = await appendAssistantMessage({
                chatId,
                content: finalContent,
                name: chat.character.name,
                swipeId: 0,
              });
            }

            if (wasTruncated) {
              controller.enqueue(
                encoder.encode(
                  sse({ type: "response_truncated", finishReason: chunk.finishReason }),
                ),
              );
            }
            controller.enqueue(
              encoder.encode(
                sse({
                  type: "response_debug",
                  finishReason: chunk.finishReason,
                  incomplete: diagnostics.incomplete,
                  reasons: diagnostics.reasons,
                }),
              ),
            );
            controller.enqueue(
              encoder.encode(
                sse({
                  type: "done",
                  messageId: assistantMessageId,
                  finishReason: chunk.finishReason,
                }),
              ),
            );
            controller.close();
            return;
          } else if (chunk.type === "error") {
            controller.enqueue(
              encoder.encode(sse({ type: "error", message: chunk.message })),
            );
            controller.close();
            return;
          }
        }
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        try {
          controller.enqueue(encoder.encode(sse({ type: "error", message })));
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
