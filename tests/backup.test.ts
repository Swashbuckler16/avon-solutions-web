import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../lib/db.ts";
import { copyDatabase } from "../lib/backup.ts";

test("WAL backup restores records, revokes sessions, pauses schedules and never overwrites files", async () => {
  const directory = mkdtempSync(join(tmpdir(), "avon-backup-test-"));
  const source = join(directory, "source.sqlite"),
    snapshot = join(directory, "backup.sqlite"),
    restored = join(directory, "restored.sqlite");
  const db = openDatabase(source);
  try {
    db.exec(
      "INSERT INTO users(id,email,name,role,password_hash,created_at) VALUES ('u','test@example.test','Test','admin','unused',0); INSERT INTO sessions VALUES ('token','u',9999999999999)",
    );
    db.exec(
      "INSERT INTO report_definitions(id,user_id,name,filters,interval_hours,next_run) VALUES ('r','u','Report','{}',24,100)",
    );
    await copyDatabase(source, snapshot);
    await copyDatabase(snapshot, restored, true);
    const copy = new DatabaseSync(restored);
    try {
      assert.equal(copy.prepare("SELECT count(*) n FROM users").get()?.n, 1);
      assert.equal(copy.prepare("SELECT count(*) n FROM sessions").get()?.n, 0);
      assert.equal(
        copy.prepare("SELECT interval_hours FROM report_definitions").get()
          ?.interval_hours,
        0,
      );
    } finally {
      copy.close();
    }
    assert.equal(db.prepare("SELECT count(*) n FROM sessions").get()?.n, 1);
    const original = readFileSync(snapshot);
    await assert.rejects(copyDatabase(source, snapshot), /EEXIST/);
    assert.deepEqual(readFileSync(snapshot), original);
    await assert.rejects(copyDatabase(source, source), /different/);
    const invalid = join(directory, "invalid.sqlite");
    writeFileSync(invalid, "not a database");
    await assert.rejects(
      copyDatabase(invalid, join(directory, "bad-copy.sqlite")),
    );
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test(
  "POSIX snapshots retain no permissions broader than owner/source",
  { skip: process.platform === "win32" },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "avon-backup-mode-"));
    const source = join(directory, "source.sqlite"),
      target = join(directory, "private", "backup.sqlite");
    const db = openDatabase(source);
    db.close();
    try {
      chmodSync(source, 0o640);
      await copyDatabase(source, target);
      assert.equal(statSync(target).mode & 0o777, 0o600);
      assert.equal(statSync(join(directory, "private")).mode & 0o777, 0o700);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
