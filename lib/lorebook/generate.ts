import {
  getCloudTextConfig,
  callCloudText,
  pingCloudText,
} from "@/lib/cloud-ai/cloud-text";
import "server-only";

import { DEFAULT_SAMPLER } from "@/lib/llama/sampler";
import { streamChat, type ChatMessage } from "@/lib/llama/client";

export type LorebookEntryDraft = {
  keys: string[];
  secondaryKeys: string[];
  content: string;
  comment: string;
  insertionOrder: number;
  enabled: boolean;
  caseSensitive: boolean;
  regex: boolean;
  constant: boolean;
  position: "before_char" | "after_char" | "before_system" | "after_system" | "before_exmpls";
  priority: number;
  selectiveLogic: "and" | "not";
};

export type LorebookDraftResult = {
  name: string;
  description: string;
  scanDepth: number;
  tokenBudget: number;
  entries: LorebookEntryDraft[];
  provider?: {
    source: "cloud" | "local";
    model: string;
  };
};

const SYSTEM_PROMPT = `You are a worldbuilding assistant for a roleplay application. Given a short user description of a character, location, or world, produce a JSON array of lorebook entries.

Each entry is a keyword-triggered knowledge block that will be injected into the LLM prompt when its keys appear in recent chat messages.

IMPORTANT: The user may provide the description in ANY language (Indonesian, English, Japanese, etc.), but you MUST always generate ALL entries with English content. Keys, content, and comments should all be in English for universal compatibility.

Rules:
- Output ONLY a JSON array. No prose, no markdown fences, no explanation.
- Each array element must have all these fields:
  - keys: string[] (1-5 trigger keywords/phrases in English, lowercase, concise)
  - secondaryKeys: string[] (optional additional conditions in English, can be empty)
  - content: string (the knowledge text in English to be injected into the prompt, 1-4 sentences, detailed and specific)
  - comment: string (short note for the author in English, can be empty)
  - insertionOrder: number (0-based, order among entries with same priority)
  - enabled: true
  - caseSensitive: false
  - regex: false
  - constant: false
  - position: "after_char" (default; use "before_char" only for critical warnings)
  - priority: number (0-1000, higher = more important; background facts ~200, secrets ~500, critical warnings ~800)
  - selectiveLogic: "and" (default) or "not"

Guidelines:
- Generate 6-12 entries covering: identity, appearance, personality, background, relationships, secrets, skills, habits, world details.
- keys should be the most likely English words a user would type in chat to trigger this info.
- content must be self-contained, in English, and directly usable in a prompt.
- If the description is vague, invent plausible, interesting details that fit.
- Vary priority: critical facts higher, flavor details lower.`;

function buildUserPrompt(description: string): string {
  return `Generate lorebook entries for the following character/world. The description may be in any language, but generate ALL entries in English:\n\n"${description.trim()}"\n\nReturn JSON array only.`;
}

export async function generateLorebookDraft(
  description: string,
  opts?: { baseUrl?: string; apiKey?: string },
): Promise<LorebookDraftResult> {
  if (!description.trim()) {
    throw new Error("Deskripsi tidak boleh kosong.");
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(description) },
  ];

  let accumulated = "";
  let provider: { source: "cloud" | "local"; model: string } = {
    source: "local",
    model: "llama-server",
  };

  let entries: LorebookEntryDraft[] | null = null;

  // Try Cloud Text AI first if enabled & reachable
  const cloudCfg = await getCloudTextConfig();
  if (cloudCfg.enabled && cloudCfg.url && cloudCfg.apiKey && cloudCfg.model) {
    const reachable = await pingCloudText(cloudCfg.url, cloudCfg.apiKey);
    if (reachable) {
      try {
        console.log("[lorebook-gen] Using cloud text AI:", cloudCfg.model);
        accumulated = await callCloudText(cloudCfg, messages, {
          temperature: 0.85,
          max_tokens: 4096,
        });
        entries = parseLorebookEntries(accumulated, description);
        provider = { source: "cloud", model: cloudCfg.model };
      } catch (err) {
        console.warn(
          "[lorebook-gen] Cloud Text AI API or parsing failed, falling back to local model:",
          err instanceof Error ? err.message : String(err),
        );
        accumulated = "";
        entries = null;
      }
    } else {
      console.warn("[lorebook-gen] Cloud Text AI unreachable, using local model");
    }
  }

  // Fallback to local streamChat
  if (!accumulated) {
    console.log("[lorebook-gen] Using local llama-server");
    const baseUrl = opts?.baseUrl ?? "http://127.0.0.1:8080/v1";
    let llmError: string | null = null;

    try {
      for await (const chunk of streamChat(messages, {
        sampler: { ...DEFAULT_SAMPLER, temperature: 0.85, max_tokens: 2048 },
        baseUrl,
      })) {
        if (chunk.type === "delta") accumulated += chunk.content;
        else if (chunk.type === "error") {
          llmError = chunk.message;
          break;
        } else if (chunk.type === "done") {
          break;
        }
      }
    } catch (err) {
      llmError = err instanceof Error ? err.message : String(err);
    }

    if (llmError) throw new Error("LLM error: " + llmError.slice(0, 200));
    if (!accumulated.trim()) throw new Error("LLM mengembalikan respons kosong.");
  }

  if (!entries) {
    entries = parseLorebookEntries(accumulated, description);
  }

  const name = extractName(description);
  return {
    name,
    description: description.trim(),
    scanDepth: 5,
    tokenBudget: 1024,
    entries,
    provider,
  };
}

function extractName(description: string): string {
  const trimmed = description.trim();
  const firstSentence = trimmed.split(/[.!?]/)[0]?.trim() ?? trimmed;
  if (firstSentence.length <= 40) return firstSentence;
  return trimmed.slice(0, 40).trim() + "…";
}

function extractFirstJsonArray(s: string): string | null {
  const start = s.indexOf("[");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }

  // Truncated array salvage: if bracket opened but unclosed, attempt auto-closing
  if (depth > 0) {
    let salvaged = s.slice(start).trim();
    // Remove trailing unclosed quote or comma if present
    salvaged = salvaged.replace(/,\s*$/, "").replace(/"[^"]*$/, "");
    // Close missing brackets
    salvaged += "]".repeat(depth);
    return salvaged;
  }

  return null;
}

function parseLorebookEntries(raw: string, fallbackContext: string): LorebookEntryDraft[] {
  let clean = raw.trim();

  // Strip code fences if present
  clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  let jsonStr = extractFirstJsonArray(clean);

  if (!jsonStr) {
    // Stage fallback: look anywhere for bracket
    const start = raw.indexOf("[");
    if (start !== -1) {
      jsonStr = raw.slice(start);
      if (!jsonStr.endsWith("]")) jsonStr += "]";
    }
  }

  if (!jsonStr) {
    console.warn("[parseLorebookEntries] Could not locate JSON array. Raw output:", raw.slice(0, 300));
    throw new Error(
      "LLM tidak mengembalikan JSON yang valid. Coba lagi — model mungkin perlu percobaan lain.",
    );
  }

  // Clean illegal control characters and fix common LLM backslash escaping issues
  const sanitizedJsonStr = jsonStr
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replace(/\\+"/g, '\\"')
    .replace(/\\+(,|\n|\r)/g, "$1");

  let parsed: unknown[] | null = null;
  try {
    parsed = JSON.parse(sanitizedJsonStr) as unknown[];
  } catch (err) {
    // Secondary attempt: try parsing original jsonStr
    try {
      parsed = JSON.parse(jsonStr) as unknown[];
    } catch {
      console.warn("[parseLorebookEntries] JSON.parse failed. Raw snippet:", sanitizedJsonStr.slice(0, 300));
      throw new Error(
        "Gagal parse JSON lorebook: " + (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Hasil bukan array.");
  }

  return parsed
    .map((item): LorebookEntryDraft | null => {
      if (typeof item !== "object" || item === null) return null;
      const o = item as Record<string, unknown>;

      const keys = normaliseStringArray(o.keys ?? o.key ?? o.keywords ?? o.keyword);
      const secondaryKeys = normaliseStringArray(o.secondaryKeys);
      const content = typeof o.content === "string" ? o.content.trim() : "";
      const comment = typeof o.comment === "string" ? o.comment.trim() : "";

      if (keys.length === 0 && !content) return null;

      return {
        keys,
        secondaryKeys,
        content: content || fallbackContext.slice(0, 200),
        comment,
        insertionOrder: typeof o.insertionOrder === "number" ? o.insertionOrder : 0,
        enabled: o.enabled !== false,
        caseSensitive: o.caseSensitive === true,
        regex: o.regex === true,
        constant: o.constant === true,
        position: isValidPosition(o.position) ? o.position : "after_char",
        priority: typeof o.priority === "number" ? Math.max(0, Math.min(1000, Math.round(o.priority))) : 100,
        selectiveLogic: o.selectiveLogic === "not" ? "not" : "and",
      };
    })
    .filter((e): e is LorebookEntryDraft => e !== null);
}

const VALID_POSITIONS = new Set([
  "before_char",
  "after_char",
  "before_system",
  "after_system",
  "before_exmpls",
]);

function isValidPosition(v: unknown): v is LorebookEntryDraft["position"] {
  return typeof v === "string" && VALID_POSITIONS.has(v);
}

function normaliseStringArray(v: unknown): string[] {
  if (typeof v === "string") {
    return v
      .split(/[,;\n]+/)
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
  }
  if (!Array.isArray(v)) return [];
  return v
    .flatMap((x) => (typeof x === "string" ? x.split(/[,;\n]+/).map((s) => s.trim()) : ""))
    .filter((x) => x.length > 0);
}
