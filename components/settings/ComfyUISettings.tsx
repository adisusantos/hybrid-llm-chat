"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wifi, WifiOff, Save, Loader2, RefreshCw } from "lucide-react";

type Props = {
  initialUrl: string;
  initialEnabled: boolean;
  initialWorkflowPath: string;
  initialFaceswapOnlyWorkflowPath: string;
  initialCheckpoint: string;
  initialOutputPath: string;
  saveAction: (formData: FormData) => Promise<void>;
};

export function ComfyUISettings({
  initialUrl,
  initialEnabled,
  initialWorkflowPath,
  initialFaceswapOnlyWorkflowPath,
  initialCheckpoint,
  initialOutputPath,
  saveAction,
}: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [workflowPath, setWorkflowPath] = useState(initialWorkflowPath);
  const [faceswapOnlyWorkflowPath, setFaceswapOnlyWorkflowPath] = useState(initialFaceswapOnlyWorkflowPath);
  const [checkpoint, setCheckpoint] = useState(initialCheckpoint);
  const [outputPath, setOutputPath] = useState(initialOutputPath);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Connection test
  const [connStatus, setConnStatus] = useState<{
    ok: boolean;
    version?: string;
    error?: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  // Model list
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const res = await fetch("/api/settings/comfyui/models");
      const data = (await res.json()) as { models?: string[]; error?: string };
      if (!res.ok || data.error) {
        setModelsError(data.error ?? `HTTP ${res.status}`);
        setModels([]);
      } else {
        setModels(data.models ?? []);
      }
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : String(err));
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, []);

  // Auto-fetch models on mount if ComfyUI is enabled
  useEffect(() => {
    if (initialEnabled) fetchModels();
  }, [initialEnabled, fetchModels]);

  const testConn = async () => {
    setTesting(true);
    setConnStatus(null);
    try {
      const res = await fetch("/api/settings/comfyui/test-connection");
      const data = (await res.json()) as {
        ok: boolean;
        version?: string;
        error?: string;
      };
      setConnStatus(data);
      // Also refresh model list after successful connection test
      if (data.ok) fetchModels();
    } catch (err) {
      setConnStatus({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^https?:\/\//.test(url)) {
      setError("URL must start with http:// or https://");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("url", url);
      fd.set("enabled", enabled ? "1" : "0");
      fd.set("workflowPath", workflowPath);
      fd.set("faceswapOnlyWorkflowPath", faceswapOnlyWorkflowPath);
      fd.set("checkpoint", checkpoint);
      fd.set("outputPath", outputPath);
      try {
        await saveAction(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">

          {/* URL */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="comfyui-url">Server URL</Label>
            <Input
              id="comfyui-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://127.0.0.1:8188"
            />
            <p className="text-muted-foreground text-xs">
              URL ComfyUI lokal. Default port ComfyUI adalah <code>8188</code>.
            </p>
          </div>

          {/* Enabled */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="comfyui-enabled">Aktifkan ComfyUI</Label>
              <input
                id="comfyui-enabled"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="size-4"
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Jika aktif, tombol &quot;Generate (ComfyUI)&quot; akan muncul di
              chat bubble asisten.
            </p>
          </div>

          {/* Workflow path */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="comfyui-workflow">Full Workflow path</Label>
            <Input
              id="comfyui-workflow"
              type="text"
              value={workflowPath}
              onChange={(e) => setWorkflowPath(e.target.value)}
              placeholder="data/comfyui/faceswap_workflow.json"
            />
            <p className="text-muted-foreground text-xs">
              Path relatif ke file workflow JSON ComfyUI utama. File harus mengandung
              node <code>Positive Prompt</code> dan <code>Save Image</code>.
            </p>
          </div>

          {/* FaceSwap-Only Workflow path */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="comfyui-faceswap-only-workflow">Hybrid FaceSwap Workflow path</Label>
            <Input
              id="comfyui-faceswap-only-workflow"
              type="text"
              value={faceswapOnlyWorkflowPath}
              onChange={(e) => setFaceswapOnlyWorkflowPath(e.target.value)}
              placeholder="data/comfyui/faceswap_only_workflow.json"
            />
            <p className="text-muted-foreground text-xs">
              Path ke file workflow JSON yang digunakan saat mode Hybrid (Cloud Generate + Local Faceswap).
              File ini harus mengandung node <code>Load Target Image</code>, <code>Load Source Face</code>, dan <code>Save Image</code>.
            </p>
          </div>

          {/* Checkpoint model — dropdown if models available, text input as fallback */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="comfyui-checkpoint">Checkpoint model</Label>
              <button
                type="button"
                onClick={fetchModels}
                disabled={modelsLoading}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                title="Refresh model list from ComfyUI"
              >
                <RefreshCw className={`size-3 ${modelsLoading ? "animate-spin" : ""}`} />
                {modelsLoading ? "Loading…" : "Refresh list"}
              </button>
            </div>

            {models.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <select
                  id="comfyui-checkpoint"
                  value={checkpoint}
                  onChange={(e) => setCheckpoint(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— pakai model dari workflow file —</option>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <p className="text-muted-foreground text-xs">
                  {models.length} model terdeteksi dari ComfyUI.
                  Pilih model yang akan dipakai saat generate, atau biarkan kosong untuk memakai model di file workflow.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Input
                  id="comfyui-checkpoint"
                  type="text"
                  value={checkpoint}
                  onChange={(e) => setCheckpoint(e.target.value)}
                  placeholder="realisticVisionV60B1.safetensors"
                />
                {modelsError ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Tidak bisa load daftar model: {modelsError} — isi manual atau klik Refresh list setelah ComfyUI aktif.
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Klik &quot;Refresh list&quot; saat ComfyUI aktif untuk memuat daftar model otomatis.
                    Kosongkan untuk memakai model yang ada di file workflow.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Output folder path — for auto-delete */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="comfyui-output-path">Output folder path</Label>
            <Input
              id="comfyui-output-path"
              type="text"
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
              placeholder="/path/to/ComfyUI/output"
            />
            <p className="text-muted-foreground text-xs">
              Path absolut ke folder output ComfyUI. Jika diisi, file gambar hasil generate
              akan <strong>otomatis dihapus</strong> dari folder ini setelah berhasil disimpan ke app.
              Kosongkan untuk menonaktifkan auto-delete — file tetap ada di folder ComfyUI.
            </p>
          </div>

          {/* Test Connection */}          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={testConn}
              disabled={testing}
              className="w-fit gap-2"
            >
              {testing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : connStatus?.ok ? (
                <Wifi className="size-4" />
              ) : connStatus && !connStatus.ok ? (
                <WifiOff className="size-4" />
              ) : (
                <Wifi className="size-4" />
              )}
              {testing ? "Testing…" : "Test Connection"}
            </Button>

            {connStatus !== null && (
              <p
                className={
                  connStatus.ok
                    ? "text-sm text-green-600 dark:text-green-400"
                    : "text-sm text-destructive"
                }
              >
                {connStatus.ok
                  ? `Connected — ComfyUI v${connStatus.version}`
                  : connStatus.error}
              </p>
            )}
          </div>

          {/* Save error */}
          {error && (
            <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
              {error}
            </div>
          )}

          {/* Save button */}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending} className="gap-2">
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
