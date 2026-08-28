import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";


const uuid = () => crypto.randomUUID();
const now = sql`(unixepoch())`;

// --- characters ---------------------------------------------------------

export const characters = sqliteTable("characters", {
  id: text("id").primaryKey().$defaultFn(uuid),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  personality: text("personality").notNull().default(""),
  scenario: text("scenario").notNull().default(""),
  firstMes: text("first_mes").notNull().default(""),
  mesExample: text("mes_example").notNull().default(""),
  systemPromptOverride: text("system_prompt_override"),
  postHistoryInstructions: text("post_history_instructions").notNull().default(""),
  appearance: text("appearance").notNull().default(""),
  avatarPath: text("avatar_path"),
  // Compact, comma-separated head/face attributes extracted from the avatar
  // by a vision model (qwen2.5vl via Ollama). Injected with top priority into
  // image-generation prompts. Null until the user runs "Analyze face".
  faceDescription: text("face_description"),
  // V3: Body attributes extracted from full-body avatar analysis.
  // Separate from faceDescription for more granular control.
  bodyDescription: text("body_description"),
  // IP-Adapter: when enabled, the avatar image itself is fed to the image generation
  // backend as a visual conditioning signal for strong face likeness.
  // Complementary to faceDescription (text). Weight ~0.5-0.9; 0.7 is the tuned default.
  useIpAdapter: integer("use_ip_adapter", { mode: "boolean" }).notNull().default(false),
  ipAdapterWeight: real("ip_adapter_weight").notNull().default(0.7),
  useFaceSwap: integer("use_face_swap", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
});

// --- chats --------------------------------------------------------------

export const chats = sqliteTable(
  "chats",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    characterId: text("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    summary: text("summary").notNull().default(""),
    samplerPresetId: text("sampler_preset_id"),
    lastSummaryMsgCount: integer("last_summary_msg_count").default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
  },
  (t) => [index("chats_character_id_idx").on(t.characterId)],
);

// --- messages -----------------------------------------------------------

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    content: text("content").notNull(),
    name: text("name"),
    swipeId: integer("swipe_id").notNull().default(0),
    isHidden: integer("is_hidden", { mode: "boolean" }).notNull().default(false),
    tokenEstimate: integer("token_estimate").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  },
  (t) => [index("messages_chat_id_created_at_idx").on(t.chatId, t.createdAt)],
);

// --- lorebooks ----------------------------------------------------------

export const lorebooks = sqliteTable("lorebooks", {
  id: text("id").primaryKey().$defaultFn(uuid),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  scanDepth: integer("scan_depth").notNull().default(5),
  tokenBudget: integer("token_budget").notNull().default(1024),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const lorebookEntries = sqliteTable(
  "lorebook_entries",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    lorebookId: text("lorebook_id")
      .notNull()
      .references(() => lorebooks.id, { onDelete: "cascade" }),
    keys: text("keys", { mode: "json" }).$type<string[]>().notNull(),
    secondaryKeys: text("secondary_keys", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    content: text("content").notNull(),
    comment: text("comment").notNull().default(""),
    insertionOrder: integer("insertion_order").notNull().default(0),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    caseSensitive: integer("case_sensitive", { mode: "boolean" }).notNull().default(false),
    regex: integer("regex", { mode: "boolean" }).notNull().default(false),
    constant: integer("constant", { mode: "boolean" }).notNull().default(false),
    position: text("position", {
      enum: [
        "before_char",
        "after_char",
        "before_system",
        "after_system",
        "before_exmpls",
      ],
    })
      .notNull()
      .default("after_char"),
    priority: integer("priority").notNull().default(100),
    selectiveLogic: text("selective_logic", { enum: ["and", "not"] })
      .notNull()
      .default("and"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  },
  (t) => [index("lorebook_entries_lorebook_priority_idx").on(t.lorebookId, t.priority)],
);

export const chatLorebooks = sqliteTable(
  "chat_lorebooks",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    lorebookId: text("lorebook_id")
      .notNull()
      .references(() => lorebooks.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.chatId, t.lorebookId] })],
);

// --- memories -----------------------------------------------------------

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey().$defaultFn(uuid),
  chatId: text("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  importance: integer("importance").notNull().default(3),
  isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

// --- sampler presets ---------------------------------------------------

export const samplerPresets = sqliteTable("sampler_presets", {
  id: text("id").primaryKey().$defaultFn(uuid),
  name: text("name").notNull(),
  scope: text("scope", { enum: ["global", "character", "chat"] })
    .notNull()
    .default("global"),
  configJson: text("config_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

// --- generated images --------------------------------------------------

export const generatedImages = sqliteTable(
  "generated_images",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    negativePrompt: text("negative_prompt").notNull().default(""),
    paramsJson: text("params_json").notNull().default("{}"),
    filePath: text("file_path").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  },
  (t) => [
    index("generated_images_chat_idx").on(t.chatId),
    index("generated_images_message_idx").on(t.messageId),
  ],
);

// --- key-value settings ------------------------------------------------

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" })
    .$type<unknown>()
    .notNull(),
});
