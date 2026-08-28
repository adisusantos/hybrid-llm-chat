"use client";

import { useState, useTransition } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Brain, RefreshCw, Plus, Sparkles, Trash2, Save } from "lucide-react";
import { MemoryItem, type MemoryItemData } from "./MemoryItem";

type Props = {
  chatId: string;
  initialSummary: string;
  initialMemories: MemoryItemData[];
};

export function MemoryPanel({ chatId, initialSummary, initialMemories }: Props) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState(initialSummary);
  const [memories, setMemories] = useState<MemoryItemData[]>(initialMemories);
  const [pendingSummary, startSummary] = useTransition();
  const [pendingSummarySave, startSave] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ content: "", importance: 3, isPinned: false });
  const [pendingAdd, startAdd] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summarizeInfo, setSummarizeInfo] = useState<string | null>(null);
  const [summaryProvider, setSummaryProvider] = useState<{ source: "cloud" | "local"; model: string } | null>(null);

  // Re-sync whenever the parent passes new initial props (e.g. router.refresh).
  // We use the React-19-friendly pattern of deriving state during render via
  // a "previous props" tracker instead of an effect.
  const [prevInitial, setPrevInitial] = useState({ summary: initialSummary, memories: initialMemories });
  if (
    prevInitial.summary !== initialSummary ||
    prevInitial.memories !== initialMemories
  ) {
    setPrevInitial({ summary: initialSummary, memories: initialMemories });
    setSummary(initialSummary);
    setMemories(initialMemories);
  }

  const refresh = async () => {
    const res = await fetch(`/api/chats/${chatId}/summary`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { summary: string };
    setSummary(data.summary);
    const memRes = await fetch(`/api/chats/${chatId}/memories`, { cache: "no-store" });
    if (memRes.ok) {
      const memData = (await memRes.json()) as { memories: MemoryItemData[] };
      setMemories(memData.memories);
    }
  };

  const summarize = () => {
    setError(null);
    setSummarizeInfo(null);
    startSummary(async () => {
      const res = await fetch(`/api/chats/${chatId}/summary`, { method: "POST" });
      if (!res.ok) {
        const t = await res.text();
        setError(`Summarize failed: ${res.status} ${t.slice(0, 200)}`);
        return;
      }
      const out = (await res.json()) as {
        summary: string;
        memoriesAdded: number;
        summaryLength: number;
        provider?: { source: "cloud" | "local"; model: string };
      };
      setSummarizeInfo(
        `Saved summary (${out.summaryLength} chars), added ${out.memoriesAdded} memories.`,
      );
      if (out.provider) setSummaryProvider(out.provider);
      await refresh();
    });
  };

  const saveSummary = () => {
    setError(null);
    startSave(async () => {
      const res = await fetch(`/api/chats/${chatId}/summary`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary }),
      });
      if (!res.ok) {
        const t = await res.text();
        setError(`Save failed: ${res.status} ${t.slice(0, 200)}`);
      }
    });
  };

  const clearSummary = () => {
    if (!confirm("Clear the chat summary? Memories will be kept.")) return;
    startSave(async () => {
      await fetch(`/api/chats/${chatId}/summary`, { method: "DELETE" });
      setSummary("");
    });
  };

  const addMemory = () => {
    setError(null);
    if (!draft.content.trim()) {
      setError("Content cannot be empty");
      return;
    }
    startAdd(async () => {
      const res = await fetch(`/api/chats/${chatId}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const t = await res.text();
        setError(`${res.status}: ${t.slice(0, 200)}`);
        return;
      }
      setDraft({ content: "", importance: 3, isPinned: false });
      setAdding(false);
      await refresh();
    });
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2 text-xs hover:bg-accent"
      >
        <Brain className="size-3.5" />
        <span className="hidden sm:inline">Memory</span>
      </Button>
      <SheetContent
        side="right"
        showCloseButton
        className="flex w-full flex-col gap-4 p-6 sm:max-w-lg"
        open={open}
        onClose={() => setOpen(false)}
      >
        <SheetHeader>
          <SheetTitle>Memory</SheetTitle>
          <SheetDescription>
            Summarized context + key facts injected into the system prompt.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Conversation summary</h3>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={pendingSummary}
                onClick={summarize}
                className="gap-1.5"
              >
                {pendingSummary ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin" /> Summarizing…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" /> Summarize now
                  </>
                )}
              </Button>
            </div>
          </div>
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={5}
            placeholder="No summary yet. Click &quot;Summarize now&quot; to generate one from the chat history."
            className="text-sm"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">
                {summary.length} chars
              </span>
              {summaryProvider && (
                <span
                  className={
                    summaryProvider.source === "cloud"
                      ? "inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  }
                >
                  {summaryProvider.source === "cloud" ? "☁️ Cloud" : "🖥️ Local"} — {summaryProvider.model}
                </span>
              )}
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={pendingSummarySave}
                onClick={saveSummary}
                className="gap-1.5"
              >
                <Save className="size-3.5" /> Save
              </Button>
              {summary.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pendingSummarySave}
                  onClick={clearSummary}
                  className="gap-1.5"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
          {summarizeInfo && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              {summarizeInfo}
            </div>
          )}
        </div>

        <Separator />

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              Memories ({memories.length})
            </h3>
            {!adding && (
              <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                <Plus className="size-3.5" /> Add
              </Button>
            )}
          </div>

          {adding && (
            <div className="border-primary/40 bg-primary/5 flex flex-col gap-3 rounded-md border p-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-mem-content">Content</Label>
                <Input
                  id="new-mem-content"
                  value={draft.content}
                  onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                  placeholder="e.g. User mentioned they have a cat named Mochi"
                />
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs">Importance</Label>
                <ImportancePicker
                  value={draft.importance}
                  onChange={(v) => setDraft((d) => ({ ...d, importance: v }))}
                />
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={draft.isPinned}
                  onChange={(e) => setDraft((d) => ({ ...d, isPinned: e.target.checked }))}
                  className="size-3.5"
                />
                Pinned
              </label>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAdding(false);
                    setDraft({ content: "", importance: 3, isPinned: false });
                  }}
                  disabled={pendingAdd}
                >
                  Cancel
                </Button>
                <Button size="sm" disabled={pendingAdd} onClick={addMemory}>
                  Save
                </Button>
              </div>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {memories.length === 0 && !adding ? (
              <p className="text-muted-foreground py-6 text-center text-xs">
                No memories yet. Add manually or run Summarize now.
              </p>
            ) : (
              memories.map((m) => (
                <MemoryItem key={m.id} chatId={chatId} memory={m} onChanged={() => void refresh()} />
              ))
            )}
          </div>
        </div>

        {error && (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-xs">
            {error}
          </div>
        )}
      </SheetContent>
    </>
  );
}

function ImportancePicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="hover:bg-muted/50 rounded p-0.5"
          aria-label={`Importance ${n}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={n <= value ? "#facc15" : "none"}
            stroke={n <= value ? "#facc15" : "currentColor"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      ))}
    </div>
  );
}
