import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

let connection: DatabaseSync | undefined;

export function openDatabase(path: string) {
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  if (
    !db.prepare("SELECT version FROM schema_migrations WHERE version = 1").get()
  ) {
    db.exec("BEGIN IMMEDIATE");
    try {
      // Recheck under the write lock: development workers can start together.
      if (
        !db
          .prepare("SELECT version FROM schema_migrations WHERE version = 1")
          .get()
      ) {
        db.exec(readFileSync(resolve("migrations/001-foundation.sql"), "utf8"));
        db.prepare("INSERT INTO schema_migrations VALUES (1, ?)").run(
          Date.now(),
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      throw error;
    }
  }
  return db;
}

export function getDb() {
  // ponytail: one SQLite writer suits a local team; migrate to PostgreSQL if concurrent writes become a bottleneck.
  connection ??= openDatabase(process.env.AVON_DB_PATH || ".local/avon.sqlite");
  return connection;
}
