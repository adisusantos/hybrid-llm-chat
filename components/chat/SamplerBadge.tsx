"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sliders, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type PresetOption = {
  id: string;
  name: string;
};

type Props = {
  chatId: string;
  currentPresetId: string | null;
  currentPresetName: string | null;
  presets: PresetOption[];
};

export function SamplerBadge({
  chatId,
  currentPresetId,
  currentPresetName,
  presets,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(currentPresetId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/chats/${chatId}/sampler`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetId: selected }),
      });
      if (!res.ok) {
        setError(`Failed: ${res.status}`);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setOpen(true);
          setSelected(currentPresetId);
          setError(null);
        }}
        className="text-muted-foreground hover:text-foreground h-10 gap-1.5 px-3 text-xs"
        aria-label="Open sampler settings"
      >
        <Sliders className="size-3.5" />
        <span className="hidden sm:inline">
          {currentPresetName ?? "Default"}
        </span>
      </Button>
      <DialogContent open={open} onClose={() => setOpen(false)}>
        <DialogHeader>
          <DialogTitle>Sampler for this chat</DialogTitle>
          <DialogDescription>
            Override the global preset for this chat. Changes apply to the next message.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {presets.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={cn(
                "hover:bg-accent flex items-center gap-3 rounded-md px-2 py-2 text-left text-sm",
                selected === p.id && "bg-accent",
              )}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border",
                  selected === p.id ? "border-primary bg-primary text-primary-foreground" : "border-input",
                )}
              >
                {selected === p.id && <Check className="size-3" />}
              </span>
              <span className="truncate">{p.name}</span>
              {p.id === "default-balanced" && (
                <span className="text-muted-foreground ml-auto text-xs">default</span>
              )}
            </button>
          ))}
        </div>
        {error && (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
            {error}
          </div>
        )}
        <DialogFooter onClose={() => setOpen(false)}>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={pending || selected === currentPresetId}>
            {pending ? "Applying…" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </>
  );
}
