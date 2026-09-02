"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CharacterEditor, type CharacterFormData } from "@/components/character/CharacterEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, PenLine } from "lucide-react";

type Mode = "pick" | "generate" | "manual";

const EMPTY_DRAFT: Omit<CharacterFormData, "id"> = {
  name: "",
  description: "",
  personality: "",
  scenario: "",
  worldSetting: "",
  firstMes: "",
  mesExample: "",
  appearance: "",
  faceDescription: "",
  bodyDescription: "",
  systemPromptOverride: "",
  postHistoryInstructions: "",
  useFaceSwap: false,
};

export function NewCharacterFlowV2() {
  const [mode, setMode] = useState<Mode>("pick");
  const [hint, setHint] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftData, setDraftData] = useState<CharacterFormData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [genPending, startGen] = useTransition();
  const [creating, setCreating] = useState(false);

  // Create a temporary draft character row so the editor (which needs an id
  // for avatar upload and face-analysis endpoints) can work before saving.
  const createDraft = async (): Promise<string | null> => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "[DRAFT]" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.id) {
        setError(body.error || `Failed to create draft (${res.status})`);
        return null;
      }
      return body.id as string;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setCreating(false);
    }
  };

  const handleGenerate = () => {
    if (!hint.trim()) {
      setError("Isi hint dulu sebelum generate.");
      return;
    }
    setError(null);
    startGen(async () => {
      // 1. Create draft row for the editor
      const id = await createDraft();
      if (!id) return;

      // 2. Call LLM to generate all character fields from the hint
      try {
        const res = await fetch("/api/characters/generate-v3", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: hint }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error || `Generate failed (${res.status})`);
          return;
        }

        // 3. Map generated fields to editor form data

        // Normalise mesExample — LLM sometimes returns it as array of objects
        const rawMesExample = body.mesExample;
        let mesExample = "";
        if (typeof rawMesExample === "string") {
          mesExample = rawMesExample;
        } else if (Array.isArray(rawMesExample)) {
          mesExample = rawMesExample
            .map((item: unknown) => {
              if (typeof item === "string") return item;
              if (typeof item === "object" && item !== null) {
                const o = item as Record<string, unknown>;
                if (typeof o.user === "string" && typeof o.char === "string")
                  return `{{user}}: ${o.user}\n{{char}}: ${o.char}`;
                if (typeof o.role === "string" && typeof o.content === "string") {
                  const role = o.role === "assistant" ? "{{char}}" : "{{user}}";
                  return `${role}: ${o.content}`;
                }
              }
              return String(item);
            })
            .join("\n");
        }

        setDraftId(id);
        setDraftData({
          id,
          name: body.name ?? "",
          description: body.description ?? "",
          personality: body.personality ?? "",
          scenario: body.scenario ?? "",
          worldSetting: body.worldSetting ?? "",
          firstMes: body.firstMes ?? "",
          mesExample,
          appearance: body.appearance ?? "",
          faceDescription: "",
          bodyDescription: "",
          systemPromptOverride: "",
          postHistoryInstructions: "",
          useFaceSwap: false,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const handleManual = async () => {
    setError(null);
    const id = await createDraft();
    if (!id) return;
    setDraftId(id);
    setDraftData({ id, ...EMPTY_DRAFT });
  };

  // Show editor once draft is ready (either generated or manual)
  if (draftId && draftData) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">New character</h1>
          <Link href="/characters" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back
          </Link>
        </div>
        <CharacterEditor mode="edit" initial={draftData} />
      </main>
    );
  }

  // Pick mode: choose generate or manual
  if (mode === "pick") {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">New character</h1>
          <Link href="/characters" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("generate")}
            className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-accent"
          >
            <Sparkles className="size-6 text-primary" />
            <div>
              <p className="font-medium">Generate dengan AI</p>
              <p className="text-muted-foreground mt-0.5 text-sm">
                Tulis hint singkat → AI mengisi semua field secara detail.
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={handleManual}
            disabled={creating}
            className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-accent disabled:opacity-60"
          >
            <PenLine className="size-6 text-primary" />
            <div>
              <p className="font-medium">Isi manual</p>
              <p className="text-muted-foreground mt-0.5 text-sm">
                Langsung buka form kosong dan isi sendiri.
              </p>
            </div>
          </button>
        </div>
        {error && (
          <p className="text-destructive text-sm">{error}</p>
        )}
      </main>
    );
  }

  // Generate mode: hint input + generate button
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">New character</h1>
        <Link href="/characters" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="size-4" /> Generate karakter dengan AI
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hint">Hint / deskripsi singkat</Label>
            <Textarea
              id="hint"
              rows={4}
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder={`Contoh:\n• "wanita paruh baya, mantan detektif, sinis tapi peduli, suka kopi"\n• "pemuda desa sederhana, penjual ikan, percaya diri, suka humor"\n• "guru SMA galak tapi sebenarnya baik hati, berkacamata tebal, hobby baking"`}
              disabled={genPending}
            />
            <p className="text-muted-foreground text-xs">
              Tulis hint singkat tentang karakter — kepribadian, latar belakang, fisik, peran.
              AI akan mengisi semua field secara lengkap berdasarkan hint ini.
            </p>
          </div>

          {error && (
            <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={genPending || !hint.trim()}
              className="gap-2"
            >
              {genPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> Generate
                </>
              )}
            </Button>
            <button
              type="button"
              onClick={() => { setMode("pick"); setError(null); }}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              ← Kembali
            </button>
          </div>

          {genPending && (
            <p className="text-muted-foreground text-xs">
              Meminta llama-server untuk membuat karakter… ini mungkin butuh 10–30 detik.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
