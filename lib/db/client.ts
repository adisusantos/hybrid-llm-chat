import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import * as schema from "./schema";

const DB_PATH = process.env.LLAMAROLE_DB ?? path.join(process.cwd(), "data", "roleplay.db");

declare global {
  var __llamaroleSqlite: Database.Database | undefined;
}

const sqlite =
  globalThis.__llamaroleSqlite ??
  (() => {
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    return db;
  })();

if (process.env.NODE_ENV !== "production") {
  globalThis.__llamaroleSqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { schema };
