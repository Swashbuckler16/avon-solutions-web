import { randomUUID, createHash } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { User } from "./auth-core.ts";
import {
  InputError,
  record,
  text,
  writable,
  transaction,
  getOrder,
  validateOrder,
  address,
  date,
  type OrderData,
  type Address,
} from "./orders.ts";
import { simulatedServices } from "./carrier-simulator.ts";
import { manualServices } from "./rate-cards.ts";
import { trackingStatuses, type TrackingStatus } from "./shipping-format.ts";

export type ShippingSnapshot = {
  pricing_source?: string;
  order: OrderData;
  pickup: Address;
  recipient: Address;
  total_paise: number;
  reference: string;
  customer: string;
  direction: "forward" | "reverse";
};
export type Shipment = {
  id: string;
  order_id: string;
  status: string;
  carrier: string;
  created_date: string;
  mode: "fixture" | "simulator";
  direction: "forward" | "reverse";
  parent_id: string | null;
  awb: string | null;
  service: string;
  price_paise: number;
  snapshot: ShippingSnapshot;
  created_at: number;
  last_event_at: number;
  revision: number;
  qa_status: string;
  qa_note: string;
  reference: string;
  customer: string;
  customer_id: string | null;
};
type Quote = {
  id: string;
  order_id: string;
  parent_id: string | null;
  order_revision: number;
  warehouse_revision: number;
  carrier: string;
  service: string;
  price_paise: number;
  chargeable_kg: number;
  eta_days: number;
  snapshot: ShippingSnapshot;
  expires_at: number;
};
export function getShipment(
  db: DatabaseSync,
  user: User,
  id: string,
): Shipment {
  const row = db
    .prepare(
      `SELECT s.*,o.reference,o.customer,o.customer_id FROM shipments s JOIN orders o ON o.id=s.order_id WHERE s.id=? ${user.customer_id ? "AND o.customer_id=?" : ""}`,
    )
    .get(id, ...(user.customer_id ? [user.customer_id] : []));
  if (!row) throw new InputError("Shipment not found.", 404);
  return { ...row, snapshot: JSON.parse(String(row.snapshot)) } as Shipment;
}
function simulatorOnly(s: Shipment) {
  if (s.mode !== "simulator")
    throw new InputError(
      "Historical fixtures cannot perform shipping operations. Create a complete order first.",
      409,
    );
}
function audit(
  db: DatabaseSync,
  user: User,
  id: string,
  action: string,
  note = "",
) {
  db.prepare(
    "INSERT INTO shipment_audit(shipment_id,user_id,action,note,created_at) VALUES (?,?,?,?,?)",
  ).run(id, user.id, action, note, Date.now());
}
function staff(user: User) {
  writable(user);
  if (user.customer_id)
    throw new InputError("Avon staff access is required for this action.", 403);
}
function eligibility(
  db: DatabaseSync,
  user: User,
  orderId: string,
  parentId?: string | null,
) {
  const order = getOrder(db, user, orderId);
  if (parentId) {
    const parent = getShipment(db, user, parentId);
    simulatorOnly(parent);
    if (
      parent.order_id !== orderId ||
      parent.direction !== "forward" ||
      parent.status !== "delivered"
    )
      throw new InputError(
        "Only a delivered forward shipment can be returned.",
        409,
      );
    if (
      db
        .prepare(
          "SELECT id FROM shipments WHERE parent_id=? AND status<>'cancelled'",
        )
        .get(parentId)
    )
      throw new InputError("A return already exists for this shipment.", 409);
  } else {
    if (order.status !== "new")
      throw new InputError("Mark the order ready (new) before booking.", 409);
    if (
      db
        .prepare(
          "SELECT id FROM shipments WHERE order_id=? AND direction='forward' AND status<>'cancelled'",
        )
        .get(orderId)
    )
      throw new InputError(
        "An active shipment already exists for this order.",
        409,
      );
  }
  return order;
}
export function quoteShipment(
  db: DatabaseSync,
  user: User,
  input: unknown,
  now = Date.now(),
) {
  writable(user);
  const v = record(input),
    orderId = text(v.order_id, "Order ID"),
    parentId = v.parent_id ? text(v.parent_id, "Parent shipment") : null;
  return transaction(db, () => {
    const order = eligibility(db, user, orderId, parentId);
    const { data, total } = validateOrder(db, user, order.details);
    const warehouse = db
      .prepare("SELECT details,revision FROM warehouses WHERE id=?")
      .get(order.warehouse_id)!;
    let pickup = address(JSON.parse(String(warehouse.details))),
      recipient = data.recipient;
    if (parentId) {
      const original = getShipment(db, user, parentId).snapshot;
      pickup = original.recipient;
      recipient = original.pickup;
    }
    const snapshot: ShippingSnapshot = {
      order: {
        ...data,
        payment_mode: parentId ? "prepaid" : data.payment_mode,
      },
      pickup,
      recipient,
      total_paise: total,
      reference: order.reference,
      customer: order.customer,
      direction: parentId ? "reverse" : "forward",
    };
    const fictional = simulatedServices(pickup, recipient, data.packages);
    const manual = parentId
      ? []
      : manualServices(db, data, fictional[0].chargeable_kg);
    const services = manual.length
      ? manual
      : !parentId && data.shipping?.country && data.shipping.country !== "IN"
        ? fictional.slice(0, 1).map((s) => ({
            ...s,
            carrier: "Local simulator",
            service: "Simulated international",
            eta_days: 10,
            reason:
              "Fictional international service; no customs clearance or carrier availability verified.",
          }))
        : fictional;
    const quotes = services.map((service) => {
      if (!service.available)
        return { ...service, id: null, expires_at: now + 900000 };
      const id = randomUUID();
      db.prepare(
        "INSERT INTO shipping_quotes VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        orderId,
        parentId,
        order.revision,
        Number(warehouse.revision),
        service.carrier,
        service.service,
        service.price_paise,
        service.chargeable_kg,
        service.eta_days,
        JSON.stringify({ ...snapshot, pricing_source: service.reason }),
        now + 900000,
      );
      return { ...service, id, expires_at: now + 900000 };
    });
    return { mode: "simulator", snapshot, quotes };
  });
}
export type BookingResult = {
  state: "booked" | "retryable" | "unknown";
  id?: string;
  message: string;
};
export function reconcileBooking(
  db: DatabaseSync,
  user: User,
  input: unknown,
): BookingResult {
  writable(user);
  const v = record(input),
    key = text(v.request_key, "Request key", 80);
  const attempt = db
    .prepare(
      "SELECT outcome,shipment_id FROM booking_attempts WHERE user_id=? AND request_key=?",
    )
    .get(user.id, key);
  if (attempt?.shipment_id) {
    const s = getShipment(db, user, String(attempt.shipment_id));
    return {
      state: "booked",
      id: s.id,
      message: "Existing simulated booking recovered.",
    };
  }
  if (!attempt || attempt.outcome === "retryable")
    return {
      state: "retryable",
      message: "No booking was created. You may fetch fresh services or retry.",
    };
  return {
    state: "unknown",
    message:
      "Outcome unresolved. Keep this request key and do not create another booking.",
  };
}
export function bookShipment(
  db: DatabaseSync,
  user: User,
  input: unknown,
  now = Date.now(),
): BookingResult {
  writable(user);
  const v = record(input),
    quoteId = text(v.quote_id, "Quote ID"),
    key = text(v.request_key, "Request key", 80),
    scenario = text(v.scenario ?? "success", "Simulation scenario", 40);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(key))
    throw new InputError(
      "Use a stable request key of 8–80 letters, digits, _ or -.",
    );
  if (!["success", "fail_once", "timeout_after_booking"].includes(scenario))
    throw new InputError("Unknown simulation scenario.");
  return transaction(db, () => {
    const row = db
      .prepare("SELECT * FROM shipping_quotes WHERE id=?")
      .get(quoteId);
    if (!row) throw new InputError("Quote not found.", 404);
    const quote = {
      ...row,
      snapshot: JSON.parse(String(row.snapshot)),
    } as Quote;
    getOrder(db, user, quote.order_id);
    const previous = db
      .prepare(
        "SELECT * FROM booking_attempts WHERE user_id=? AND request_key=?",
      )
      .get(user.id, key);
    if (
      previous &&
      (previous.quote_id !== quoteId || previous.scenario !== scenario)
    )
      throw new InputError(
        "Request key was already used for a different booking.",
        409,
      );
    if (previous?.shipment_id) {
      const existing = getShipment(db, user, String(previous.shipment_id));
      return {
        state: "booked",
        id: existing.id,
        message: "Existing booking recovered. No duplicate created.",
      };
    }
    if (quote.expires_at <= now)
      throw new InputError("Quote expired. Fetch services again.", 409);
    const order = eligibility(db, user, quote.order_id, quote.parent_id);
    validateOrder(db, user, order.details);
    const warehouse = db
      .prepare("SELECT revision FROM warehouses WHERE id=?")
      .get(order.warehouse_id)!;
    if (
      order.revision !== quote.order_revision ||
      Number(warehouse.revision) !== quote.warehouse_revision
    )
      throw new InputError(
        "Order or pickup changed. Fetch services again.",
        409,
      );
    db.prepare(
      "INSERT INTO booking_attempts(user_id,request_key,quote_id,scenario,attempts,outcome,created_at) VALUES (?,?,?,?,1,'pending',?) ON CONFLICT(user_id,request_key) DO UPDATE SET attempts=attempts+1,outcome='pending'",
    ).run(user.id, key, quoteId, scenario, now);
    if (scenario === "fail_once" && !previous) {
      db.prepare(
        "UPDATE booking_attempts SET outcome='retryable' WHERE user_id=? AND request_key=?",
      ).run(user.id, key);
      return {
        state: "retryable",
        message:
          "Simulated provider failure before booking. Retry the same request safely.",
      };
    }
    const id = randomUUID(),
      awb =
        "SIM-" + randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase();
    db.prepare(
      "INSERT INTO shipments(id,order_id,status,carrier,created_date,synthetic,mode,direction,parent_id,awb,service,price_paise,snapshot,created_at,last_event_at) VALUES (?,?,'info_received',?,?,1,'simulator',?,?,?,?,?,?,?,?)",
    ).run(
      id,
      order.id,
      quote.carrier,
      new Date(now).toISOString().slice(0, 10),
      quote.snapshot.direction,
      quote.parent_id,
      awb,
      quote.service,
      quote.price_paise,
      JSON.stringify(quote.snapshot),
      now,
      now,
    );
    db.prepare("UPDATE shipments SET expected_delivery_at=? WHERE id=?").run(
      now + quote.eta_days * 86400000,
      id,
    );
    db.prepare(
      "INSERT INTO tracking_events(shipment_id,event_key,status,location,note,occurred_at,received_at,applied,disposition,raw) VALUES (?,'booking','info_received',?,'Simulated booking accepted',?,?,1,'applied',?)",
    ).run(
      id,
      quote.snapshot.pickup.city,
      now,
      now,
      JSON.stringify({ source: "simulator", status: "info_received" }),
    );
    if (!quote.parent_id) {
      db.prepare(
        "UPDATE orders SET status='shipped',revision=revision+1,updated_at=? WHERE id=?",
      ).run(now, order.id);
      db.prepare(
        "INSERT INTO order_events(order_id,user_id,action,note,created_at) VALUES (?,?,?,?,?)",
      ).run(
        order.id,
        user.id,
        "shipment_booked",
        "Local simulator: " + awb,
        now,
      );
    }
    audit(
      db,
      user,
      id,
      quote.parent_id ? "reverse_booked" : "booked",
      "Local simulator",
    );
    db.prepare(
      "UPDATE booking_attempts SET outcome='booked',shipment_id=? WHERE user_id=? AND request_key=?",
    ).run(id, user.id, key);
    return scenario === "timeout_after_booking"
      ? {
          state: "unknown",
          message:
            "Simulated lost response after acceptance. Retry this same request to recover the booking.",
        }
      : {
          state: "booked",
          id,
          message: "Simulated shipment booked. No real pickup or charge.",
        };
  });
}
export function cancelShipment(db: DatabaseSync, user: User, input: unknown) {
  writable(user);
  const v = record(input),
    id = text(v.id, "Shipment ID"),
    note = text(v.note, "Cancellation reason", 250);
  return transaction(db, () => {
    const s = getShipment(db, user, id);
    simulatorOnly(s);
    if (s.status === "cancelled") return { id, message: "Already cancelled." };
    if (s.revision !== Number(v.revision))
      throw new InputError("Shipment changed. Reload before cancelling.", 409);
    if (s.status !== "info_received")
      throw new InputError(
        "Simulator cancellation is supported only before pickup.",
        409,
      );
    const now = Date.now();
    db.prepare(
      "UPDATE shipments SET status='cancelled',revision=revision+1,last_event_at=? WHERE id=?",
    ).run(now, id);
    db.prepare(
      "INSERT INTO tracking_events(shipment_id,event_key,status,location,note,occurred_at,received_at,applied,disposition,raw) VALUES (?,'cancellation','cancelled','',?,?,?,1,'applied',?)",
    ).run(
      id,
      note,
      now,
      now,
      JSON.stringify({ source: "local_cancellation", note }),
    );
    if (s.direction === "forward") {
      db.prepare(
        "UPDATE orders SET status='new',revision=revision+1,updated_at=? WHERE id=?",
      ).run(now, s.order_id);
      db.prepare(
        "INSERT INTO order_events(order_id,user_id,action,note,created_at) VALUES (?,?,?,?,?)",
      ).run(s.order_id, user.id, "shipment_cancelled", note, now);
    }
    audit(db, user, id, "cancelled", note);
    return {
      id,
      message:
        "Simulated shipment cancelled. Forward orders can be edited and rebooked.",
    };
  });
}
export function replayTracking(
  db: DatabaseSync,
  user: User,
  input: unknown,
  now = Date.now(),
) {
  staff(user);
  const v = record(input),
    id = text(v.id, "Shipment ID"),
    eventKey = text(v.event_key, "Event ID", 80),
    status = text(v.status, "Status", 30) as TrackingStatus,
    location = text(v.location ?? "", "Location", 100, false),
    note = text(v.note ?? "", "Note", 250, false);
  if (!(trackingStatuses as readonly string[]).includes(status))
    throw new InputError("Unknown tracking status.");
  const occurred = Date.parse(text(v.occurred_at, "Event time", 40));
  if (!Number.isFinite(occurred) || occurred > now + 300000)
    throw new InputError(
      "Event time must be valid and no more than five minutes in the future.",
    );
  const raw = JSON.stringify({
    status,
    location,
    note,
    occurred_at: new Date(occurred).toISOString(),
  });
  return transaction(db, () => {
    const s = getShipment(db, user, id);
    simulatorOnly(s);
    const old = db
      .prepare(
        "SELECT raw,disposition FROM tracking_events WHERE shipment_id=? AND event_key=?",
      )
      .get(id, eventKey);
    if (old) {
      if (old.raw !== raw)
        throw new InputError("Event ID already has different content.", 409);
      return {
        applied: false,
        disposition: "duplicate",
        message: "Duplicate event ignored.",
      };
    }
    if (occurred < s.created_at)
      throw new InputError("Event cannot precede booking.");
    let disposition = "applied";
    const rank: Record<string, number> = {
      info_received: 0,
      in_transit: 1,
      out_for_delivery: 2,
      delivered: 3,
      rto: 3,
    };
    if (["delivered", "rto", "cancelled"].includes(s.status))
      disposition = "terminal_state";
    else if (occurred <= s.last_event_at) disposition = "out_of_order";
    else if (
      status === s.status ||
      (s.status !== "exception" &&
        status !== "exception" &&
        rank[status] < rank[s.status])
    )
      disposition = "no_progress";
    const applied = disposition === "applied";
    db.prepare(
      "INSERT INTO tracking_events(shipment_id,event_key,status,location,note,occurred_at,received_at,applied,disposition,raw) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      eventKey,
      status,
      location,
      note,
      occurred,
      now,
      applied ? 1 : 0,
      disposition,
      raw,
    );
    if (applied)
      db.prepare(
        "UPDATE shipments SET status=?,last_event_at=?,revision=revision+1,qa_status=CASE WHEN direction='reverse' AND ?='delivered' THEN 'pending' ELSE qa_status END WHERE id=?",
      ).run(status, occurred, status, id);
    audit(db, user, id, "tracking_replayed", eventKey + ": " + disposition);
    if (
      applied &&
      status === "exception" &&
      !db
        .prepare(
          "SELECT id FROM exception_cases WHERE shipment_id=? AND status<>'resolved'",
        )
        .get(id)
    ) {
      const caseId = randomUUID();
      db.prepare(
        "INSERT INTO exception_cases(id,shipment_id,kind,reason,created_at) VALUES (?,?,?,?,?)",
      ).run(
        caseId,
        id,
        s.status === "info_received" ? "npr" : "ndr",
        note || "Simulated tracking exception",
        now,
      );
      db.prepare(
        "INSERT INTO exception_history(case_id,user_id,action,note,created_at) VALUES (?,?,'opened',?,?)",
      ).run(
        caseId,
        user.id,
        "Created by local tracking replay: " + eventKey,
        now,
      );
    }
    return {
      applied,
      disposition,
      message: applied
        ? "Tracking updated."
        : "Event retained without changing current status: " + disposition,
    };
  });
}
export function reviewReturn(db: DatabaseSync, user: User, input: unknown) {
  staff(user);
  const v = record(input),
    id = text(v.id, "Shipment ID"),
    decision = text(v.decision, "QA decision", 20),
    note = text(v.note, "QA note", 500);
  if (!["accepted", "rejected"].includes(decision))
    throw new InputError("Choose accepted or rejected.");
  return transaction(db, () => {
    const s = getShipment(db, user, id);
    simulatorOnly(s);
    if (
      s.direction !== "reverse" ||
      s.status !== "delivered" ||
      s.qa_status !== "pending"
    )
      throw new InputError(
        "QA requires a received return awaiting review.",
        409,
      );
    if (s.revision !== Number(v.revision))
      throw new InputError("Return changed. Reload before review.", 409);
    db.prepare(
      "UPDATE shipments SET qa_status=?,qa_note=?,revision=revision+1 WHERE id=?",
    ).run(decision, note, id);
    audit(db, user, id, "return_qa_" + decision, note);
    return { id };
  });
}
export async function uploadProof(
  db: DatabaseSync,
  user: User,
  input: unknown,
) {
  writable(user);
  const v = record(input),
    id = text(v.id, "Shipment ID"),
    filename = text(v.filename, "Filename", 120),
    encoded = text(v.content, "Image data", 1_400_000);
  const initial = getShipment(db, user, id);
  simulatorOnly(initial);
  if (initial.status !== "delivered")
    throw new InputError(
      "POD can be uploaded only for delivered shipments.",
      409,
    );
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw new InputError("Invalid image encoding.");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > 1_000_000)
    throw new InputError("POD file must be at most 1 MB.", 413);
  const { default: sharp } = await import("sharp");
  let content: Buffer;
  try {
    const image = sharp(bytes, {
      limitInputPixels: 16_000_000,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (!["jpeg", "png"].includes(metadata.format || ""))
      throw new Error("type");
    content = await image.rotate().png().toBuffer();
  } catch {
    throw new InputError(
      "Upload a valid PNG or JPEG image, up to 16 megapixels.",
    );
  }
  if (content.length > 2_000_000)
    throw new InputError("Decoded proof exceeds 2 MB. Resize the image.", 413);
  return transaction(db, () => {
    const s = getShipment(db, user, id);
    if (s.status !== "delivered")
      throw new InputError("Shipment is not delivered.", 409);
    const hash = createHash("sha256").update(content).digest("hex"),
      existing = db
        .prepare(
          "SELECT id FROM delivery_proofs WHERE shipment_id=? AND sha256=?",
        )
        .get(id, hash);
    if (existing)
      return {
        id: String(existing.id),
        message: "This proof is already uploaded.",
      };
    const count = Number(
      db
        .prepare("SELECT count(*) n FROM delivery_proofs WHERE shipment_id=?")
        .get(id)!.n,
    );
    if (count >= 10)
      throw new InputError(
        "At most ten proof versions are supported per shipment.",
      );
    const proofId = randomUUID();
    db.prepare(
      "INSERT INTO delivery_proofs(id,shipment_id,uploaded_by,filename,content,sha256,created_at) VALUES (?,?,?,?,?,?,?)",
    ).run(proofId, id, user.id, filename, content, hash, Date.now());
    audit(db, user, id, "pod_uploaded", proofId);
    return { id: proofId, message: "Proof uploaded for manual review." };
  });
}
export function getProof(db: DatabaseSync, user: User, id: string) {
  const proof = db.prepare("SELECT * FROM delivery_proofs WHERE id=?").get(id);
  if (!proof) throw new InputError("Proof not found.", 404);
  getShipment(db, user, String(proof.shipment_id));
  return proof;
}
export function reviewProof(db: DatabaseSync, user: User, input: unknown) {
  staff(user);
  const v = record(input),
    id = text(v.id, "Proof ID"),
    decision = text(v.decision, "Decision", 20),
    note = text(v.note, "Review note", 500);
  if (!["verified", "rejected"].includes(decision))
    throw new InputError("Choose verified or rejected.");
  return transaction(db, () => {
    const proof = getProof(db, user, id);
    if (proof.status !== "pending" || proof.revision !== Number(v.revision))
      throw new InputError(
        "Proof changed or was already reviewed. Reload.",
        409,
      );
    db.prepare(
      "UPDATE delivery_proofs SET status=?,reviewed_by=?,reviewed_at=?,review_note=?,revision=revision+1 WHERE id=?",
    ).run(decision, user.id, Date.now(), note, id);
    audit(db, user, String(proof.shipment_id), "pod_" + decision, note);
    return { id };
  });
}
export function shipmentDetail(db: DatabaseSync, user: User, id: string) {
  const shipment = getShipment(db, user, id);
  const events = db
    .prepare(
      "SELECT id,event_key,status,location,note,occurred_at,received_at,applied,disposition FROM tracking_events WHERE shipment_id=? ORDER BY occurred_at DESC,id DESC",
    )
    .all(id);
  const proofs = db
    .prepare(
      "SELECT id,filename,status,created_at,review_note,revision FROM delivery_proofs WHERE shipment_id=? ORDER BY created_at DESC",
    )
    .all(id);
  const history = db
    .prepare(
      "SELECT action,note,created_at FROM shipment_audit WHERE shipment_id=? ORDER BY id DESC",
    )
    .all(id);
  return { shipment, events, proofs, history };
}
export function listShipments(
  db: DatabaseSync,
  user: User,
  params: URLSearchParams,
  direction = "forward",
) {
  const where = ["s.direction=?"],
    values: SQLInputValue[] = [direction];
  if (user.customer_id) {
    where.push("o.customer_id=?");
    values.push(user.customer_id);
  }
  for (const [key, column] of [
    ["status", "s.status"],
    ["carrier", "s.carrier"],
    ["qa", "s.qa_status"],
    ["mode", "s.mode"],
  ]) {
    if (params.get(key)) {
      where.push(`${column}=?`);
      values.push(params.get(key)!);
    }
  }
  if (params.get("q")) {
    where.push(
      "(s.awb LIKE ? ESCAPE '\\' OR o.reference LIKE ? ESCAPE '\\' OR o.customer LIKE ? ESCAPE '\\')",
    );
    const match =
      "%" +
      params
        .get("q")!
        .slice(0, 100)
        .replace(/[\\%_]/g, (c) => "\\" + c) +
      "%";
    values.push(match, match, match);
  }
  const from = params.get("from") ? date(params.get("from"), "from") : "";
  const to = params.get("to") ? date(params.get("to"), "to") : "";
  for (const [bound, op] of [
    [from, ">="],
    [to, "<="],
  ])
    if (bound) {
      where.push(`s.created_date${op}?`);
      values.push(bound);
    }
  if (from && to && from > to)
    throw new InputError("Start date must not follow end date.");
  const clause = where.join(" AND ");
  const total = Number(
      db
        .prepare(
          `SELECT count(*) n FROM shipments s JOIN orders o ON o.id=s.order_id WHERE ${clause}`,
        )
        .get(...values)!.n,
    ),
    pages = Math.max(1, Math.ceil(total / 20)),
    page = Math.min(
      pages,
      Math.max(1, Math.floor(Number(params.get("page")) || 1)),
    );
  const rows = db
    .prepare(
      `SELECT s.id,s.awb,s.status,s.carrier,s.service,s.mode,s.direction,s.created_date,s.price_paise,s.qa_status,o.reference,o.customer FROM shipments s JOIN orders o ON o.id=s.order_id WHERE ${clause} ORDER BY s.created_date DESC,s.created_at DESC,s.id DESC LIMIT 20 OFFSET ?`,
    )
    .all(...values, (page - 1) * 20);
  return { rows, total, page, pages };
}
