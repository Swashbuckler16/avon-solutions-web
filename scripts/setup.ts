import {
  mkdirSync,
  writeFileSync,
  appendFileSync,
  openSync,
  fchmodSync,
  closeSync,
} from "node:fs";
import { resolve } from "node:path";
import { getDb } from "../lib/db.ts";
import { seed } from "../lib/seed.ts";

const db = getDb();
const accounts = await seed(db);
mkdirSync(".local", { recursive: true });
const path = resolve(".local/setup-credentials.txt");
if (accounts.length) {
  const content = accounts
    .map((a) => `${a.role}: ${a.email}\nPassword: ${a.password}\n`)
    .join("\n");
  // Local-only onboarding file, excluded from Git. Keep it private and delete after saving credentials.
  try {
    writeFileSync(path, content, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const descriptor = openSync(path, "a");
    try {
      fchmodSync(descriptor, 0o600);
      appendFileSync(descriptor, "\n" + content);
    } finally {
      closeSync(descriptor);
    }
  }
  console.log(
    `Created ${accounts.length} local accounts. Credentials saved privately at ${path}`,
  );
} else console.log("Database ready. Existing accounts and records preserved.");
console.log("Synthetic sample data only. No carrier connection or booking.");
db.close();
