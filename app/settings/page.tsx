import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getOrCreateDefaultPreset,
  getSetting,
  listSamplerPresets,
  setSetting,
} from "@/lib/db/queries";
import { ComfyUISettings } from "@/components/settings/ComfyUISettings";
import { CloudImageSettings } from "@/components/settings/CloudImageSettings";
import { CloudVisionSettings } from "@/components/settings/CloudVisionSettings";
import { CloudTextSettings } from "@/components/settings/CloudTextSettings";
import { TTSSettings } from "@/components/settings/TTSSettings";
import { TopNav } from "@/components/top-nav";
import { DEFAULT_SAMPLER } from "@/lib/llama/sampler";
import {
  DEFAULT_COMFYUI_URL,
  DEFAULT_COMFYUI_WORKFLOW_PATH,
  DEFAULT_COMFYUI_FACESWAP_ONLY_WORKFLOW_PATH,
} from "@/lib/imagegen/comfyui";
import {
  SETTING_KEY_CLOUD_IMAGE_URL,
  SETTING_KEY_CLOUD_IMAGE_API_KEY,
  SETTING_KEY_CLOUD_IMAGE_MODEL,
  SETTING_KEY_CLOUD_IMAGE_ENABLED,
  DEFAULT_CLOUD_IMAGE_URL,
} from "@/lib/imagegen/cloud";
import {
  SETTING_KEY_CLOUD_TEXT_URL,
  SETTING_KEY_CLOUD_TEXT_API_KEY,
  SETTING_KEY_CLOUD_TEXT_MODEL,
  SETTING_KEY_CLOUD_TEXT_ENABLED,
  DEFAULT_CLOUD_TEXT_URL,
} from "@/lib/cloud-ai/cloud-text";
import {
  SETTING_KEY_TTS_URL,
  SETTING_KEY_TTS_ENABLED,
  SETTING_KEY_TTS_VOICE_MAP,
  DEFAULT_TTS_URL,
  DEFAULT_VOICE_MAP,
  type VoiceMap,
} from "@/lib/tts/tts-types";
import {
  SETTING_KEY_CLOUD_VISION_URL,
  SETTING_KEY_CLOUD_VISION_API_KEY,
  SETTING_KEY_CLOUD_VISION_MODEL,
  SETTING_KEY_CLOUD_VISION_ENABLED,
  DEFAULT_CLOUD_VISION_URL,
} from "@/lib/cloud-ai/cloud-vision";
import { db } from "@/lib/db/client";
import { samplerPresets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Star } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import type { SamplerFormValues } from "@/components/settings/SamplerPresetForm";

export const dynamic = "force-dynamic";

const KEY_COMFYUI_URL = "comfyui.url";
const KEY_COMFYUI_ENABLED = "comfyui.enabled";
const KEY_COMFYUI_WORKFLOW_PATH = "comfyui.workflow_path";
const KEY_COMFYUI_FACESWAP_ONLY_WORKFLOW_PATH = "comfyui.faceswap_only_workflow_path";
const KEY_COMFYUI_CHECKPOINT = "comfyui.checkpoint";
const KEY_COMFYUI_OUTPUT_PATH = "comfyui.output_path";
const KEY_CLOUD_IMAGE_URL = "cloud_image.url";
const KEY_CLOUD_IMAGE_API_KEY = "cloud_image.api_key";
const KEY_CLOUD_IMAGE_MODEL = "cloud_image.model";
const KEY_CLOUD_IMAGE_ENABLED = "cloud_image.enabled";
const KEY_CLOUD_VISION_URL = "cloud_vision.url";
const KEY_CLOUD_VISION_API_KEY = "cloud_vision.api_key";
const KEY_CLOUD_VISION_MODEL = "cloud_vision.model";
const KEY_CLOUD_VISION_ENABLED = "cloud_vision.enabled";
const KEY_CLOUD_TEXT_URL = "cloud_text.url";
const KEY_CLOUD_TEXT_API_KEY = "cloud_text.api_key";
const KEY_CLOUD_TEXT_MODEL = "cloud_text.model";
const KEY_CLOUD_TEXT_ENABLED = "cloud_text.enabled";
const KEY_TTS_URL = "tts.url";
const KEY_TTS_ENABLED = "tts.enabled";
const KEY_TTS_VOICE_MAP = "tts.voice_map";


async function saveComfyUI(formData: FormData) {
  "use server";
  const url = (formData.get("url") as string | null)?.trim() || null;
  const enabled = formData.get("enabled") === "1";
  const workflowPath =
    (formData.get("workflowPath") as string | null)?.trim() || null;
  const faceswapOnlyWorkflowPath =
    (formData.get("faceswapOnlyWorkflowPath") as string | null)?.trim() || null;
  const checkpoint =
    (formData.get("checkpoint") as string | null)?.trim() || null;

  if (url !== null) {
    if (!/^https?:\/\//.test(url)) return;
    await setSetting(KEY_COMFYUI_URL, url);
  }
  await setSetting(KEY_COMFYUI_ENABLED, enabled);
  if (workflowPath !== null) {
    await setSetting(KEY_COMFYUI_WORKFLOW_PATH, workflowPath);
  }
  if (faceswapOnlyWorkflowPath !== null) {
    await setSetting(KEY_COMFYUI_FACESWAP_ONLY_WORKFLOW_PATH, faceswapOnlyWorkflowPath);
  }
  // Empty string → use workflow default
  await setSetting(KEY_COMFYUI_CHECKPOINT, checkpoint ?? "");
  // Empty string → auto-delete disabled
  const outputPath = (formData.get("outputPath") as string | null)?.trim() || null;
  await setSetting(KEY_COMFYUI_OUTPUT_PATH, outputPath ?? "");
  revalidatePath("/settings");
}

async function saveCloudImage(formData: FormData) {
  "use server";
  const url = (formData.get("url") as string | null)?.trim() || null;
  const apiKey = (formData.get("apiKey") as string | null)?.trim() || null;
  const model = (formData.get("model") as string | null)?.trim() || null;
  const enabled = formData.get("enabled") === "1";

  if (url !== null) {
    if (!/^https?:\/\//.test(url)) return;
    await setSetting(KEY_CLOUD_IMAGE_URL, url);
  }
  await setSetting(KEY_CLOUD_IMAGE_API_KEY, apiKey ?? "");
  await setSetting(KEY_CLOUD_IMAGE_MODEL, model ?? "");
  await setSetting(KEY_CLOUD_IMAGE_ENABLED, enabled);
  revalidatePath("/settings");
}

async function saveCloudText(formData: FormData) {
  "use server";
  const url = (formData.get("url") as string | null)?.trim() || null;
  const apiKey = (formData.get("apiKey") as string | null)?.trim() || null;
  const model = (formData.get("model") as string | null)?.trim() || null;
  const enabled = formData.get("enabled") === "1";

  if (url !== null) {
    if (!/^https?:\/\//.test(url)) return;
    await setSetting(KEY_CLOUD_TEXT_URL, url);
  }
  await setSetting(KEY_CLOUD_TEXT_API_KEY, apiKey ?? "");
  await setSetting(KEY_CLOUD_TEXT_MODEL, model ?? "");
  await setSetting(KEY_CLOUD_TEXT_ENABLED, enabled);
  revalidatePath("/settings");
}

async function saveCloudVision(formData: FormData) {
  "use server";
  const url = (formData.get("url") as string | null)?.trim() || null;
  const apiKey = (formData.get("apiKey") as string | null)?.trim() || null;
  const model = (formData.get("model") as string | null)?.trim() || null;
  const enabled = formData.get("enabled") === "1";

  if (url !== null) {
    if (!/^https?:\/\//.test(url)) return;
    await setSetting(KEY_CLOUD_VISION_URL, url);
  }
  await setSetting(KEY_CLOUD_VISION_API_KEY, apiKey ?? "");
  await setSetting(KEY_CLOUD_VISION_MODEL, model ?? "");
  await setSetting(KEY_CLOUD_VISION_ENABLED, enabled);
  revalidatePath("/settings");
}

async function saveTts(formData: FormData) {
  "use server";
  const url = (formData.get("url") as string | null)?.trim() || null;
  const enabled = formData.get("enabled") === "1";
  const voiceMapRaw = (formData.get("voiceMap") as string | null)?.trim() || null;

  if (url !== null) {
    if (url && !/^https?:\/\//.test(url)) return;
    await setSetting(KEY_TTS_URL, url);
  }
  await setSetting(KEY_TTS_ENABLED, enabled);
  if (voiceMapRaw) {
    try {
      const parsed = JSON.parse(voiceMapRaw) as VoiceMap;
      await setSetting(KEY_TTS_VOICE_MAP, parsed);
    } catch {
      // ignore invalid JSON — keep existing
    }
  }
  revalidatePath("/settings");
  revalidatePath("/chat", "layout");
}

async function deletePresetAction(formData: FormData) {
  "use server";
  const id = formData.get("presetId") as string;
  if (!id || id === "default-balanced") return;
  await db.delete(samplerPresets).where(eq(samplerPresets.id, id));
  redirect("/settings");
}

async function createPresetAction(formData: FormData) {
  "use server";
  const name = (formData.get("name") as string)?.trim();
  if (!name) redirect("/settings?new=1&error=Name+is+required");
  const config = {
    temperature: parseFloat(formData.get("temperature") as string) || DEFAULT_SAMPLER.temperature,
    top_p: parseFloat(formData.get("top_p") as string) || DEFAULT_SAMPLER.top_p,
    top_k: parseInt(formData.get("top_k") as string) || DEFAULT_SAMPLER.top_k,
    min_p: parseFloat(formData.get("min_p") as string) || DEFAULT_SAMPLER.min_p,
    repeat_penalty: parseFloat(formData.get("repeat_penalty") as string) || DEFAULT_SAMPLER.repeat_penalty,
    repeat_last_n: parseInt(formData.get("repeat_last_n") as string) || DEFAULT_SAMPLER.repeat_last_n,
    dry_multiplier: parseFloat(formData.get("dry_multiplier") as string) || DEFAULT_SAMPLER.dry_multiplier,
    max_tokens: parseInt(formData.get("max_tokens") as string) || 800,
  };
  await db.insert(samplerPresets).values({
    id: crypto.randomUUID(),
    name,
    scope: "global",
    configJson: JSON.stringify(config),
    createdAt: new Date(),
  });
  redirect("/settings");
}


export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; error?: string }>;
}) {
  const { new: showNew, error } = await searchParams;
  await getOrCreateDefaultPreset();

  const [
    presetRows,
    comfyUrl, comfyEnabled, comfyWorkflowPath, comfyFaceswapOnlyWorkflowPath, comfyCheckpoint, comfyOutputPath,
    cloudUrl, cloudApiKey, cloudModel, cloudEnabled,
    cvUrl, cvApiKey, cvModel, cvEnabled,
    ctUrl, ctApiKey, ctModel, ctEnabled,
    ttsUrl, ttsEnabledVal, ttsVoiceMap,
  ] =
    await Promise.all([
      listSamplerPresets(),
      getSetting<string>(KEY_COMFYUI_URL),
      getSetting<boolean>(KEY_COMFYUI_ENABLED),
      getSetting<string>(KEY_COMFYUI_WORKFLOW_PATH),
      getSetting<string>(KEY_COMFYUI_FACESWAP_ONLY_WORKFLOW_PATH),
      getSetting<string>(KEY_COMFYUI_CHECKPOINT),
      getSetting<string>(KEY_COMFYUI_OUTPUT_PATH),
      getSetting<string>(KEY_CLOUD_IMAGE_URL),
      getSetting<string>(KEY_CLOUD_IMAGE_API_KEY),
      getSetting<string>(KEY_CLOUD_IMAGE_MODEL),
      getSetting<boolean>(KEY_CLOUD_IMAGE_ENABLED),
      getSetting<string>(KEY_CLOUD_VISION_URL),
      getSetting<string>(KEY_CLOUD_VISION_API_KEY),
      getSetting<string>(KEY_CLOUD_VISION_MODEL),
      getSetting<boolean>(KEY_CLOUD_VISION_ENABLED),
      getSetting<string>(KEY_CLOUD_TEXT_URL),
      getSetting<string>(KEY_CLOUD_TEXT_API_KEY),
      getSetting<string>(KEY_CLOUD_TEXT_MODEL),
      getSetting<boolean>(KEY_CLOUD_TEXT_ENABLED),
      getSetting<string>(KEY_TTS_URL),
      getSetting<boolean>(KEY_TTS_ENABLED),
      getSetting<VoiceMap>(KEY_TTS_VOICE_MAP),
    ]);

  const presets = presetRows.map((r) => {
    let config: SamplerFormValues;
    try { config = { ...DEFAULT_SAMPLER, ...JSON.parse(r.configJson) }; }
    catch { config = DEFAULT_SAMPLER; }
    return { id: r.id, name: r.name, scope: r.scope, config };
  });

  return (
    <>
      <TopNav active="settings" />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm">
            Sampler presets determine how the model generates text.
          </p>
        </div>

        <hr className="border-border" />

        {/* Presets header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Sampler presets</h2>
          {!showNew && (
            <a
              href="/settings?new=1"
              className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              + New preset
            </a>
          )}
        </div>

        {/* New preset form */}
        {showNew && (
          <form
            action={createPresetAction}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
          >
            <h3 className="text-sm font-semibold">New sampler preset</h3>
            {error && (
              <p className="text-sm text-destructive">{decodeURIComponent(error)}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium">Name</label>
                <input
                  name="name"
                  required
                  className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {(["temperature","top_p","min_p","top_k","repeat_penalty","repeat_last_n","dry_multiplier","max_tokens"] as const).map((key) => {
                const SAMPLER_HINTS: Record<string, string> = {
                  temperature:
                    "Tingkat keacakan/kreativitas jawaban. Nilai rendah (0.2–0.5) = fokus & konsisten; tinggi (0.8–1.2) = lebih kreatif & bervariasi, tapi berisiko ngawur.",
                  top_p:
                    "Nucleus sampling: ambil kata dari kumpulan probabilitas teratas hingga totalnya mencapai nilai ini (mis. 0.9 = 90% teratas). Lebih rendah = lebih aman/terbatas.",
                  min_p:
                    "Ambang minimum probabilitas sebuah kata (relatif terhadap kata terbaik) agar dipertimbangkan. Makin tinggi = makin ketat membuang kata yang tak mungkin.",
                  top_k:
                    "Hanya pertimbangkan K kata dengan probabilitas tertinggi (mis. 40 = pilih dari 40 kandidat teratas). 0 = nonaktif.",
                  repeat_penalty:
                    "Hukuman untuk kata yang sudah muncul, mengurangi pengulangan. >1 menekan repetisi (1.1 umum); terlalu tinggi bisa bikin teks terasa aneh.",
                  repeat_last_n:
                    "Berapa banyak token terakhir yang diperiksa untuk penalti pengulangan (mis. 64 = cek 64 token sebelumnya).",
                  dry_multiplier:
                    "Kekuatan DRY (Don't Repeat Yourself) untuk mencegah pengulangan frasa/pola. 0 = mati. Naikkan jika model sering mengulang kalimat yang sama.",
                  max_tokens:
                    "Panjang maksimum jawaban yang dihasilkan (dalam token). Makin besar = jawaban bisa lebih panjang, tapi lebih lambat.",
                };
                return (
                  <div key={key}>
                    <label className="text-xs font-medium">{key}</label>
                    <input
                      name={key}
                      type="number"
                      step="any"
                      defaultValue={String(DEFAULT_SAMPLER[key])}
                      className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      {SAMPLER_HINTS[key]}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <SubmitButton
                loadingText="⏳ Saving…"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-60"
              >
                Save
              </SubmitButton>
              <a
                href="/settings"
                className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                Cancel
              </a>
            </div>
          </form>
        )}

        {/* Presets table */}
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">temp</th>
                <th className="px-3 py-2 text-left">top_p</th>
                <th className="px-3 py-2 text-left">top_k</th>
                <th className="px-3 py-2 text-left">max_tok</th>
                <th className="px-3 py-2 text-left"></th>
              </tr>
            </thead>
            <tbody>
              {presets.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">
                    {p.id === "default-balanced" && (
                      <Star className="mr-1 inline size-3 fill-yellow-400 text-yellow-400" />
                    )}
                    {p.name}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{p.config.temperature.toFixed(2)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.config.top_p.toFixed(2)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.config.top_k}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.config.max_tokens}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <a
                        href={`/settings/presets/${p.id}/edit`}
                        className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        Edit
                      </a>
                      {p.id !== "default-balanced" && (
                        <form action={deletePresetAction}>
                          <input type="hidden" name="presetId" value={p.id} />
                          <SubmitButton
                            loadingText="…"
                            className="rounded px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-60"
                          >
                            Delete
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <hr className="border-border" />

        {/* Cloud Text AI */}
        <div>
          <h2 className="text-lg font-semibold">Cloud Text AI (Summarizer &amp; Prompts)</h2>
          <p className="text-sm text-muted-foreground">
            Digunakan untuk proses non-chat seperti summarizer (ringkasan percakapan &amp; memori) 
            serta image prompt extraction. Jika aktif dan reachable, akan diprioritaskan. 
            Jika tidak, fallback ke llama-server lokal.
          </p>
        </div>
        <CloudTextSettings
          initialUrl={ctUrl ?? DEFAULT_CLOUD_TEXT_URL}
          initialApiKey={ctApiKey ?? ""}
          initialModel={ctModel ?? ""}
          initialEnabled={ctEnabled ?? false}
          saveAction={saveCloudText}
        />

        <hr className="border-border" />
        {/* Cloud Vision */}
        <div>
          <h2 className="text-lg font-semibold">Cloud Vision (Analisa Gambar)</h2>
          <p className="text-sm text-muted-foreground">
            Analisa gambar karakter (face &amp; body) menggunakan cloud AI vision model
            yang kompatibel dengan OpenAI Chat Completions API. Jika aktif dan reachable,
            akan digunakan sebagai primary (1 pass, lebih cepat dan akurat).
            Jika tidak reachable, fallback ke Ollama vision lokal (multi-pass).
          </p>
        </div>
        <CloudVisionSettings
          initialUrl={cvUrl ?? DEFAULT_CLOUD_VISION_URL}
          initialApiKey={cvApiKey ?? ""}
          initialModel={cvModel ?? ""}
          initialEnabled={cvEnabled ?? false}
          saveAction={saveCloudVision}
        />

        <hr className="border-border" />

        <div>
          <h2 className="text-lg font-semibold">ComfyUI</h2>
          <p className="text-sm text-muted-foreground">
            ComfyUI sebagai image generation provider dengan dukungan face swap.
            Aktifkan dan konfigurasikan URL server ComfyUI lokal serta path ke
            workflow JSON yang akan digunakan.
          </p>
        </div>
        <ComfyUISettings
          initialUrl={comfyUrl ?? DEFAULT_COMFYUI_URL}
          initialEnabled={comfyEnabled ?? false}
          initialWorkflowPath={comfyWorkflowPath ?? DEFAULT_COMFYUI_WORKFLOW_PATH}
          initialFaceswapOnlyWorkflowPath={comfyFaceswapOnlyWorkflowPath ?? DEFAULT_COMFYUI_FACESWAP_ONLY_WORKFLOW_PATH}
          initialCheckpoint={comfyCheckpoint ?? ""}
          initialOutputPath={comfyOutputPath ?? ""}
          saveAction={saveComfyUI}
        />

        <hr className="border-border" />

        <div>
          <h2 className="text-lg font-semibold">Cloud Image Generation</h2>
          <p className="text-sm text-muted-foreground">
            Generate gambar menggunakan API cloud yang kompatibel dengan OpenAI
            Images API. Jika cloud aktif dan reachable, akan diprioritaskan.
            Jika tidak reachable, otomatis fallback ke ComfyUI lokal.
          </p>
        </div>
        <CloudImageSettings
          initialUrl={cloudUrl ?? DEFAULT_CLOUD_IMAGE_URL}
          initialApiKey={cloudApiKey ?? ""}
          initialModel={cloudModel ?? ""}
          initialEnabled={cloudEnabled ?? false}
          saveAction={saveCloudImage}
        />

        <hr className="border-border" />

        <div>
          <h2 className="text-lg font-semibold">Text-to-Speech (TTS)</h2>
          <p className="text-sm text-muted-foreground">
            Memutar pesan AI sebagai audio menggunakan server TTS yang kompatibel
            dengan OpenAI <code>/v1/audio/speech</code>. Contoh: kokoro-fastapi.
            Emosi pesan dideteksi otomatis untuk memilih suara yang sesuai.
          </p>
        </div>
        <TTSSettings
          initialUrl={ttsUrl ?? DEFAULT_TTS_URL}
          initialEnabled={ttsEnabledVal ?? false}
          initialVoiceMap={ttsVoiceMap ?? DEFAULT_VOICE_MAP}
          saveAction={saveTts}
        />

      </main>
    </>
  );
}
