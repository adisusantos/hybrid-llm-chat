import { NextResponse } from "next/server";
import { getSetting } from "@/lib/db/queries";
import {
  fetchCloudVisionModels,
  SETTING_KEY_CLOUD_VISION_URL,
  SETTING_KEY_CLOUD_VISION_API_KEY,
  DEFAULT_CLOUD_VISION_URL,
} from "@/lib/cloud-ai/cloud-vision";

// GET /api/settings/cloud-vision/models
// Fetches the list of models from the cloud vision API via GET /v1/models.

export async function GET() {
  const [storedUrl, apiKeyRaw] = await Promise.all([
    getSetting<string>(SETTING_KEY_CLOUD_VISION_URL),
    getSetting<string>(SETTING_KEY_CLOUD_VISION_API_KEY),
  ]);
  const url = storedUrl ?? DEFAULT_CLOUD_VISION_URL;

  const rawKeyString = apiKeyRaw ?? "";
  const apiKeys = rawKeyString
    .split(/[\n,]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  const firstKey = apiKeys[0];

  if (!url || !firstKey) {
    return NextResponse.json(
      { error: "Cloud Vision API not configured. Set Base URL and API Key first." },
      { status: 400 },
    );
  }

  try {
    const models = await fetchCloudVisionModels(url, firstKey);
    return NextResponse.json({ models });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error }, { status: 502 });
  }
}
