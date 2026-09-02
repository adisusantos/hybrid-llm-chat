import "server-only";
import {
  appendMessage,
  getChat,
  getChatSummary,
  getLorebookBundleForChat,
  listMemoriesForChat,
  resolveSamplerForChat,
} from "@/lib/db/queries";
import {
  formatMemoriesBlock,
  selectMemories,
} from "@/lib/memory/summarizer";
import {
  assembleFinalSystemPrompt,
  scanLorebooks,
  type LorebookEntryInput,
  type LorebookInput,
} from "@/lib/prompt/lorebook";
import { applySlidingWindow, type SlidingWindowResult } from "@/lib/prompt/sliding-window";
import type { ChatMessage } from "@/lib/llama/client";

/**
 * Build the full set of messages + sampler config to send to llama-server.
 * Pulls character + lorebooks + summary + memories, assembles system prompt,
 * and applies a sliding window to the chat history to prevent context overflow.
 */
export async function buildChatPrompt(chatId: string): Promise<{
  chat: NonNullable<Awaited<ReturnType<typeof getChat>>>;
  messages: ChatMessage[];
  sampler: Awaited<ReturnType<typeof resolveSamplerForChat>>["config"];
  slidingWindow: SlidingWindowResult;
}> {
  const chat = await getChat(chatId);
  if (!chat) throw new Error("chat not found");

  const sampler = (await resolveSamplerForChat(chatId)).config;

  // Character + lorebook system prompt
  const lorebooks = await getLorebookBundleForChat(chatId);
  const baseCharacterPrompt = buildCharacterSystemPrompt(chat.character);

  const lbInputs: LorebookInput[] = lorebooks.map((lb) => ({
    id: lb.id,
    scanDepth: lb.scanDepth,
    tokenBudget: lb.tokenBudget,
    entries: lb.entries.map<LorebookEntryInput>((e) => ({
      id: e.id,
      keys: e.keys,
      secondaryKeys: e.secondaryKeys,
      content: e.content,
      enabled: e.enabled,
      caseSensitive: e.caseSensitive,
      regex: e.regex,
      constant: e.constant,
      position: e.position,
      priority: e.priority,
      selectiveLogic: e.selectiveLogic,
    })),
  }));

  const recentMessages = chat.messages.map((m) => ({
    role: m.role as ChatMessage["role"],
    content: m.content,
  }));
  const activated = scanLorebooks(lbInputs, recentMessages);
  const matchedIds = new Set(activated.map((a) => a.id));

  const flatForAssemble = lbInputs.flatMap((lb) =>
    lb.entries.map((entry) => ({
      entry,
      lorebookId: lb.id,
      lorebookBudget: lb.tokenBudget,
    })),
  );
  const { system: characterPromptWithLorebooks } = assembleFinalSystemPrompt(
    flatForAssemble,
    matchedIds,
    baseCharacterPrompt,
  );

  // Append memory block
  const [summary, allMemories] = await Promise.all([
    getChatSummary(chatId),
    listMemoriesForChat(chatId),
  ]);
  const topMemories = selectMemories(allMemories, 8);
  const memoryBlock = formatMemoriesBlock(summary, topMemories);

  const systemPrompt = memoryBlock
    ? `${characterPromptWithLorebooks}\n\n${memoryBlock}`
    : characterPromptWithLorebooks;

  const allMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...chat.messages.map((m) => ({
      role: m.role as ChatMessage["role"],
      content: m.content,
      name: m.name ?? undefined,
    })),
  ];

  // Apply sliding window: automatically trim oldest history messages if the
  // total prompt is over the configured cap. Preserves the system message
  // and always keeps the most recent N messages (see sliding-window.ts).
  const slidingWindow = applySlidingWindow(allMessages);

  return { chat, messages: slidingWindow.messages, sampler, slidingWindow };
}

/**
 * Build a chat prompt up to (and including) a specific user message id.
 * Used by regenerate — we don't want to include the previous assistant
 * response as context for the new one.
 */
export async function buildChatPromptUpToMessage(
  chatId: string,
  upToUserMessageId: string,
): Promise<{
  chat: NonNullable<Awaited<ReturnType<typeof getChat>>>;
  messages: ChatMessage[];
  sampler: Awaited<ReturnType<typeof resolveSamplerForChat>>["config"];
}> {
  const full = await buildChatPrompt(chatId);
  // Find the index of the user message in the message list (skip system at index 0).
  const idx = full.messages.findIndex(
    (m) => m.role === "user" && m.content && full.chat.messages.some((cm) => cm.id === upToUserMessageId && cm.content === m.content),
  );
  if (idx === -1) return full;
  return {
    chat: full.chat,
    sampler: full.sampler,
    messages: full.messages.slice(0, idx + 1),
  };
}

/**
 * Replace SillyTavern-style template variables in a string.
 * {{char}} → character name, {{user}} → "User"
 */
function substituteTemplateVars(text: string, charName: string, userName = "User"): string {
  return text
    .replace(/\{\{char\}\}/gi, charName)
    .replace(/\{\{user\}\}/gi, userName);
}

export function buildCharacterDetailBlock(character: {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  worldSetting: string;
  appearance: string;
  firstMes: string;
  mesExample: string;
}): string {
  const sub = (text: string) => substituteTemplateVars(text, character.name);
  const parts: string[] = [];
  if (character.description) parts.push(`[Character background]\n${sub(character.description)}`);
  if (character.personality) parts.push(`[Personality]\n${sub(character.personality)}`);
  if (character.appearance) parts.push(`[Physical appearance]\n${sub(character.appearance)}`);
  if (character.scenario) parts.push(`[Scenario]\n${sub(character.scenario)}`);
  if (character.worldSetting) parts.push(`[World Setting]\n${sub(character.worldSetting)}\nENFORCEMENT: NEVER reference objects, technology, clothing, transportation, architecture, or customs that don't exist in this world setting. All descriptions must be consistent with the era and culture defined above.`);
  // Replace the generic EXAMPLE FORMAT section's examples with character-specific ones
  if (character.firstMes) parts.push(`[Opening line example]\n${sub(character.firstMes)}`);
  if (character.mesExample) parts.push(`[Example dialogue]\n${sub(character.mesExample)}`);
  if (parts.length === 0) return "";
  return "\n" + parts.join("\n\n") + "\n";
}

export function buildCharacterSystemPrompt(character: {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  worldSetting: string;
  firstMes: string;
  mesExample: string;
  systemPromptOverride: string | null;
  postHistoryInstructions: string;
  appearance: string;
}): string {
  if (character.systemPromptOverride && character.systemPromptOverride.trim()) {
    // The override may be a generic roleplay template that only says "You are {{char}}."
    // without any character-specific detail. Inject personality/description/scenario
    // right after the first line so the model always knows who it's playing.
    const overrideResolved = substituteTemplateVars(character.systemPromptOverride, character.name);
    const characterDetail = buildCharacterDetailBlock(character);
    if (characterDetail) {
      // Insert the character detail block after the first line of the override
      const firstNewline = overrideResolved.indexOf("\n");
      const base = firstNewline !== -1
        ? overrideResolved.slice(0, firstNewline) + "\n" + characterDetail + overrideResolved.slice(firstNewline)
        : overrideResolved + "\n" + characterDetail;

      // Replace the generic EXAMPLE FORMAT block (if present) with character-specific examples
      // so the model doesn't roleplay as whoever is in the generic example.
      if (character.firstMes || character.mesExample) {
        const sub = (t: string) => substituteTemplateVars(t, character.name);
        const charExample =
          (character.mesExample ? sub(character.mesExample) : "") ||
          (character.firstMes ? `${character.name}: ${sub(character.firstMes)}` : "");
        return base.replace(
          /EXAMPLE FORMAT[\s\S]*$/i,
          `EXAMPLE FORMAT\n\n${charExample}`,
        );
      }
      return base;
    }
    return overrideResolved;
  }
  // Helper to substitute {{char}}/{{user}} in any character field
  const sub = (text: string) => substituteTemplateVars(text, character.name);

  const sections: string[] = [];
  sections.push(
    `You are ${character.name}. Fully embody this character at all times — including any harsh, cold, sarcastic, blunt, hostile, or morally grey traits defined below. Do NOT soften, sanitize, or revert to a generic helpful-assistant tone. Your personality supersedes any default assistant behavior.`,
  );
  if (character.description) sections.push(sub(character.description));
  if (character.personality) sections.push(`\n[Personality]\n${sub(character.personality)}`);
  if (character.appearance)
    sections.push(`\n[Physical appearance]\n${sub(character.appearance)}`);
  if (character.scenario) sections.push(`\n[Scenario]\n${sub(character.scenario)}`);
  if (character.worldSetting) sections.push(`\n[World Setting]\n${sub(character.worldSetting)}\nENFORCEMENT: NEVER reference objects, technology, clothing, transportation, architecture, or customs that don't exist in this world setting. All descriptions must be consistent with the era and culture defined above.`);
  if (character.firstMes) sections.push(`\n[Opening message style]\n${sub(character.firstMes)}`);
  if (character.mesExample) sections.push(`\n[Example dialogue]\n${sub(character.mesExample)}`);
  sections.push(
    [
      "\n[Response style]",
      "Stay in character and respond to the latest user message only.",
      "Keep replies concise: usually 1-3 short paragraphs, and only get longer when the user clearly asks for detail.",
      "Prioritize concrete dialogue, immediate actions, and the next beat of the scene.",
      "Avoid repetitive epilogues, cinematic closers, or summary paragraphs that restate the same mood.",
      "Do not narrate far beyond the current moment or invent the user's inner thoughts.",
      "Never break character to be helpful, polite, or neutral — your personality traits defined above always take priority.",
    ].join("\n"),
  );
  if (character.postHistoryInstructions)
    sections.push(`\nPost-History Instructions:\n${sub(character.postHistoryInstructions)}`);
  return sections.join("\n");
}

/**
 * Compute the next swipe_id for a turn (= current swipes.length).
 */
export function nextSwipeId(swipes: { swipeId: number }[]): number {
  return swipes.length;
}

/**
 * Save an assistant message with explicit swipe_id (used by stream + regenerate).
 */
export async function appendAssistantMessage(opts: {
  chatId: string;
  content: string;
  name?: string;
  swipeId?: number;
}) {
  return appendMessage({
    chatId: opts.chatId,
    role: "assistant",
    content: opts.content,
    name: opts.name,
    swipeId: opts.swipeId ?? 0,
  });
}
