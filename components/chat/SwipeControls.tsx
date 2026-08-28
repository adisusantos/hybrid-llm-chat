"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { RegenerateState } from "@/lib/hooks/use-regenerate";
import { cn } from "@/lib/utils";

type Props = {
  chatId: string;
  swipes: Array<{ id: string; content: string; swipeId: number; isHidden: boolean }>;
  isContinuing?: boolean;
  regen: RegenerateState;
};

export function SwipeControls({ chatId, swipes, isContinuing = false, regen }: Props) {
  const router = useRouter();
  const [navigating, startNav] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (swipes.length === 0) return null;

  const activeIndex = swipes.findIndex((s) => !s.isHidden);
  const isRegenerating = regen.status === "streaming";
  const currentSwipeContent =
    isRegenerating ? regen.content : swipes[activeIndex]?.content ?? "";

  const go = (direction: "left" | "right") => {
    setError(null);
    startNav(async () => {
      const res = await fetch(`/api/chats/${chatId}/swipe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      if (!res.ok) {
        const t = await res.text();
        setError(`${res.status}: ${t.slice(0, 200)}`);
        return;
      }
      router.refresh();
    });
  };

  const canLeft = activeIndex > 0 && !isRegenerating && !isContinuing;
  const canRight = activeIndex < swipes.length - 1 && !isRegenerating && !isContinuing;

  return (
    <div className="flex flex-col items-center gap-1 py-2">
      {regen.truncated && (
        <div className="mx-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
          <span className="font-medium">⚠️ Context trimmed:</span>{" "}
          {regen.truncated.droppedCount} older message
          {regen.truncated.droppedCount === 1 ? "" : "s"} dropped to fit the{" "}
          {regen.truncated.maxPromptTokens.toLocaleString()}-token limit.
        </div>
      )}
      {isRegenerating && (
        <div className="bg-muted/40 mx-auto max-w-2xl rounded-md border px-4 py-3 text-sm">
          <div className="text-muted-foreground mb-1 flex items-center gap-2 text-xs">
            <Loader2 className="size-3 animate-spin" />
            regenerating swipe {swipes.length + 1}…
          </div>
          <div className="text-muted-foreground line-clamp-3 whitespace-pre-wrap italic">
            {currentSwipeContent}
          </div>
        </div>
      )}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={!canLeft || navigating}
          onClick={() => go("left")}
          aria-label="Previous swipe"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span
          className={cn(
            "text-muted-foreground min-w-[3rem] text-center font-mono text-xs",
            isRegenerating && "opacity-50",
          )}
        >
          {isRegenerating
            ? `${swipes.length + 1}/?`
            : `${activeIndex + 1}/${swipes.length}`}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={!canRight || navigating}
          onClick={() => go("right")}
          aria-label="Next swipe"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
      {error && (
        <div className="text-destructive text-xs">{error}</div>
      )}
    </div>
  );
}
