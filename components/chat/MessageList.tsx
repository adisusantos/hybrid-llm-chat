"use client";

import { useEffect, useRef, useState } from "react";
import { MessageBubble } from "./MessageBubble";
import { Button } from "@/components/ui/button";
import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type DisplayMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  name?: string | null;
  content: string;
};

export type DisplayImage = {
  id: string;
  url: string;
  width: number;
  height: number;
  prompt: string;
  createdAt: string;
  paramsJson?: string | null;
};

type Props = {
  messages: DisplayMessage[];
  streamingContent?: string;
  streamingName?: string;
  className?: string;

  // Image-gen wiring
  chatId?: string;
  imagesByMessageId?: Record<string, DisplayImage[]>;
  imageGenEnabled?: boolean;

  // TTS
  ttsEnabled?: boolean;

  // Last-message turn actions (threaded through to the bubbles)
  busy?: boolean;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  onContinue?: () => void;
  isContinuing?: boolean;
  onEditResend?: (content: string) => void;
  onUndo?: () => void;
  canUndo?: boolean;
  isDeleting?: boolean;
};

const SCROLL_BOTTOM_THRESHOLD_PX = 80;

export function MessageList({
  messages,
  streamingContent,
  streamingName,
  className,
  chatId,
  imagesByMessageId,
  imageGenEnabled,
  ttsEnabled,
  busy,
  onRegenerate,
  isRegenerating,
  onContinue,
  isContinuing,
  onEditResend,
  onUndo,
  canUndo,
  isDeleting,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastContentLenRef = useRef<number>(0);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  // Track whether user is at the bottom of the scroll area.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      setPinnedToBottom(distanceFromBottom <= SCROLL_BOTTOM_THRESHOLD_PX);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Track content length so we can count new tokens while scrolled away.
  useEffect(() => {
    const total =
      messages.reduce((n, m) => n + m.content.length, 0) +
      (streamingContent?.length ?? 0);
    if (total > lastContentLenRef.current) {
      const delta = total - lastContentLenRef.current;
      if (!pinnedToBottom && streamingContent !== undefined) {
        setUnreadCount((c) => c + delta);
      }
    }
    lastContentLenRef.current = total;
  }, [messages, streamingContent, pinnedToBottom]);

  // Auto-scroll on new messages or streaming tokens when pinned.
  // During streaming we scroll INSTANTLY (behavior:"auto") rather than
  // "smooth": a smooth scroll restarted on every token (~every 50ms) never
  // completes and produces visible flicker/jank, especially on mobile.
  useEffect(() => {
    if (!pinnedToBottom) return;
    const behavior: ScrollBehavior =
      streamingContent !== undefined ? "auto" : "smooth";
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, [messages.length, streamingContent, pinnedToBottom]);

  const jumpToLatest = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setUnreadCount(0);
  };

  const showJumpButton = !pinnedToBottom;

  // Identify the last visible assistant message (not the streaming one — it
  // belongs to a new turn and is allowed to be generated separately later).
  const lastAssistantId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === "assistant") return messages[i]!.id;
    }
    return null;
  })();
  // Identify the last user message — the one that can be edited / undone.
  const lastUserId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === "user") return messages[i]!.id;
    }
    return null;
  })();
  const streamingId = "__streaming__"; // synthetic id for the streaming bubble

  return (
    <div className={cn("relative min-h-0 flex-1", className)}>
      <div
        ref={scrollRef}
        className="h-full overflow-auto overscroll-contain"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex flex-col gap-3 p-4">
          {messages.length === 0 && !streamingContent && (
            <div className="text-muted-foreground mx-auto mt-12 max-w-md text-center text-sm">
              Say something to start the conversation.
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              id={m.id}
              role={m.role}
              name={m.name}
              content={m.content}
              chatId={chatId}
              isLastAssistant={m.id === lastAssistantId}
              isLastUser={m.id === lastUserId}
              busy={busy}
              onRegenerate={onRegenerate}
              isRegenerating={isRegenerating}
              onContinue={onContinue}
              isContinuing={isContinuing}
              onEditResend={onEditResend}
              onUndo={onUndo}
              canUndo={canUndo}
              isDeleting={isDeleting}
              imageCount={imagesByMessageId?.[m.id]?.length ?? 0}
              images={imagesByMessageId?.[m.id]}
              imageGenEnabled={imageGenEnabled}
              ttsEnabled={ttsEnabled}
            />
          ))}
          {streamingContent !== undefined && (
            <MessageBubble
              id={streamingId}
              role="assistant"
              name={streamingName}
              content={streamingContent}
              streaming
            />
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      {showJumpButton && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={jumpToLatest}
            className="pointer-events-auto gap-1.5 rounded-full shadow-md"
            aria-label="Jump to latest"
          >
            <ArrowDown className="size-3.5" />
            {unreadCount > 0 ? `${unreadCount} new` : "Jump to latest"}
          </Button>
        </div>
      )}
    </div>
  );
}