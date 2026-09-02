"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CharacterAvatar } from "@/components/character/CharacterAvatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Trash2, RotateCcw, Sparkles, Shuffle } from "lucide-react";

export type CharacterFormData = {
  id?: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  worldSetting: string;
  firstMes: string;
  mesExample: string;
  systemPromptOverride: string;
  postHistoryInstructions: string;
  appearance: string;
  faceDescription: string;
  bodyDescription: string;
  useFaceSwap: boolean;
};

type Props = {
  initial?: CharacterFormData;
  mode: "create" | "edit";
};

const EMPTY: CharacterFormData = {
  name: "",
  description: "",
  personality: "",
  scenario: "",
  worldSetting: "",
  firstMes: "",
  mesExample: "",
  systemPromptOverride: "",
  postHistoryInstructions: "",
  appearance: "",
  faceDescription: "",
  bodyDescription: "",
  useFaceSwap: false,
};

const DRAFT_KEY_PREFIX = "llamarole.character-editor.draft.";

/**
 * Display helper: if the value is a JSON object (from avatar analysis),
 * flatten it to a readable comma-separated string for the textarea.
 * If the user edits it, we store whatever they type (plain string).
 */
function flattenForDisplay(raw: string): string {
  if (!raw.trim().startsWith("{")) return raw;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.values(parsed)
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim())
      .join(", ");
  } catch {
    return raw;
  }
}

function draftKey(mode: "create" | "edit", id?: string) {
  return `${DRAFT_KEY_PREFIX}${mode}.${id ?? "new"}`;
}

function loadDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored) return JSON.parse(stored) as T;
  } catch {
    /* corrupt draft — ignore */
  }
  return null;
}

function saveDraft(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode — ignore */
  }
}

function clearDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function CharacterEditor({ initial, mode }: Props) {
  const router = useRouter();
  const [data, setData] = useState<CharacterFormData>(() => {
    const key = draftKey(mode, initial?.id);
    const draft = loadDraft<CharacterFormData>(key);
    if (draft) {
      // Preserve the identity (id) from the source of truth; the draft
      // might have been written before the route was fully resolved.
      if (initial?.id) draft.id = initial.id;
      return draft;
    }
    return initial ?? EMPTY;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [restoredFromDraft, setRestoredFromDraft] = useState(false);

  // Persist on every change. useEffect for an external system (localStorage)
  // is exactly the right place.
  useEffect(() => {
    saveDraft(draftKey(mode, data.id), data);
  }, [mode, data]);

  const update = <K extends keyof CharacterFormData>(key: K, value: CharacterFormData[K]) =>
    setData((d) => ({ ...d, [key]: value }));

  const resetDraft = () => {
    if (!confirm("Reset the form? All unsaved changes will be lost.")) return;
    const key = draftKey(mode, data.id);
    clearDraft(key);
    setData(initial ?? EMPTY);
    setError(null);
    setRestoredFromDraft(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!data.name.trim()) {
      setError("Name is required");
      return;
    }
    startTransition(async () => {
      const url = mode === "create" ? "/api/characters" : `/api/characters/${data.id}`;
      const method = mode === "create" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.text();
        setError(`${res.status}: ${body.slice(0, 200)}`);
        return;
      }
      if (mode === "create") {
        const created = (await res.json()) as { id?: string };
        if (created.id) {
          clearDraft(draftKey("create", data.id));
          router.push(`/characters/${created.id}`);
        } else {
          setError("Saved but the server response was missing an id. Reloading…");
          router.push("/characters");
          router.refresh();
        }
      } else {
        clearDraft(draftKey("edit", data.id));
        router.refresh();
      }
    });
  };

  const onDelete = () => {
    if (!data.id) return;
    if (!confirm(`Delete "${data.name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/characters/${data.id}`, { method: "DELETE" });
      if (res.ok) {
        clearDraft(draftKey("edit", data.id));
        router.push("/characters");
        router.refresh();
      } else {
        setError(`Delete failed: ${res.status}`);
      }
    });
  };

  const [faceLoading, setFaceLoading] = useState(false);
  const [faceError, setFaceError] = useState<string | null>(null);
  const [analysisProvider, setAnalysisProvider] = useState<{
    source: "cloud" | "local";
    model: string;
  } | null>(null);

  // Generate random character state
  const [genHint, setGenHint] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [showGenPanel, setShowGenPanel] = useState(false);
  const [genProvider, setGenProvider] = useState<{ source: "cloud" | "local"; model: string } | null>(null);

  const generateCharacter = async () => {
    setGenLoading(true);
    setGenError(null);
    try {
      const res = await fetch("/api/characters/generate-v3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: genHint.trim() || "random interesting character",
          faceDescription: data.faceDescription || undefined,
          bodyDescription: data.bodyDescription || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenError(body.error || `Generate failed (${res.status})`);
        return;
      }
      // Normalise mesExample — LLM sometimes returns array of objects
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
      const tags: string[] = [];

      setData((d) => ({
        ...d,
        name: body.name ?? d.name,
        description: body.description ?? d.description,
        personality: body.personality ?? d.personality,
        scenario: body.scenario ?? d.scenario,
        worldSetting: body.worldSetting ?? d.worldSetting,
        firstMes: body.firstMes ?? d.firstMes,
        mesExample: mesExample || d.mesExample,
        appearance: body.appearance ?? d.appearance,
      }));
      setShowGenPanel(false);
      setGenHint("");
      if (body.provider) setGenProvider(body.provider);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenLoading(false);
    }
  };

  const analyzeAvatar = async () => {
    if (!data.id) return;
    setFaceLoading(true);
    setFaceError(null);
    try {
      const res = await fetch(`/api/characters/${data.id}/analyze-body`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFaceError(body.error || `Failed (${res.status})`);
        return;
      }
      const body = await res.json();
      update("faceDescription", body.faceDescription ?? "");
      update("bodyDescription", body.bodyDescription ?? "");
      if (body.provider) setAnalysisProvider(body.provider);
    } catch (e) {
      setFaceError(e instanceof Error ? e.message : String(e));
    } finally {
      setFaceLoading(false);
    }
  };

  const onAvatarChange = (file: File | null) => {
    if (!file || !data.id) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("avatar", file);
      const res = await fetch(`/api/characters/${data.id}/avatar`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        setError(`Avatar upload failed: ${res.status}`);
        return;
      }
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        // Prevent Enter in textareas from submitting the form (HTML5 default
        // is to submit when there's a single submit button). Enter in a
        // textarea should insert a newline; Shift+Enter is unchanged.
        const target = e.target as HTMLElement | null;
        if (e.key === "Enter" && !e.shiftKey && target?.tagName === "TEXTAREA") {
          e.preventDefault();
          // Manually insert a newline at the cursor for consistency with
          // the user's expectation (some mobile browsers don't do this by
          // default on textareas inside forms).
          const ta = target as HTMLTextAreaElement;
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          const before = ta.value.slice(0, start);
          const after = ta.value.slice(end);
          ta.value = `${before}\n${after}`;
          ta.setSelectionRange(start + 1, start + 1);
          ta.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }}
      className="flex flex-col gap-4"
    >
      {restoredFromDraft && mode === "create" && (
        <div className="border-primary/30 bg-primary/5 text-muted-foreground flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
          <span>Restored unsaved draft from your last visit.</span>
          <button
            type="button"
            onClick={resetDraft}
            className="hover:text-foreground inline-flex items-center gap-1 underline"
          >
            <RotateCcw className="size-3" /> Reset
          </button>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center gap-4 space-y-0">
          <div className="flex-1">
            <CardTitle className="text-base">
              {mode === "create" ? "New character" : data.name || "(unnamed)"}
            </CardTitle>
            <p className="text-muted-foreground text-sm">
                {mode === "edit"
                ? "Edit character fields and avatar."
                : "Fill in the fields and save."}
            </p>
          </div>
          {mode === "edit" && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onDelete}
              disabled={pending}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </CardHeader>
        {mode === "edit" && (
          <CardContent>
            <Label htmlFor="avatar-upload" className="text-sm">
              Avatar image
            </Label>
            <div className="mt-2 mb-1">
              <CharacterAvatar
                characterId={data.id}
                name={data.name}
                size="xl"
                className="size-24 rounded-lg"
              />
            </div>
            <Input
              id="avatar-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => onAvatarChange(e.target.files?.[0] ?? null)}
              disabled={pending}
              className="mt-1"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Optional. PNG / JPG / WebP / GIF. Replaces the existing avatar.
            </p>
            {data.id && (
              <div className="mt-4 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label>Avatar analysis</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={analyzeAvatar}
                    disabled={faceLoading || pending}
                  >
                    {faceLoading ? "Analyzing…" : "Analyze avatar"}
                  </Button>
                </div>
                {faceError && (
                  <p className="text-destructive text-xs">{faceError}</p>
                )}
                {analysisProvider && (
                  <p className="text-xs">
                    <span
                      className={
                        analysisProvider.source === "cloud"
                          ? "inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          : "inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                      }
                    >
                      {analysisProvider.source === "cloud" ? "☁️" : "🖥️"}{" "}
                      {analysisProvider.source === "cloud" ? "Cloud" : "Local"} — {analysisProvider.model}
                    </span>
                  </p>
                )}
                {/* Face description — stored as JSON, displayed as flat readable text */}
                <div className="flex flex-col gap-1">
                  <Label htmlFor="faceDescription" className="text-xs text-muted-foreground">
                    Face / head
                  </Label>
                  <Textarea
                    id="faceDescription"
                    rows={2}
                    value={flattenForDisplay(data.faceDescription)}
                    onChange={(e) => update("faceDescription", e.target.value)}
                    placeholder="e.g. oval face, dark brown almond eyes, jet black hair, medium tan warm skin, Southeast Asian, mid 20s"
                  />
                </div>
                {/* Body description — stored as JSON, displayed as flat readable text */}
                <div className="flex flex-col gap-1">
                  <Label htmlFor="bodyDescription" className="text-xs text-muted-foreground">
                    Body
                  </Label>
                  <Textarea
                    id="bodyDescription"
                    rows={2}
                    value={flattenForDisplay(data.bodyDescription)}
                    onChange={(e) => update("bodyDescription", e.target.value)}
                    placeholder="e.g. chubby, large bust, full waist, wide hips, apple proportions (only from full-body photo)"
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  Diisi otomatis saat klik Analyze. Bisa diedit manual. Dipakai sebagai referensi saat generate gambar.
                  Untuk body: upload foto seluruh badan agar hasilnya akurat.
                </p>
                <div className="mt-4 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="useFaceSwap">
                      Gunakan ComfyUI face swap
                    </Label>
                    <input
                      id="useFaceSwap"
                      type="checkbox"
                      checked={data.useFaceSwap}
                      onChange={(ev) => update("useFaceSwap", ev.target.checked)}
                      className="size-4"
                    />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Aktifkan ComfyUI face swap untuk karakter ini. Membutuhkan ComfyUI aktif di Settings dan model face swap terpasang.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Generate random character panel — available in both create and edit mode */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shuffle className="text-muted-foreground size-4" />
              <CardTitle className="text-sm font-medium">Generate karakter dengan AI</CardTitle>
            {genProvider && (
              <span
                className={
                  genProvider.source === "cloud"
                    ? "inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    : "inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                }
              >
                {genProvider.source === "cloud" ? "☁️ Cloud" : "🖥️ Local"} — {genProvider.model}
              </span>
            )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setShowGenPanel((v) => !v); setGenError(null); }}
              className="text-muted-foreground h-7 px-2 text-xs"
            >
              {showGenPanel ? "Tutup" : "Buka"}
            </Button>
          </div>
        </CardHeader>
        {showGenPanel && (
          <CardContent className="flex flex-col gap-3 pt-0">
            <p className="text-muted-foreground text-xs">
              Masukkan deskripsi singkat (opsional) lalu klik Generate. Field name, description, personality, scenario, first message, dan appearance akan diisi otomatis.{" "}
              {data.faceDescription ? (
                <span className="text-green-600 dark:text-green-400">Face description yang sudah ada akan dipakai sebagai referensi.</span>
              ) : (
                <span>Jika ada face description, akan dipakai sebagai referensi.</span>
              )}
            </p>
            <Textarea
              rows={2}
              value={genHint}
              onChange={(e) => setGenHint(e.target.value)}
              placeholder="Contoh: dokter wanita paruh baya yang misterius, atau biarkan kosong untuk karakter random"
              disabled={genLoading}
            />
            {genError && (
              <p className="text-destructive text-xs">{genError}</p>
            )}
            <div className="flex justify-end">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={generateCharacter}
                disabled={genLoading || pending}
                className="gap-1.5"
              >
                <Sparkles className="size-3.5" />
                {genLoading ? "Generating…" : "Generate"}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <Field id="name" label="Name *">
            <Input
              id="name"
              value={data.name}
              onChange={(e) => update("name", e.target.value)}
              required
            />
          </Field>

          <Field id="description" label="Description">
            <Textarea
              id="description"
              rows={4}
              value={data.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </Field>

          <Field id="personality" label="Personality">
            <Textarea
              id="personality"
              rows={3}
              value={data.personality}
              onChange={(e) => update("personality", e.target.value)}
            />
          </Field>

          <Field id="appearance" label="Physical appearance">
            <Textarea
              id="appearance"
              rows={4}
              value={data.appearance}
              onChange={(e) => update("appearance", e.target.value)}
              placeholder="e.g. 160cm tall, slim build, curly black hair down to shoulders, brown eyes, calloused hands with small tattoo on left wrist, often wears a worn denim jacket over white t-shirt."
            />
            <p className="text-muted-foreground text-xs">
              Physical features used for image generation — height, build, hair, eyes, skin, clothing, distinguishing marks, etc.
            </p>
          </Field>

          <Field id="scenario" label="Scenario">
            <Textarea
              id="scenario"
              rows={3}
              value={data.scenario}
              onChange={(e) => update("scenario", e.target.value)}
            />
          </Field>

          <Field id="worldSetting" label="World Setting">
            <Textarea
              id="worldSetting"
              rows={3}
              value={data.worldSetting}
              onChange={(e) => update("worldSetting", e.target.value)}
              placeholder="Era, teknologi, pakaian, transportasi, arsitektur, adat istiadat. Contoh: Jawa kuno abad 9, era Kerajaan Mataram Hindu. Teknologi terbatas pada alat besi, perahu kayu, gerobak sapi. Pakaian kain tenun, batik, kemben. Arsitektur pendopo, candi batu."
            />
            <p className="text-muted-foreground text-xs">
              Deskripsi setting dunia untuk menjaga konsistensi era/environment sepanjang percakapan. AI tidak akan menyebut hal yang tidak sesuai setting ini.
            </p>
          </Field>

          <Field id="firstMes" label="First message">
            <Textarea
              id="firstMes"
              rows={4}
              value={data.firstMes}
              onChange={(e) => update("firstMes", e.target.value)}
            />
          </Field>

          <Field id="mesExample" label="Example dialogue">
            <Textarea
              id="mesExample"
              rows={6}
              value={data.mesExample}
              onChange={(e) => update("mesExample", e.target.value)}
            />
          </Field>

          <Separator />

          <Field id="systemPromptOverride" label="System prompt override (optional)">
            <Textarea
              id="systemPromptOverride"
              rows={4}
              value={data.systemPromptOverride}
              onChange={(e) => update("systemPromptOverride", e.target.value)}
              placeholder="If set, replaces the auto-generated system prompt entirely. Use this only if you need full control over what the model sees."
            />
          </Field>

          <Field id="postHistoryInstructions" label="Post-history instructions">
            <Textarea
              id="postHistoryInstructions"
              rows={3}
              value={data.postHistoryInstructions}
              onChange={(e) => update("postHistoryInstructions", e.target.value)}
              placeholder="Injected at the END of the system prompt (after chat history). Use for reminders the model must always see: 'Stay in character', 'Use Indonesian', etc."
            />
          </Field>

          <Separator />
        </CardContent>
      </Card>

      {error && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {mode === "create" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={resetDraft}
            className="text-muted-foreground gap-1"
          >
            <RotateCcw className="size-3.5" /> Reset form
          </Button>
        )}
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? "Saving…" : mode === "create" ? "Create character" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Separator() {
  return <div className="bg-border h-px" />;
}