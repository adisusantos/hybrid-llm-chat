import "server-only";
import { readFile } from "node:fs/promises";
import { findAvatar } from "@/lib/avatars/storage";
import { getSetting } from "@/lib/db/queries";
import type { AvatarKind } from "@/lib/avatars/storage";
import {
  getCloudVisionConfig,
  callCloudVision,
  pingCloudVision,
  type CloudVisionConfig,
} from "@/lib/cloud-ai/cloud-vision";

// ---------------------------------------------------------------------------
// Structured analysis type — 17 focused fields
//
// Chosen for maximum SD prompt impact and model accuracy:
// Face fields: directly drive character appearance in generation
// Body fields: drive body shape — most sensitive to model accuracy issues
// All null for portrait images except face fields.
// ---------------------------------------------------------------------------
export type AvatarAnalysis = {
  // ── Face (always attempted) ──────────────────────────────────────────────
  face_shape:    string | null; // oval / round / square / heart / diamond / oblong
  skin_tone:     string | null; // depth + undertone, e.g. "medium tan, warm olive"
  ethnicity:     string | null; // observational heritage cues, e.g. "East Asian features"
  age_range:     string | null; // e.g. "late 20s, young adult"
  gender:        string | null; // male / female / uncertain, based on visible presentation
  eyes:          string | null; // shape + color, e.g. "almond, double-lidded, dark brown"
  hair:          string | null; // color + length + texture + style
  eyebrows:      string | null; // thickness + arch + color
  nose:          string | null; // bridge height + tip shape + nostrils
  lips:          string | null; // fullness + cupid's bow + color
  jaw_chin:      string | null; // jawline + chin, e.g. "soft jaw, slightly pointed chin"
  skin_texture:  string | null; // smooth / pores / freckles / marks
  // ── Body (null when not visible / portrait) ──────────────────────────────
  body_build:       string | null; // slim / lean / lean muscular / athletic / average / chubby / plus-size / obese / muscular / heavily muscular / thick
  bust:             string | null; // female: very small / small / medium / large / very large / extremely large bust + shape notes; male: broad muscular chest / heavy chest (only if notable)
  waist:            string | null; // defined / moderate / full / straight / very wide / extremely wide
  hip_width:        string | null; // narrow / moderate / wide / very wide / extremely wide
  buttocks:         string | null; // flat / small / average / round / large round / very large / extremely large + projection notes
  body_proportions: string | null; // hourglass / pear / extreme pear-shaped / rectangular / inverted-triangle / apple / barrel / thick
};

// All keys in declaration order — used for normalization and splitting
export const AVATAR_ANALYSIS_FACE_KEYS: (keyof AvatarAnalysis)[] = [
  "face_shape", "skin_tone", "ethnicity", "age_range", "gender",
  "eyes", "hair", "eyebrows", "nose", "lips", "jaw_chin", "skin_texture",
];
export const AVATAR_ANALYSIS_BODY_KEYS: (keyof AvatarAnalysis)[] = [
  "body_build", "bust", "waist", "hip_width", "buttocks", "body_proportions",
];
export const AVATAR_ANALYSIS_ALL_KEYS: (keyof AvatarAnalysis)[] = [
  ...AVATAR_ANALYSIS_FACE_KEYS,
  ...AVATAR_ANALYSIS_BODY_KEYS,
];
// ---------------------------------------------------------------------------
// Analysis result with provider metadata
// ---------------------------------------------------------------------------

export type AnalysisProvider = {
  source: "cloud" | "local";
  model: string;
};

type AnalysisResult = {
  analysis: AvatarAnalysis;
  provider: AnalysisProvider;
};


// ---------------------------------------------------------------------------
// Flatten to SD prompt string
// ---------------------------------------------------------------------------

/**
 * Flatten an AvatarAnalysis JSON string into a compact comma-separated string
 * suitable for Stable Diffusion prompts.
 * Omits null fields and field names — just the values.
 * Falls back to raw string if not valid JSON (legacy format).
 */
export function flattenAnalysisToString(raw: string): string {
  if (!raw.trim().startsWith("{")) return raw;
  try {
    const parsed = JSON.parse(raw) as Partial<AvatarAnalysis>;
    return Object.values(parsed)
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim())
      .join(", ");
  } catch {
    return raw;
  }
}

// ---------------------------------------------------------------------------
// Image processing helpers
// ---------------------------------------------------------------------------

const MAX_DIM_PORTRAIT = 896;
const MAX_DIM_FULLBODY  = 1120;

async function toSupportedFormat(
  buf: Buffer,
  ext: AvatarKind,
  maxDim: number,
): Promise<Buffer> {
  const needsConvert = ext !== "jpg" && ext !== "jpeg" && ext !== "png";
  const dims = getImageDims(buf);
  const needsResize = dims && (dims.w > maxDim || dims.h > maxDim);

  if (!needsConvert && !needsResize) return buf;

  try {
    const sharp = (await import("sharp")).default;
    let pipeline = sharp(buf);
    if (needsResize) {
      pipeline = pipeline.resize(maxDim, maxDim, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    return await pipeline.jpeg({ quality: 88 }).toBuffer();
  } catch {
    return buf;
  }
}

function getImageDims(buf: Buffer): { w: number; h: number } | null {
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const marker = buf[o + 1];
      if (marker >= 0xc0 && marker <= 0xcf &&
          marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) };
      }
      o += 2 + buf.readUInt16BE(o + 2);
    }
  }
  return null;
}

/**
 * Determine the MIME type from the avatar file extension.
 */
function mimeFromExt(ext: AvatarKind): string {
  switch (ext) {
    case "png": return "image/png";
    case "jpg": case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    default: return "image/jpeg";
  }
}

// ---------------------------------------------------------------------------
// JSON parsing with normalization
// ---------------------------------------------------------------------------

function tryParseJson(raw: string): Partial<AvatarAnalysis> | null {
  let clean = raw.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  if (!clean.startsWith("{")) {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start !== -1 && end > start) clean = clean.slice(start, end + 1);
  }

  try {
    const parsed = JSON.parse(clean) as Record<string, unknown>;
    const result: Partial<AvatarAnalysis> = {};
    for (const key of AVATAR_ANALYSIS_ALL_KEYS) {
      const val = parsed[key];
      if (typeof val === "string" && val.trim().length > 0) {
        result[key] = val.trim();
      }
    }
    return result;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Prompts — local model (Ollama) needs detailed, multi-pass prompts
// ---------------------------------------------------------------------------

const FACE_PASS_PROMPT =
  "You are an anatomical image analyst. Look at this photo carefully.\n\n" +
  "Task: describe the FACE and HEAD only. Be specific and objective. " +
  "No subjective words. No clothing or background.\n\n" +
  "Output a JSON object with ONLY these keys (omit any you cannot see):\n" +
  "face_shape, skin_tone, ethnicity, age_range, gender, eyes, hair, eyebrows, nose, lips, jaw_chin, skin_texture\n\n" +
  "Guidelines per field:\n" +
  "- face_shape: pick from oval/round/square/heart/diamond/oblong, add notes (e.g. 'wide cheekbones')\n" +
  "- skin_tone: depth word (fair/light/medium/tan/deep/dark) + undertone (warm/cool/neutral/olive)\n" +
  "- ethnicity: observable heritage cues only (e.g. 'East Asian features', 'South Asian features', 'mixed')\n" +
  "- age_range: decade estimate + category, e.g. 'late 20s, young adult' or 'early 40s, middle-aged'\n" +
  "- gender: infer visible gender presentation; output exactly male, female, or uncertain. " +
  "For children, use male for a boy and female for a girl; use uncertain if visual evidence is insufficient\n" +
  "- eyes: lid type + shape + color + any notable feature\n" +
  "- hair: exact color + length + texture + style\n" +
  "- eyebrows: thickness + arch + color\n" +
  "- nose: bridge height + tip shape + nostril width\n" +
  "- lips: fullness + cupid's bow definition + color/tone\n" +
  "- jaw_chin: jawline shape + chin shape in one phrase\n" +
  "- skin_texture: smoothness, pore size, marks, freckles, etc.\n\n" +
  "Output ONLY valid JSON. No preamble, no explanation.\n" +
  'Example: {"face_shape":"oval, slightly wide at cheekbones","skin_tone":"medium tan, warm olive",' +
  '"ethnicity":"Southeast Asian features","age_range":"mid 20s, young adult","gender":"female",' +
  '"eyes":"double-lidded almond, dark brown, calm gaze","hair":"straight, jet black, shoulder length, center part",' +
  '"eyebrows":"medium thick, slightly arched, dark brown","nose":"low bridge, rounded tip, medium nostrils",' +
  '"lips":"medium fullness, defined cupid\'s bow, warm pink-brown","jaw_chin":"soft jaw, slightly pointed chin",' +
  '"skin_texture":"smooth, minimal pores, even tone"}';

const BODY_PASS_PROMPT =
  "You are an anatomical image analyst. Look at this full-body photo carefully.\n\n" +
  "Task: describe the BODY SHAPE only (neck downward). Be specific and honest — " +
  "do not default to slim or average if the person is clearly heavier, curvier, or more muscular. " +
  "If the lower body is cropped out, only describe what you can see (e.g. build and bust/chest) and omit the rest.\n\n" +
  "Output a JSON object with ONLY these keys (omit any you cannot see):\n" +
  "body_build, bust, waist, hip_width, buttocks, body_proportions\n\n" +
  "Guidelines per field:\n" +
  "- body_build: pick the CLOSEST match from this list based on what you actually see:\n" +
  "  slim (very little fat, narrow frame) | lean (low fat, some muscle definition) |\n" +
  "  lean muscular (low body fat with visible muscle tone, not bulky) |\n" +
  "  athletic (toned, defined muscles, fit appearance) |\n" +
  "  average (moderate fat, no strong lean or heavy features) |\n" +
  "  chubby (visibly soft, belly slightly rounded, fuller cheeks/arms) |\n" +
  "  plus-size (full figure, belly prominent, arms and thighs clearly full) |\n" +
  "  obese (very heavy, large belly, fat rolls visible, arms/legs very thick) |\n" +
  "  muscular (noticeably developed muscles, broad shoulders, thick arms) |\n" +
  "  heavily muscular (bodybuilder-level mass, bulging muscles, veins may be visible, extremely broad) |\n" +
  "  thick (full thighs and hips but defined waist)\n" +
  "  Visual anchors:\n" +
  "  - belly extends past the chest line → at least chubby\n" +
  "  - thighs clearly touching with fat → at least chubby\n" +
  "  - belly hangs or folds over waistband, very thick arms → obese\n" +
  "  - arms wider than head, visible muscle striations, deltoids capped → heavily muscular\n" +
  "  - moderate muscle definition without bulk → lean muscular or athletic\n" +
  "- bust: for FEMALE subjects — MUST include the word 'bust'. Pick the closest:\n" +
  "  'very small bust' (nearly flat) | 'small bust' | 'medium bust' | 'large bust' |\n" +
  "  'very large bust' (noticeably bigger than torso width, heavy, prominent cleavage) |\n" +
  "  'extremely large bust' (disproportionately large relative to frame, each breast approaching or exceeding head size).\n" +
  "  Visual anchors: if breasts extend well past the arm line when arms are at sides → at least very large bust;\n" +
  "  if breasts rest on or near the belly → extremely large bust.\n" +
  "  Add shape notes if visible (e.g. 'very large bust, round, heavy').\n" +
  "  For MALE subjects: output 'chest' description ONLY if the chest is notably developed or large.\n" +
  "  Use: 'broad muscular chest' / 'very broad muscular chest, prominent pecs' for muscular men;\n" +
  "  'full chest' / 'heavy chest' for overweight men with visible chest mass.\n" +
  "  Omit bust/chest entirely for males with average/slim builds.\n" +
  "- waist: MUST include the word 'waist' (e.g. 'defined waist', 'moderate waist', 'full waist', " +
  "'straight waist', 'very wide waist', 'extremely wide waist'). Omit if hidden.\n" +
  "- hip_width: MUST include the word 'hips' (e.g. 'narrow hips', 'moderate hips', 'wide hips', " +
  "'very wide hips', 'extremely wide hips'). Omit if hidden.\n" +
  "- buttocks: MUST include the word 'buttocks'. Describe size and projection from the side/rear. Pick the closest:\n" +
  "  'flat buttocks' | 'small buttocks' | 'average buttocks' | 'round buttocks' |\n" +
  "  'large round buttocks' (noticeably prominent, projects outward significantly) |\n" +
  "  'very large buttocks' (disproportionately large, extends well beyond the back line, very prominent) |\n" +
  "  'extremely large buttocks' (exceptionally prominent, shelf-like projection, very wide and round).\n" +
  "  Visual anchors: if buttocks projects noticeably past the lower back line → at least large round buttocks;\n" +
  "  if buttocks creates a dramatic shelf-like silhouette or is clearly wider than the shoulders → very large or extremely large buttocks.\n" +
  "  Add shape notes if visible (e.g. 'very large buttocks, round, high-set'). Omit if rear is not visible at all.\n" +
  "- body_proportions: pick from hourglass / pear / extreme pear-shaped / rectangular / " +
  "inverted-triangle / apple / barrel / thick — " +
  "use 'extreme pear-shaped body, broad pelvis, very wide hips, thick thighs, lower-body dominant fat distribution' " +
  "when the pelvis, hips, and thighs are markedly dominant; do not reduce this to ordinary pear or thick. " +
  "Use 'barrel, round torso, thick all around' when fat is distributed evenly and the person is very heavy. " +
  "Use 'inverted-triangle, very broad shoulders, narrow waist' for heavily muscular males. " +
  "You may add brief context notes if needed. Omit if lower body is cropped.\n\n" +
  "Output ONLY valid JSON. No preamble, no explanation.\n" +
  'Example (chubby female): {"body_build":"chubby","bust":"large bust, round","waist":"full waist",' +
  '"hip_width":"wide hips","buttocks":"large round buttocks","body_proportions":"apple, full waist, rounded abdomen"}\n' +
  'Example (muscular male): {"body_build":"heavily muscular","bust":"very broad muscular chest, prominent pecs",' +
  '"waist":"defined waist, V-taper","hip_width":"moderate hips","buttocks":"round buttocks, muscular","body_proportions":"inverted-triangle, very broad shoulders"}\n' +
  'Example (plus-size female): {"body_build":"plus-size","bust":"very large bust, heavy, pendulous",' +
  '"waist":"very wide waist","hip_width":"very wide hips","buttocks":"very large buttocks, round, prominent","body_proportions":"pear, lower-body dominant"}';

function bodyPassPrompt(face: Partial<AvatarAnalysis>): string {
  const context = [face.gender && `gender=${face.gender}`, face.age_range && `age=${face.age_range}`]
    .filter(Boolean)
    .join(", ");
  if (!context) return BODY_PASS_PROMPT;
  return BODY_PASS_PROMPT +
    `\n\nSubject context from the face analysis: ${context}. ` +
    "Use this context only to avoid inappropriate adult or gendered body labels. " +
    "For a child, omit bust/chest and omit adult figure categories such as hourglass, pear, or apple; " +
    "describe only visible build and neutral proportions. " +
    "For a male subject, follow the bust field guidelines above (describe chest only if notably muscular or heavy).";
}

const DETECT_PROMPT =
  "Is this photo a close-up portrait (head/shoulders only) or a full-body photo " +
  "(most of the body visible)? Reply with exactly one word: PORTRAIT or FULLBODY.";

// ---------------------------------------------------------------------------
// Ollama config
// ---------------------------------------------------------------------------

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_VISION_MODEL = "qwen2.5vl:7b";
const SETTING_KEY_OLLAMA_URL = "vision.ollama_url";
const SETTING_KEY_VISION_MODEL = "vision.model";

export type FaceAnalysisConfig = { baseUrl: string; model: string };

export async function getFaceAnalysisConfig(): Promise<FaceAnalysisConfig> {
  const [url, model] = await Promise.all([
    getSetting<string>(SETTING_KEY_OLLAMA_URL),
    getSetting<string>(SETTING_KEY_VISION_MODEL),
  ]);
  const configuredUrl = url ?? process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL;
  const configuredModel = model ?? process.env.VISION_MODEL ?? DEFAULT_VISION_MODEL;
  return {
    baseUrl: stripJsonQuotes(String(configuredUrl)).replace(/\/+$/, ""),
    model: stripJsonQuotes(String(configuredModel)),
  };
}

function stripJsonQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "string" ? parsed : trimmed;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Ollama Vision API call
// ---------------------------------------------------------------------------

async function callVision(
  baseUrl: string,
  model: string,
  prompt: string,
  b64: string,
  signal: AbortSignal,
): Promise<string> {
  let modelInfo: Response;
  try {
    modelInfo = await fetch(`${baseUrl}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model }),
      signal,
    });
  } catch (err) {
    throw new Error(
      `Tidak dapat terhubung ke Ollama di ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (modelInfo.ok) {
    const metadata = (await modelInfo.json().catch(() => ({}))) as {
      capabilities?: unknown;
    };
    if (!Array.isArray(metadata.capabilities) || !metadata.capabilities.includes("vision")) {
      throw new Error(
        `Model Ollama "${model}" tidak mendukung input gambar. ` +
          "Pilih model vision seperti qwen2.5vl:7b pada konfigurasi vision.model.",
      );
    }
  }

  const res = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      images: [b64],
      stream: false,
      options: {
        temperature: 0.15,
        repeat_penalty: 1.05,
        num_predict: 512,
      },
    }),
    signal,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    if (/does not support image input/i.test(t)) {
      throw new Error(
        `Vision model "${model}" tidak mendukung input gambar. ` +
          "Gunakan model vision Ollama seperti qwen2.5vl:7b, " +
          "lalu pull model tersebut dan kosongkan/reset setting vision.model " +
          "jika masih menunjuk ke model teks biasa.",
      );
    }
    throw new Error(`Vision request failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { response?: string; error?: string };
  if (data.error) {
    if (/does not support image input/i.test(data.error)) {
      throw new Error(
        `Model Ollama "${model}" tidak mendukung input gambar. ` +
          "Pilih model vision seperti qwen2.5vl:7b pada konfigurasi vision.model.",
      );
    }
    throw new Error(`Vision request failed: ${data.error.slice(0, 300)}`);
  }
  return (data.response ?? "").trim();
}

// ---------------------------------------------------------------------------
// Cloud analysis — single-pass via OpenAI-compatible vision API
// ---------------------------------------------------------------------------

async function runCloudAnalysis(
  characterId: string,
  cloudConfig: CloudVisionConfig,
): Promise<AvatarAnalysis> {
  const found = await findAvatar(characterId);
  if (!found) {
    throw new Error("No avatar image found. Upload an avatar before analyzing.");
  }

  const rawBuf = await readFile(found.absPath);
  const dims = getImageDims(rawBuf);
  if (dims && (dims.w < MIN_AVATAR_DIM || dims.h < MIN_AVATAR_DIM)) {
    throw new Error(
      `Avatar is too small (${dims.w}\u00d7${dims.h}px). Upload at least 64\u00d764px.`,
    );
  }

  // Resize for cloud — use fullbody max to preserve detail
  const processedBuf = await toSupportedFormat(rawBuf, found.ext, MAX_DIM_FULLBODY);
  const b64 = processedBuf.toString("base64");
  const mime = mimeFromExt(found.ext);

  const responseText = await callCloudVision(cloudConfig, b64, mime);
  if (!responseText) {
    throw new Error("Cloud Vision API returned empty response.");
  }

  const parsed = tryParseJson(responseText);
  if (!parsed) {
    throw new Error(
      "Cloud Vision API did not return valid JSON. Raw: " + responseText.slice(0, 300),
    );
  }

  // Normalize to full AvatarAnalysis with null for missing keys
  const result: Record<string, string | null> = {};
  for (const k of AVATAR_ANALYSIS_ALL_KEYS) {
    result[k] = parsed[k] ?? null;
  }

  return result as AvatarAnalysis;
}

// ---------------------------------------------------------------------------
// Local analysis — multi-pass via Ollama (original logic)
// ---------------------------------------------------------------------------

const MIN_AVATAR_DIM = 64;

async function runLocalAnalysis(
  characterId: string,
  opts?: { baseUrl?: string; model?: string; timeoutMs?: number },
): Promise<AvatarAnalysis> {
  const found = await findAvatar(characterId);
  if (!found) {
    throw new Error("No avatar image found. Upload an avatar before analyzing.");
  }

  const cfg = await getFaceAnalysisConfig();
  const baseUrl = (opts?.baseUrl ?? cfg.baseUrl).replace(/\/+$/, "");
  const model = opts?.model ?? cfg.model;
  const timeoutMs = opts?.timeoutMs ?? 200_000;

  const rawBuf = await readFile(found.absPath);
  const dims = getImageDims(rawBuf);
  if (dims && (dims.w < MIN_AVATAR_DIM || dims.h < MIN_AVATAR_DIM)) {
    throw new Error(
      `Avatar is too small (${dims.w}\u00d7${dims.h}px). Upload at least 64\u00d764px.`,
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // ── Step 1: detect portrait vs full-body ────────────────────────────────
    const bufSmall = await toSupportedFormat(rawBuf, found.ext, MAX_DIM_PORTRAIT);
    const b64Small = bufSmall.toString("base64");

    let isFullBody = false;
    try {
      const detectText = await callVision(baseUrl, model, DETECT_PROMPT, b64Small, controller.signal);
      isFullBody = /fullbody|full.body|full/i.test(detectText);
    } catch {
      // non-fatal — default to portrait
    }

    // ── Step 2: face pass ────────────────────────────────────────────────────
    const faceBuf = await toSupportedFormat(
      rawBuf, found.ext,
      isFullBody ? MAX_DIM_FULLBODY : MAX_DIM_PORTRAIT,
    );
    const b64Face = faceBuf.toString("base64");

    const faceText = await callVision(baseUrl, model, FACE_PASS_PROMPT, b64Face, controller.signal);
    if (!faceText) throw new Error("Vision model returned empty response.");
    const faceParsed = tryParseJson(faceText);
    if (!faceParsed) {
      throw new Error("Vision model did not return valid JSON. Raw: " + faceText.slice(0, 300));
    }

    // ── Step 3: body pass (full-body only) ──────────────────────────────────
    let bodyParsed: Partial<AvatarAnalysis> | null = null;
    if (isFullBody) {
      const bodyBuf = await toSupportedFormat(rawBuf, found.ext, MAX_DIM_FULLBODY);
      const b64Body = bodyBuf.toString("base64");
      const bodyText = await callVision(baseUrl, model, bodyPassPrompt(faceParsed), b64Body, controller.signal);
      if (bodyText) bodyParsed = tryParseJson(bodyText);
    }

    // ── Merge and normalize to full AvatarAnalysis with null for missing ────
    const merged: Record<string, string | null> = {};
    for (const k of AVATAR_ANALYSIS_ALL_KEYS) {
      merged[k] = faceParsed[k] ?? bodyParsed?.[k] ?? null;
    }
    if (bodyParsed) {
      for (const k of AVATAR_ANALYSIS_BODY_KEYS) {
        merged[k] = bodyParsed[k] ?? null;
      }
    }

    return merged as AvatarAnalysis;

  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Vision model timed out after ${Math.round(timeoutMs / 1000)}s. ` +
          "It may still be loading — please try again.",
      );
    }
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Unified analysis — cloud primary, Ollama fallback
// ---------------------------------------------------------------------------

async function runAnalysis(
  characterId: string,
  opts?: { baseUrl?: string; model?: string; timeoutMs?: number },
): Promise<AnalysisResult> {
  // Check if cloud vision is configured and enabled
  const cloudConfig = await getCloudVisionConfig();

  if (cloudConfig.enabled && cloudConfig.url && cloudConfig.apiKey && cloudConfig.model) {
    // Ping cloud to check reachability before committing
    const reachable = await pingCloudVision(cloudConfig.url, cloudConfig.apiKey);
    if (reachable) {
      try {
        console.log("[analyze-avatar] Using cloud vision:", cloudConfig.model);
        const analysis = await runCloudAnalysis(characterId, cloudConfig);
        return { analysis, provider: { source: "cloud", model: cloudConfig.model } };
      } catch (err) {
        console.warn(
          "[analyze-avatar] Cloud vision failed, falling back to local Ollama:",
          err instanceof Error ? err.message : String(err),
        );
        // Fall through to local
      }
    } else {
      console.warn("[analyze-avatar] Cloud vision unreachable, using local Ollama");
    }
  }

  // Fallback: local Ollama multi-pass analysis
  const localCfg = await getFaceAnalysisConfig();
  const localModel = opts?.model ?? localCfg.model;
  console.log("[analyze-avatar] Using local Ollama vision:", localModel);
  const analysis = await runLocalAnalysis(characterId, opts);
  return { analysis, provider: { source: "local", model: localModel } };
}

// ---------------------------------------------------------------------------
// Public API — same signatures as before for backward compat
// ---------------------------------------------------------------------------

/**
 * Analyze a character's avatar. Returns JSON string of AvatarAnalysis.
 * Stored in faceDescription for backward compat.
 */
export async function analyzeAvatarFace(
  characterId: string,
  opts?: { baseUrl?: string; model?: string; timeoutMs?: number },
): Promise<{ result: string; provider: AnalysisProvider }> {
  const { analysis, provider } = await runAnalysis(characterId, opts);
  return { result: JSON.stringify(analysis), provider };
}

/**
 * Analyze a character's avatar. Returns separate face and body JSON strings.
 */
export async function analyzeAvatarFullBody(
  characterId: string,
  opts?: { baseUrl?: string; model?: string; timeoutMs?: number },
): Promise<{ faceDescription: string; bodyDescription: string; provider: AnalysisProvider }> {
  const { analysis, provider } = await runAnalysis(characterId, opts);

  const faceObj: Partial<AvatarAnalysis> = {};
  const bodyObj: Partial<AvatarAnalysis> = {};
  for (const k of AVATAR_ANALYSIS_FACE_KEYS) faceObj[k] = analysis[k];
  for (const k of AVATAR_ANALYSIS_BODY_KEYS) bodyObj[k] = analysis[k];

  return {
    faceDescription: JSON.stringify(faceObj),
    bodyDescription: JSON.stringify(bodyObj),
    provider,
  };
}
