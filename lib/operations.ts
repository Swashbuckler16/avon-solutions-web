import { randomUUID, createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { User } from "./auth-core.ts";
import {
  InputError,
  record,
  text,
  writable,
  transaction,
  getOrder,
  saveOrder,
  validateOrder,
  money,
  date,
  type OrderData,
} from "./orders.ts";
import { getShipment } from "./shipping.ts";
import { simulatorCarriers } from "./shipping-format.ts";

export function staffOnly(user: User) {
  writable(user);
  if (user.customer_id)
    throw new InputError("Only Avon staff can perform this action.", 403);
}
function customerAccess(db: DatabaseSync, user: User, id: string) {
  if (
    (user.customer_id && user.customer_id !== id) ||
    !db.prepare("SELECT id FROM customers WHERE id=? AND active=1").get(id)
  )
    throw new InputError("Active customer not found.", 404);
}
function revision(row: { revision: unknown }, value: unknown) {
  if (Number(row.revision) !== Number(value))
    throw new InputError("Record changed. Reload before saving.", 409);
}
function audit(db: DatabaseSync, user: User, action: string) {
  db.prepare(
    "INSERT INTO audit_events(user_id,action,created_at) VALUES (?,?,?)",
  ).run(user.id, action, Date.now());
}
export function integer(
  value: unknown,
  label: string,
  min: number,
  max: number,
) {
  const n = Number(value);
  if (
    value === "" ||
    value == null ||
    !Number.isInteger(n) ||
    n < min ||
    n > max
  )
    throw new InputError(`${label} must be ${min}–${max}.`);
  return n;
}

export function openException(db: DatabaseSync, user: User, input: unknown) {
  staffOnly(user);
  const v = record(input),
    id = text(v.shipment_id, "Shipment"),
    kind = text(v.kind, "Kind"),
    reason = text(v.reason, "Reason", 250);
  if (!["ndr", "npr"].includes(kind))
    throw new InputError("Choose NDR or NPR.");
  return transaction(db, () => {
    const s = getShipment(db, user, id);
    if (
      s.mode !== "simulator" ||
      ["delivered", "rto", "cancelled"].includes(s.status)
    )
      throw new InputError("Choose an active simulated shipment.");
    if (
      (kind === "npr" && !["info_received", "exception"].includes(s.status)) ||
      (kind === "ndr" && s.status === "info_received")
    )
      throw new InputError(
        "NPR is for pickup failures; NDR is for delivery failures.",
      );
    if (
      db
        .prepare(
          "SELECT id FROM exception_cases WHERE shipment_id=? AND status<>'resolved'",
        )
        .get(id)
    )
      throw new InputError("An open case already exists.", 409);
    const caseId = randomUUID();
    db.prepare(
      "INSERT INTO exception_cases(id,shipment_id,kind,reason,created_at) VALUES (?,?,?,?,?)",
    ).run(caseId, id, kind, reason, Date.now());
    db.prepare(
      "INSERT INTO exception_history(case_id,user_id,action,note,created_at) VALUES (?,?,'opened',?,?)",
    ).run(caseId, user.id, reason, Date.now());
    return { message: "Local exception case opened.", id: caseId };
  });
}
export function exceptionCases(db: DatabaseSync, user: User) {
  return db
    .prepare(
      `SELECT e.*,s.awb,s.status shipment_status,o.reference,o.customer FROM exception_cases e JOIN shipments s ON s.id=e.shipment_id JOIN orders o ON o.id=s.order_id ${user.customer_id ? "WHERE o.customer_id=?" : ""} ORDER BY e.created_at DESC,e.id DESC`,
    )
    .all(...(user.customer_id ? [user.customer_id] : []))
    .map(
      (row) =>
        ({
          ...row,
          history: db
            .prepare(
              "SELECT action,note,created_at FROM exception_history WHERE case_id=? ORDER BY id DESC",
            )
            .all(row.id)
            .map((entry) => ({ ...entry })),
        }) as {
          id: string;
          shipment_id: string;
          kind: string;
          reason: string;
          status: string;
          follow_up_date: string;
          revision: number;
          awb: string;
          reference: string;
          customer: string;
          history: { action: string; note: string; created_at: number }[];
        },
    );
}
export function exceptionAction(db: DatabaseSync, user: User, input: unknown) {
  writable(user);
  const v = record(input),
    action = text(v.action, "Action"),
    note = text(v.note, "Reason", 500),
    followUp = v.follow_up_date ? date(v.follow_up_date, "Follow-up date") : "";
  if (
    !["reattempt", "contact", "return_request", "resolve", "reopen"].includes(
      action,
    )
  )
    throw new InputError("Unknown exception action.");
  if (["resolve", "reopen"].includes(action)) staffOnly(user);
  if (!Array.isArray(v.cases) || !v.cases.length || v.cases.length > 100)
    throw new InputError("Select 1–100 cases.");
  const results = v.cases.map((raw, index) => {
    let id = `Entry ${index + 1}`;
    try {
      const item = record(raw);
      id = text(item.id, "Case");
      transaction(db, () => {
        const row = db
          .prepare("SELECT * FROM exception_cases WHERE id=?")
          .get(id);
        if (!row) throw new InputError("Case not found.", 404);
        const s = getShipment(db, user, String(row.shipment_id));
        revision(row as { revision: unknown }, item.revision);
        if (action === "reopen") {
          if (
            row.status !== "resolved" ||
            ["delivered", "cancelled", "rto"].includes(s.status)
          )
            throw new InputError(
              "Only a resolved case on an active shipment can reopen.",
              409,
            );
          if (
            db
              .prepare(
                "SELECT id FROM exception_cases WHERE shipment_id=? AND status<>'resolved'",
              )
              .get(s.id)
          )
            throw new InputError("Another open case exists.", 409);
        } else if (row.status === "resolved")
          throw new InputError("Case is already resolved.", 409);
        if (
          !["resolve", "reopen"].includes(action) &&
          ["delivered", "cancelled", "rto"].includes(s.status)
        )
          throw new InputError(
            "Shipment is terminal; staff can close the case.",
            409,
          );
        const status =
          action === "resolve"
            ? "resolved"
            : action === "reopen"
              ? "open"
              : "requested";
        db.prepare(
          "UPDATE exception_cases SET status=?,follow_up_date=?,revision=revision+1 WHERE id=?",
        ).run(
          status,
          status === "resolved" ? "" : followUp || String(row.follow_up_date),
          id,
        );
        db.prepare(
          "INSERT INTO exception_history(case_id,user_id,action,note,created_at) VALUES (?,?,?,?,?)",
        ).run(
          id,
          user.id,
          action,
          note + (followUp ? " · Requested follow-up: " + followUp : ""),
          Date.now(),
        );
      });
      return {
        id,
        status: "saved",
        message: "Saved locally; no carrier request sent.",
      };
    } catch (error) {
      if (!(error instanceof InputError)) throw error;
      return { id, status: "error", message: error.message };
    }
  });
  return {
    message: `${results.filter((r) => r.status === "saved").length} of ${results.length} cases updated.`,
    results,
  };
}

type RuleConfig = {
  pin: string;
  payment: string;
  max_kg: number;
  carrier: string;
  warehouse_id: string;
  length: string;
  width: string;
  height: string;
};
export function rules(db: DatabaseSync, user: User) {
  return db
    .prepare(
      `SELECT r.*,c.name customer FROM shipping_rules r JOIN customers c ON c.id=r.customer_id ${user.customer_id ? "WHERE r.customer_id=?" : ""} ORDER BY priority,id`,
    )
    .all(...(user.customer_id ? [user.customer_id] : []))
    .map(
      (r) =>
        ({ ...r, config: JSON.parse(String(r.config)) }) as {
          id: string;
          customer_id: string;
          name: string;
          customer: string;
          priority: number;
          active: number;
          revision: number;
          config: RuleConfig;
        },
    );
}
export function saveRule(db: DatabaseSync, user: User, input: unknown) {
  staffOnly(user);
  const v = record(input),
    customer = text(v.customer_id, "Customer");
  customerAccess(db, user, customer);
  const config: RuleConfig = {
    pin: text(v.pin ?? "", "PIN prefix", 6, false),
    payment: text(v.payment ?? "any", "Payment", 10),
    max_kg: integer(v.max_kg, "Maximum weight", 1, 20000),
    carrier: text(v.carrier, "Carrier"),
    warehouse_id: text(v.warehouse_id ?? "", "Warehouse", 160, false),
    length: text(v.length ?? "", "Length", 10, false),
    width: text(v.width ?? "", "Width", 10, false),
    height: text(v.height ?? "", "Height", 10, false),
  };
  if (
    !/^\d{0,6}$/.test(config.pin) ||
    !["any", "prepaid", "cod"].includes(config.payment) ||
    !(simulatorCarriers as readonly string[]).includes(config.carrier)
  )
    throw new InputError("Invalid rule conditions or carrier.");
  const dims = [config.length, config.width, config.height];
  if (
    dims.some(Boolean) &&
    !dims.every(
      (d) => /^\d+(\.\d{1,3})?$/.test(d) && Number(d) > 0 && Number(d) <= 500,
    )
  )
    throw new InputError(
      "Supply all three dimensions, each positive and at most 500 cm.",
    );
  if (
    config.warehouse_id &&
    !db
      .prepare(
        "SELECT id FROM warehouses WHERE id=? AND customer_id=? AND active=1",
      )
      .get(config.warehouse_id, customer)
  )
    throw new InputError(
      "Choose an active pickup location belonging to this customer.",
    );
  const name = text(v.name, "Name", 80),
    priority = integer(v.priority, "Priority", 1, 1000),
    active = integer(v.active, "Active", 0, 1),
    id = v.id ? text(v.id, "Rule") : randomUUID();
  return transaction(db, () => {
    if (v.id) {
      const old = db.prepare("SELECT * FROM shipping_rules WHERE id=?").get(id);
      if (!old || old.customer_id !== customer)
        throw new InputError("Rule not found.", 404);
      revision(old as { revision: unknown }, v.revision);
      db.prepare(
        "UPDATE shipping_rules SET name=?,priority=?,active=?,config=?,revision=revision+1 WHERE id=?",
      ).run(name, priority, active, JSON.stringify(config), id);
    } else
      db.prepare(
        "INSERT INTO shipping_rules(id,customer_id,name,priority,active,config) VALUES (?,?,?,?,?,?)",
      ).run(id, customer, name, priority, active, JSON.stringify(config));
    audit(db, user, "shipping_rule_saved:" + id);
    return {
      message: "Rule saved. First matching active rule wins; ties use rule ID.",
      id,
    };
  });
}
export function applyRule(
  db: DatabaseSync,
  user: User,
  input: unknown,
  commit = false,
) {
  writable(user);
  const v = record(input),
    id = text(v.order_id, "Order");
  return transaction(db, () => {
    const order = getOrder(db, user, id);
    revision(order, v.revision);
    const { data } = validateOrder(db, user, order.details);
    const grams = data.packages.reduce(
      (sum, p) => sum + Math.round(Number(p.weight) * 1000),
      0,
    );
    const match = rules(db, user).find(
      (r) =>
        r.active === 1 &&
        r.customer_id === data.customer_id &&
        data.recipient.pincode.startsWith(r.config.pin) &&
        (r.config.payment === "any" ||
          r.config.payment === data.payment_mode) &&
        grams <= r.config.max_kg * 1000,
    );
    if (!match) return { message: "No active rule matches this order." };
    const c = match.config,
      next: OrderData = {
        ...data,
        carrier: c.carrier,
        warehouse_id: c.warehouse_id || data.warehouse_id,
        packages: c.length
          ? data.packages.map((p) => ({
              ...p,
              length: c.length,
              width: c.width,
              height: c.height,
            }))
          : data.packages,
      };
    validateOrder(db, user, next);
    if (commit) {
      saveOrder(db, user, { ...next, revision: order.revision }, id);
      db.prepare(
        "INSERT INTO order_events(order_id,user_id,action,note,created_at) VALUES (?,?,'rule_applied',?,?)",
      ).run(id, user.id, String(match.name), Date.now());
    }
    const pickup = db
      .prepare("SELECT name FROM warehouses WHERE id=?")
      .get(next.warehouse_id)!;
    return {
      message: `${commit ? "Applied" : "Preview"}: ${match.name}. Carrier preference ${c.carrier}; pickup ${pickup.name}; ${c.length ? "package dimensions replaced" : "package dimensions preserved"}. No booking created.`,
      rule_id: match.id,
      order_id: id,
      packages: next.packages,
    };
  });
}

export function channels(db: DatabaseSync, user: User) {
  return db
    .prepare(
      `SELECT c.*,u.name customer FROM channels c JOIN customers u ON u.id=c.customer_id ${user.customer_id ? "WHERE c.customer_id=?" : ""} ORDER BY c.name`,
    )
    .all(...(user.customer_id ? [user.customer_id] : []))
    .map(
      (c) =>
        ({
          ...c,
          events: db
            .prepare(
              "SELECT event_key,status,order_id,message,created_at FROM channel_events WHERE channel_id=? ORDER BY id DESC LIMIT 50",
            )
            .all(c.id),
        }) as {
          id: string;
          customer_id: string;
          name: string;
          customer: string;
          active: number;
          callbacks: number;
          revision: number;
          events: Record<string, import("node:sqlite").SQLOutputValue>[];
        },
    );
}
export function saveChannel(db: DatabaseSync, user: User, input: unknown) {
  staffOnly(user);
  if (user.role !== "admin")
    throw new InputError(
      "Only Avon administrators can configure channels.",
      403,
    );
  const v = record(input),
    customer = text(v.customer_id, "Customer"),
    name = text(v.name, "Name", 80),
    active = integer(v.active, "Active", 0, 1),
    callbacks = integer(v.callbacks, "Local replay enabled", 0, 1);
  customerAccess(db, user, customer);
  return transaction(db, () => {
    const id = v.id ? text(v.id, "Channel") : randomUUID();
    if (v.id) {
      const old = db
        .prepare("SELECT * FROM channels WHERE id=? AND customer_id=?")
        .get(id, customer);
      if (!old) throw new InputError("Channel not found.", 404);
      revision(old as { revision: unknown }, v.revision);
      db.prepare(
        "UPDATE channels SET name=?,active=?,callbacks=?,revision=revision+1 WHERE id=?",
      ).run(name, active, callbacks, id);
    } else
      db.prepare(
        "INSERT INTO channels(id,customer_id,name,active,callbacks) VALUES (?,?,?,?,?)",
      ).run(id, customer, name, active, callbacks);
    audit(db, user, "local_channel_saved:" + id);
    return {
      message:
        "Local channel configured. External sync and public webhooks are disabled.",
      id,
    };
  });
}

export function channelTemplates(
  db: DatabaseSync,
  user: User,
  customerId: string,
) {
  return db
    .prepare(
      `SELECT id,reference FROM orders WHERE customer_id=? AND (customer_id=? OR ? IS NULL)
     AND json_extract(details,'$.recipient.name') IS NOT NULL ORDER BY creation_seq DESC LIMIT 100`,
    )
    .all(customerId, user.customer_id || null, user.customer_id || null);
}
export function syncChannel(db: DatabaseSync, user: User, input: unknown) {
  writable(user);
  const v = record(input),
    id = text(v.channel_id, "Channel"),
    channel = db.prepare("SELECT * FROM channels WHERE id=?").get(id);
  if (!channel) throw new InputError("Channel not found.", 404);
  customerAccess(db, user, String(channel.customer_id));
  if (channel.active !== 1 || channel.callbacks !== 1)
    throw new InputError("Enable this local channel and replay first.");
  if (!Array.isArray(v.events) || !v.events.length || v.events.length > 100)
    throw new InputError("Replay 1–100 events.");
  const events = v.events.map((raw) => {
    const event = record(raw),
      key = text(event.event_key, "Event key", 80),
      data = record(event.order);
    return { key, data };
  });
  const results = events.map(({ key, data }) => {
    const hash = createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
    return transaction(db, () => {
      const old = db
        .prepare(
          "SELECT * FROM channel_events WHERE channel_id=? AND event_key=?",
        )
        .get(id, key);
      if (old && old.payload_hash !== hash)
        return {
          event_key: key,
          status: "error",
          message:
            "Event key already has different content. Use a new key for corrected data.",
        };
      if (old?.status === "imported")
        return {
          event_key: key,
          status: "duplicate",
          order_id: old.order_id,
          message: "Existing order retained.",
        };
      try {
        if (data.customer_id !== channel.customer_id)
          throw new InputError("Order customer must match the channel.");
        const orderId = saveOrder(db, user, data);
        db.prepare(
          "INSERT INTO channel_events(channel_id,event_key,payload_hash,status,order_id,message,created_at) VALUES (?,?,?,'imported',?,'Imported locally',?) ON CONFLICT(channel_id,event_key) DO UPDATE SET status='imported',order_id=excluded.order_id,message=excluded.message,created_at=excluded.created_at",
        ).run(id, key, hash, orderId, Date.now());
        return {
          event_key: key,
          status: "imported",
          order_id: orderId,
          message: "Imported locally.",
        };
      } catch (error) {
        if (!(error instanceof InputError)) throw error;
        db.prepare(
          "INSERT INTO channel_events(channel_id,event_key,payload_hash,status,message,created_at) VALUES (?,?,?,'failed',?,?) ON CONFLICT(channel_id,event_key) DO UPDATE SET message=excluded.message,created_at=excluded.created_at",
        ).run(id, key, hash, error.message, Date.now());
        return { event_key: key, status: "failed", message: error.message };
      }
    });
  });
  return {
    message: "Local replay complete. No external service contacted.",
    results,
  };
}

export function saveFreight(db: DatabaseSync, user: User, input: unknown) {
  staffOnly(user);
  const v = record(input),
    id = text(v.shipment_id, "Shipment"),
    quoted = money(v.quoted),
    invoiced = money(v.invoiced),
    reference = text(v.invoice_ref, "Invoice reference", 100);
  return transaction(db, () => {
    const s = getShipment(db, user, id);
    if (s.mode !== "simulator")
      throw new InputError("Choose a simulator shipment.");
    const old = db
      .prepare("SELECT revision FROM freight_entries WHERE shipment_id=?")
      .get(id);
    if (old) revision(old as { revision: unknown }, v.revision);
    else if (Number(v.revision) !== 0)
      throw new InputError("Reload freight record.", 409);
    db.prepare(
      "INSERT INTO freight_entries(shipment_id,quoted_paise,invoiced_paise,invoice_ref,user_id,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(shipment_id) DO UPDATE SET quoted_paise=excluded.quoted_paise,invoiced_paise=excluded.invoiced_paise,invoice_ref=excluded.invoice_ref,user_id=excluded.user_id,revision=freight_entries.revision+1,updated_at=excluded.updated_at",
    ).run(id, quoted, invoiced, reference, user.id, Date.now());
    audit(db, user, "freight_recorded:" + id);
    return {
      message: "Supplied amounts recorded. No payment or settlement performed.",
    };
  });
}
export function saveFeedback(db: DatabaseSync, user: User, input: unknown) {
  writable(user);
  const v = record(input),
    id = text(v.shipment_id, "Shipment"),
    score = integer(v.score, "Score", 0, 10),
    note = text(v.note ?? "", "Feedback", 500, false);
  return transaction(db, () => {
    const s = getShipment(db, user, id);
    if (
      s.status !== "delivered" ||
      s.direction !== "forward" ||
      s.mode !== "simulator"
    )
      throw new InputError(
        "Feedback requires a delivered forward simulator shipment.",
      );
    const old = db
      .prepare("SELECT revision FROM shipment_feedback WHERE shipment_id=?")
      .get(id);
    if (old) revision(old as { revision: unknown }, v.revision);
    else if (Number(v.revision) !== 0)
      throw new InputError("Reload feedback record.", 409);
    db.prepare(
      "INSERT INTO shipment_feedback(shipment_id,score,note,user_id,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(shipment_id) DO UPDATE SET score=excluded.score,note=excluded.note,user_id=excluded.user_id,revision=shipment_feedback.revision+1,updated_at=excluded.updated_at",
    ).run(id, score, note, user.id, Date.now());
    audit(db, user, "feedback_saved:" + id);
    return {
      message: "Feedback saved. One current response per delivered shipment.",
    };
  });
}
