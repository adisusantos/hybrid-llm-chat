import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const dbPath = path.join(process.cwd(), "data", "roleplay.db");
if (!fs.existsSync(dbPath)) {
  console.error(`db not found at ${dbPath}; run \`pnpm db:migrate\` first`);
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const DEFAULT_CHAR_ID = "default-aria";

const existingChar = db
  .prepare("SELECT id FROM characters WHERE id = ?")
  .get(DEFAULT_CHAR_ID) as { id: string } | undefined;

if (!existingChar) {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO characters (id, name, description, personality, scenario, first_mes, mes_example, post_history_instructions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    DEFAULT_CHAR_ID,
    "Aria",
    "A cheerful librarian in a small seaside town.",
    "Warm, curious, slightly bookish. Speaks with gentle humor; never sarcastic or mean.",
    "Aria works at the lighthouse library. The {{user}} visits on a stormy evening.",
    '*looks up from the front desk, rain dripping from the visitor\'s coat* "Welcome to the lighthouse library! You look soaked — come in, come in. I was just cataloguing some new arrivals."',
    '{{user}}: What do you recommend?\nAria: *leans over the counter with a conspiratorial grin* "Depends on your mood. Mystery? Romance?"',
    'Stay in character. Use *asterisk actions* and "spoken dialogue".',
    now,
    now,
  );
  console.log("seeded default character:", DEFAULT_CHAR_ID);
}

const chatId = process.argv[2] ?? crypto.randomUUID();
const existingChat = db.prepare("SELECT id FROM chats WHERE id = ?").get(chatId) as
  | { id: string }
  | undefined;

if (!existingChat) {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO chats (id, character_id, title, summary, sampler_preset_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(chatId, DEFAULT_CHAR_ID, "Test chat", "", null, now, now);
  console.log("seeded chat:", chatId);
} else {
  console.log("chat already exists:", chatId);
}

console.log("CHAT_ID=" + chatId);
db.close();
