import "server-only";
import {
  getCloudTextConfig,
  callCloudText,
} from "@/lib/cloud-ai/cloud-text";
import type { EmotionLabel } from "./tts-config";

const EMOTION_LABELS: EmotionLabel[] = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "excited",
  "whisper",
  "tender",
];

// Strip common markdown syntax to get plain text for emotion analysis.
function stripMarkdown(text: string): string {
  return text
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, "")
    // Remove inline code
    .replace(/`[^`]*`/g, "")
    // Remove images
    .replace(/!\[.*?\]\(.*?\)/g, "")
    // Remove links — keep label text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Remove bold/italic
    .replace(/\*{1,3}([^*]*)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]*)_{1,3}/g, "$1")
    // Remove headings
    .replace(/^#{1,6}\s+/gm, "")
    // Remove blockquotes
    .replace(/^>\s+/gm, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

const CLASSIFY_PROMPT = (content: string) =>
  `Given this roleplay message, classify the dominant emotional tone into exactly one of:\nneutral | happy | sad | angry | excited | whisper | tender\n\nRespond with only the single label — no punctuation, no explanation.\n\nMessage:\n"""\n${content}\n"""`;

export async function detectEmotion(content: string): Promise<EmotionLabel> {
  try {
    const config = await getCloudTextConfig();
    if (!config.enabled || !config.url || !config.apiKey) {
      return "neutral";
    }

    const plain = stripMarkdown(content);
    const excerpt = plain.length > 500 ? plain.slice(0, 300) : plain;

    const result = await callCloudText(
      config,
      [{ role: "user", content: CLASSIFY_PROMPT(excerpt) }],
      { temperature: 0.0, max_tokens: 10 },
    );

    const label = result.trim().toLowerCase() as EmotionLabel;
    if (EMOTION_LABELS.includes(label)) {
      return label;
    }

    for (const l of EMOTION_LABELS) {
      if (result.toLowerCase().includes(l)) return l;
    }

    return "neutral";
  } catch {
    return "neutral";
  }
}
