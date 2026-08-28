"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Cpu } from "lucide-react";
import { ComfyUIPromptModal } from "./ComfyUIPromptModal";

type Props = {
  chatId: string;
  messageId: string;
  prompt: string;
  imageCount?: number;
  onGenerated?: () => void;
};

export function ComfyUIGenerateButton({
  chatId,
  messageId,
  imageCount = 0,
  onGenerated,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground h-7 gap-1.5 px-2 text-xs"
        title={
          imageCount > 0
            ? `Regenerate image (${imageCount} already on this message)`
            : "Generate image"
        }
      >
        <Cpu className="size-3.5" />
        Generate
        {imageCount > 0 && (
          <span className="bg-muted-foreground/20 text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]">
            {imageCount}
          </span>
        )}
      </Button>

      <ComfyUIPromptModal
        open={open}
        onOpenChange={setOpen}
        chatId={chatId}
        messageId={messageId}
        onGenerated={onGenerated ?? (() => router.refresh())}
      />
    </>
  );
}
