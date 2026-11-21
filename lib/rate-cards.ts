import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { User } from "./auth-core.ts";
import {
  InputError,
  record,
  text,
  money,
  transaction,
  type OrderData,
} from "./orders.ts";
import { integer, staffOnly } from "./operations.ts";
import { simulatorCarriers } from "./shipping-format.ts";

export type DispatchConfig = {
  country: string;
  prefix: string;
  warehouse_id: string;
  carrier: string;
  service: string;
  base: string;
  per_kg: string;
  max_kg: number;
  eta_days: number;
  sku: string;
  units: number;
  unit_weight: number;
  tare: number;
  length: number;
  width: number;
  height: number;
};
export type DispatchProfile = {
  id: string;
  customer_id: string;
  kind: string;
  name: string;
  customer: string;
  active: number;
  priority: number;
  revision: number;
  config: DispatchConfig;
};
export function profiles(db: DatabaseSync, user: User, kind: string) {
  return db
    .prepare(
      `SELECT p.*,c.name customer FROM dispatch_profiles p JOIN customers c ON c.id=p.customer_id WHERE kind=? AND (p.customer_id=? OR ? IS NULL) ORDER BY priority,id`,
    )
    .all(kind, user.customer_id || null, user.customer_id || null)
    .map(
      (r) =>
        ({ ...r, config: JSON.parse(String(r.config)) }) as DispatchProfile,
    );
}
export function saveProfile(db: DatabaseSync, user: User, input: unknown) {
  staffOnly(user);
  const v = record(input),
    kind = text(v.kind, "Profile kind"),
    customer = text(v.customer_id, "Customer");
  if (!["rate", "packing"].includes(kind))
    throw new InputError("Unknown profile kind.");
  if (
    !db
      .prepare("SELECT id FROM customers WHERE id=? AND active=1")
      .get(customer)
  )
    throw new InputError("Choose an active customer.");
  const number = (key: string, min: number, max: number) => {
    const n = Number(v[key]);
    if (
      !/^\d+(\.\d{1,3})?$/.test(String(v[key])) ||
      !Number.isFinite(n) ||
      n < min ||
      n > max
    )
      throw new InputError(
        `${key} must be ${min}–${max}, at most three decimals.`,
      );
    return n;
  };
  const config = {
    country: text(v.country ?? "IN", "Country", 2).toUpperCase(),
    prefix: text(v.prefix ?? "", "Postal prefix", 16, false),
    warehouse_id: text(v.warehouse_id ?? "", "Warehouse", 160, false),
  } as DispatchConfig;
  if (
    !/^[A-Z]{2}$/.test(config.country) ||
    !new Intl.DisplayNames(["en"], { type: "region", fallback: "none" }).of(
      config.country,
    )
  )
    throw new InputError("Use a recognized country code.");
  if (
    config.warehouse_id &&
    !db
      .prepare(
        "SELECT id FROM warehouses WHERE id=? AND customer_id=? AND active=1",
      )
      .get(config.warehouse_id, customer)
  )
    throw new InputError(
      "Warehouse must be active and belong to this customer.",
    );
  if (kind === "rate") {
    config.carrier = text(v.carrier, "Carrier");
    if (!(simulatorCarriers as readonly string[]).includes(config.carrier))
      throw new InputError("Choose a supported carrier.");
    config.service = text(v.service, "Service", 60);
    config.base = text(v.base, "Base INR", 12);
    config.per_kg = text(v.per_kg, "INR per kg", 12);
    money(config.base);
    money(config.per_kg);
    config.max_kg = number("max_kg", 0.001, 20000);
    config.eta_days = integer(v.eta_days, "Estimated days", 1, 365);
  } else {
    config.sku = text(v.sku, "SKU", 60);
    config.units = integer(v.units, "Units per box", 1, 10000);
    config.unit_weight = number("unit_weight", 0.001, 1000);
    config.tare = number("tare", 0, 1000);
    for (const key of ["length", "width", "height"] as const)
      config[key] = number(key, 0.001, 500);
    config.max_kg = number("max_kg", 0.001, 1000);
    if (
      config.units * Math.round(config.unit_weight * 1000) +
        Math.round(config.tare * 1000) >
      Math.round(config.max_kg * 1000)
    )
      throw new InputError(
        "A full box exceeds its maximum weight; reduce units per box.",
      );
  }
  const id = v.id ? text(v.id, "Profile") : randomUUID(),
    name = text(v.name, "Name", 80),
    priority = integer(v.priority, "Priority", 1, 1000),
    active = integer(v.active, "Enabled", 0, 1);
  return transaction(db, () => {
    if (v.id) {
      const old = db
        .prepare(
          "SELECT * FROM dispatch_profiles WHERE id=? AND customer_id=? AND kind=?",
        )
        .get(id, customer, kind);
      if (!old) throw new InputError("Profile not found.", 404);
      if (old.revision !== Number(v.revision))
        throw new InputError("Profile changed. Reload.", 409);
      db.prepare(
        "UPDATE dispatch_profiles SET name=?,active=?,priority=?,config=?,revision=revision+1 WHERE id=?",
      ).run(name, active, priority, JSON.stringify(config), id);
    } else
      db.prepare(
        "INSERT INTO dispatch_profiles(id,customer_id,kind,name,active,priority,config) VALUES (?,?,?,?,?,?,?)",
      ).run(id, customer, kind, name, active, priority, JSON.stringify(config));
    db.prepare(
      "INSERT INTO audit_events(user_id,action,created_at) VALUES (?,?,?)",
    ).run(user.id, `dispatch_${kind}_saved:${id}`, Date.now());
    return {
      id,
      message: "Profile saved. Manual estimates only; no carrier contacted.",
    };
  });
}
export function manualServices(db: DatabaseSync, data: OrderData, kg: number) {
  const rows = db
    .prepare(
      "SELECT * FROM dispatch_profiles WHERE customer_id=? AND kind='rate' AND active=1 ORDER BY priority,id",
    )
    .all(data.customer_id);
  return rows.flatMap((row) => {
    const c = JSON.parse(String(row.config)) as DispatchConfig;
    if (
      c.country !== (data.shipping?.country || "IN") ||
      !data.recipient.pincode
        .toUpperCase()
        .startsWith(c.prefix.toUpperCase()) ||
      (c.warehouse_id && c.warehouse_id !== data.warehouse_id) ||
      kg > c.max_kg
    )
      return [];
    const price = money(c.base) + Math.ceil(money(c.per_kg) * kg);
    if (!Number.isSafeInteger(price) || price > 100000000000)
      throw new InputError("Rate estimate exceeds supported amount.");
    return [
      {
        carrier: c.carrier,
        service: `Manual estimate: ${c.service}`,
        chargeable_kg: kg,
        eta_days: c.eta_days,
        price_paise: price,
        available: true,
        reason: `User-entered rate card: ${row.name} (revision ${row.revision}). Not a carrier quote.`,
      },
    ];
  });
}
