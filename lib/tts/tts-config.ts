import "server-only";
import { getSetting } from "@/lib/db/queries";
import {
  SETTING_KEY_TTS_URL,
  SETTING_KEY_TTS_ENABLED,
  SETTING_KEY_TTS_VOICE_MAP,
  DEFAULT_TTS_URL,
  DEFAULT_TTS_ENABLED,
  DEFAULT_VOICE_MAP,
  type VoiceMap,
  type TtsConfig,
} from "./tts-types";

// Re-export everything for convenience
export {
  SETTING_KEY_TTS_URL,
  SETTING_KEY_TTS_ENABLED,
  SETTING_KEY_TTS_VOICE_MAP,
  DEFAULT_TTS_URL,
  DEFAULT_TTS_ENABLED,
  DEFAULT_VOICE_MAP,
} from "./tts-types";
export type {
  EmotionLabel,
  VoiceEntry,
  VoiceMap,
  TtsConfig,
} from "./tts-types";

// ---------------------------------------------------------------------------
// Config loader (server-only)
// ---------------------------------------------------------------------------

export async function getTtsConfig(): Promise<TtsConfig> {
  const [url, enabled, voiceMapRaw] = await Promise.all([
    getSetting<string>(SETTING_KEY_TTS_URL),
    getSetting<boolean>(SETTING_KEY_TTS_ENABLED),
    getSetting<VoiceMap>(SETTING_KEY_TTS_VOICE_MAP),
  ]);

  return {
    url: url ?? DEFAULT_TTS_URL,
    enabled: enabled ?? DEFAULT_TTS_ENABLED,
    voiceMap: voiceMapRaw ?? DEFAULT_VOICE_MAP,
  };
}
