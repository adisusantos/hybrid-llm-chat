import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db/queries";
import {
  SETTING_KEY_TTS_URL,
  SETTING_KEY_TTS_ENABLED,
  SETTING_KEY_TTS_VOICE_MAP,
  DEFAULT_TTS_URL,
  DEFAULT_TTS_ENABLED,
  DEFAULT_VOICE_MAP,
} from "@/lib/tts/tts-config";

export async function GET() {
  const [url, enabled, voiceMap] = await Promise.all([
    getSetting<string>(SETTING_KEY_TTS_URL),
    getSetting<boolean>(SETTING_KEY_TTS_ENABLED),
    getSetting(SETTING_KEY_TTS_VOICE_MAP),
  ]);

  return NextResponse.json({
    url: url ?? DEFAULT_TTS_URL,
    enabled: enabled ?? DEFAULT_TTS_ENABLED,
    voiceMap: voiceMap ?? DEFAULT_VOICE_MAP,
  });
}

export async function POST(req: NextRequest) {
  let body: { url?: string; enabled?: boolean; voiceMap?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url, enabled, voiceMap } = body;

  if (url !== undefined) {
    if (url && !/^https?:\/\//.test(url)) {
      return NextResponse.json(
        { error: "URL must start with http:// or https://" },
        { status: 400 },
      );
    }
    await setSetting(SETTING_KEY_TTS_URL, url);
  }

  if (enabled !== undefined) {
    await setSetting(SETTING_KEY_TTS_ENABLED, Boolean(enabled));
  }

  if (voiceMap !== undefined) {
    await setSetting(SETTING_KEY_TTS_VOICE_MAP, voiceMap);
  }

  return NextResponse.json({ ok: true });
}
