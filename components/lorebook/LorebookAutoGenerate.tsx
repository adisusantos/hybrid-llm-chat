"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2, Check, X, AlertCircle } from "lucide-react";

export type LorebookEntryDraft = {
  keys: string[];
  secondaryKeys: string[];
  content: string;
  comment: string;
  insertionOrder: number;
  enabled: boolean;
  caseSensitive: boolean;
  regex: boolean;
  constant: boolean;
  position: "before_char" | "after_char" | "before_system" | "after_system" | "before_exmpls";
  priority: number;
  selectiveLogic: "and" | "not";
};

type Props = {
  lorebookId?: string;
  onCreated?: (lorebookId: string) => void;
};

export function LorebookAutoGenerate({ lorebookId, onCreated }: Props) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [lorebookName, setLorebookName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [previewDraft, setPreviewDraft] = useState<{
    name: string;
    description: string;
    scanDepth: number;
    tokenBudget: number;
    entries: LorebookEntryDraft[];
    provider?: { source: "cloud" | "local"; model: string };
  } | null>(null);
  
  const [selectedEntries, setSelectedEntries] = useState<Set<number>>(new Set());
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    const timer = setTimeout(async () => {
      await doGenerate();
    }, 300);
    
    setDebounceTimer(timer);
  };

  const doGenerate = async () => {
    setError(null);
    setPreviewDraft(null);
    setSelectedEntries(new Set());
    
    if (!description.trim()) {
      setError("Masukkan deskripsi terlebih dahulu.");
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/lorebooks/generate/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
        }),
      });
      
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Gagal (${res.status})`);
        return;
      }
      
      setPreviewDraft(data);
      setSelectedEntries(new Set(data.entries.map((_: unknown, idx: number) => idx)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!previewDraft) return;
    
    const entriesToSave = previewDraft.entries.filter((_, idx) => selectedEntries.has(idx));
    
    if (entriesToSave.length === 0) {
      setError("Pilih minimal 1 entry untuk disimpan.");
      return;
    }

    setSaving(true);
    setError(null);
    
    try {
      const res = await fetch("/api/lorebooks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lorebookId: lorebookId,
          name: lorebookId ? undefined : (lorebookName.trim() || previewDraft.name),
          description: previewDraft.description,
          scanDepth: previewDraft.scanDepth,
          tokenBudget: previewDraft.tokenBudget,
          entries: entriesToSave,
        }),
      });
      
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Gagal menyimpan (${res.status})`);
        return;
      }
      
      // Success: clear all states
      setPreviewDraft(null);
      setSelectedEntries(new Set());
      setDescription("");
      setLorebookName("");
      
      // Notify parent and let it handle navigation/refresh
      if (data.lorebookId && !lorebookId) {
        onCreated?.(data.lorebookId);
      } else if (lorebookId) {
        router.refresh();
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }, 100);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleEntry = (index: number) => {
    setSelectedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (!previewDraft) return;
    if (selectedEntries.size === previewDraft.entries.length) {
      setSelectedEntries(new Set());
    } else {
      setSelectedEntries(new Set(previewDraft.entries.map((_, idx) => idx)));
    }
  };

  const estimatedTokens = previewDraft
    ? previewDraft.entries
        .filter((_, idx) => selectedEntries.has(idx))
        .reduce((sum, e) => sum + Math.ceil(e.content.length / 4), 0)
    : 0;

  const exceedsTokenBudget = previewDraft && estimatedTokens > previewDraft.tokenBudget;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4" />
            Generate Lorebook dengan AI
          </CardTitle>
          {previewDraft?.provider && (
            <span
              className={
                previewDraft.provider.source === "cloud"
                  ? "inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 border border-blue-200 dark:border-blue-800"
                  : "inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
              }
            >
              {previewDraft.provider.source === "cloud" ? "☁️ Cloud AI" : "🖥️ Local Model"} ({previewDraft.provider.model})
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!previewDraft ? (
          <form onSubmit={handleGenerate} className="flex flex-col gap-3">
            {!lorebookId && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lorebook-name">Nama Lorebook (opsional)</Label>
                <Input
                  id="lorebook-name"
                  value={lorebookName}
                  onChange={(e) => setLorebookName(e.target.value)}
                  placeholder="Misal: Karakter Aria"
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Deskripsi Karakter / Dunia</Label>
              <Textarea
                id="description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contoh: laki-laki, 20 tahun, mahasiswa informatika, yatim piatu, tinggal di kosan dekat kampus, memiliki kucing oranye bernama Milo, rahasia dia adalah keturunan keluarga penyihir yang tersembunyi..."
              />
              <p className="text-muted-foreground text-xs">
                Input bisa dalam bahasa apa saja. Output akan dalam bahasa Inggris.
              </p>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={generating} className="gap-2">
                {generating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    Generate Preview
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">
                    {previewDraft.entries.length} entry dihasilkan ({selectedEntries.size} dipilih)
                  </p>
                  {previewDraft.provider && (
                    <span
                      className={
                        previewDraft.provider.source === "cloud"
                          ? "inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          : "inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                      }
                    >
                      {previewDraft.provider.source === "cloud" ? "☁️ Cloud" : "🖥️ Local"} — {previewDraft.provider.model}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">
                  Est. tokens: {estimatedTokens} / {previewDraft.tokenBudget}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPreviewDraft(null);
                    setSelectedEntries(new Set());
                  }}
                  className="gap-1"
                >
                  <X className="size-3" /> Batal
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleAll}
                  className="gap-1"
                >
                  {selectedEntries.size === previewDraft.entries.length ? "Unselect All" : "Select All"}
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleSave} 
                  disabled={saving || selectedEntries.size === 0}
                  className="gap-1"
                >
                  {saving ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Check className="size-3" />
                  )}
                  Simpan {selectedEntries.size > 0 && `(${selectedEntries.size})`}
                </Button>
              </div>
            </div>

            {exceedsTokenBudget && (
              <div className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>
                  Token yang dipilih ({estimatedTokens}) melebihi budget ({previewDraft.tokenBudget}). Beberapa entry mungkin tidak akan ter-trigger.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-3 text-xs">
              <div className="flex flex-col gap-1">
                <Label htmlFor="preview-name" className="text-xs font-semibold">Nama Lorebook</Label>
                <Input
                  id="preview-name"
                  value={previewDraft.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPreviewDraft((prev) => prev ? { ...prev, name: val } : null);
                  }}
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="preview-desc" className="text-xs font-semibold">Deskripsi Ringkas</Label>
                <Textarea
                  id="preview-desc"
                  rows={2}
                  value={previewDraft.description}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPreviewDraft((prev) => prev ? { ...prev, description: val } : null);
                  }}
                  className="text-xs"
                />
              </div>
            </div>

            <div className="flex max-h-[400px] flex-col gap-2 overflow-y-auto">
              {previewDraft.entries.map((entry, idx) => (
                <Card
                  key={idx}
                  className={`cursor-pointer transition-opacity ${
                    selectedEntries.has(idx) ? "" : "opacity-40"
                  }`}
                  onClick={() => toggleEntry(idx)}
                >
                  <CardContent className="flex flex-col gap-2 pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant="outline" className="text-[10px]">
                          pri {entry.priority}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {entry.position}
                        </Badge>
                        {entry.constant && (
                          <Badge variant="secondary" className="text-[10px]">
                            constant
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {selectedEntries.has(idx) ? (
                          <Check className="text-primary size-4" />
                        ) : (
                          <div className="size-4 rounded border border-input" />
                        )}
                      </div>
                    </div>
                    <div className="text-xs">
                      <span className="text-muted-foreground">keys: </span>
                      {entry.keys.map((k) => (
                        <code
                          key={k}
                          className="bg-muted mr-1 rounded px-1 py-0.5"
                        >
                          {k}
                        </code>
                      ))}
                    </div>
                    <p className="text-muted-foreground line-clamp-3 text-xs">
                      {entry.content}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}