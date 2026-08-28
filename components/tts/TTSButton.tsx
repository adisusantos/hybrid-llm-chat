"use client";

import { useState, useRef, useCallback } from "react";
import { Volume2, Pause, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type TTSState = "idle" | "loading" | "playing" | "error";

type Props = {
  content: string;
  disabled?: boolean;
  className?: string;
};

export function TTSButton({ content, disabled, className }: Props) {
  const [state, setState] = useState<TTSState>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const stopCurrent = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  const handleClick = useCallback(async () => {
    if (disabled) return;

    // If playing → stop
    if (state === "playing") {
      stopCurrent();
      setState("idle");
      return;
    }

    // If already loading, ignore
    if (state === "loading") return;

    stopCurrent();
    setState("loading");

    try {
      const res = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) errMsg = data.error;
        } catch {
          // ignore
        }
        console.error("[TTS] error:", errMsg);
        setState("error");
        setTimeout(() => setState("idle"), 2000);
        return;
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      blobUrlRef.current = blobUrl;

      const audio = new Audio(blobUrl);
      audioRef.current = audio;

      audio.addEventListener("ended", () => {
        stopCurrent();
        setState("idle");
      });

      audio.addEventListener("error", () => {
        stopCurrent();
        setState("error");
        setTimeout(() => setState("idle"), 2000);
      });

      await audio.play();
      setState("playing");
    } catch (err) {
      console.error("[TTS] fetch error:", err);
      stopCurrent();
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }, [content, disabled, state, stopCurrent]);

  const isError = state === "error";

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={disabled || state === "loading"}
      title={
        state === "playing"
          ? "Stop audio"
          : state === "loading"
            ? "Generating audio…"
            : isError
              ? "TTS error"
              : "Play audio"
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
        "text-muted-foreground hover:text-foreground hover:bg-muted",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "h-7",
        isError && "text-destructive hover:text-destructive",
        className,
      )}
    >
      {state === "loading" ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : state === "playing" ? (
        <Pause className="size-3.5" />
      ) : (
        <Volume2 className="size-3.5" />
      )}
    </button>
  );
}
