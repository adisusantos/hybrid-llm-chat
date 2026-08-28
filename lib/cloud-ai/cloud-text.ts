import "server-only";
import { getSetting } from "@/lib/db/queries";

// ---------------------------------------------------------------------------
// Setting keys
// ---------------------------------------------------------------------------

export const SETTING_KEY_CLOUD_TEXT_URL = "cloud_text.url";
export const SETTING_KEY_CLOUD_TEXT_API_KEY = "cloud_text.api_key";
export const SETTING_KEY_CLOUD_TEXT_MODEL = "cloud_text.model";
export const SETTING_KEY_CLOUD_TEXT_ENABLED = "cloud_text.enabled";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_CLOUD_TEXT_URL = "";
export const DEFAULT_CLOUD_TEXT_MODEL = "";
export const DEFAULT_CLOUD_TEXT_ENABLED = false;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CloudTextConfig = {
  /** Base URL for OpenAI-compatible chat/completions API. e.g. "https://api.openai.com" */
  url: string;
  /** First API key (primary). All keys in apiKeys. */
  apiKey: string;
  apiKeys: string[];
  /** Model name, e.g. "gpt-4o-mini", "claude-3-5-sonnet", "deepseek-chat" */
  model: string;
  /** Whether cloud text is active */
  enabled: boolean;
};

export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

export async function getCloudTextConfig(): Promise<CloudTextConfig> {
  const [url, apiKeyRaw, model, enabled] = await Promise.all([
    getSetting<string>(SETTING_KEY_CLOUD_TEXT_URL),
    getSetting<string>(SETTING_KEY_CLOUD_TEXT_API_KEY),
    getSetting<string>(SETTING_KEY_CLOUD_TEXT_MODEL),
    getSetting<boolean>(SETTING_KEY_CLOUD_TEXT_ENABLED),
  ]);

  const rawKeyString = apiKeyRaw ?? "";
  const apiKeys = rawKeyString
    .split(/[\n,]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  return {
    url: url ?? DEFAULT_CLOUD_TEXT_URL,
    apiKey: apiKeys[0] ?? "",
    apiKeys,
    model: model ?? DEFAULT_CLOUD_TEXT_MODEL,
    enabled: enabled ?? DEFAULT_CLOUD_TEXT_ENABLED,
  };
}

// ---------------------------------------------------------------------------
// Connection testing — ping /v1/models
// ---------------------------------------------------------------------------

export async function testCloudTextConnection(
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
    throw new Error(`Cloud Text API unreachable at ${normalizedUrl}: ${reason}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Cloud Text API /v1/models returned status ${res.status}: ${body.slice(0, 200)}`,
    );
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Fetch available models
// ---------------------------------------------------------------------------

export async function fetchCloudTextModels(
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
    throw new Error(`Cloud Text API unreachable at ${normalizedUrl}: ${reason}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Cloud Text API /v1/models returned status ${res.status}: ${body.slice(0, 200)}`,
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("Cloud Text API /v1/models returned invalid JSON");
  }

  const models = (data as { data?: Array<{ id?: string }> })?.data;
  if (!Array.isArray(models)) {
    throw new Error("Cloud Text API /v1/models: unexpected response shape");
  }

  return models
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string")
    .sort();
}

// ---------------------------------------------------------------------------
// Ping — lightweight check for fallback decision logic
// ---------------------------------------------------------------------------

export async function pingCloudText(url: string, apiKey: string): Promise<boolean> {
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
// Cloud Text API call — non-streaming OpenAI-compatible /v1/chat/completions
// ---------------------------------------------------------------------------

export async function callCloudText(
  config: CloudTextConfig,
  messages: ChatCompletionMessage[],
  opts?: {
    temperature?: number;
    max_tokens?: number;
    stop?: string[];
  },
): Promise<string> {
  const normalizedUrl = config.url.replace(/\/+$/, "").replace(/\/v1$/, "");
  const endpoint = `${normalizedUrl}/v1/chat/completions`;

  const body = {
    model: config.model,
    messages,
    temperature: opts?.temperature ?? 0.3,
    max_tokens: opts?.max_tokens ?? 1500,
    ...(opts?.stop ? { stop: opts.stop } : {}),
    stream: false,
  };

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
        if (res.status === 401 || res.status === 403 || res.status === 429) {
          lastError = new Error(`Cloud Text API ${res.status}: ${text.slice(0, 200)}`);
          continue;
        }
        throw new Error(`Cloud Text API error ${res.status}: ${text.slice(0, 300)}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Cloud Text API returned empty response");
      }
      return content.trim();
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error("Cloud Text API timed out after 60s");
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.message.includes("fetch failed") || lastError.message.includes("ECONNREFUSED")) {
        throw lastError;
      }
    }
  }

  throw lastError;
}
