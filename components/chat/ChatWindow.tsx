"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageList, type DisplayMessage, type DisplayImage } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { useChatStream } from "@/lib/hooks/use-chat-stream";
import { useContinue } from "@/lib/hooks/use-continue";
import { useRegenerate } from "@/lib/hooks/use-regenerate";
import { SwipeControls } from "./SwipeControls";
import { ErrorBanner } from "./ErrorBanner";

export type InitialMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  name?: string | null;
  content: string;
};

type LastTurnSwipe = {
  id: string;
  content: string;
  swipeId: number;
  isHidden: boolean;
};

// Chat page → ChatWindow
type Props = {
  chatId: string;
  characterName: string;
  initialMessages: InitialMessage[];
  lastTurnSwipes?: LastTurnSwipe[];
  imagesByMessageId?: Record<string, DisplayImage[]>;
  imageGenEnabled?: boolean;
  ttsEnabled?: boolean;
};

export function ChatWindow({
  chatId,
  characterName,
  initialMessages,
  lastTurnSwipes,
  imagesByMessageId,
  imageGenEnabled,
  ttsEnabled,
}: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<DisplayMessage[]>(initialMessages);
  const [stream, controls] = useChatStream();
  const [cont, contControls] = useContinue();
  const [regen, regenControls] = useRegenerate();
  const [lastUserContent, setLastUserContent] = useState<string | null>(null);
  const [, startRefresh] = useTransition();
  const [deleting, setDeleting] = useState(false);

  // Sync props changes back into local state when the server re-renders
  // (e.g. after router.refresh()). Using useEffect avoids render-phase
  // setState which causes hydration mismatches in React 19 / Next.js 16.
  useEffect(() => {
    setMessages(initialMessages);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessages]);

  const refreshMessages = useCallback(() => {
    startRefresh(async () => {
      const res = await fetch(`/api/chat/${chatId}/messages`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: DisplayMessage[] };
      setMessages(data.messages);
    });
  }, [chatId]);

  useEffect(() => {
    if (stream.status === "done") {
      refreshMessages();
    }
  }, [stream.status, stream.finishReason, refreshMessages]);

  useEffect(() => {
    if (cont.status === "done") {
      refreshMessages();
      router.refresh(); // update swipe count in header
    }
  }, [cont.status, cont.finishReason, refreshMessages, router]);

  useEffect(() => {
    if (regen.status === "done") {
      refreshMessages();
      router.refresh(); // update swipe count in header
    }
  }, [regen.status, regen.finishReason, refreshMessages, router]);

  const handleSubmit = useCallback(
    async (content: string) => {
      const optimisticId = `temp-user-${Date.now()}`;
      setMessages((m) => [
        ...m,
        { id: optimisticId, role: "user", name: "User", content },
      ]);
      setLastUserContent(content);
      await controls.start(chatId, content);
    },
    [chatId, controls],
  );

  const retryLast = useCallback(async () => {
    if (!lastUserContent) return;
    await controls.start(chatId, lastUserContent);
  }, [chatId, controls, lastUserContent]);

  // Edit + resend: rewrite the last user message content in the DB, then
  // regenerate a fresh reply for it (same flow as the Regenerate button).
  const handleResend = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (!lastUser) return;
      setMessages((m) =>
        m.map((msg) => (msg.id === lastUser.id ? { ...msg, content: trimmed } : msg)),
      );
      setLastUserContent(trimmed);
      const res = await fetch(`/api/chats/${chatId}/messages/${lastUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("edit message failed", res.status, text);
        return;
      }
      await regenControls.start(chatId);
    },
    [chatId, messages, regenControls],
  );

  const streamingContent =
    stream.status === "streaming" ? stream.content :
    cont.status === "streaming"   ? cont.content :
    undefined;

  const swipe = useCallback(
    async (direction: "left" | "right") => {
      const res = await fetch(`/api/chats/${chatId}/swipe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      if (res.ok) {
        // Re-fetch the page server component so the chat header (which
        // shows swipe count) and MessageList (which shows the new active
        // message) both update.
        router.refresh();
      }
    },
    [chatId, router],
  );

  // Delete the last turn: the most recent user bubble + every assistant swipe
  // generated for it. The Undo button on the last user bubble arms an inline
  // confirmation; the second click commits the delete here.
  const hasUserMessages = messages.some((m) => m.role === "user");
  const canDelete =
    hasUserMessages &&
    !deleting &&
    stream.status !== "streaming" &&
    cont.status !== "streaming" &&
    regen.status !== "streaming";

  const performDelete = useCallback(async () => {
    if (!canDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/chats/${chatId}/last-turn`, { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("delete last turn failed", res.status, text);
        return;
      }
      // Refresh from server so swipe count, header, and message list all sync.
      router.refresh();
      await refreshMessages();
    } finally {
      setDeleting(false);
    }
  }, [canDelete, chatId, router, refreshMessages]);

  // Keyboard shortcuts:
  //   Esc: abort current stream
  //   Alt+ArrowLeft / Alt+ArrowRight: swipe nav (if multiple swipes)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (e.key === "Escape") {
        if (stream.status === "streaming") {
          e.preventDefault();
          controls.abort();
          return;
        }
      }

      // Alt+arrow for swipe navigation. Skip when typing in an input.
      if (e.altKey && !e.ctrlKey && !e.metaKey && !isEditable && lastTurnSwipes && lastTurnSwipes.length > 1) {
        const direction = e.key === "ArrowLeft" ? "left" : e.key === "ArrowRight" ? "right" : null;
        if (direction) {
          e.preventDefault();
          void swipe(direction);
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stream.status, controls, lastTurnSwipes, swipe]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {stream.truncated && (
        <div className="mx-3 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <span className="font-medium">⚠️ Context trimmed:</span>{" "}
          {stream.truncated.droppedCount} older message
          {stream.truncated.droppedCount === 1 ? "" : "s"} dropped to fit
          the {stream.truncated.maxPromptTokens.toLocaleString()}-token limit
          (now ~{stream.truncated.totalTokens.toLocaleString()} tokens).
          Use <span className="font-medium">Summarize now</span> in the memory
          panel to preserve long-term context.
        </div>
      )}
      {stream.outputTruncated && (
        <div className="mx-3 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <span className="font-medium">⚠️ Response cut short:</span> the model hit the output token limit before finishing its reply.
        </div>
      )}
      {stream.outputDebug && (
        <div className="mx-3 mt-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
          <span className="font-medium">Debug:</span> finish reason <span className="font-mono">{stream.outputDebug.finishReason}</span>
          {stream.outputDebug.incomplete && (
            <>
              {" "}- possible incomplete reply ({stream.outputDebug.reasons.join(", ")})
            </>
          )}
        </div>
      )}
      <MessageList
        messages={messages}
        streamingContent={streamingContent}
        streamingName={characterName}
        className="flex-1"
        chatId={chatId}
        imagesByMessageId={imagesByMessageId}
        imageGenEnabled={imageGenEnabled}
        ttsEnabled={ttsEnabled}
        busy={
          stream.status === "streaming" ||
          cont.status === "streaming" ||
          regen.status === "streaming"
        }
        onRegenerate={() => void regenControls.start(chatId).then(() => router.refresh())}
        isRegenerating={regen.status === "streaming"}
        onContinue={() => void contControls.start(chatId)}
        isContinuing={cont.status === "streaming"}
        onEditResend={(content) => void handleResend(content)}
        onUndo={() => void performDelete()}
        canUndo={canDelete}
        isDeleting={deleting}
      />
      {stream.error && (
        <ErrorBanner
          message={stream.error}
          canRetry={Boolean(lastUserContent) && stream.status === "error"}
          onRetry={() => void retryLast()}
          onDismiss={() => controls.reset()}
        />
      )}
      {lastTurnSwipes && lastTurnSwipes.length > 0 && (
        <SwipeControls
          chatId={chatId}
          swipes={lastTurnSwipes}
          isContinuing={cont.status === "streaming"}
          regen={regen}
        />
      )}

      <MessageInput
        chatId={chatId}
        disabled={
          stream.status === "streaming" ||
          cont.status === "streaming" ||
          regen.status === "streaming"
        }
        placeholder={`Message ${characterName}…`}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
