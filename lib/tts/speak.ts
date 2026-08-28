import "server-only";

export async function synthesizeSpeech(
  text: string,
  voiceId: string,
  speed: number,
  ttsUrl: string,
): Promise<ArrayBuffer> {
  const normalizedUrl = ttsUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
  const endpoint = `${normalizedUrl}/v1/audio/speech`;

  const body = {
    model: "kokoro",
    input: text,
    voice: voiceId,
    speed,
    response_format: "mp3",
  };

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`TTS server unreachable at ${normalizedUrl}: ${reason}`);
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(
      `TTS server returned ${res.status}: ${bodyText.slice(0, 300)}`,
    );
  }

  return res.arrayBuffer();
}
