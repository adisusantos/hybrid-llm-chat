"use client";

import { useEffect, useState } from "react";
import { MarkdownContent } from "./MarkdownContent";
import { ComfyUIGenerateButton } from "./ComfyUIGenerateButton";
import { GeneratedImageList } from "./GeneratedImageList";
import { TTSButton } from "@/components/tts/TTSButton";
import { Button } from "@/components/ui/button";
import { ChevronsRight, Loader2, Pencil, RefreshCw, Send, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type MessageBubbleProps = {
  id: string;
  role: "user" | "assistant" | "system";
  name?: string | null;
  content: string;
  streaming?: boolean;
  className?: string;

  // Image-gen wiring
  chatId?: string;
  isLastAssistant?: boolean;
  imageCount?: number;
  images?: Array<{
    id: string;
    url: string;
    width: number;
    height: number;
    prompt: string;
    createdAt: string;
  }>;
  imageGenEnabled?: boolean;

  // TTS
  ttsEnabled?: boolean;

  // Last-message turn actions
  isLastUser?: boolean;
  busy?: boolean;
  // Assistant turn actions (aligned with the Generate button)
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  onContinue?: () => void;
  isContinuing?: boolean;
  // User turn actions
  onEditResend?: (content: string) => void;
  onUndo?: () => void;
  canUndo?: boolean;
  isDeleting?: boolean;
};

export function MessageBubble({
  id,
  role,
  name,
  content,
  streaming,
  className,
  chatId,
  isLastAssistant = false,
  imageCount = 0,
  images = [],
  imageGenEnabled,
  ttsEnabled,
  isLastUser = false,
  busy = false,
  onRegenerate,
  isRegenerating = false,
  onContinue,
  isContinuing = false,
  onEditResend,
  onUndo,
  canUndo = true,
  isDeleting = false,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const isSystem = role === "system";
  const showGenerate = role === "assistant" && isLastAssistant && Boolean(chatId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [confirmingUndo, setConfirmingUndo] = useState(false);

  // Auto-disarm the Undo confirmation after 3s of inactivity.
  useEffect(() => {
    if (!confirmingUndo) return;
    const t = setTimeout(() => setConfirmingUndo(false), 3000);
    return () => clearTimeout(t);
  }, [confirmingUndo]);

  if (isSystem) {
    return (
      <div className={cn("mx-auto max-w-2xl text-xs text-muted-foreground italic", className)}>
        {content}
      </div>
    );
  }

  const showUserActions = isUser && isLastUser && !streaming;
  const showAssistantActions = showGenerate && !streaming;

  const handleResend = () => {
    const trimmed = draft.trim();
    if (!trimmed || busy) return;
    setEditing(false);
    onEditResend?.(trimmed);
  };

  const openEditor = () => {
    if (busy || isDeleting) return;
    setDraft(content);
    setEditing(true);
  };

  const handleUndo = () => {
    if (!canUndo || busy || isDeleting) return;
    if (confirmingUndo) {
      setConfirmingUndo(false);
      onUndo?.();
    } else {
      setConfirmingUndo(true);
    }
  };

  return (
    <div
      data-role={role}
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start", className)}
    >
      <div className="flex min-w-0 max-w-[85%] flex-col gap-1.5">
        <div
          className={cn(
            "min-w-0 rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm overflow-hidden break-words",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-card-foreground",
          )}
          style={{ overflowWrap: "anywhere" }}
        >
          {name && (
            <div
              className={cn(
                "mb-1 text-xs font-medium",
                isUser ? "text-primary-foreground/70" : "text-muted-foreground",
              )}
            >
              {name}
            </div>
          )}
          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleResend();
                  }
                }}
                autoFocus
                rows={Math.min(6, Math.max(2, draft.split("\n").length))}
                className="w-full resize-y rounded-lg bg-background p-2 text-sm text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary"
              />
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(false)}
                  className="text-primary-foreground/80 hover:text-primary-foreground h-7 gap-1 px-2 text-xs"
                >
                  <X className="size-3.5" />
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleResend}
                  disabled={!draft.trim() || busy}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  <Send className="size-3.5" />
                  Resend
                </Button>
              </div>
            </div>
          ) : (
            <>
              <MarkdownContent content={content} />
              {streaming && (
                <span
                  aria-hidden
                  className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 animate-pulse bg-current opacity-70"
                />
              )}
            </>
          )}
          {!editing && showAssistantActions && (
            <div className="-mb-1 mt-2 flex flex-wrap items-center gap-1">
              {ttsEnabled && (
                <TTSButton
                  content={content}
                  disabled={busy || isRegenerating || isContinuing}
                />
              )}
              {imageGenEnabled && (
                <ComfyUIGenerateButton
                  chatId={chatId!}
                  messageId={id}
                  prompt={content}
                  imageCount={imageCount}
                />
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onRegenerate}
                disabled={busy || isRegenerating || isContinuing}
                className="text-muted-foreground hover:text-foreground h-7 gap-1.5 px-2 text-xs"
              >
                <RefreshCw className={cn("size-3.5", isRegenerating && "animate-spin")} />
                Regenerate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onContinue}
                disabled={busy || isRegenerating || isContinuing}
                className="text-muted-foreground hover:text-foreground h-7 gap-1.5 px-2 text-xs"
              >
                <ChevronsRight className={cn("size-3.5", isContinuing && "animate-pulse")} />
                Continue
              </Button>
            </div>
          )}
          {!editing && showUserActions &&
            (confirmingUndo ? (
              <div className="-mb-1 mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-primary-foreground/80">
                  Delete last message and reply?
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingUndo(false)}
                  disabled={busy || isDeleting}
                  className="text-primary-foreground/80 hover:text-primary-foreground h-7 px-2 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleUndo}
                  disabled={busy || isDeleting || !canUndo}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Delete
                </Button>
              </div>
            ) : (
              <div className="-mb-1 mt-2 flex flex-wrap items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={openEditor}
                  disabled={busy || isDeleting}
                  className="text-primary-foreground/80 hover:text-primary-foreground h-7 gap-1.5 px-2 text-xs"
                >
                  <Pencil className="size-3.5" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUndo}
                  disabled={busy || isDeleting || !canUndo}
                  className="text-primary-foreground/80 hover:text-primary-foreground h-7 gap-1.5 px-2 text-xs"
                >
                  <Undo2 className="size-3.5" />
                  Undo
                </Button>
              </div>
            ))}
        </div>
        {/* Generated images render below the bubble, indented like an attachment. */}
        {role === "assistant" && images.length > 0 && (
          <GeneratedImageList images={images} />
        )}
      </div>
    </div>
  );
}
