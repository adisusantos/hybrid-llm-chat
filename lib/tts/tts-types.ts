// Shared types and constants — no server-only imports, safe for client components.

// ---------------------------------------------------------------------------
// Setting keys
// ---------------------------------------------------------------------------

export const SETTING_KEY_TTS_URL = "tts.url";
export const SETTING_KEY_TTS_ENABLED = "tts.enabled";
export const SETTING_KEY_TTS_VOICE_MAP = "tts.voice_map";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmotionLabel =
  | "neutral"
  | "happy"
  | "sad"
  | "angry"
  | "excited"
  | "whisper"
  | "tender";

export type VoiceEntry = {
  voice_id: string;
  speed: number;
};

export type VoiceMap = Record<EmotionLabel, VoiceEntry>;

export type TtsConfig = {
  url: string;
  enabled: boolean;
  voiceMap: VoiceMap;
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_TTS_URL = "";
export const DEFAULT_TTS_ENABLED = false;

export const DEFAULT_VOICE_MAP: VoiceMap = {
  neutral: { voice_id: "af_heart", speed: 1.0 },
  happy: { voice_id: "af_bella", speed: 1.1 },
  sad: { voice_id: "af_heart", speed: 0.85 },
  angry: { voice_id: "af_nicole", speed: 1.15 },
  excited: { voice_id: "af_bella", speed: 1.2 },
  whisper: { voice_id: "af_sky", speed: 0.8 },
  tender: { voice_id: "af_heart", speed: 0.9 },
};
