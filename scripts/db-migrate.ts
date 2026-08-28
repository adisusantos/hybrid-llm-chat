import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const dbPath = process.env.LLAMAROLE_DB ?? path.join(process.cwd(), "data", "roleplay.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite);

console.log(`[migrate] db: ${dbPath}`);
console.log(`[migrate] migrations: ./lib/db/migrations`);

migrate(db, { migrationsFolder: "./lib/db/migrations" });

console.log("[migrate] done");
sqlite.close();
