"use client";

import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  chatId: string;
  className?: string;
};

export function ExportChatButton({ chatId, className }: Props) {
  return (
    <a
      href={`/api/chats/${chatId}/export`}
      download={`chat-${chatId.slice(0, 8)}.json`}
      className={cn(
        "text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm hover:bg-accent",
        className
      )}
      aria-label="Export chat"
    >
      <Download className="size-3.5" />
      <span className="hidden sm:inline">Export</span>
    </a>
  );
}
