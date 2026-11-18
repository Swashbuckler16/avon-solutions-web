import type { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { hashPassword, type Role } from "./auth-core.ts";

export async function seed(db: DatabaseSync) {
  const accounts: { email: string; password: string; role: Role }[] = [];
  const prepared = await Promise.all(
    (["admin", "operator", "viewer"] as Role[]).map(async (role) => {
      const password = randomBytes(18).toString("base64url");
      return { role, password, hash: await hashPassword(password) };
    }),
  );
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const { role, password, hash } of prepared) {
      const email = `${role}@avon.local`;
      if (!db.prepare("SELECT id FROM users WHERE email=?").get(email)) {
        db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?)").run(
          role,
          email,
          role === "admin"
            ? "Avon Admin"
            : role === "operator"
              ? "Avon Operator"
              : "Avon Viewer",
          role,
          hash,
          Date.now(),
        );
        accounts.push({ email, password, role });
      }
    }
    const insertWarehouse = db.prepare(
      "INSERT OR IGNORE INTO warehouses VALUES (?,?,?,?)",
    );
    insertWarehouse.run("mum", "Mumbai Central", "Mumbai", "MUM-01");
    insertWarehouse.run("blr", "Bengaluru South", "Bengaluru", "BLR-01");
    insertWarehouse.run("del", "Delhi North", "Delhi", "DEL-01");
    if (
      !(
        db.prepare("SELECT count(*) AS count FROM orders").get() as {
          count: number;
        }
      ).count
    ) {
      const cities = [
        "Bengaluru",
        "New Delhi",
        "Pune",
        "Chennai",
        "Hyderabad",
        "Jaipur",
        "Kolkata",
        "Ahmedabad",
      ];
      const names = [
        "Sample Studio",
        "Demo Supply Co.",
        "Example Works",
        "Test Collective",
        "Sample Retail",
        "Demo Systems",
      ];
      const states = [
        "delivered",
        "delivered",
        "in_transit",
        "delivered",
        "out_for_delivery",
        "exception",
        "info_received",
        "rto",
      ];
      for (let i = 0; i < 48; i++) {
        const date = new Date(Date.now() - Math.floor(i / 7) * 86400000)
          .toISOString()
          .slice(0, 10);
        const id = `sample-${i + 1}`;
        const status =
          i % 9 === 0 ? "new" : i % 13 === 0 ? "unprocessed" : "shipped";
        db.prepare("INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,1)").run(
          id,
          `AV-${1048 - i}`,
          names[i % 6],
          cities[i % 8],
          ["mum", "blr", "del"][i % 3],
          status,
          i % 5 === 0 ? "cod" : "prepaid",
          125000 + i * 3500,
          date,
        );
        if (status === "shipped")
          db.prepare("INSERT INTO shipments VALUES (?,?,?,?,?,1)").run(
            `demo-${i + 1}`,
            id,
            states[i % 8],
            "Local simulator",
            date,
          );
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return accounts;
}
