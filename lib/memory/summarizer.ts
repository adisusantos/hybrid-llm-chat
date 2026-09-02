import {
  getCloudTextConfig,
  callCloudText,
  pingCloudText,
} from "@/lib/cloud-ai/cloud-text";
import "server-only";
import { AION_RP_MODEL_NAME } from "@/lib/llama/types";
import { estimateTokens } from "@/lib/utils/tokens";

export type ChatTurn = { role: "user" | "assistant" | "system"; content: string };

export type ExtractedMemory = {
  content: string;
  importance: number; // 1-5
};

export type SummaryResult = {
  summary: string;
  memories: ExtractedMemory[];
  provider?: {
    source: "cloud" | "local";
    model: string;
  };
};

function getSystemPrompt(hasPreviousSummary: boolean, worldSetting?: string): string {
  const summaryInstruction = hasPreviousSummary 
    ? `1. "summary": a 2-4 sentence prose summary updating/extending the existing summary with new events. Merge the previous summary's key context with the new developments. Keep it concise. Capture: main events, emotional arcs, character dynamics.`
    : `1. "summary": a 2-4 sentence prose summary of the conversation so far. Capture: main events, emotional arcs, character dynamics, and any important context. Be specific (use names, places, items mentioned) but concise.`;

  const worldSettingRule = worldSetting
    ? `\n- The story takes place in this world setting: "${worldSetting}". Do NOT generate memories that contradict this setting (e.g. modern technology in a medieval setting). Summaries should capture location/environment changes within the narrative.`
    : "";

  return `You are a memory assistant for a roleplay chat. Given a conversation between a USER and an ASSISTANT (the character), produce a single JSON object with two fields:

${summaryInstruction}

2. "memories": an array of 3-6 short factual items worth remembering for future turns. Each item has:
   - "content": one specific sentence (under 20 words)
   - "importance": integer 1-5, where 5 = critical plot/character fact, 1 = minor detail

Rules:
- Output ONLY the JSON object, nothing else.
- No markdown code fences.
- Do not invent facts that aren't in the conversation.
- If the conversation is trivial, return a short summary and an empty memories array.${worldSettingRule}`;
}

function buildUserPrompt(turns: ChatTurn[], previousSummary?: string, worldSetting?: string): string {
  const lines: string[] = [];
  
  if (worldSetting && worldSetting.trim().length > 0) {
    lines.push(`World Setting: ${worldSetting.trim()}`, "");
  }

  if (previousSummary && previousSummary.trim().length > 0) {
    lines.push("Previous Summary:", previousSummary.trim(), "");
    lines.push("Latest Conversation to summarize:", "");
  } else {
    lines.push("Conversation to summarize:", "");
  }

  // Token budget for the turns to prevent context window overflow (e.g. 16k context window).
  // 6000 tokens gives plenty of room for system prompt and generation.
  const TOKEN_BUDGET = 6000;
  let tokensUsed = 0;
  const turnLines: string[] = [];
  
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    const role = t.role.charAt(0).toUpperCase() + t.role.slice(1);
    // Trim individual messages too, to prevent one huge message from eating the budget
    const maxLen = 800; // chars
    const text = t.content.length > maxLen ? `${t.content.slice(0, maxLen)}…` : t.content;
    const line = `${role}: ${text}`;
    const lineTokens = estimateTokens(line);
    
    if (tokensUsed + lineTokens > TOKEN_BUDGET) {
      if (turnLines.length === 0) {
          turnLines.unshift(line);
      }
      break;
    }
    
    turnLines.unshift(line);
    tokensUsed += lineTokens;
  }
  
  lines.push(...turnLines);
  lines.push("", "Return JSON only.");
  return lines.join("\n");
}

/**
 * Call llama-server once to summarize the conversation. Uses non-streaming
 * mode and a deterministic-ish sampler (low temp) for stable summaries.
 */
export async function summarizeConversation(
  turns: ChatTurn[],
  opts?: { baseUrl?: string; apiKey?: string; previousSummary?: string; worldSetting?: string },
): Promise<SummaryResult> {
  if (turns.length === 0) {
    return { summary: "", memories: [] };
  }

  const hasPreviousSummary = !!(opts?.previousSummary && opts.previousSummary.trim().length > 0);
  const messages = [
    { role: "system" as const, content: getSystemPrompt(hasPreviousSummary, opts?.worldSetting) },
    { role: "user" as const, content: buildUserPrompt(turns, opts?.previousSummary, opts?.worldSetting) },
  ];

  // Try Cloud Text AI if enabled & reachable
  const cloudCfg = await getCloudTextConfig();
  if (cloudCfg.enabled && cloudCfg.url && cloudCfg.apiKey && cloudCfg.model) {
    const reachable = await pingCloudText(cloudCfg.url, cloudCfg.apiKey);
    if (reachable) {
      try {
        console.log("[summarizer] Using cloud text AI:", cloudCfg.model);
        const raw = await callCloudText(cloudCfg, messages, {
          temperature: 0.3,
          max_tokens: 1500,
        });
        const res = parseSummary(raw);
        res.provider = { source: "cloud", model: cloudCfg.model };
        return res;
      } catch (err) {
        console.warn(
          "[summarizer] Cloud Text AI failed, falling back to local model:",
          err instanceof Error ? err.message : String(err),
        );
      }
    } else {
      console.warn("[summarizer] Cloud Text AI unreachable, using local model");
    }
  }

  // Fallback to local llama-server
  console.log("[summarizer] Using local llama-server");
  const baseUrl = opts?.baseUrl ?? "http://127.0.0.1:8080/v1";
  const body = {
    model: AION_RP_MODEL_NAME,
    messages,
    stream: false,
    temperature: 0.3,
    top_p: 0.9,
    top_k: 40,
    min_p: 0.05,
    max_tokens: 1500,
    chat_template_kwargs: { enable_thinking: false },
    stop: ["</s>", "<|im_end|>", "<|eot_id|>", "\n\n__", "__USER__:", "__ASSISTANT__:"],
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts?.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`summarizer ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content ?? "";

  const parsed = parseSummary(raw);
  parsed.provider = { source: "local", model: AION_RP_MODEL_NAME };
  return parsed;
}

function parseSummary(raw: string): SummaryResult {
  const trimmed = raw.trim();
  // Strip leading/trailing code fences if the model included them.
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const body = fenced ? fenced[1]! : trimmed;

  // Find the first balanced JSON object in the body. The model may continue
  // generating past the closing brace, so we extract just the JSON envelope.
  const objText = extractFirstJsonObject(body);
  if (!objText) {
    // Truncated output — attempt to salvage the summary field from the partial JSON.
    const partialSummary = extractSummaryField(body);
    if (partialSummary) {
      return { summary: partialSummary, memories: [] };
    }
    return { summary: "", memories: [] };
  }

  try {
    const obj = JSON.parse(objText) as { summary?: unknown; memories?: unknown };
    const summary = typeof obj.summary === "string" ? obj.summary : "";
    const memories = Array.isArray(obj.memories)
      ? obj.memories
          .map((m): ExtractedMemory | null => {
            if (typeof m !== "object" || m === null) return null;
            const r = m as { content?: unknown; importance?: unknown };
            if (typeof r.content !== "string") return null;
            const importance = Number.isFinite(r.importance)
              ? Math.max(1, Math.min(5, Math.round(Number(r.importance))))
              : 3;
            return { content: r.content, importance };
          })
          .filter((m): m is ExtractedMemory => m !== null)
      : [];
    return { summary, memories };
  } catch {
    // JSON.parse failed — salvage what we can.
    const partialSummary = extractSummaryField(body);
    if (partialSummary) {
      return { summary: partialSummary, memories: [] };
    }
    return { summary: "", memories: [] };
  }
}

/**
 * Attempt to extract the "summary" field value from incomplete/truncated JSON.
 * Returns the string value if found, null otherwise.
 */
function extractSummaryField(s: string): string | null {
  const match = s.match(/"summary"\s*:\s*"([\s\S]*?)"\s*,\s*"memories"/);
  if (match?.[1]) return match[1].replace(/\\"/g, '"').replace(/\\n/g, "\n");
  // Fallback: just the summary key without memories following
  const simpleMatch = s.match(/"summary"\s*:\s*"([\s\S]*?)"/);
  if (simpleMatch?.[1]) return simpleMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n");
  return null;
}

function extractFirstJsonObject(s: string): string | null {
  const start = s.indexOf("{");
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
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Select up to K memories for prompt injection. Scoring:
 *   score = importance * recencyDecay
 * where recencyDecay = 1 / (1 + ageDays)  (older = lower).
 * Pinned memories always included first.
 */
export function selectMemories(
  memories: Array<{ id: string; content: string; importance: number; isPinned: boolean; createdAt: Date | number }>,
  k: number,
  now: Date = new Date(),
): typeof memories {
  const scored = memories.map((m) => {
    const t = m.createdAt instanceof Date ? m.createdAt.getTime() : Number(m.createdAt);
    const ageDays = Math.max(0, (now.getTime() - t) / (1000 * 60 * 60 * 24));
    const recencyDecay = 1 / (1 + ageDays);
    const score = m.importance * recencyDecay + (m.isPinned ? 100 : 0);
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.m);
}

export function estimateMemoriesBlockTokens(
  summary: string,
  memories: Array<{ content: string }>,
): number {
  return (
    estimateTokens(summary) + estimateTokens(memories.map((m) => m.content).join("\n"))
  );
}

export function formatMemoriesBlock(
  summary: string,
  memories: Array<{ content: string; importance: number; isPinned: boolean }>,
): string {
  const parts: string[] = [];
  if (summary && summary.trim().length > 0) {
    parts.push(`[Conversation summary so far]\n${summary.trim()}`);
  }
  if (memories.length > 0) {
    const lines = memories.map((m) => {
      const pin = m.isPinned ? "📌 " : "";
      return `- ${pin}${m.content} (importance ${m.importance}/5)`;
    });
    parts.push(`[Key memories]\n${lines.join("\n")}`);
  }
  if (parts.length === 0) return "";
  return parts.join("\n\n") + "\n\n";
}
