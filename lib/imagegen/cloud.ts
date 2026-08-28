import "server-only";
import { getSetting } from "@/lib/db/queries";

// ---------------------------------------------------------------------------
// Setting keys
// ---------------------------------------------------------------------------

export const SETTING_KEY_CLOUD_IMAGE_URL = "cloud_image.url";
export const SETTING_KEY_CLOUD_IMAGE_API_KEY = "cloud_image.api_key";
export const SETTING_KEY_CLOUD_IMAGE_MODEL = "cloud_image.model";
export const SETTING_KEY_CLOUD_IMAGE_ENABLED = "cloud_image.enabled";

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

export const DEFAULT_CLOUD_IMAGE_URL = "";
export const DEFAULT_CLOUD_IMAGE_MODEL = "";
export const DEFAULT_CLOUD_IMAGE_ENABLED = false;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CloudImageConfig = {
  /** Base URL for the OpenAI-compatible image API. e.g. "https://api.openai.com" */
  url: string;
  /** API keys for authentication. If multiple, comma or newline separated originally. The first key is apiKey, all are in apiKeys. */
  apiKey: string;
  apiKeys: string[];
  /** Model name, e.g. "dall-e-3" */
  model: string;
  /** Whether the cloud image provider is active */
  enabled: boolean;
};

export type CloudGenerateResult = {
  image: Buffer;
  width: number;
  height: number;
  contentType: string;
};

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

export async function getCloudImageConfig(): Promise<CloudImageConfig> {
  const [url, apiKeyRaw, model, enabled] = await Promise.all([
    getSetting<string>(SETTING_KEY_CLOUD_IMAGE_URL),
    getSetting<string>(SETTING_KEY_CLOUD_IMAGE_API_KEY),
    getSetting<string>(SETTING_KEY_CLOUD_IMAGE_MODEL),
    getSetting<boolean>(SETTING_KEY_CLOUD_IMAGE_ENABLED),
  ]);

  const rawKeyString = apiKeyRaw ?? "";
  const apiKeys = rawKeyString
    .split(/[\n,]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  return {
    url: url ?? DEFAULT_CLOUD_IMAGE_URL,
    apiKey: apiKeys[0] ?? "",
    apiKeys: apiKeys,
    model: model ?? DEFAULT_CLOUD_IMAGE_MODEL,
    enabled: enabled ?? DEFAULT_CLOUD_IMAGE_ENABLED,
  };
}

// ---------------------------------------------------------------------------
// Connection testing — ping /v1/models
// ---------------------------------------------------------------------------

/**
 * Test connectivity to an OpenAI-compatible image API by calling GET /v1/models.
 *
 * Returns `{ ok: true }` on success.
 * Throws a human-readable error for every failure mode.
 * Uses a 10-second timeout.
 */
export async function testCloudConnection(
  url: string,
  apiKey: string,
): Promise<{ ok: true }> {
  const normalizedUrl = url.replace(/\/+$/, "").replace(/\/v1$/, "");
  const endpoint = `${normalizedUrl}/v1/models`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Cloud API unreachable at ${normalizedUrl}: ${reason}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Cloud API /v1/models returned status ${res.status}: ${body.slice(0, 200)}`,
    );
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Fetch available models from /v1/models
// ---------------------------------------------------------------------------

/**
 * Fetch models from an OpenAI-compatible API.
 * Returns all model IDs — filtering for image models is left to the caller
 * since there's no standard `type` field in the API response.
 */
export async function fetchCloudModels(
  url: string,
  apiKey: string,
): Promise<string[]> {
  const normalizedUrl = url.replace(/\/+$/, "").replace(/\/v1$/, "");
  const endpoint = `${normalizedUrl}/v1/models`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Cloud API unreachable at ${normalizedUrl}: ${reason}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Cloud API /v1/models returned status ${res.status}: ${body.slice(0, 200)}`,
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("Cloud API /v1/models returned invalid JSON");
  }

  const models = (data as { data?: Array<{ id?: string }> })?.data;
  if (!Array.isArray(models)) {
    throw new Error("Cloud API /v1/models: unexpected response shape");
  }

  return models
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string")
    .sort();
}

// ---------------------------------------------------------------------------
// Generate image via cloud API — POST /v1/images/generations
// ---------------------------------------------------------------------------

/**
 * Generate an image using an OpenAI-compatible image generation API.
 *
 * Sends POST to `{url}/v1/images/generations` with:
 *   { model, prompt, n: 1, size: "1024x1024", response_format: "b64_json" }
 *
 * Returns the decoded image as a Buffer.
 *
 * Timeout: 60 seconds for the generation request.
 * Throws descriptive errors for network issues, non-2xx responses, and
 * unexpected response shapes.
 */
export async function generateWithCloud(opts: {
  prompt: string;
  model: string;
  url: string;
  apiKey: string;
}): Promise<CloudGenerateResult> {
  const normalizedUrl = opts.url.replace(/\/+$/, "").replace(/\/v1$/, "");
  const endpoint = `${normalizedUrl}/v1/images/generations`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        prompt: opts.prompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Cloud API unreachable at ${normalizedUrl}: ${reason}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Don't fallback on auth/API errors — only on connection issues
    throw new Error(
      `Cloud API /v1/images/generations error ${res.status}: ${body.slice(0, 400)}`,
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("Cloud API /v1/images/generations returned invalid JSON");
  }

  const images = (data as { data?: Array<{ b64_json?: string }> })?.data;
  if (!Array.isArray(images) || images.length === 0 || !images[0]?.b64_json) {
    throw new Error(
      "Cloud API /v1/images/generations: unexpected response — missing image data",
    );
  }

  const imageBuffer = Buffer.from(images[0].b64_json, "base64");

  return {
    image: imageBuffer,
    width: 1024,
    height: 1024,
    contentType: "image/png",
  };
}

// ---------------------------------------------------------------------------
// Ping — lightweight connection check for the generate route fallback logic
// ---------------------------------------------------------------------------

/**
 * Quick connectivity check: ping GET /v1/models with a 5-second timeout.
 * Returns true if the API is reachable and responds with 2xx, false otherwise.
 * Does NOT throw — designed for use in the fallback decision logic.
 */
export async function pingCloud(url: string, apiKey: string): Promise<boolean> {
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
