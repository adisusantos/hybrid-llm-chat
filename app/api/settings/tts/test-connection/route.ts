import { NextResponse } from "next/server";
import { getSetting } from "@/lib/db/queries";
import {
  SETTING_KEY_TTS_URL,
  DEFAULT_TTS_URL,
} from "@/lib/tts/tts-config";

export async function GET() {
  const storedUrl = await getSetting<string>(SETTING_KEY_TTS_URL);
  const url = (storedUrl ?? DEFAULT_TTS_URL).replace(/\/+$/, "").replace(/\/v1$/, "");

  if (!url) {
    return NextResponse.json({
      ok: false,
      error: "TTS URL not configured. Set Base URL first.",
    });
  }

  // Hit /v1/models — any OpenAI-compatible server should respond
  let res: Response;
  try {
    res = await fetch(`${url}/v1/models`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      error: `TTS server unreachable: ${reason}`,
    });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return NextResponse.json({
      ok: false,
      error: `TTS server returned ${res.status}: ${body.slice(0, 200)}`,
    });
  }

  return NextResponse.json({ ok: true });
}
