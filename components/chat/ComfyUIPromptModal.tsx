"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Cpu } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chatId: string;
  messageId: string;
  onGenerated?: () => void;
};

export function ComfyUIPromptModal({
  open,
  onOpenChange,
  chatId,
  messageId,
  onGenerated,
}: Props) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genPending, startGen] = useTransition();

  // Fetch prompt preview when modal opens
  useEffect(() => {
    let mounted = true;
    if (!open) return;
    setError(null);
    setPrompt("");
    setNegativePrompt("");
    setLoadingPreview(true);

    fetch(`/api/chats/${chatId}/messages/${messageId}/comfyui-generate`, {
      method: "GET",
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
        }
        return res.json() as Promise<{ prompt: string, negativePrompt: string }>;
      })
      .then((data) => {
        if (mounted) {
          setPrompt(data.prompt);
          setNegativePrompt(data.negativePrompt || "");
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
      .finally(() => {
        if (mounted) {
          setLoadingPreview(false)
        }
      });
      return () => { mounted = false; };
  }, [open, chatId, messageId]);

  const submit = () => {
    if (!prompt.trim()) return;
    setError(null);
    startGen(async () => {
      try {
        const res = await fetch(
          `/api/chats/${chatId}/messages/${messageId}/comfyui-generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: prompt.trim(), negativePrompt: negativePrompt.trim() }),
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError((data as { error?: string }).error ?? `Error ${res.status}`);
          return;
        }
        onOpenChange(false);
        if (onGenerated) {
          onGenerated();
        } else {
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <DialogContent open={open} onClose={() => onOpenChange(false)} className="max-w-xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Cpu className="size-4" />
          Generate Image
        </DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-xs">
          Review and edit the prompt before generating.
        </p>

        {loadingPreview ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-3.5 animate-spin" />
            Building prompt…
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Positive Prompt</label>
              <Textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="font-mono text-xs"
                placeholder="Positive prompt will appear here…"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Negative Prompt</label>
              <Textarea
                rows={3}
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                className="font-mono text-xs"
                placeholder="Negative prompt will appear here…"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
            {error}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={genPending}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          disabled={genPending || loadingPreview || !prompt.trim()}
          className="gap-2"
        >
          {genPending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Cpu className="size-4" /> Generate
            </>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
