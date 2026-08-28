"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BookPlus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type LorebookOption = { id: string; name: string };

type Props = {
  chatId: string;
  attached: LorebookOption[];
  available: LorebookOption[];
};

export function AttachLorebookDialog({ chatId, attached, available }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const attachedIds = new Set(attached.map((a) => a.id));
  const attachable = available.filter((a) => !attachedIds.has(a.id));

  const attach = (lorebookId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/chats/${chatId}/lorebooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lorebookId }),
      });
      if (!res.ok) {
        const t = await res.text();
        setError(`${res.status}: ${t.slice(0, 200)}`);
        return;
      }
      router.refresh();
    });
  };

  const detach = (lorebookId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/chats/${chatId}/lorebooks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lorebookId }),
      });
      if (!res.ok) {
        const t = await res.text();
        setError(`${res.status}: ${t.slice(0, 200)}`);
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground h-10 gap-1.5 px-3 text-xs"
        aria-label="Attach lorebooks"
      >
        <BookPlus className="size-3.5" />
        <span className="hidden sm:inline">Lorebooks</span>
      </Button>
      <DialogContent open={open} onClose={() => setOpen(false)}>
        <DialogHeader>
          <DialogTitle>Lorebooks for this chat</DialogTitle>
          <DialogDescription>
            Attach lorebooks to inject world info into the system prompt.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-2 text-sm font-medium">Attached</h3>
            {attached.length === 0 ? (
              <p className="text-muted-foreground text-xs italic">None</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {attached.map((lb) => (
                  <li
                    key={lb.id}
                    className="flex items-center justify-between rounded-md border bg-accent/30 px-3 py-2 text-sm"
                  >
                    <span className="truncate">{lb.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => detach(lb.id)}
                    >
                      Detach
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">Available</h3>
            {attachable.length === 0 ? (
              <p className="text-muted-foreground text-xs italic">
                {available.length === 0
                  ? "No lorebooks yet. Create one in /lorebooks."
                  : "All lorebooks are already attached."}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {attachable.map((lb) => (
                  <li key={lb.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-start"
                      disabled={pending}
                      onClick={() => attach(lb.id)}
                    >
                      <span className="truncate flex-1">{lb.name}</span>
                      <span className="flex items-center gap-1 text-xs">
                        Attach <Check className="size-3" />
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {error && (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <DialogFooter onClose={() => setOpen(false)}>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </>
  );
}
