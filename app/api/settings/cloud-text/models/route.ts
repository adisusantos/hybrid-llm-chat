import { NextResponse } from "next/server";
import { getSetting } from "@/lib/db/queries";
import {
  fetchCloudTextModels,
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
    return NextResponse.json(
      { error: "Cloud Text API not configured. Set Base URL and API Key first." },
      { status: 400 },
    );
  }

  try {
    const models = await fetchCloudTextModels(url, firstKey);
    return NextResponse.json({ models });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error }, { status: 502 });
  }
}
