"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Wifi, WifiOff, Save, Loader2 } from "lucide-react";
import type { VoiceMap, EmotionLabel } from "@/lib/tts/tts-types";
import { DEFAULT_VOICE_MAP } from "@/lib/tts/tts-types";

type Props = {
  initialUrl: string;
  initialEnabled: boolean;
  initialVoiceMap: VoiceMap;
  saveAction: (formData: FormData) => Promise<void>;
};

// Kokoro voice list from mlx-tts-studio/app/engines.py
const KOKORO_VOICES = [
  { id: "af_heart", label: "Heart (warm female)", group: "American Female" },
  { id: "af_bella", label: "Bella (bright female)", group: "American Female" },
  { id: "af_nicole", label: "Nicole (smooth female)", group: "American Female" },
  { id: "af_sarah", label: "Sarah (natural female)", group: "American Female" },
  { id: "af_sky", label: "Sky (airy female)", group: "American Female" },
  { id: "af_nova", label: "Nova (bright female)", group: "American Female" },
  { id: "af_river", label: "River (flowing female)", group: "American Female" },
  { id: "af_kore", label: "Kore (steady female)", group: "American Female" },
  { id: "am_adam", label: "Adam (clear male)", group: "American Male" },
  { id: "am_michael", label: "Michael (deep male)", group: "American Male" },
  { id: "bf_emma", label: "Emma (British female)", group: "British Female" },
  { id: "bf_isabella", label: "Isabella (British female)", group: "British Female" },
  { id: "bm_george", label: "George (British male)", group: "British Male" },
];

const EMOTIONS: Array<{ id: EmotionLabel; label: string; description: string }> = [
  { id: "neutral", label: "Neutral", description: "Default, balanced tone" },
  { id: "happy", label: "Happy", description: "Cheerful, upbeat" },
  { id: "sad", label: "Sad", description: "Melancholic, somber" },
  { id: "angry", label: "Angry", description: "Intense, aggressive" },
  { id: "excited", label: "Excited", description: "Energetic, enthusiastic" },
  { id: "whisper", label: "Whisper", description: "Soft, intimate" },
  { id: "tender", label: "Tender", description: "Gentle, affectionate" },
];

function voiceMapToFormData(vm: VoiceMap): Record<string, { voice: string; speed: number }> {
  const result: Record<string, { voice: string; speed: number }> = {};
  for (const emotion of EMOTIONS) {
    const entry = vm[emotion.id];
    result[emotion.id] = {
      voice: entry?.voice_id || "af_heart",
      speed: entry?.speed || 1.0,
    };
  }
  return result;
}

export function TTSSettings({
  initialUrl,
  initialEnabled,
  initialVoiceMap,
  saveAction,
}: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [voiceSettings, setVoiceSettings] = useState(() =>
    voiceMapToFormData(initialVoiceMap),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Connection test
  const [connStatus, setConnStatus] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const testConn = () => {
    if (!url) {
      setConnStatus({ ok: false, error: "Fill in Base URL first." });
      return;
    }

    setTesting(true);
    setConnStatus(null);

    startTransition(async () => {
      try {
        // Save first so test-connection uses latest values
        const fd = buildFormData();
        await saveAction(fd);

        const res = await fetch("/api/settings/tts/test-connection");
        const data = (await res.json()) as { ok: boolean; error?: string };
        setConnStatus(data);
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

  const buildFormData = () => {
    const fd = new FormData();
    fd.set("url", url);
    fd.set("enabled", enabled ? "1" : "0");

    // Reconstruct VoiceMap from form state
    const voiceMap: VoiceMap = {} as VoiceMap;
    for (const emotion of EMOTIONS) {
      const setting = voiceSettings[emotion.id];
      voiceMap[emotion.id] = {
        voice_id: setting.voice,
        speed: setting.speed,
      };
    }
    fd.set("voiceMap", JSON.stringify(voiceMap));
    return fd;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (url && !/^https?:\/\//.test(url)) {
      setError("URL must start with http:// or https://");
      return;
    }

    startTransition(async () => {
      const fd = buildFormData();
      try {
        await saveAction(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const resetToDefaults = () => {
    setVoiceSettings(voiceMapToFormData(DEFAULT_VOICE_MAP));
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">

          {/* Base URL */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tts-url">Base URL</Label>
            <Input
              id="tts-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://127.0.0.1:8880"
            />
            <p className="text-muted-foreground text-xs">
              URL server TTS yang kompatibel dengan OpenAI{" "}
              <code>/v1/audio/speech</code>. Contoh: kokoro-fastapi di{" "}
              <code>http://127.0.0.1:8880</code>.
            </p>
          </div>

          {/* Enabled toggle */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="tts-enabled">Aktifkan TTS</Label>
              <input
                id="tts-enabled"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="size-4"
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Jika aktif, tombol speaker akan muncul di bawah pesan terakhir AI untuk memutar audio.
            </p>
          </div>

          <hr className="border-border" />

          {/* Voice Settings per Emotion */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Voice Settings per Emotion</h3>
            <button
              type="button"
              onClick={resetToDefaults}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Reset ke default
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {EMOTIONS.map((emotion) => {
              const setting = voiceSettings[emotion.id];
              return (
                <div key={emotion.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{emotion.label}</p>
                      <p className="text-xs text-muted-foreground">{emotion.description}</p>
                    </div>
                  </div>

                  {/* Voice Dropdown */}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`voice-${emotion.id}`} className="text-xs">Voice</Label>
                    <Select
                      value={setting.voice}
                      onValueChange={(value) =>
                        setVoiceSettings((prev) => ({
                          ...prev,
                          [emotion.id]: { ...prev[emotion.id], voice: value },
                        }))
                      }
                    >
                      <SelectTrigger id={`voice-${emotion.id}`} className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KOKORO_VOICES.map((voice) => (
                          <SelectItem key={voice.id} value={voice.id} className="text-xs">
                            {voice.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Speed Slider */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`speed-${emotion.id}`} className="text-xs">Speed</Label>
                      <span className="text-xs text-muted-foreground">{setting.speed.toFixed(2)}x</span>
                    </div>
                    <Slider
                      id={`speed-${emotion.id}`}
                      min={0.5}
                      max={2.0}
                      step={0.05}
                      value={[setting.speed]}
                      onValueChange={([value]) =>
                        setVoiceSettings((prev) => ({
                          ...prev,
                          [emotion.id]: { ...prev[emotion.id], speed: value },
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <hr className="border-border" />

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
