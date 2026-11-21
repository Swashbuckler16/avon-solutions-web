import { backup, DatabaseSync } from "node:sqlite";
import {
  constants,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  chmodSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

// A SQLite snapshot includes POD images and report files, which are stored as blobs.
// Publish only a checked snapshot; COPYFILE_EXCL never replaces existing data.
export async function copyDatabase(
  source: string,
  destination: string,
  restore = false,
) {
  const target = resolve(destination);
  if (resolve(source).toLowerCase() === target.toLowerCase())
    throw new Error("Source and destination must be different files.");
  const db = new DatabaseSync(resolve(source), { readOnly: true });
  let temporary: string | undefined;
  try {
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    temporary = mkdtempSync(join(dirname(target), ".avon-snapshot-"));
    const snapshot = join(temporary, "snapshot.sqlite");
    await backup(db, snapshot);
    const check = new DatabaseSync(snapshot);
    try {
      const integrity = check.prepare("PRAGMA integrity_check").all();
      if (
        integrity.length !== 1 ||
        integrity[0].integrity_check !== "ok" ||
        check.prepare("PRAGMA foreign_key_check").all().length
      )
        throw new Error("Database integrity check failed.");
      const versions = check
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all();
      if (versions.map((v) => v.version).join(",") !== "1,2,3,4,5,6,7,8")
        throw new Error(
          "Backup schema does not match this release. Use the matching source version.",
        );
      if (restore) {
        check.exec(
          "BEGIN IMMEDIATE; DELETE FROM sessions; UPDATE report_definitions SET interval_hours=0,next_run=0; COMMIT;",
        );
      }
      check.exec(
        "PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;",
      );
    } finally {
      check.close();
    }
    // The staging directory is private. Set the file mode before publishing;
    // copyFile preserves it. Windows access remains governed by folder ACLs.
    if (process.platform !== "win32")
      chmodSync(snapshot, statSync(source).mode & 0o600);
    copyFileSync(snapshot, target, constants.COPYFILE_EXCL);
    return target;
  } finally {
    db.close();
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }
}
