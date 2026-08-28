import "server-only";
import { AION_RP_STOP_TOKENS, AION_RP_MODEL_NAME } from "./types";
import type { SamplerConfig } from "./sampler";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
};

export type ChatChunk =
  | { type: "delta"; content: string }
  | { type: "done"; finishReason: string }
  | { type: "error"; message: string };

export type StreamHandle = {
  abort: () => void;
  finished: Promise<void>;
};

export type StreamOptions = {
  baseUrl?: string;
  sampler: SamplerConfig;
  signal?: AbortSignal;
};

const DEFAULT_BASE = "http://127.0.0.1:8080/v1";

export function streamChat(
  messages: ChatMessage[],
  opts: StreamOptions,
): AsyncIterable<ChatChunk> & StreamHandle {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE;

  const ac = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) ac.abort();
    else opts.signal.addEventListener("abort", () => ac.abort(), { once: true });
  }

  const body = {
    model: AION_RP_MODEL_NAME,
    messages,
    stream: true,
    // Qwen3 models default to thinking mode and stream everything into
    // reasoning_content, never content — which left the app with empty
    // responses. Disable thinking so replies come through as normal content.
    chat_template_kwargs: { enable_thinking: false },
    temperature: opts.sampler.temperature,
    top_p: opts.sampler.top_p,
    top_k: opts.sampler.top_k,
    min_p: opts.sampler.min_p,
    repeat_penalty: opts.sampler.repeat_penalty,
    repeat_last_n: opts.sampler.repeat_last_n,
    dry_multiplier: opts.sampler.dry_multiplier,
    dry_base: opts.sampler.dry_base,
    dry_allowed_length: opts.sampler.dry_allowed_length,
    max_tokens: opts.sampler.max_tokens,
    stop: [...AION_RP_STOP_TOKENS],
  };

  let resolveFinished!: () => void;
  const finished = new Promise<void>((r) => {
    resolveFinished = r;
  });

  const iterator = (async function* () {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
    } catch (err) {
      yield {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      };
      resolveFinished();
      return;
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      yield {
        type: "error",
        message: `llama-server ${res.status}: ${text.slice(0, 200)}`,
      };
      resolveFinished();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finishReason = "stop";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") {
            yield { type: "done", finishReason };
            resolveFinished();
            return;
          }
          let json: {
            choices?: { delta?: { content?: string | null }; finish_reason?: string }[];
          };
          try {
            json = JSON.parse(payload);
          } catch {
            continue;
          }
          const choice = json.choices?.[0];
          if (!choice) continue;
          if (choice.finish_reason) finishReason = choice.finish_reason;
          const content = choice.delta?.content;
          if (typeof content === "string" && content.length > 0) {
            yield { type: "delta", content };
          }
        }
      }
      yield { type: "done", finishReason };
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") {
        yield { type: "done", finishReason: "abort" };
      } else {
        yield {
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        };
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* already released */
      }
      resolveFinished();
    }
  })();

  const handle = iterator as unknown as AsyncIterable<ChatChunk> & StreamHandle;
  handle.abort = () => ac.abort();
  handle.finished = finished;
  return handle;
}
