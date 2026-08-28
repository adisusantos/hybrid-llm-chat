import "server-only";
import {
  getChat,
  getChatSummary,
  getLorebookBundleForChat,
  listMemoriesForChat,
  resolveSamplerForChat,
} from "@/lib/db/queries";
import { DEFAULT_SAMPLER } from "@/lib/llama/sampler";

export const BUNDLE_VERSION = 1;
export const BUNDLE_TYPE = "llamarole.chat-bundle";

export type ChatBundle = {
  version: number;
  type: typeof BUNDLE_TYPE;
  exportedAt: string;
  character: BundleCharacter | null;
  samplerPreset: BundleSamplerPreset | null;
  lorebooks: BundleLorebook[];
  memory: BundleMemory;
  messages: BundleMessage[];
};

export type BundleCharacter = {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMes: string;
  mesExample: string;
  systemPromptOverride: string | null;
  postHistoryInstructions: string;
  appearance: string;
};

export type BundleSamplerPreset = {
  name: string;
  scope: "global" | "character" | "chat";
  config: typeof DEFAULT_SAMPLER;
};

export type BundleLorebookEntry = {
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

export type BundleLorebook = {
  name: string;
  description: string;
  scanDepth: number;
  tokenBudget: number;
  entries: BundleLorebookEntry[];
};

export type BundleMemory = {
  summary: string;
  memories: Array<{
    content: string;
    importance: number;
    isPinned: boolean;
  }>;
};

export type BundleMessage = {
  role: "user" | "assistant";
  content: string;
  name: string | null;
};

/**
 * Build a self-describing JSON bundle of a chat: character, lorebooks,
 * memories, summary, and message history. Avatar files are NOT embedded —
 * only the path is recorded; export the avatar file separately if needed.
 *
 * For MVP, only the active swipe per assistant turn is exported. Multi-swipe
 * export can be added later if needed.
 */
export async function buildChatBundle(chatId: string): Promise<ChatBundle> {
  const chat = await getChat(chatId);
  if (!chat) throw new Error("chat not found");

  const [samplerResolved, attachedLorebooks, summary, memories] = await Promise.all([
    resolveSamplerForChat(chatId),
    getLorebookBundleForChat(chatId),
    getChatSummary(chatId),
    listMemoriesForChat(chatId),
  ]);

  const character: BundleCharacter | null = {
    name: chat.character.name,
    description: chat.character.description,
    personality: chat.character.personality,
    scenario: chat.character.scenario,
    firstMes: chat.character.firstMes,
    mesExample: chat.character.mesExample,
    systemPromptOverride: chat.character.systemPromptOverride,
    postHistoryInstructions: chat.character.postHistoryInstructions,
    appearance: chat.character.appearance,
  };

  const samplerPreset: BundleSamplerPreset | null = {
    name: samplerResolved.sourcePresetName ?? "Default",
    scope: "global",
    config: samplerResolved.config,
  };

  const lorebooks: BundleLorebook[] = attachedLorebooks.map((lb) => ({
    name: lb.name,
    description: lb.description,
    scanDepth: lb.scanDepth,
    tokenBudget: lb.tokenBudget,
    entries: lb.entries.map((e) => ({
      keys: e.keys,
      secondaryKeys: e.secondaryKeys,
      content: e.content,
      comment: e.comment,
      insertionOrder: e.insertionOrder,
      enabled: e.enabled,
      caseSensitive: e.caseSensitive,
      regex: e.regex,
      constant: e.constant,
      position: e.position,
      priority: e.priority,
      selectiveLogic: e.selectiveLogic,
    })),
  }));

  // Export only the active message per turn (filter out hidden swipes and
  // assistant messages that come after a later user message).
  const messages: BundleMessage[] = [];
  for (const m of chat.messages) {
    if (m.isHidden) continue;
    if (m.role !== "user" && m.role !== "assistant") continue;
    messages.push({
      role: m.role as "user" | "assistant",
      content: m.content,
      name: m.name ?? null,
    });
  }

  return {
    version: BUNDLE_VERSION,
    type: BUNDLE_TYPE,
    exportedAt: new Date().toISOString(),
    character,
    samplerPreset,
    lorebooks,
    memory: {
      summary,
      memories: memories.map((m) => ({
        content: m.content,
        importance: m.importance,
        isPinned: m.isPinned,
      })),
    },
    messages,
  };
}
