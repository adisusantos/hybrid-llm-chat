import { NextResponse } from "next/server";
import { getSetting } from "@/lib/db/queries";
import {
  fetchCloudModels,
  SETTING_KEY_CLOUD_IMAGE_URL,
  SETTING_KEY_CLOUD_IMAGE_API_KEY,
  DEFAULT_CLOUD_IMAGE_URL,
} from "@/lib/imagegen/cloud";

// GET /api/settings/cloud-image/models
// Fetches the list of models from the cloud API via GET /v1/models.
// Returns all model IDs — client can pick whichever ones are relevant.
//
// Returns: { models: string[] }

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
    return NextResponse.json(
      { error: "Cloud image API not configured. Set Base URL and API Key first." },
      { status: 400 },
    );
  }

  try {
    const models = await fetchCloudModels(url, firstKey);
    return NextResponse.json({ models });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error }, { status: 502 });
  }
}
