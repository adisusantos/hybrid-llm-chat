import "server-only";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "./client";
import {
  characters,
  chats,
  chatLorebooks,
  lorebookEntries,
  lorebooks,
  memories,
  messages,
  samplerPresets,
  settings,
} from "./schema";
import { DEFAULT_SAMPLER } from "@/lib/llama/sampler";

const DEFAULT_CHARACTER_ID = "default-aria";
const DEFAULT_PRESET_ID = "default-balanced";

export async function getOrCreateDefaultCharacter() {
  const existing = await db
    .select()
    .from(characters)
    .where(eq(characters.id, DEFAULT_CHARACTER_ID))
    .limit(1);
  if (existing[0]) return existing[0];

  const now = new Date();
  const row = {
    id: DEFAULT_CHARACTER_ID,
    name: "Aria",
    description: "A cheerful librarian in a small seaside town.",
    personality:
      "Warm, curious, slightly bookish. Speaks with gentle humor; never sarcastic or mean.",
    scenario:
      "Aria works at the lighthouse library. The {{user}} visits on a stormy evening.",
    firstMes:
      '*looks up from the front desk, rain dripping from the visitor\'s coat* "Welcome to the lighthouse library! You look soaked — come in, come in. I was just cataloguing some new arrivals."',
    mesExample:
      "{{user}}: What do you recommend?\nAria: *leans over the counter with a conspiratorial grin* \"Depends on your mood. Mystery? Romance?\"",
    postHistoryInstructions:
      "Stay in character. Use *asterisk actions* and \"spoken dialogue\". Avoid breaking the fourth wall.",
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(characters).values(row);
  const inserted = await db
    .select()
    .from(characters)
    .where(eq(characters.id, DEFAULT_CHARACTER_ID))
    .limit(1);
  return inserted[0]!;
}

export async function getOrCreateDefaultPreset() {
  const existing = await db
    .select()
    .from(samplerPresets)
    .where(eq(samplerPresets.id, DEFAULT_PRESET_ID))
    .limit(1);
  if (existing[0]) return existing[0];

  const now = new Date();
  await db.insert(samplerPresets).values({
    id: DEFAULT_PRESET_ID,
    name: "Balanced",
    scope: "global",
    configJson: JSON.stringify(DEFAULT_SAMPLER),
    createdAt: now,
  });
  const inserted = await db
    .select()
    .from(samplerPresets)
    .where(eq(samplerPresets.id, DEFAULT_PRESET_ID))
    .limit(1);
  return inserted[0]!;
}

export async function listChats() {
  const rows = await db
    .select({
      id: chats.id,
      title: chats.title,
      characterId: chats.characterId,
      characterName: characters.name,
      samplerPresetId: chats.samplerPresetId,
      updatedAt: chats.updatedAt,
      createdAt: chats.createdAt,
    })
    .from(chats)
    .innerJoin(characters, eq(chats.characterId, characters.id))
    .orderBy(desc(chats.updatedAt));

  const counts = new Map<string, number>();
  if (rows.length > 0) {
    const all = await db
      .select({ chatId: messages.chatId })
      .from(messages)
      .where(eq(messages.isHidden, false));
    for (const m of all) {
      counts.set(m.chatId, (counts.get(m.chatId) ?? 0) + 1);
    }
  }

  return rows.map((row) => ({
    ...row,
    messageCount: counts.get(row.id) ?? 0,
  }));
}

export type ChatWithMessages = Awaited<ReturnType<typeof getChat>>;

export async function getChat(id: string) {
  const rows = await db
    .select({
      chat: chats,
      character: characters,
    })
    .from(chats)
    .innerJoin(characters, eq(chats.characterId, characters.id))
    .where(eq(chats.id, id))
    .limit(1);

  const found = rows[0];
  if (!found) return null;

  const msgs = await db
    .select()
    .from(messages)
    .where(and(eq(messages.chatId, id), eq(messages.isHidden, false)))
    .orderBy(asc(messages.createdAt), asc(messages.swipeId));

  return {
    ...found.chat,
    character: found.character,
    messages: msgs,
  };
}

export async function createChat(opts?: {
  characterId?: string;
  title?: string;
  samplerPresetId?: string | null;
}) {
  const character =
    (opts?.characterId
      ? (
          await db
            .select()
            .from(characters)
            .where(eq(characters.id, opts.characterId))
            .limit(1)
        )[0]
      : null) ?? (await getOrCreateDefaultCharacter());

  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(chats).values({
    id,
    characterId: character.id,
    title: opts?.title ?? "",
    summary: "",
    samplerPresetId: opts?.samplerPresetId ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function deleteChat(id: string) {
  await db.delete(chats).where(eq(chats.id, id));
}

export async function touchChat(id: string) {
  await db
    .update(chats)
    .set({ updatedAt: new Date() })
    .where(eq(chats.id, id));
}

export async function setChatSamplerPreset(
  chatId: string,
  presetId: string | null,
) {
  await db
    .update(chats)
    .set({ samplerPresetId: presetId, updatedAt: new Date() })
    .where(eq(chats.id, chatId));
}

export async function appendMessage(opts: {
  chatId: string;
  role: "user" | "assistant" | "system";
  content: string;
  name?: string;
  swipeId?: number;
  tokenEstimate?: number;
}) {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(messages).values({
    id,
    chatId: opts.chatId,
    role: opts.role,
    content: opts.content,
    name: opts.name ?? null,
    swipeId: opts.swipeId ?? 0,
    isHidden: false,
    tokenEstimate: opts.tokenEstimate ?? 0,
    createdAt: now,
  });
  await touchChat(opts.chatId);
  return id;
}

export function defaultSamplerJson() {
  return JSON.stringify(DEFAULT_SAMPLER);
}

// --- Sampler presets ----------------------------------------------------

export type SamplerPresetRow = Awaited<ReturnType<typeof getSamplerPreset>>;

export async function listSamplerPresets() {
  // Always make sure the default preset exists; otherwise the UI can render
  // an empty list when the user has never created a chat (which is the only
  // other path that triggers the seed).
  await getOrCreateDefaultPreset();
  return db.select().from(samplerPresets).orderBy(asc(samplerPresets.name));
}

export async function getSamplerPreset(id: string) {
  const rows = await db
    .select()
    .from(samplerPresets)
    .where(eq(samplerPresets.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Look up an existing sampler preset by (name, scope, configJson).
 * Used by import to avoid creating duplicates when a bundle's preset
 * already exists in the DB. Configs are compared as their canonical
 * JSON string, so whitespace/key-order differences are tolerated.
 */
export async function getSamplerPresetByMatch(opts: {
  name: string;
  scope: "global" | "character" | "chat";
  configJson: string;
}) {
  const rows = await db
    .select()
    .from(samplerPresets)
    .where(
      and(
        eq(samplerPresets.name, opts.name),
        eq(samplerPresets.scope, opts.scope),
        eq(samplerPresets.configJson, opts.configJson),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function createSamplerPreset(opts: {
  id?: string;
  name: string;
  scope?: "global" | "character" | "chat";
  configJson: string;
}) {
  const id = opts.id ?? crypto.randomUUID();
  const now = new Date();
  await db.insert(samplerPresets).values({
    id,
    name: opts.name,
    scope: opts.scope ?? "global",
    configJson: opts.configJson,
    createdAt: now,
  });
  return id;
}

export async function updateSamplerPreset(
  id: string,
  opts: { name?: string; configJson?: string; scope?: "global" | "character" | "chat" },
) {
  const updates: Record<string, unknown> = {};
  if (opts.name !== undefined) updates.name = opts.name;
  if (opts.configJson !== undefined) updates.configJson = opts.configJson;
  if (opts.scope !== undefined) updates.scope = opts.scope;
  if (Object.keys(updates).length === 0) return;
  await db.update(samplerPresets).set(updates).where(eq(samplerPresets.id, id));
}

export async function deleteSamplerPreset(id: string) {
  // If a chat references this preset, drop the reference first.
  await db.update(chats).set({ samplerPresetId: null }).where(eq(chats.samplerPresetId, id));
  await db.delete(samplerPresets).where(eq(samplerPresets.id, id));
}

/**
 * Resolve the effective sampler config for a chat.
 * Cascade: chat.preset → default preset → built-in defaults.
 * Returns the resolved config plus the name of the source preset (for UI display).
 */
export async function resolveSamplerForChat(chatId: string): Promise<{
  config: typeof DEFAULT_SAMPLER;
  sourcePresetId: string | null;
  sourcePresetName: string | null;
}> {
  const chatRows = await db
    .select({ samplerPresetId: chats.samplerPresetId })
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(1);
  const chat = chatRows[0];

  // Try chat-specific preset first.
  if (chat?.samplerPresetId) {
    const preset = await getSamplerPreset(chat.samplerPresetId);
    if (preset) {
      try {
        return {
          config: { ...DEFAULT_SAMPLER, ...JSON.parse(preset.configJson) },
          sourcePresetId: preset.id,
          sourcePresetName: preset.name,
        };
      } catch {
        // fall through to defaults
      }
    }
  }

  // Then default preset.
  const def = await getOrCreateDefaultPreset();
  try {
    return {
      config: { ...DEFAULT_SAMPLER, ...JSON.parse(def.configJson) },
      sourcePresetId: def.id,
      sourcePresetName: def.name,
    };
  } catch {
    return {
      config: DEFAULT_SAMPLER,
      sourcePresetId: null,
      sourcePresetName: null,
    };
  }
}

// --- Generated images --------------------------------------------------

import { generatedImages } from "./schema";
import { saveImage, deleteImageFile } from "@/lib/images/storage";

export async function createGeneratedImage(opts: {
  chatId: string;
  messageId: string;
  prompt: string;
  negativePrompt: string;
  params: Record<string, unknown>;
  imageBuffer: Buffer;
  width: number;
  height: number;
  contentType?: string;
}) {
  const id = crypto.randomUUID();
  const ext = opts.contentType?.includes("jpeg") ? "jpg" : "png";
  const filename = `${id}.${ext}`;
  const stored = await saveImage({
    chatId: opts.chatId,
    filename,
    buffer: opts.imageBuffer,
  });
  await db.insert(generatedImages).values({
    id,
    chatId: opts.chatId,
    messageId: opts.messageId,
    prompt: opts.prompt,
    negativePrompt: opts.negativePrompt,
    paramsJson: JSON.stringify(opts.params),
    filePath: stored.relPath,
    width: opts.width,
    height: opts.height,
    createdAt: new Date(),
  });
  return { id, relPath: stored.relPath };
}

export async function getGeneratedImage(id: string) {
  const rows = await db
    .select()
    .from(generatedImages)
    .where(eq(generatedImages.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listGeneratedImagesForMessage(messageId: string) {
  return db
    .select()
    .from(generatedImages)
    .where(eq(generatedImages.messageId, messageId))
    .orderBy(desc(generatedImages.createdAt));
}

export async function deleteGeneratedImage(id: string) {
  const row = await getGeneratedImage(id);
  if (!row) return;
  await db.delete(generatedImages).where(eq(generatedImages.id, id));
  await deleteImageFile(row.filePath);
}

/** Load all images for a chat, keyed by message_id, newest first. */
export async function getImagesForChat(
  chatId: string,
): Promise<Map<string, Array<{ id: string; filePath: string; width: number; height: number; prompt: string; createdAt: Date; paramsJson: string | null }>>> {
  const rows = await db
    .select()
    .from(generatedImages)
    .where(eq(generatedImages.chatId, chatId))
    .orderBy(desc(generatedImages.createdAt));
  const byMsg = new Map<
    string,
    Array<{ id: string; filePath: string; width: number; height: number; prompt: string; createdAt: Date; paramsJson: string | null }>
  >();
  for (const r of rows) {
    const arr = byMsg.get(r.messageId) ?? [];
    arr.push({
      id: r.id,
      filePath: r.filePath,
      width: r.width,
      height: r.height,
      prompt: r.prompt,
      createdAt: r.createdAt,
      paramsJson: r.paramsJson,
    });
    byMsg.set(r.messageId, arr);
  }
  return byMsg;
}

// --- Lorebooks ----------------------------------------------------------

export async function listLorebooks() {
  return db.select().from(lorebooks).orderBy(asc(lorebooks.name));
}

export async function getLorebook(id: string) {
  const rows = await db.select().from(lorebooks).where(eq(lorebooks.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getLorebookWithEntries(id: string) {
  const lb = await getLorebook(id);
  if (!lb) return null;
  const entries = await db
    .select()
    .from(lorebookEntries)
    .where(eq(lorebookEntries.lorebookId, id))
    .orderBy(desc(lorebookEntries.priority), asc(lorebookEntries.insertionOrder));
  return { ...lb, entries };
}

export async function createLorebook(opts: {
  id?: string;
  name: string;
  description?: string;
  scanDepth?: number;
  tokenBudget?: number;
}) {
  const id = opts.id ?? crypto.randomUUID();
  const now = new Date();
  await db.insert(lorebooks).values({
    id,
    name: opts.name,
    description: opts.description ?? "",
    scanDepth: opts.scanDepth ?? 5,
    tokenBudget: opts.tokenBudget ?? 1024,
    createdAt: now,
  });
  return id;
}

export async function updateLorebook(
  id: string,
  opts: {
    name?: string;
    description?: string;
    scanDepth?: number;
    tokenBudget?: number;
  },
) {
  const updates: Record<string, unknown> = {};
  if (opts.name !== undefined) updates.name = opts.name;
  if (opts.description !== undefined) updates.description = opts.description;
  if (opts.scanDepth !== undefined) updates.scanDepth = opts.scanDepth;
  if (opts.tokenBudget !== undefined) updates.tokenBudget = opts.tokenBudget;
  if (Object.keys(updates).length === 0) return;
  await db.update(lorebooks).set(updates).where(eq(lorebooks.id, id));
}

export async function deleteLorebook(id: string) {
  // FK cascade on lorebook_entries; chat_lorebooks we clean up explicitly
  // (no FK cascade configured there for safety).
  await db.delete(chatLorebooks).where(eq(chatLorebooks.lorebookId, id));
  await db.delete(lorebookEntries).where(eq(lorebookEntries.lorebookId, id));
  await db.delete(lorebooks).where(eq(lorebooks.id, id));
}

// --- Lorebook entries ---------------------------------------------------

export async function listLorebookEntries(lorebookId: string) {
  return db
    .select()
    .from(lorebookEntries)
    .where(eq(lorebookEntries.lorebookId, lorebookId))
    .orderBy(desc(lorebookEntries.priority), asc(lorebookEntries.insertionOrder));
}

export async function getLorebookEntry(lorebookId: string, entryId: string) {
  const rows = await db
    .select()
    .from(lorebookEntries)
    .where(
      and(
        eq(lorebookEntries.id, entryId),
        eq(lorebookEntries.lorebookId, lorebookId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export type LorebookEntryPayload = {
  keys: string[];
  secondaryKeys?: string[];
  content: string;
  comment?: string;
  insertionOrder?: number;
  enabled?: boolean;
  caseSensitive?: boolean;
  regex?: boolean;
  constant?: boolean;
  position?: "before_char" | "after_char" | "before_system" | "after_system" | "before_exmpls";
  priority?: number;
  selectiveLogic?: "and" | "not";
};

export async function createLorebookEntry(
  lorebookId: string,
  payload: LorebookEntryPayload,
) {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(lorebookEntries).values({
    id,
    lorebookId,
    keys: payload.keys,
    secondaryKeys: payload.secondaryKeys ?? [],
    content: payload.content,
    comment: payload.comment ?? "",
    insertionOrder: payload.insertionOrder ?? 0,
    enabled: payload.enabled ?? true,
    caseSensitive: payload.caseSensitive ?? false,
    regex: payload.regex ?? false,
    constant: payload.constant ?? false,
    position: payload.position ?? "after_char",
    priority: payload.priority ?? 100,
    selectiveLogic: payload.selectiveLogic ?? "and",
    createdAt: now,
  });
  return id;
}

export async function updateLorebookEntry(
  lorebookId: string,
  entryId: string,
  payload: LorebookEntryPayload,
) {
  const updates: Record<string, unknown> = {
    keys: payload.keys,
    secondaryKeys: payload.secondaryKeys ?? [],
    content: payload.content,
    comment: payload.comment ?? "",
    insertionOrder: payload.insertionOrder ?? 0,
    enabled: payload.enabled ?? true,
    caseSensitive: payload.caseSensitive ?? false,
    regex: payload.regex ?? false,
    constant: payload.constant ?? false,
    position: payload.position ?? "after_char",
    priority: payload.priority ?? 100,
    selectiveLogic: payload.selectiveLogic ?? "and",
  };
  await db
    .update(lorebookEntries)
    .set(updates)
    .where(
      and(
        eq(lorebookEntries.id, entryId),
        eq(lorebookEntries.lorebookId, lorebookId),
      ),
    );
}

export async function deleteLorebookEntry(lorebookId: string, entryId: string) {
  await db
    .delete(lorebookEntries)
    .where(
      and(
        eq(lorebookEntries.id, entryId),
        eq(lorebookEntries.lorebookId, lorebookId),
      ),
    );
}

// --- Memories -----------------------------------------------------------

export async function listMemoriesForChat(chatId: string) {
  return db
    .select()
    .from(memories)
    .where(eq(memories.chatId, chatId))
    .orderBy(desc(memories.isPinned), desc(memories.importance), desc(memories.createdAt));
}

export async function addMemory(opts: {
  chatId: string;
  content: string;
  importance: number;
  isPinned?: boolean;
}) {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(memories).values({
    id,
    chatId: opts.chatId,
    content: opts.content,
    importance: Math.max(1, Math.min(5, Math.round(opts.importance))),
    isPinned: opts.isPinned ?? false,
    createdAt: now,
  });
  await touchChat(opts.chatId);
  return id;
}

export async function hasMemoryWithContent(chatId: string, content: string): Promise<boolean> {
  const rows = await db
    .select({ id: memories.id })
    .from(memories)
    .where(and(eq(memories.chatId, chatId), eq(memories.content, content)))
    .limit(1);
  return rows.length > 0;
}

export async function updateMemory(
  chatId: string,
  memoryId: string,
  opts: { content?: string; importance?: number; isPinned?: boolean },
) {
  const updates: Record<string, unknown> = {};
  if (opts.content !== undefined) updates.content = opts.content;
  if (opts.importance !== undefined) {
    updates.importance = Math.max(1, Math.min(5, Math.round(opts.importance)));
  }
  if (opts.isPinned !== undefined) updates.isPinned = opts.isPinned;
  if (Object.keys(updates).length === 0) return;
  await db
    .update(memories)
    .set(updates)
    .where(and(eq(memories.id, memoryId), eq(memories.chatId, chatId)));
}

export async function deleteMemory(chatId: string, memoryId: string) {
  await db
    .delete(memories)
    .where(and(eq(memories.id, memoryId), eq(memories.chatId, chatId)));
}

export async function getChatSummary(chatId: string): Promise<string> {
  const rows = await db
    .select({ summary: chats.summary })
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(1);
  return rows[0]?.summary ?? "";
}

export async function setChatSummary(chatId: string, summary: string) {
  await db
    .update(chats)
    .set({ summary, updatedAt: new Date() })
    .where(eq(chats.id, chatId));
}

export async function getChatSummaryWatermark(chatId: string): Promise<number> {
  const rows = await db
    .select({ count: chats.lastSummaryMsgCount })
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(1);
  return rows[0]?.count ?? 0;
}

export async function setChatSummaryWatermark(chatId: string, msgCount: number) {
  await db
    .update(chats)
    .set({ lastSummaryMsgCount: msgCount, updatedAt: new Date() })
    .where(eq(chats.id, chatId));
}

// --- Settings (key-value JSON) -----------------------------------------

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return (rows[0]?.value as T | undefined) ?? null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value: value as never })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: value as never },
    });
}

// --- Swipes / regenerate -------------------------------------------------

/**
 * Return the id of the last user message in the chat, or null if there are
 * no user messages. Used as the boundary that defines "the latest turn".
 */
export async function getLastUserMessageId(chatId: string): Promise<string | null> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.role, "user")))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Update the content of a user message. Only updates messages that belong to
 * the given chat and have role "user" (editing assistant/system messages is
 * not allowed). Returns true if a row was updated.
 */
export async function updateUserMessageContent(
  chatId: string,
  messageId: string,
  content: string,
): Promise<boolean> {
  const result = await db
    .update(messages)
    .set({ content })
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.chatId, chatId),
        eq(messages.role, "user"),
      ),
    );
  return result.changes > 0;
}

/**
 * List all assistant swipes for a given user message (the "turn").
 * Sorted by swipe_id ascending. Includes hidden swipes.
 */
export async function listSwipesForTurn(
  chatId: string,
  userMessageId: string,
) {
  const userRow = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(eq(messages.id, userMessageId))
    .limit(1);
  const userTs = userRow[0]?.createdAt;
  if (!userTs) return [];

  return db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.chatId, chatId),
        eq(messages.role, "assistant"),
        gte(messages.createdAt, userTs),
      ),
    )
    .orderBy(asc(messages.swipeId), asc(messages.createdAt));
}

/**
 * Hide every swipe in a turn except the given target swipeId.
 * Returns the count of rows touched.
 */
export async function setActiveSwipe(
  chatId: string,
  userMessageId: string,
  targetSwipeId: string,
): Promise<number> {
  const swipes = await listSwipesForTurn(chatId, userMessageId);
  if (swipes.length === 0) return 0;
  const target = swipes.find((s) => s.id === targetSwipeId);
  if (!target) return 0;

  for (const s of swipes) {
    await db
      .update(messages)
      .set({ isHidden: s.id !== target.id })
      .where(eq(messages.id, s.id));
  }
  await touchChat(chatId);
  return swipes.length;
}

/**
 * Hide every swipe in the latest turn. Used by regenerate to "soft-delete"
 * the previous active response before the new one comes in.
 */
export async function hideAllSwipesForTurn(
  chatId: string,
  userMessageId: string,
): Promise<void> {
  const swipes = await listSwipesForTurn(chatId, userMessageId);
  for (const s of swipes) {
    await db.update(messages).set({ isHidden: true }).where(eq(messages.id, s.id));
  }
}

/**
 * Hard-delete the latest turn (the most recent user message + every assistant
 * swipe that was generated for it, including hidden ones). Also removes any
 * generated images attached to those messages (both DB rows and files on disk).
 *
 * Used by the "rewind / undo last turn" UI button. Returns the IDs that were
 * removed, in case the caller wants to log or surface them.
 *
 * Throws if there is no user message to delete.
 */
export async function deleteLastTurn(chatId: string): Promise<{
  deletedUserId: string;
  deletedAssistantIds: string[];
  deletedImageIds: string[];
}> {
  const userId = await getLastUserMessageId(chatId);
  if (!userId) {
    throw new Error("no user message to delete");
  }

  const swipes = await listSwipesForTurn(chatId, userId);
  const assistantIds = swipes.map((s) => s.id);
  const allMessageIds = [userId, ...assistantIds];

  // Clean up generated images first: list them, delete files, then delete rows.
  // We do this before deleting the messages themselves so the FK (if any) is
  // still resolvable.
  const images = await db
    .select()
    .from(generatedImages)
    .where(inArray(generatedImages.messageId, allMessageIds));
  const deletedImageIds: string[] = [];
  for (const img of images) {
    await deleteImageFile(img.filePath);
    await db.delete(generatedImages).where(eq(generatedImages.id, img.id));
    deletedImageIds.push(img.id);
  }

  // Delete the assistant swipes first (no FK, but be explicit about order).
  if (assistantIds.length > 0) {
    await db.delete(messages).where(inArray(messages.id, assistantIds));
  }
  // Then the user message.
  await db.delete(messages).where(eq(messages.id, userId));

  await touchChat(chatId);

  return {
    deletedUserId: userId,
    deletedAssistantIds: assistantIds,
    deletedImageIds,
  };
}

// --- Chat ↔ Lorebook attachment -----------------------------------------

export async function listLorebooksForChat(chatId: string) {
  return db
    .select({
      id: lorebooks.id,
      name: lorebooks.name,
      description: lorebooks.description,
      scanDepth: lorebooks.scanDepth,
      tokenBudget: lorebooks.tokenBudget,
      createdAt: lorebooks.createdAt,
    })
    .from(chatLorebooks)
    .innerJoin(lorebooks, eq(chatLorebooks.lorebookId, lorebooks.id))
    .where(eq(chatLorebooks.chatId, chatId));
}

export async function attachLorebookToChat(chatId: string, lorebookId: string) {
  // Validate both exist (FK would also catch this but gives a friendlier error).
  const lb = await getLorebook(lorebookId);
  if (!lb) throw new Error("lorebook not found");
  await db
    .insert(chatLorebooks)
    .values({ chatId, lorebookId })
    .onConflictDoNothing();
}

export async function detachLorebookFromChat(chatId: string, lorebookId: string) {
  await db
    .delete(chatLorebooks)
    .where(
      and(eq(chatLorebooks.chatId, chatId), eq(chatLorebooks.lorebookId, lorebookId)),
    );
}

/**
 * Load every lorebook attached to a chat, with all its enabled entries.
 * Used by the prompt builder to inject world info into the system prompt.
 */
export async function getLorebookBundleForChat(chatId: string) {
  const attached = await db
    .select({
      lorebookId: chatLorebooks.lorebookId,
      name: lorebooks.name,
      description: lorebooks.description,
      scanDepth: lorebooks.scanDepth,
      tokenBudget: lorebooks.tokenBudget,
    })
    .from(chatLorebooks)
    .innerJoin(lorebooks, eq(chatLorebooks.lorebookId, lorebooks.id))
    .where(eq(chatLorebooks.chatId, chatId));

  if (attached.length === 0) return [];

  const lbIds = attached.map((a) => a.lorebookId);
  const allEntries = await db
    .select()
    .from(lorebookEntries)
    .where(inArray(lorebookEntries.lorebookId, lbIds))
    .orderBy(desc(lorebookEntries.priority), asc(lorebookEntries.insertionOrder));

  return attached.map((lb) => ({
    id: lb.lorebookId,
    name: lb.name,
    description: lb.description,
    scanDepth: lb.scanDepth,
    tokenBudget: lb.tokenBudget,
    entries: allEntries.filter((e) => e.lorebookId === lb.lorebookId),
  }));
}
