"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle, ImageIcon } from "lucide-react";

export type WorkflowDebugInfo = {
  ok: boolean;
  path: string;
  error?: string;
  nodeTitles: string[];
  positivePrompt?: string;
  negativePrompt?: string;
  checkpoint?: string;
  savePrefix?: string;
  sourceFaceImage?: string;
  samplePrompt?: string;
};

type Props = {
  workflowPath: string;
  loadAction: () => Promise<WorkflowDebugInfo>;
};

export function ComfyUIWorkflowDebug({ workflowPath, loadAction }: Props) {
  const [info, setInfo] = useState<WorkflowDebugInfo | null>(null);
  const [loading, startLoading] = useTransition();
  const [clientError, setClientError] = useState<string | null>(null);
  const [positivePrompt, setPositivePrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [checkpoint, setCheckpoint] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generatedPromptId, setGeneratedPromptId] = useState<string | null>(null);
  const [provider, setProvider] = useState<"comfyui" | "cloud" | "auto">("auto");

  const load = useCallback(() => {
    startLoading(async () => {
      setClientError(null);
      try {
        const data = await loadAction();
        setInfo(data);
        setPositivePrompt(data.positivePrompt ?? "");
        setNegativePrompt(data.negativePrompt ?? "");
        setCheckpoint(data.checkpoint ?? "");
      } catch (err) {
        setClientError(err instanceof Error ? err.message : String(err));
      }
    });
  }, [loadAction]);

  const fetchModels = async () => {
    setModelsLoading(true);
    try {
      const response = await fetch("/api/settings/comfyui/models");
      const data = (await response.json()) as { models?: string[] };
      setModels(data.models ?? []);
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const status = info
    ? info.ok
      ? { icon: CheckCircle2, text: "Workflow valid", className: "text-green-600 dark:text-green-400" }
      : { icon: XCircle, text: info.error ?? "Workflow error", className: "text-destructive" }
    : null;

  const generate = async () => {
    const value = positivePrompt.trim();
    if (!value || generating) return;
    setGenerating(true);
    setClientError(null);
    setGeneratedImage(null);
    setGeneratedPromptId(null);
    try {
      const response = await fetch("/api/settings/comfyui/debug-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positivePrompt: value, negativePrompt, checkpoint, provider }),
      });
      const data = (await response.json()) as {
        image?: string;
        promptId?: string;
        provider?: string;
        error?: string;
      };
      if (!response.ok || !data.image) {
        throw new Error(data.error ?? `Generate failed (HTTP ${response.status})`);
      }
      setGeneratedImage(data.image);
      setGeneratedPromptId(data.promptId ?? null);
    } catch (err) {
      setClientError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Debug: ComfyUI Workflow</h3>
            <p className="text-muted-foreground text-xs">
              Atur prompt dan model untuk membuat custom avatar dengan workflow ComfyUI.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Reload
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Workflow path</Label>
          <code className="bg-muted rounded-md px-2 py-1 text-xs">{workflowPath}</code>
        </div>

        {clientError && (
          <div className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {clientError}
          </div>
        )}

        {status && (
          <div className={`flex items-center gap-2 text-sm ${status.className}`}>
            <status.icon className="size-4" />
            {status.text}
          </div>
        )}

        {info && info.ok && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Detected node titles ({info.nodeTitles.length})</Label>
              <div className="flex flex-wrap gap-1.5">
                {info.nodeTitles.length === 0 ? (
                  <span className="text-muted-foreground text-xs">No titled nodes found.</span>
                ) : (
                  info.nodeTitles.map((title) => (
                    <span
                      key={title}
                      className="bg-muted rounded-full px-2 py-0.5 text-[11px] font-medium"
                    >
                      {title}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Provider</Label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as "comfyui" | "cloud" | "auto")}
                className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="auto">Auto (cloud-first, fallback to ComfyUI)</option>
                <option value="cloud">Cloud only</option>
                <option value="comfyui">ComfyUI only</option>
              </select>
              <p className="text-muted-foreground text-[11px]">
                Auto: tries cloud first, falls back to ComfyUI if unreachable or error.
              </p>
            </div>

            <div className="grid gap-3 text-xs sm:grid-cols-2">
              {info.positivePrompt !== undefined && (
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-muted-foreground">Positive Prompt</Label>
                  <textarea value={positivePrompt} onChange={(event) => setPositivePrompt(event.target.value)} rows={4} className="border-input bg-background w-full rounded-md border px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              )}
              {info.negativePrompt !== undefined && (
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-muted-foreground">Negative Prompt</Label>
                  <textarea value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} rows={4} className="border-input bg-background w-full rounded-md border px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              )}
              {info.checkpoint !== undefined && (
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-muted-foreground">Checkpoint</Label>
                  <select value={checkpoint} onChange={(event) => setCheckpoint(event.target.value)} onFocus={() => { if (models.length === 0) void fetchModels(); }} className="border-input bg-background rounded-md border px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">Workflow default ({info.checkpoint})</option>
                    {models.map((model) => <option key={model} value={model}>{model}</option>)}
                  </select>
                  <button type="button" onClick={() => void fetchModels()} disabled={modelsLoading} className="self-start text-[11px] text-muted-foreground hover:text-foreground">
                    {modelsLoading ? "Loading installed models..." : "Refresh installed models"}
                  </button>
                </div>
              )}
              {info.savePrefix !== undefined && (
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-muted-foreground">Save prefix</Label>
                  <span className="bg-muted rounded-md px-2 py-1.5 font-mono">{info.savePrefix}</span>
                </div>
              )}
              {info.sourceFaceImage !== undefined && (
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-muted-foreground">Source face image</Label>
                  <span className="bg-muted rounded-md px-2 py-1.5 font-mono">{info.sourceFaceImage}</span>
                </div>
              )}
            </div>

            {info.samplePrompt && (
              <div className="text-muted-foreground border-l-2 border-border pl-3 text-xs">
                  <span className="font-medium">Workflow sample prompt:</span>{" "}
                {info.samplePrompt}
              </div>
            )}

            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <div>
                <h4 className="text-sm font-semibold">Generate debug image</h4>
                <p className="text-muted-foreground text-xs">
                  Nilai awal diambil dari workflow, lalu dapat diedit di sini. Perubahan hanya berlaku untuk generate ini dan tidak mengubah file workflow.
                </p>
              </div>
               <div className="flex items-center justify-between gap-3">
                 <span className="text-muted-foreground text-[11px]">Prompt di atas dikirim langsung saat generate.</span>
                 <Button type="button" onClick={generate} disabled={generating || !positivePrompt.trim()} className="gap-2">
                  {generating ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
                  {generating ? "Generating..." : "Generate test image"}
                </Button>
              </div>
              {generatedImage && (
                <div className="flex flex-col gap-2">
                  {/* Data URI returned by the local debug endpoint cannot use Next image optimization. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={generatedImage} alt="ComfyUI debug result" className="max-h-[32rem] w-full rounded-md border border-border object-contain" />
                  {generatedPromptId && (
                    <p className="text-muted-foreground font-mono text-[11px]">prompt_id: {generatedPromptId}</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
