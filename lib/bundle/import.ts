import "server-only";
import { z } from "zod";
import {
  addMemory,
  appendMessage,
  attachLorebookToChat,
  createChat,
  createLorebook,
  createLorebookEntry,
  getSamplerPresetByMatch,
  setChatSummary,
} from "@/lib/db/queries";
import { BUNDLE_TYPE, BUNDLE_VERSION } from "./export";

const PositionSchema = z.enum([
  "before_char",
  "after_char",
  "before_system",
  "after_system",
  "before_exmpls",
]);

const BundleCharacterSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  personality: z.string().default(""),
  scenario: z.string().default(""),
  worldSetting: z.string().default(""),
  firstMes: z.string().default(""),
  mesExample: z.string().default(""),
  systemPromptOverride: z.string().nullable().optional(),
  postHistoryInstructions: z.string().default(""),
  appearance: z.string().default(""),
});

const BundleSamplerConfigSchema = z.object({
  temperature: z.number().default(0.8),
  top_p: z.number().default(0.95),
  top_k: z.number().int().default(40),
  min_p: z.number().default(0.05),
  repeat_penalty: z.number().default(1.0),
  repeat_last_n: z.number().int().default(64),
  dry_multiplier: z.number().default(0),
  dry_base: z.number().default(1.75),
  dry_allowed_length: z.number().int().default(2),
  max_tokens: z.number().int().default(512),
});

const BundleSamplerPresetSchema = z.object({
  name: z.string().default("Imported"),
  scope: z.enum(["global", "character", "chat"]).default("global"),
  config: BundleSamplerConfigSchema,
});

const BundleEntrySchema = z.object({
  keys: z.array(z.string()).default([]),
  secondaryKeys: z.array(z.string()).default([]),
  content: z.string().default(""),
  comment: z.string().default(""),
  insertionOrder: z.number().int().default(0),
  enabled: z.boolean().default(true),
  caseSensitive: z.boolean().default(false),
  regex: z.boolean().default(false),
  constant: z.boolean().default(false),
  position: PositionSchema.default("after_char"),
  priority: z.number().int().default(100),
  selectiveLogic: z.enum(["and", "not"]).default("and"),
});

const BundleLorebookSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  scanDepth: z.number().int().min(1).max(50).default(5),
  tokenBudget: z.number().int().min(64).max(16384).default(1024),
  entries: z.array(BundleEntrySchema).default([]),
});

const BundleMemorySchema = z.object({
  summary: z.string().default(""),
  memories: z
    .array(
      z.object({
        content: z.string().min(1),
        importance: z.number().int().min(1).max(5).default(3),
        isPinned: z.boolean().default(false),
      }),
    )
    .default([]),
});

const BundleMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  name: z.string().nullable().optional(),
});

export const ChatBundleSchema = z.object({
  version: z.number().int(),
  type: z.string(),
  exportedAt: z.string().optional(),
  character: BundleCharacterSchema.nullable().optional(),
  samplerPreset: BundleSamplerPresetSchema.nullable().optional(),
  lorebooks: z.array(BundleLorebookSchema).default([]),
  memory: BundleMemorySchema.default({ summary: "", memories: [] }),
  messages: z.array(BundleMessageSchema).default([]),
});

export type ParsedBundle = z.infer<typeof ChatBundleSchema>;

export type ImportResult = {
  characterId: string;
  chatId: string;
  samplerPresetId: string | null;
  lorebookIds: string[];
  memoriesAdded: number;
  messagesImported: number;
};

export class BundleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleValidationError";
  }
}

export async function importChatBundle(
  rawBundle: unknown,
  opts?: { title?: string },
): Promise<ImportResult> {
  const parsed = ChatBundleSchema.safeParse(rawBundle);
  if (!parsed.success) {
    throw new BundleValidationError(
      `Invalid bundle: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  const bundle = parsed.data;

  if (bundle.type !== BUNDLE_TYPE) {
    throw new BundleValidationError(
      `Not a chat bundle (type=${bundle.type}, expected ${BUNDLE_TYPE})`,
    );
  }
  if (bundle.version > BUNDLE_VERSION) {
    throw new BundleValidationError(
      `Bundle version ${bundle.version} is newer than supported (${BUNDLE_VERSION})`,
    );
  }

  // 1. Character (always create new with fresh UUID).
  let characterId: string;
  if (bundle.character) {
    const id = crypto.randomUUID();
    const now = new Date();
    const c = bundle.character;
    await import("@/lib/db/client").then(async ({ db }) => {
      const { characters } = await import("@/lib/db/schema");
      await db.insert(characters).values({
        id,
        name: c.name,
        description: c.description,
        personality: c.personality,
        scenario: c.scenario,
        worldSetting: c.worldSetting,
        firstMes: c.firstMes,
        mesExample: c.mesExample,
        systemPromptOverride: c.systemPromptOverride ?? null,
        postHistoryInstructions: c.postHistoryInstructions,
        appearance: c.appearance,
        avatarPath: null,
        createdAt: now,
        updatedAt: now,
      });
    });
    characterId = id;
  } else {
    // Fallback: use the default Aria
    characterId = "default-aria";
    // Make sure default exists
    await import("@/lib/db/queries").then(async (q) => {
      await q.getOrCreateDefaultCharacter();
    });
  }

  // 2. Sampler preset — idempotent: reuse existing preset if name+scope+config
  //    match, else create new. Prevents duplicates when re-importing a bundle
  //    whose original preset was the system default.
  let samplerPresetId: string | null = null;
  if (bundle.samplerPreset) {
    const configJson = JSON.stringify(bundle.samplerPreset.config);
    const existing = await getSamplerPresetByMatch({
      name: bundle.samplerPreset.name,
      scope: bundle.samplerPreset.scope,
      configJson,
    });
    if (existing) {
      samplerPresetId = existing.id;
    } else {
      const presetId = crypto.randomUUID();
      const { db } = await import("@/lib/db/client");
      const { samplerPresets } = await import("@/lib/db/schema");
      await db.insert(samplerPresets).values({
        id: presetId,
        name: bundle.samplerPreset!.name,
        scope: bundle.samplerPreset!.scope,
        configJson,
        createdAt: new Date(),
      });
      samplerPresetId = presetId;
    }
  }

  // 3. Lorebooks — create each, attach to the chat.
  const lorebookIds: string[] = [];
  // We need the chatId to attach — so create chat first.
  const chatId = await createChat({
    characterId,
    title: opts?.title,
    samplerPresetId,
  });

  for (const lb of bundle.lorebooks) {
    const lbId = await createLorebook({
      name: lb.name,
      description: lb.description,
      scanDepth: lb.scanDepth,
      tokenBudget: lb.tokenBudget,
    });
    lorebookIds.push(lbId);
    for (const entry of lb.entries) {
      await createLorebookEntry(lbId, {
        keys: entry.keys,
        secondaryKeys: entry.secondaryKeys,
        content: entry.content,
        comment: entry.comment,
        insertionOrder: entry.insertionOrder,
        enabled: entry.enabled,
        caseSensitive: entry.caseSensitive,
        regex: entry.regex,
        constant: entry.constant,
        position: entry.position,
        priority: entry.priority,
        selectiveLogic: entry.selectiveLogic,
      });
    }
    await attachLorebookToChat(chatId, lbId);
  }

  // 4. Summary + memories.
  if (bundle.memory?.summary) {
    await setChatSummary(chatId, bundle.memory.summary);
  }
  let memoriesAdded = 0;
  for (const m of bundle.memory?.memories ?? []) {
    await addMemory({
      chatId,
      content: m.content,
      importance: m.importance,
      isPinned: m.isPinned,
    });
    memoriesAdded += 1;
  }

  // 5. Messages — insert in order; assistant messages start at swipe_id=0.
  // We don't preserve multi-swipe history in MVP; only the active stream.
  let lastRole: "user" | "assistant" | null = null;
  let messagesImported = 0;
  for (const m of bundle.messages) {
    // Skip leading assistant messages with no preceding user — we don't
    // import orphan greetings.
    if (lastRole === null && m.role !== "user") continue;
    // Don't allow two user messages in a row (would be malformed).
    if (lastRole === "user" && m.role === "user") continue;
    // Don't allow two assistant messages in a row either.
    if (lastRole === "assistant" && m.role === "assistant") continue;

    await appendMessage({
      chatId,
      role: m.role,
      content: m.content,
      name: m.name ?? (m.role === "user" ? "User" : characterId === "default-aria" ? "Aria" : undefined),
    });
    messagesImported += 1;
    lastRole = m.role;
  }

  return {
    characterId,
    chatId,
    samplerPresetId,
    lorebookIds,
    memoriesAdded,
    messagesImported,
  };
}
