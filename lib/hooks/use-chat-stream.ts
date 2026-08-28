"use client";

import { useCallback, useRef, useState } from "react";

export type TruncationNotice = {
  droppedCount: number;
  totalTokens: number;
  maxPromptTokens: number;
};

export type OutputTruncationNotice = {
  finishReason: string;
};

export type OutputDebugNotice = {
  finishReason: string;
  incomplete: boolean;
  reasons: string[];
};

export type StreamState = {
  status: "idle" | "streaming" | "done" | "error";
  content: string;
  error: string | null;
  finishReason: string | null;
  truncated: TruncationNotice | null;
  outputTruncated: OutputTruncationNotice | null;
  outputDebug: OutputDebugNotice | null;
};

export type StreamControls = {
  start: (chatId: string, content: string) => Promise<void>;
  abort: () => void;
  reset: () => void;
};

type ServerEvent =
  | { type: "user_message"; id: string }
  | { type: "context_truncated"; droppedCount: number; totalTokens: number; maxPromptTokens: number }
  | { type: "delta"; content: string }
  | { type: "response_truncated"; finishReason: string }
  | { type: "response_debug"; finishReason: string; incomplete: boolean; reasons: string[] }
  | { type: "done"; messageId: string; finishReason: string }
  | { type: "error"; message: string };

export function useChatStream(): [StreamState, StreamControls] {
  const [state, setState] = useState<StreamState>({
    status: "idle",
    content: "",
      error: null,
      finishReason: null,
      truncated: null,
      outputTruncated: null,
      outputDebug: null,
  });
  const acRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    acRef.current?.abort();
    acRef.current = null;
    setState({ status: "idle", content: "", error: null, finishReason: null, truncated: null, outputTruncated: null, outputDebug: null });
  }, []);

  const abort = useCallback(() => {
    acRef.current?.abort();
  }, []);

  const start = useCallback(async (chatId: string, content: string) => {
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;

    setState({ status: "streaming", content: "", error: null, finishReason: null, truncated: null, outputTruncated: null, outputDebug: null });

    let res: Response;
    try {
      res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, content }),
        signal: ac.signal,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((s) => ({
        ...s,
        status: "error",
        error: ac.signal.aborted ? "aborted" : message,
      }));
      return;
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      setState((s) => ({
        ...s,
        status: "error",
        error: `server ${res.status}: ${text.slice(0, 200)}`,
      }));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          for (const line of block.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload) continue;
            let event: ServerEvent;
            try {
              event = JSON.parse(payload);
            } catch {
              continue;
            }
            if (event.type === "delta") {
              setState((s) => ({
                ...s,
                content: s.content + event.content,
              }));
            } else if (event.type === "context_truncated") {
              setState((s) => ({
                ...s,
                truncated: {
                  droppedCount: event.droppedCount,
                  totalTokens: event.totalTokens,
                  maxPromptTokens: event.maxPromptTokens,
                },
              }));
            } else if (event.type === "response_truncated") {
              setState((s) => ({
                ...s,
                outputTruncated: {
                  finishReason: event.finishReason,
                },
              }));
            } else if (event.type === "response_debug") {
              setState((s) => ({
                ...s,
                outputDebug: {
                  finishReason: event.finishReason,
                  incomplete: event.incomplete,
                  reasons: event.reasons,
                },
              }));
            } else if (event.type === "done") {
              setState((s) => ({
                ...s,
                status: "done",
                finishReason: event.finishReason,
              }));
            } else if (event.type === "error") {
              setState((s) => ({
                ...s,
                status: "error",
                error: event.message,
              }));
            }
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if ((err as { name?: string })?.name === "AbortError") {
        setState((s) => ({ ...s, status: "idle" }));
      } else {
        setState((s) => ({ ...s, status: "error", error: message }));
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* released */
      }
    }
  }, []);

  return [state, { start, abort, reset }];
}
