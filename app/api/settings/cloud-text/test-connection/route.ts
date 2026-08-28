import { NextResponse } from "next/server";
import { getSetting } from "@/lib/db/queries";
import {
  testCloudTextConnection,
  SETTING_KEY_CLOUD_TEXT_URL,
  SETTING_KEY_CLOUD_TEXT_API_KEY,
  DEFAULT_CLOUD_TEXT_URL,
} from "@/lib/cloud-ai/cloud-text";

export async function GET() {
  const [storedUrl, apiKeyRaw] = await Promise.all([
    getSetting<string>(SETTING_KEY_CLOUD_TEXT_URL),
    getSetting<string>(SETTING_KEY_CLOUD_TEXT_API_KEY),
  ]);
  const url = storedUrl ?? DEFAULT_CLOUD_TEXT_URL;

  const rawKeyString = apiKeyRaw ?? "";
  const apiKeys = rawKeyString
    .split(/[\n,]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  const firstKey = apiKeys[0];

  if (!url || !firstKey) {
    return NextResponse.json({
      ok: false,
      error: "Cloud Text API not configured. Set Base URL and API Key first.",
    });
  }

  let lastErr = new Error("No API keys available");
  for (const key of apiKeys) {
    try {
      await testCloudTextConnection(url, key);
      return NextResponse.json({ ok: true });
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }

  return NextResponse.json({ ok: false, error: lastErr.message });
}
