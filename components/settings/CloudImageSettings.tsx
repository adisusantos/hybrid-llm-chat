"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Wifi, WifiOff, Save, Loader2, RefreshCw } from "lucide-react";

type Props = {
  initialUrl: string;
  initialApiKey: string;
  initialModel: string;
  initialEnabled: boolean;
  saveAction: (formData: FormData) => Promise<void>;
};

export function CloudImageSettings({
  initialUrl,
  initialApiKey,
  initialModel,
  initialEnabled,
  saveAction,
}: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [model, setModel] = useState(initialModel);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Connection test
  const [connStatus, setConnStatus] = useState<{
    ok: boolean;
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
      const res = await fetch("/api/settings/cloud-image/models");
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

  // Auto-fetch models on mount if cloud is enabled
  useEffect(() => {
    if (initialEnabled) fetchModels();
  }, [initialEnabled, fetchModels]);

  const testConn = () => {
    // Save the current form values first so the server uses latest
    if (!url || !apiKey) {
      setConnStatus({ ok: false, error: "Fill in Base URL and API Key first." });
      return;
    }

    setTesting(true);
    setConnStatus(null);
    
    startTransition(async () => {
      try {
        // First save current settings
        const fd = new FormData();
        fd.set("url", url);
        fd.set("apiKey", apiKey);
        fd.set("model", model);
        fd.set("enabled", enabled ? "1" : "0");
        await saveAction(fd);

        // Then test connection
        const res = await fetch("/api/settings/cloud-image/test-connection");
        const data = (await res.json()) as { ok: boolean; error?: string };
        setConnStatus(data);
        if (data.ok) fetchModels();
      } catch (err) {
        setConnStatus({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setTesting(false);
      }
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (url && !/^https?:\/\//.test(url)) {
      setError("URL must start with http:// or https://");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("url", url);
      fd.set("apiKey", apiKey);
      fd.set("model", model);
      fd.set("enabled", enabled ? "1" : "0");
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

          {/* Base URL */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cloud-image-url">Base URL</Label>
            <Input
              id="cloud-image-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.openai.com"
            />
            <p className="text-muted-foreground text-xs">
              Base URL untuk API cloud yang kompatibel dengan OpenAI Images API
              (format <code>/v1/images/generations</code>).
            </p>
          </div>

          {/* API Key */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cloud-image-api-key">API Key(s)</Label>
            <Textarea
              id="cloud-image-api-key"
              rows={3}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-...\nsk-..."
            />
            <p className="text-muted-foreground text-xs">
              Satu API key per baris (atau dipisah koma). Jika quota habis, sistem akan otomatis beralih ke key berikutnya.
            </p>
          </div>

          {/* Enabled toggle */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="cloud-image-enabled">Aktifkan Cloud Image</Label>
              <input
                id="cloud-image-enabled"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="size-4"
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Jika aktif, sistem akan mencoba generate via cloud terlebih dahulu.
              Jika cloud tidak reachable, fallback ke ComfyUI lokal.
            </p>
          </div>

          {/* Model — dropdown if models available, text input as fallback */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="cloud-image-model">Model</Label>
              <button
                type="button"
                onClick={fetchModels}
                disabled={modelsLoading}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                title="Refresh model list from cloud API"
              >
                <RefreshCw className={`size-3 ${modelsLoading ? "animate-spin" : ""}`} />
                {modelsLoading ? "Loading…" : "Refresh list"}
              </button>
            </div>

            {models.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <select
                  id="cloud-image-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— pilih model —</option>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <p className="text-muted-foreground text-xs">
                  {models.length} model terdeteksi dari API.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Input
                  id="cloud-image-model"
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="dall-e-3"
                />
                {modelsError ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Tidak bisa load daftar model: {modelsError} — isi manual.
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Klik &quot;Refresh list&quot; setelah mengisi URL dan API key untuk memuat daftar model otomatis.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Test Connection */}
          <div className="flex flex-col gap-2">
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
                {connStatus.ok ? "Connected" : connStatus.error}
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
