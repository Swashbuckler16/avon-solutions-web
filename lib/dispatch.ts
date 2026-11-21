import { createHash } from "node:crypto";
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
  changeOrder,
  validateOrder,
  money,
  shippingDetails,
  type OrderData,
  type Parcel,
} from "./orders.ts";
import { profiles } from "./rate-cards.ts";
import {
  quoteShipment,
  bookShipment,
  replayTracking,
  getShipment,
} from "./shipping.ts";
import { integer, staffOnly } from "./operations.ts";

function readyOrder(
  db: DatabaseSync,
  user: User,
  id: string,
  revision: unknown,
) {
  const order = getOrder(db, user, id);
  if (order.revision !== Number(revision))
    throw new InputError("Order changed. Reload.", 409);
  if (
    !["new", "unprocessed"].includes(order.status) ||
    db
      .prepare(
        "SELECT id FROM shipments WHERE order_id=? AND status<>'cancelled'",
      )
      .get(id)
  )
    throw new InputError(
      "Only unbooked new/unprocessed orders can be prepared.",
      409,
    );
  return { ...order, details: validateOrder(db, user, order.details).data };
}
export function packingPlan(
  db: DatabaseSync,
  user: User,
  input: unknown,
  commit = false,
) {
  writable(user);
  const v = record(input),
    id = text(v.order_id, "Order");
  return transaction(db, () => {
    const order = readyOrder(db, user, id, v.revision),
      data = order.details,
      candidates = profiles(db, user, "packing").filter(
        (r) => r.active === 1 && r.customer_id === data.customer_id,
      ),
      packages: Parcel[] = [],
      used: string[] = [],
      warehouses = new Set<string>();
    const quantities = new Map<string, number>();
    for (const item of data.items)
      quantities.set(item.sku, (quantities.get(item.sku) || 0) + item.quantity);
    for (const [sku, quantity] of quantities) {
      const match = candidates.find(
        (r) =>
          r.config.sku === sku &&
          r.config.country === (data.shipping?.country || "IN") &&
          data.recipient.pincode
            .toUpperCase()
            .startsWith(r.config.prefix.toUpperCase()),
      );
      if (!match)
        throw new InputError(
          `No active packing rule for SKU ${sku || "(missing)"}. Configure every item before applying.`,
        );
      const c = match.config;
      if (c.warehouse_id) warehouses.add(c.warehouse_id);
      used.push(`${match.name} r${match.revision}`);
      for (let remaining = quantity; remaining > 0; remaining -= c.units) {
        const weight =
          (Math.min(remaining, c.units) * Math.round(c.unit_weight * 1000) +
            Math.round(c.tare * 1000)) /
          1000;
        if (weight > c.max_kg)
          throw new InputError("Planned box exceeds maximum weight.");
        packages.push({
          weight: String(weight),
          length: String(c.length),
          width: String(c.width),
          height: String(c.height),
        });
        if (packages.length > 20)
          throw new InputError(
            "Plan exceeds 20 packages; split the order first.",
          );
      }
    }
    if (warehouses.size > 1)
      throw new InputError(
        "Matching SKU rules allocate different warehouses. Split the order or align the rules.",
      );
    const next = {
      ...data,
      packages,
      warehouse_id: [...warehouses][0] || data.warehouse_id,
    };
    validateOrder(db, user, next);
    const token = createHash("sha256")
      .update(JSON.stringify({ next, used, revision: order.revision }))
      .digest("hex");
    if (commit) {
      if (v.token !== token)
        throw new InputError(
          "Plan changed. Preview again before applying.",
          409,
        );
      saveOrder(db, user, { ...next, revision: order.revision }, id);
    }
    const warehouse = db
      .prepare("SELECT name FROM warehouses WHERE id=?")
      .get(next.warehouse_id)!;
    return {
      token,
      packages,
      warehouse: String(warehouse.name),
      message: `${commit ? "Applied" : "Preview"}: ${packages.length} boxes; pickup ${warehouse.name}. ${used.join("; ")}. Based on supplied SKU capacities, not 3D packing.`,
    };
  });
}
export function transformOrder(db: DatabaseSync, user: User, input: unknown) {
  writable(user);
  const v = record(input),
    kind = text(v.kind, "Transformation");
  return transaction(db, () => {
    if (!Array.isArray(v.sources) || !v.sources.length || v.sources.length > 20)
      throw new InputError("Choose 1–20 source orders.");
    const sources = v.sources.map((raw) => {
      const r = record(raw);
      return readyOrder(db, user, text(r.id, "Source order"), r.revision);
    });
    if (new Set(sources.map((s) => s.id)).size !== sources.length)
      throw new InputError("Duplicate source order.");
    const first = sources[0],
      data = first.details;
    const outputs: OrderData[] = [];
    if (kind === "split") {
      if (
        sources.length !== 1 ||
        !Array.isArray(v.quantities) ||
        v.quantities.length !== data.items.length
      )
        throw new InputError(
          "Split one order with a quantity for each product.",
        );
      const quantities = v.quantities.map((n, i) =>
        integer(n, `Item ${i + 1} quantity`, 0, data.items[i].quantity),
      );
      const itemsA = data.items.flatMap((i, n) =>
          quantities[n] ? [{ ...i, quantity: quantities[n] }] : [],
        ),
        itemsB = data.items.flatMap((i, n) =>
          i.quantity > quantities[n]
            ? [{ ...i, quantity: i.quantity - quantities[n] }]
            : [],
        );
      if (!itemsA.length || !itemsB.length)
        throw new InputError("Both split orders must contain products.");
      if (!Array.isArray(v.packages_a) || !Array.isArray(v.packages_b))
        throw new InputError("Supply measured packages for both split orders.");
      outputs.push(
        {
          ...data,
          reference: text(v.reference_a, "First reference", 60),
          items: itemsA,
          packages: v.packages_a as Parcel[],
        },
        {
          ...data,
          reference: text(v.reference_b, "Second reference", 60),
          items: itemsB,
          packages: v.packages_b as Parcel[],
        },
      );
      if (data.shipping?.country && data.shipping.country !== "IN") {
        const declaredA = text(v.declared_a, "First declared value", 12),
          declaredB = text(v.declared_b, "Second declared value", 12);
        // Split declarations explicitly; never duplicate the source declaration.
        if (
          money(declaredA) + money(declaredB) !==
          money(data.shipping.declared_value)
        )
          throw new InputError(
            "Split declared values must add up to the original.",
          );
        outputs[0].shipping = { ...data.shipping, declared_value: declaredA };
        outputs[1].shipping = { ...data.shipping, declared_value: declaredB };
      }
    } else if (kind === "merge") {
      if (sources.length < 2)
        throw new InputError("Select at least two orders to merge.");
      const compatible = (d: OrderData) =>
        JSON.stringify([
          d.customer_id,
          d.warehouse_id,
          d.recipient,
          d.payment_mode,
          d.invoice_number,
          d.invoice_date,
          { ...shippingDetails(d.shipping), declared_value: "" },
        ]);
      if (sources.some((s) => compatible(s.details) !== compatible(data)))
        throw new InputError(
          "Merge requires the same customer, pickup, recipient, payment, invoice reference/date and shipping details.",
        );
      const notes = [
        ...new Set(sources.map((s) => s.details.notes).filter(Boolean)),
      ].join("; ");
      if (notes.length > 500)
        throw new InputError(
          "Combined notes exceed 500 characters. Resolve source notes before merging.",
        );
      outputs.push({
        ...data,
        notes,
        reference: text(v.reference, "Merged reference", 60),
        items: sources.flatMap((s) => s.details.items),
        packages: sources.flatMap((s) => s.details.packages),
      });
      if (sources.some((s) => s.details.shipping))
        outputs[0].shipping = {
          ...shippingDetails(data.shipping),
          declared_value: (
            sources.reduce(
              (sum, s) =>
                sum + money(s.details.shipping?.declared_value || "0"),
              0,
            ) / 100
          ).toFixed(2),
        };
    } else throw new InputError("Choose split or merge.");
    const ids = outputs.map((output) => saveOrder(db, user, output));
    for (const source of sources) {
      changeOrder(
        db,
        user,
        source.id,
        "cancel",
        source.revision,
        `${kind} into ${outputs.map((o) => o.reference).join(", ")}`.slice(
          0,
          250,
        ),
      );
      for (const target of ids)
        db.prepare("INSERT INTO order_links VALUES (?,?,?,?)").run(
          source.id,
          target,
          kind,
          Date.now(),
        );
    }
    return {
      message: `${kind} complete. Source orders retained as cancelled; replacement orders ready for preparation.`,
      results: ids.map((id, i) => ({
        id,
        status: "created",
        message: outputs[i].reference,
      })),
    };
  });
}

export function bulkQuotes(db: DatabaseSync, user: User, input: unknown) {
  writable(user);
  const v = record(input),
    strategy = text(v.strategy ?? "cheapest", "Strategy");
  if (!["cheapest", "fastest", "balanced"].includes(strategy))
    throw new InputError("Unknown allocation strategy.");
  if (!Array.isArray(v.orders) || !v.orders.length || v.orders.length > 500)
    throw new InputError("Select 1–500 orders.");
  return v.orders.map((raw) => {
    let id = "Invalid order";
    try {
      id = text(raw, "Order");
      const result = quoteShipment(db, user, { order_id: id }),
        choices = result.quotes.filter((q) => q.available && q.id);
      if (!choices.length)
        throw new InputError("No available simulated service.");
      const minPrice = Math.max(
          1,
          Math.min(...choices.map((q) => q.price_paise)),
        ),
        minDays = Math.min(...choices.map((q) => q.eta_days));
      const score = (q: (typeof choices)[number]) =>
        strategy === "cheapest"
          ? q.price_paise
          : strategy === "fastest"
            ? q.eta_days
            : q.price_paise / minPrice + q.eta_days / minDays;
      choices.sort(
        (a, b) =>
          score(a) - score(b) ||
          a.price_paise - b.price_paise ||
          a.carrier.localeCompare(b.carrier),
      );
      return {
        id,
        reference: result.snapshot.reference,
        status: "ready",
        quote: choices[0],
        message: choices[0].reason,
      };
    } catch (error) {
      if (!(error instanceof InputError)) throw error;
      return {
        id,
        reference: "",
        status: "error",
        quote: null,
        message: error.message,
      };
    }
  });
}
export function bulkBook(db: DatabaseSync, user: User, input: unknown) {
  writable(user);
  const v = record(input);
  if (!Array.isArray(v.rows) || !v.rows.length || v.rows.length > 500)
    throw new InputError("Confirm 1–500 prepared quotes.");
  return {
    results: v.rows.map((raw, index) => {
      let id = `Entry ${index + 1}`;
      try {
        const r = record(raw);
        id = text(r.quote_id, "Quote");
        const result = bookShipment(db, user, r);
        return {
          id: result.id || id,
          status: result.state,
          message: result.message,
        };
      } catch (error) {
        if (!(error instanceof InputError)) throw error;
        return { id, status: "error", message: error.message };
      }
    }),
    message:
      "Batch processed. Results are per shipment; retry with the same prepared batch to recover bookings.",
  };
}
export function trackingImport(
  db: DatabaseSync,
  user: User,
  input: unknown,
  commit = false,
) {
  staffOnly(user);
  const v = record(input);
  if (!Array.isArray(v.rows) || !v.rows.length || v.rows.length > 1000)
    throw new InputError("Import 1–1,000 tracking rows.");
  const rows = v.rows;
  const processRows = () => ({
    results: rows.map((raw, index) => {
      let id = `Row ${index + 1}`;
      try {
        const r = record(raw),
          awb = text(r.awb, "Waybill", 80);
        id = awb;
        if (
          typeof r.occurred_at !== "string" ||
          !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(r.occurred_at)
        )
          throw new InputError(
            "Tracking timestamp needs an ISO date/time with Z or an explicit offset.",
          );
        const shipment = db
          .prepare("SELECT id FROM shipments WHERE awb=?")
          .get(awb);
        if (!shipment) throw new InputError("Waybill not found.", 404);
        getShipment(db, user, String(shipment.id));
        const result = replayTracking(db, user, { ...r, id: shipment.id });
        return {
          id,
          status: commit ? "saved" : "valid",
          message: commit
            ? result.message
            : "Preview: " + result.message + " No event saved.",
        };
      } catch (error) {
        if (!(error instanceof InputError)) throw error;
        return { id, status: "error", message: error.message };
      }
    }),
    message: commit
      ? "Tracking file processed locally."
      : "Preview only. Confirm to save valid rows.",
  });
  if (commit) return processRows();
  // Validate the whole file in order so duplicate/conflicting rows see earlier
  // preview rows, then discard every event, status and exception mutation.
  db.exec("SAVEPOINT tracking_file_preview");
  try {
    return processRows();
  } finally {
    db.exec("ROLLBACK TO tracking_file_preview; RELEASE tracking_file_preview");
  }
}
