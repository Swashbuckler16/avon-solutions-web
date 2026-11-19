import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../lib/db.ts";
import { seed } from "../lib/seed.ts";
import {
  authenticate,
  can,
  consumeLoginAttempt,
  createSession,
  digest,
  hashPassword,
  revokeSession,
  SESSION_SECONDS,
  sessionUser,
  validOrigin,
  verifyPassword,
} from "../lib/auth-core.ts";
import { overview } from "../lib/overview.ts";

test("passwords are salted; invalid passwords and corrupt hashes fail", async () => {
  const hash = await hashPassword("test-only-password");
  assert.notEqual(hash, await hashPassword("test-only-password"));
  assert.equal(await verifyPassword("test-only-password", hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
  assert.equal(await verifyPassword("wrong", "invalid"), false);
});
test("migrations and seeding are repeatable; records and profile survive reopening", async () => {
  const directory = mkdtempSync(join(tmpdir(), "avon-test-"));
  const path = join(directory, "test.sqlite");
  let db = openDatabase(path);
  try {
    assert.equal((await seed(db)).length, 3);
    assert.equal((await seed(db)).length, 0);
    assert.equal(
      (db.prepare("SELECT count(*) n FROM orders").get() as { n: number }).n,
      48,
    );
    db.prepare("UPDATE users SET name=? WHERE id=?").run(
      "Persisted Admin",
      "admin",
    );
    db.close();
    db = openDatabase(path);
    assert.equal(
      db.prepare("SELECT name FROM users WHERE id=?").get("admin")?.name,
      "Persisted Admin",
    );
    assert.equal(
      (
        db.prepare("SELECT count(*) n FROM schema_migrations").get() as {
          n: number;
        }
      ).n,
      4,
    );
    assert.throws(() =>
      db.prepare("UPDATE users SET role='superuser' WHERE id='admin'").run(),
    );
    assert.throws(() => db.prepare("UPDATE orders SET amount_paise=-1").run());
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
test("authentication, hashed sessions, expiration and logout", async () => {
  const db = openDatabase(":memory:");
  try {
    const accounts = await seed(db);
    const admin = accounts.find((a) => a.role === "admin")!;
    assert.equal(
      (await authenticate(db, admin.email, admin.password))?.role,
      "admin",
    );
    assert.equal(await authenticate(db, admin.email, "wrong"), null);
    assert.equal(
      await authenticate(db, "nobody@avon.local", admin.password),
      null,
    );
    const token = createSession(db, "admin", 1000);
    assert.equal(
      db.prepare("SELECT token_hash FROM sessions").get()?.token_hash,
      digest(token),
    );
    assert.equal(sessionUser(db, token, 1001)?.id, "admin");
    assert.equal(
      Object.getPrototypeOf(sessionUser(db, token, 1001)),
      Object.prototype,
    );
    assert.equal(sessionUser(db, token, 1000 + SESSION_SECONDS * 1000), null);
    assert.equal(sessionUser(db, "invalid", 1001), null);
    revokeSession(db, token);
    assert.equal(sessionUser(db, token, 1001), null);
  } finally {
    db.close();
  }
});
test("role permissions and same-origin mutations are explicit", () => {
  assert.equal(can("admin", "manage_users"), true);
  assert.equal(can("operator", "operate"), true);
  assert.equal(can("operator", "manage_users"), false);
  assert.equal(can("viewer", "operate"), false);
  assert.equal(can("viewer", "view"), true);
  assert.equal(can("admin", "unknown"), false);
  assert.equal(
    validOrigin(process.env.AVON_ORIGIN || "http://127.0.0.1:3000"),
    true,
  );
  assert.equal(validOrigin("https://other.example"), false);
  assert.equal(validOrigin(null), false);
});
test("sign-in attempts are limited and reset after the window", () => {
  const db = openDatabase(":memory:");
  try {
    for (let i = 0; i < 10; i++)
      assert.equal(consumeLoginAttempt(db, "viewer@avon.local", 1000), true);
    assert.equal(consumeLoginAttempt(db, "viewer@avon.local", 1000), false);
    assert.equal(consumeLoginAttempt(db, "viewer@avon.local", 901001), true);
  } finally {
    db.close();
  }
});
test("dashboard metrics reconcile with records; literal search cannot broaden the query", async () => {
  const db = openDatabase(":memory:");
  try {
    await seed(db);
    const data = overview(db, 7);
    assert.equal(data.orders, 48);
    assert.equal(
      data.groups.reduce((n, g) => n + g.count, 0),
      data.shipments,
    );
    assert.equal(
      data.trend.reduce((n, d) => n + d.count, 0),
      data.shipments,
    );
    assert.equal(
      data.trend.reduce((n, d) => n + d.delivered, 0),
      data.delivered,
    );
    assert.equal(data.activity.length, 8);
    assert.equal(overview(db, 7, "AV-1048").matches, 1);
    assert.equal(overview(db, 7, "%").matches, 0);
    assert.equal(overview(db, 7, "' OR 1=1 --").matches, 0);
    assert.equal(
      overview(db, 7, "", new Date("2000-01-01T00:00:00Z")).orders,
      0,
    );
  } finally {
    db.close();
  }
});
