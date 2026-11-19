import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { DatabaseSync } from "node:sqlite";

const derive = promisify(scrypt);
export const SESSION_SECONDS = 8 * 60 * 60;
export type Role = "admin" | "operator" | "viewer";
export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  customer_id?: string | null;
};
export const permissions = {
  admin: ["view", "manage_users", "manage_settings", "operate"],
  operator: ["view", "operate"],
  viewer: ["view"],
} as const;
export function can(role: Role, permission: string) {
  return (permissions[role] as readonly string[]).includes(permission);
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await derive(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored)) return false;
  const actual = (await derive(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(key, "hex"));
}

export function createSession(
  db: DatabaseSync,
  userId: string,
  now = Date.now(),
) {
  const token = randomBytes(32).toString("hex");
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  db.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(
    digest(token),
    userId,
    now + SESSION_SECONDS * 1000,
  );
  return token;
}
export function sessionUser(
  db: DatabaseSync,
  token?: string,
  now = Date.now(),
): User | null {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = db
    .prepare(
      `SELECT u.id,u.email,u.name,u.role,u.customer_id FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND (u.customer_id IS NULL OR EXISTS(SELECT 1 FROM customers c WHERE c.id=u.customer_id AND c.active=1))`,
    )
    .get(digest(token), now) as User | undefined;
  // SQLite returns null-prototype rows; React server/client boundaries require plain objects.
  return row ? { ...row } : null;
}
export function revokeSession(db: DatabaseSync, token: string) {
  db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token));
}

export function consumeLoginAttempt(
  db: DatabaseSync,
  email: string,
  now = Date.now(),
) {
  const key = digest(email);
  db.prepare("DELETE FROM login_attempts WHERE reset_at <= ?").run(now);
  const row = db
    .prepare(
      `INSERT INTO login_attempts VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts`,
    )
    .get(key, now + 15 * 60 * 1000) as { attempts: number };
  return row.attempts <= 10;
}

export async function authenticate(
  db: DatabaseSync,
  email: string,
  password: string,
): Promise<User | null> {
  const row = db
    .prepare(
      "SELECT id,email,name,role,customer_id,password_hash FROM users WHERE email=? AND (customer_id IS NULL OR EXISTS(SELECT 1 FROM customers WHERE id=users.customer_id AND active=1))",
    )
    .get(email) as (User & { password_hash: string }) | undefined;
  // Equal-cost password derivation for nonexistent users avoids a quick account-existence signal.
  const fallback = "0".repeat(32) + ":" + "0".repeat(128);
  const valid = await verifyPassword(password, row?.password_hash || fallback);
  if (!row || !valid) return null;
  db.prepare("DELETE FROM login_attempts WHERE key=?").run(digest(email));
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    customer_id: row.customer_id,
  };
}

export const appOrigin = () =>
  process.env.AVON_ORIGIN || "http://127.0.0.1:3000";
export function validOrigin(origin: string | null) {
  return origin === appOrigin();
}
