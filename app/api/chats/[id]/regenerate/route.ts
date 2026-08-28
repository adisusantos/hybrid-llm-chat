import "server-only";
import { z } from "zod";
import {
  getLastUserMessageId,
  hideAllSwipesForTurn,
  listSwipesForTurn,
} from "@/lib/db/queries";
import {
  appendAssistantMessage,
  buildChatPrompt,
  nextSwipeId,
} from "@/lib/llama/prompt-builder";
import { streamChat } from "@/lib/llama/client";
import { detectIncompleteAssistantReply, stripModelMetaComments } from "@/lib/llama/output-diagnostics";

const RequestSchema = z.object({
  chatId: z.string().min(1),
});

type StreamEvent =
  | { type: "regenerate_start"; hiddenCount: number; swipeId: number }
  | { type: "context_truncated"; droppedCount: number; totalTokens: number; maxPromptTokens: number }
  | { type: "delta"; content: string }
  | { type: "response_truncated"; finishReason: string }
  | { type: "response_debug"; finishReason: string; incomplete: boolean; reasons: string[] }
  | { type: "done"; messageId: string; swipeId: number; finishReason: string }
  | { type: "error"; message: string };

function sse(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: chatId } = await ctx.params;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* body optional */
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "invalid request", issues: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const userMessageId = await getLastUserMessageId(chatId);
  if (!userMessageId) {
    return new Response(
      JSON.stringify({ error: "no user message to regenerate from" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const existingSwipes = await listSwipesForTurn(chatId, userMessageId);
  await hideAllSwipesForTurn(chatId, userMessageId);
  const swipeId = nextSwipeId(existingSwipes);

  // Build prompt up to (and including) the user message — no previous
  // assistant responses in context, otherwise regeneration would be biased
  // toward repeating the previous answer.
  const { chat, messages, sampler, slidingWindow } = await buildChatPrompt(chatId);
  // messages here include the full chat history. We need to truncate to
  // exclude any assistant messages from the latest turn. Since we just
  // hid them, the getChat query will not return them (is_hidden=false filter).
  // So the messages array is already correct — it ends at the latest user message.

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(
            sse({
              type: "regenerate_start",
              hiddenCount: existingSwipes.length,
              swipeId,
            }),
          ),
        );

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
        const handle = streamChat(messages, { sampler });

        for await (const chunk of handle) {
          if (chunk.type === "delta") {
            accumulated += chunk.content;
            controller.enqueue(encoder.encode(sse({ type: "delta", content: chunk.content })));
          } else if (chunk.type === "done") {
            const wasTruncated = chunk.finishReason === "length";
            const rawContent = wasTruncated
              ? `${accumulated.trimEnd()}\n\n[Response truncated: generation hit the output token limit.]`
              : accumulated;
            const finalContent = stripModelMetaComments(rawContent, chat.character.name);
            const diagnostics = detectIncompleteAssistantReply(finalContent);
            let assistantMessageId = "";
            if (finalContent.trim().length > 0) {
              assistantMessageId = await appendAssistantMessage({
                chatId,
                content: finalContent,
                name: chat.character.name,
                swipeId,
              });
            }
            if (wasTruncated) {
              controller.enqueue(
                encoder.encode(
                  sse({
                    type: "response_truncated",
                    finishReason: chunk.finishReason,
                  }),
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
                  swipeId,
                  finishReason: chunk.finishReason,
                }),
              ),
            );
            controller.close();
            return;
          } else if (chunk.type === "error") {
            controller.enqueue(encoder.encode(sse({ type: "error", message: chunk.message })));
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
