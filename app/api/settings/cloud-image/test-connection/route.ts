import { NextResponse } from "next/server";
import { getSetting } from "@/lib/db/queries";
import {
  testCloudConnection,
  SETTING_KEY_CLOUD_IMAGE_URL,
  SETTING_KEY_CLOUD_IMAGE_API_KEY,
  DEFAULT_CLOUD_IMAGE_URL,
} from "@/lib/imagegen/cloud";

export async function GET() {
  const [storedUrl, apiKeyRaw] = await Promise.all([
    getSetting<string>(SETTING_KEY_CLOUD_IMAGE_URL),
    getSetting<string>(SETTING_KEY_CLOUD_IMAGE_API_KEY),
  ]);
  const url = storedUrl ?? DEFAULT_CLOUD_IMAGE_URL;

  const rawKeyString = apiKeyRaw ?? "";
  const apiKeys = rawKeyString
    .split(/[\n,]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  const firstKey = apiKeys[0];

  if (!url || !firstKey) {
    return NextResponse.json({
      ok: false,
      error: "Cloud image API not configured. Set Base URL and API Key first.",
    });
  }

  let lastErr = new Error("No API keys available");
  for (const key of apiKeys) {
    try {
      await testCloudConnection(url, key);
      return NextResponse.json({ ok: true });
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  
  return NextResponse.json({ ok: false, error: lastErr.message });
}
