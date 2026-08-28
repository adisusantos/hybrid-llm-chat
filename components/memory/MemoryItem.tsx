"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Star, Trash2, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type MemoryItemData = {
  id: string;
  content: string;
  importance: number;
  isPinned: boolean;
};

type Props = {
  chatId: string;
  memory: MemoryItemData;
  onChanged: () => void;
};

export function MemoryItem({ chatId, memory, onChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({
    content: memory.content,
    importance: memory.importance,
    isPinned: memory.isPinned,
  });
  const [error, setError] = useState<string | null>(null);

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!draft.content.trim()) {
      setError("Content cannot be empty");
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/chats/${chatId}/memories/${memory.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const t = await res.text();
        setError(`${res.status}: ${t.slice(0, 200)}`);
        return;
      }
      setEditing(false);
      onChanged();
    });
  };

  const togglePin = () => {
    startTransition(async () => {
      const res = await fetch(`/api/chats/${chatId}/memories/${memory.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: !memory.isPinned }),
      });
      if (res.ok) onChanged();
    });
  };

  const remove = () => {
    if (!confirm("Delete this memory?")) return;
    startTransition(async () => {
      const res = await fetch(`/api/chats/${chatId}/memories/${memory.id}`, {
        method: "DELETE",
      });
      if (res.ok) onChanged();
    });
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-border bg-background p-3 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`mem-content-${memory.id}`}>Content</Label>
          <Input
            id={`mem-content-${memory.id}`}
            value={draft.content}
            onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Importance</Label>
          <ImportanceStars
            value={draft.importance}
            onChange={(v) => setDraft((d) => ({ ...d, importance: v }))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={draft.isPinned}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, isPinned: v === true }))}
          />
          Pinned (always included in prompt)
        </label>
        {error && (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-xs">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              setEditing(false);
              setDraft({
                content: memory.content,
                importance: memory.importance,
                isPinned: memory.isPinned,
              });
            }}
          >
            <X className="size-4" /> Cancel
          </Button>
          <Button type="button" size="sm" disabled={pending} onClick={() => save()}>
            <Check className="size-4" /> Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-background p-3",
        memory.isPinned && "border-primary/40 bg-primary/5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-relaxed text-foreground">{memory.content}</p>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={pending}
            onClick={togglePin}
            aria-label={memory.isPinned ? "Unpin" : "Pin"}
          >
            <Star
              className={cn(
                "size-3.5",
                memory.isPinned && "fill-yellow-400 text-yellow-400",
              )}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={pending}
            onClick={() => setEditing(true)}
            aria-label="Edit"
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={pending}
            onClick={remove}
            aria-label="Delete"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="text-muted-foreground mt-2 flex items-center gap-1 text-xs">
        <ImportanceStars value={memory.importance} readOnly size="xs" />
        <span className="ml-1">importance {memory.importance}/5</span>
        {memory.isPinned && (
          <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px]">
            pinned
          </span>
        )}
      </div>
    </div>
  );
}

function ImportanceStars({
  value,
  onChange,
  readOnly,
  size = "sm",
}: {
  value: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
  size?: "xs" | "sm";
}) {
  const starSize = size === "xs" ? "size-3" : "size-4";
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const StarIcon = (
          <Star
            className={cn(
              starSize,
              filled ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground",
            )}
          />
        );
        if (readOnly) {
          return (
            <span key={n} className="inline-flex">
              {StarIcon}
            </span>
          );
        }
        return (
          <button
            key={n}
            type="button"
            disabled={!onChange}
            onClick={() => onChange?.(n)}
            className="hover:bg-muted/50 rounded p-0.5"
            aria-label={`Set importance ${n}`}
          >
            {StarIcon}
          </button>
        );
      })}
    </div>
  );
}
