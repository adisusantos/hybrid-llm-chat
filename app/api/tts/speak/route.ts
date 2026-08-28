import { NextRequest, NextResponse } from "next/server";
import { getTtsConfig, DEFAULT_VOICE_MAP } from "@/lib/tts/tts-config";
import { detectEmotion } from "@/lib/tts/emotion";
import { synthesizeSpeech } from "@/lib/tts/speak";
import { extractDialogue } from "@/lib/tts/extract-dialogue";

export async function POST(req: NextRequest) {
  let body: { content?: string };
  try {
    body = (await req.json()) as { content?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const content = body.content?.trim() ?? "";
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const config = await getTtsConfig();

  if (!config.enabled) {
    return NextResponse.json(
      { error: "TTS is not enabled" },
      { status: 503 },
    );
  }

  if (!config.url) {
    return NextResponse.json(
      { error: "TTS URL is not configured" },
      { status: 503 },
    );
  }

  // Extract dialogue only (filter out actions/narration)
  const speechText = extractDialogue(content);

  // Detect emotion → pick voice
  const emotion = await detectEmotion(content);
  const voiceMap = config.voiceMap ?? DEFAULT_VOICE_MAP;
  const voiceEntry = voiceMap[emotion] ?? voiceMap.neutral ?? DEFAULT_VOICE_MAP.neutral;

  let audioBuffer: ArrayBuffer;
  try {
    audioBuffer = await synthesizeSpeech(
      speechText,
      voiceEntry.voice_id,
      voiceEntry.speed,
      config.url,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 503 });
  }

  return new NextResponse(audioBuffer, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
