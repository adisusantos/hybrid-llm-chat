import "server-only";
import { z } from "zod";
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

const RequestSchema = z.object({
  chatId: z.string().min(1),
  content: z.string().min(1).max(32_000),
});

type StreamEvent =
  | { type: "user_message"; id: string }
  | { type: "context_truncated"; droppedCount: number; totalTokens: number; maxPromptTokens: number }
  | { type: "delta"; content: string }
  | { type: "response_truncated"; finishReason: string }
  | { type: "response_debug"; finishReason: string; incomplete: boolean; reasons: string[] }
  | { type: "done"; messageId: string; finishReason: string }
  | { type: "error"; message: string };

function sse(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "invalid request", issues: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { chatId, content } = parsed.data;

  const { chat, messages, sampler, slidingWindow } = await buildChatPrompt(chatId);
  const userMessageId = await appendMessage({
    chatId,
    role: "user",
    content,
    name: "User",
  });

  const messagesWithUser = [
    ...messages,
    { role: "user" as const, content, name: "User" },
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(sse({ type: "user_message", id: userMessageId })));

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
        const handle = streamChat(messagesWithUser, { sampler });

        for await (const chunk of handle) {
          if (chunk.type === "delta") {
            accumulated += chunk.content;
            controller.enqueue(encoder.encode(sse({ type: "delta", content: chunk.content })));
          } else if (chunk.type === "done") {
            const wasTruncated = chunk.finishReason === "length";
            const rawContent = wasTruncated
              ? `${accumulated.trimEnd()}\n\n[Response truncated: generation hit the output token limit.]`
              : accumulated;
            // Strip any model meta-comments (safety warnings, author notes,
            // out-of-character commentary) before saving and displaying.
            const finalContent = stripModelMetaComments(rawContent, chat.character.name);
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
