import "server-only";
import { getSetting } from "@/lib/db/queries";

// ---------------------------------------------------------------------------
// Setting keys
// ---------------------------------------------------------------------------

export const SETTING_KEY_CLOUD_VISION_URL = "cloud_vision.url";
export const SETTING_KEY_CLOUD_VISION_API_KEY = "cloud_vision.api_key";
export const SETTING_KEY_CLOUD_VISION_MODEL = "cloud_vision.model";
export const SETTING_KEY_CLOUD_VISION_ENABLED = "cloud_vision.enabled";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_CLOUD_VISION_URL = "";
export const DEFAULT_CLOUD_VISION_MODEL = "";
export const DEFAULT_CLOUD_VISION_ENABLED = false;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CloudVisionConfig = {
  /** Base URL for OpenAI-compatible chat/completions API. e.g. "https://api.openai.com" */
  url: string;
  /** First API key (primary). All keys in apiKeys. */
  apiKey: string;
  apiKeys: string[];
  /** Vision model name, e.g. "gpt-4o", "gemini-2.0-flash" */
  model: string;
  /** Whether cloud vision is active */
  enabled: boolean;
};

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

export async function getCloudVisionConfig(): Promise<CloudVisionConfig> {
  const [url, apiKeyRaw, model, enabled] = await Promise.all([
    getSetting<string>(SETTING_KEY_CLOUD_VISION_URL),
    getSetting<string>(SETTING_KEY_CLOUD_VISION_API_KEY),
    getSetting<string>(SETTING_KEY_CLOUD_VISION_MODEL),
    getSetting<boolean>(SETTING_KEY_CLOUD_VISION_ENABLED),
  ]);

  const rawKeyString = apiKeyRaw ?? "";
  const apiKeys = rawKeyString
    .split(/[\n,]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  return {
    url: url ?? DEFAULT_CLOUD_VISION_URL,
    apiKey: apiKeys[0] ?? "",
    apiKeys,
    model: model ?? DEFAULT_CLOUD_VISION_MODEL,
    enabled: enabled ?? DEFAULT_CLOUD_VISION_ENABLED,
  };
}

// ---------------------------------------------------------------------------
// Connection testing — ping /v1/models
// ---------------------------------------------------------------------------

export async function testCloudVisionConnection(
  url: string,
  apiKey: string,
): Promise<{ ok: true }> {
  const normalizedUrl = url.replace(/\/+$/, "").replace(/\/v1$/, "");
  const endpoint = `${normalizedUrl}/v1/models`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Cloud Vision API unreachable at ${normalizedUrl}: ${reason}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Cloud Vision API /v1/models returned status ${res.status}: ${body.slice(0, 200)}`,
    );
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Fetch available models
// ---------------------------------------------------------------------------

export async function fetchCloudVisionModels(
  url: string,
  apiKey: string,
): Promise<string[]> {
  const normalizedUrl = url.replace(/\/+$/, "").replace(/\/v1$/, "");
  const endpoint = `${normalizedUrl}/v1/models`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Cloud Vision API unreachable at ${normalizedUrl}: ${reason}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Cloud Vision API /v1/models returned status ${res.status}: ${body.slice(0, 200)}`,
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("Cloud Vision API /v1/models returned invalid JSON");
  }

  const models = (data as { data?: Array<{ id?: string }> })?.data;
  if (!Array.isArray(models)) {
    throw new Error("Cloud Vision API /v1/models: unexpected response shape");
  }

  return models
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string")
    .sort();
}

// ---------------------------------------------------------------------------
// Ping — lightweight check for fallback decision logic
// ---------------------------------------------------------------------------

export async function pingCloudVision(url: string, apiKey: string): Promise<boolean> {
  const normalizedUrl = url.replace(/\/+$/, "").replace(/\/v1$/, "");
  try {
    const res = await fetch(`${normalizedUrl}/v1/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cloud Vision API call — single-pass, OpenAI-compatible /v1/chat/completions
//
// Uses image_url with base64 data URI. Compatible with OpenAI, Anthropic
// (via proxy), Google Gemini (via OpenAI-compat), OpenRouter, etc.
// ---------------------------------------------------------------------------

const CLOUD_VISION_PROMPT =
  "You are an anatomical image analyst. Analyze this image carefully and thoroughly.\n\n" +
  "Determine if this is a portrait (head/shoulders) or full-body photo, then describe accordingly.\n\n" +
  "Output a JSON object with these keys. For portrait photos, body keys should be null. " +
  "Omit nothing you can observe — be specific and objective.\n\n" +
  "Face keys:\n" +
  "- face_shape: geometric shape (oval, round, square, heart, diamond, oblong) + notes\n" +
  "- skin_tone: depth (fair/light/medium/tan/deep/dark) + undertone (warm/cool/neutral/olive)\n" +
  "- ethnicity: observable heritage cues (e.g. \"East Asian features\", \"South Asian features\")\n" +
  "- age_range: decade estimate + category (e.g. \"late 20s, young adult\")\n" +
  "- gender: visible presentation — male, female, or uncertain\n" +
  "- eyes: lid type + shape + color + notable features\n" +
  "- hair: exact color + length + texture + style\n" +
  "- eyebrows: thickness + arch + color\n" +
  "- nose: bridge height + tip shape + nostril width\n" +
  "- lips: fullness + cupid\\'s bow definition + color/tone\n" +
  "- jaw_chin: jawline shape + chin shape\n" +
  "- skin_texture: smoothness, pore size, marks, freckles, etc.\n\n" +
  "Body keys (null if not visible):\n" +
  "- body_build: slim / lean / lean muscular / athletic / average / chubby / plus-size / obese / muscular / heavily muscular / thick\n" +
  "- bust: for female — include word 'bust' with size (very small/small/medium/large/very large/extremely large) + shape; for male — only if notable chest\n" +
  "- waist: include word 'waist' (defined/moderate/full/straight/very wide/extremely wide)\n" +
  "- hip_width: include word 'hips' (narrow/moderate/wide/very wide/extremely wide)\n" +
  "- buttocks: include word 'buttocks' with size and projection notes; null if not visible\n" +
  "- body_proportions: hourglass / pear / extreme pear-shaped / rectangular / inverted-triangle / apple / barrel / thick\n\n" +
  "Output ONLY valid JSON. No preamble, no explanation, no markdown fences.";

export async function callCloudVision(
  config: CloudVisionConfig,
  imageBase64: string,
  mimeType: string = "image/jpeg",
): Promise<string> {
  const normalizedUrl = config.url.replace(/\/+$/, "").replace(/\/v1$/, "");
  const endpoint = `${normalizedUrl}/v1/chat/completions`;

  // DEBUG: Log image info
  console.log("[cloud-vision] DEBUG - Image base64 length:", imageBase64.length);
  console.log("[cloud-vision] DEBUG - MIME type:", mimeType);
  console.log("[cloud-vision] DEBUG - Model:", config.model);
  console.log("[cloud-vision] DEBUG - Endpoint:", endpoint);

  // Try simplified format without detail field (some providers don't support it)
  const body = {
    model: config.model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: CLOUD_VISION_PROMPT },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
    max_tokens: 1024,
    temperature: 0.15,
    stream: false,
  };

  // DEBUG: Log request body structure (without full base64)
  console.log("[cloud-vision] DEBUG - Request body structure:", JSON.stringify({
    ...body,
    messages: body.messages.map(m => ({
      ...m,
      content: Array.isArray(m.content) 
        ? m.content.map(c => c.type === "image_url" 
          ? { type: "image_url", image_url: { url: `data:${mimeType};base64,[${imageBase64.length} chars]` } }
          : c)
        : m.content
    }))
  }, null, 2));

  // Try each API key until one succeeds
  let lastError: Error = new Error("No API keys configured");
  for (const apiKey of config.apiKeys) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // Auth/rate-limit errors → try next key
        if (res.status === 401 || res.status === 403 || res.status === 429) {
          lastError = new Error(`Cloud Vision API ${res.status}: ${text.slice(0, 200)}`);
          continue;
        }
        throw new Error(`Cloud Vision API error ${res.status}: ${text.slice(0, 300)}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Cloud Vision API returned empty response");
      }
      return content.trim();
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error("Cloud Vision API timed out after 60s");
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      // Connection errors → don't try other keys, they'll fail too
      if (lastError.message.includes("fetch failed") || lastError.message.includes("ECONNREFUSED")) {
        throw lastError;
      }
    }
  }

  throw lastError;
}
