import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../lib/db.ts";
import {
  saveCustomer,
  saveWarehouse,
  saveOrder,
  getOrder,
  shippingDetails,
  type OrderData,
} from "../lib/orders.ts";
import { saveProfile, profiles } from "../lib/rate-cards.ts";
import {
  packingPlan,
  transformOrder,
  bulkQuotes,
  bulkBook,
  trackingImport,
} from "../lib/dispatch.ts";
import { getShipment, quoteShipment } from "../lib/shipping.ts";
import type { User } from "../lib/auth-core.ts";
function setup() {
  const db = openDatabase(":memory:"),
    staff: User = {
      id: "staff",
      email: "staff@example.test",
      name: "Test Staff",
      role: "admin",
    };
  db.prepare(
    "INSERT INTO users(id,email,name,role,password_hash,created_at) VALUES (?,?,?,?,?,0)",
  ).run(staff.id, staff.email, staff.name, staff.role, "unused");
  const address = {
    name: "Test Customer",
    phone: "9999999999",
    address: "1 Test Road",
    city: "Chennai",
    state: "Tamil Nadu",
    pincode: "600001",
  };
  const customer = saveCustomer(db, staff, {
      ...address,
      email: "a@example.test",
    }),
    other = saveCustomer(db, staff, { ...address, email: "b@example.test" }),
    warehouse = saveWarehouse(db, staff, {
      ...address,
      customer_id: customer,
      code: "PHASE6",
    });
  const user = { ...staff, role: "operator", customer_id: customer } as User,
    stranger = { ...user, customer_id: other },
    viewer = { ...staff, role: "viewer" } as User;
  const data: OrderData = {
    reference: "P6-1",
    customer_id: customer,
    warehouse_id: warehouse,
    recipient: address,
    items: [
      {
        name: "Shirt",
        sku: "SHIRT",
        hsn: "6109",
        quantity: 5,
        price: "100.25",
      },
    ],
    packages: [{ weight: "5", length: "10", width: "10", height: "10" }],
    payment_mode: "prepaid",
    invoice_number: "INV6",
    invoice_date: "2026-11-20",
    carrier: "No preference",
    notes: "",
  };
  const id = saveOrder(db, user, data);
  const rate = {
    kind: "rate",
    customer_id: customer,
    name: "Economy",
    priority: 1,
    active: 1,
    country: "IN",
    prefix: "600",
    warehouse_id: warehouse,
    carrier: "Blue Dart",
    service: "Economy",
    base: "40",
    per_kg: "10",
    max_kg: 100,
    eta_days: 5,
  };
  const packing = {
    kind: "packing",
    customer_id: customer,
    name: "Shirt box",
    priority: 1,
    active: 1,
    country: "IN",
    prefix: "600",
    warehouse_id: warehouse,
    sku: "SHIRT",
    units: 2,
    unit_weight: "0.4",
    tare: "0.1",
    length: 20,
    width: 20,
    height: 10,
    max_kg: 2,
  };
  return {
    db,
    staff,
    user,
    stranger,
    viewer,
    customer,
    warehouse,
    data,
    id,
    rate,
    packing,
  };
}
test("manual rates allocate by cost/delivery, scope customers, snapshot estimates and safely retry bulk bookings", () => {
  const x = setup();
  try {
    saveProfile(x.db, x.staff, x.rate);
    saveProfile(x.db, x.staff, {
      ...x.rate,
      name: "Fast",
      carrier: "DTDC",
      base: "100",
      eta_days: 1,
    });
    assert.equal(profiles(x.db, x.stranger, "rate").length, 0);
    assert.throws(() => saveProfile(x.db, x.user, x.rate), /staff/);
    assert.throws(() => saveProfile(x.db, x.viewer, x.rate), /read-only/);
    const cheapest = bulkQuotes(x.db, x.user, {
      orders: [x.id, "missing"],
      strategy: "cheapest",
    });
    assert.equal(cheapest[0].quote?.price_paise, 9000);
    assert.equal(cheapest[1].status, "error");
    assert.equal(
      bulkQuotes(x.db, x.user, { orders: [x.id], strategy: "fastest" })[0].quote
        ?.carrier,
      "DTDC",
    );
    assert.equal(
      bulkQuotes(x.db, x.stranger, { orders: [x.id] })[0].status,
      "error",
    );
    const rows = [
      {
        quote_id: cheapest[0].quote!.id,
        request_key: "p6-bulk-test-1",
        scenario: "success",
      },
      null,
    ];
    const booked = bulkBook(x.db, x.user, { rows });
    assert.equal(booked.results[0].status, "booked");
    assert.equal(booked.results[1].status, "error");
    assert.equal(
      bulkBook(x.db, x.user, { rows }).results[0].id,
      booked.results[0].id,
    );
    assert.match(
      getShipment(x.db, x.user, booked.results[0].id).snapshot.pricing_source!,
      /Economy/,
    );
  } finally {
    x.db.close();
  }
});
test("packing previews are read-only, preserve weights, reject stale plans and conflicting warehouses", () => {
  const x = setup();
  try {
    const profile = saveProfile(x.db, x.staff, x.packing);
    const p = packingPlan(x.db, x.user, { order_id: x.id, revision: 1 });
    assert.deepEqual(
      p.packages.map((b) => b.weight),
      ["0.9", "0.9", "0.5"],
    );
    assert.equal(getOrder(x.db, x.user, x.id).revision, 1);
    saveProfile(x.db, x.staff, {
      ...x.packing,
      id: profile.id,
      revision: 1,
      tare: "0.2",
    });
    assert.throws(
      () =>
        packingPlan(
          x.db,
          x.user,
          { order_id: x.id, revision: 1, token: p.token },
          true,
        ),
      /Plan changed/,
    );
    const fresh = packingPlan(x.db, x.user, { order_id: x.id, revision: 1 });
    packingPlan(
      x.db,
      x.user,
      { order_id: x.id, revision: 1, token: fresh.token },
      true,
    );
    assert.equal(getOrder(x.db, x.user, x.id).revision, 2);
    assert.throws(
      () => packingPlan(x.db, x.stranger, { order_id: x.id, revision: 2 }),
      /not found/,
    );
    assert.throws(
      () => saveProfile(x.db, x.staff, { ...x.packing, units: 10 }),
      /exceeds/,
    );
    const secondPickup = saveWarehouse(x.db, x.staff, {
      ...x.data.recipient,
      customer_id: x.customer,
      code: "SECOND",
    });
    saveProfile(x.db, x.staff, {
      ...x.packing,
      name: "Other SKU",
      sku: "OTHER",
      warehouse_id: secondPickup,
    });
    saveOrder(
      x.db,
      x.user,
      {
        ...x.data,
        revision: 2,
        items: [...x.data.items, { ...x.data.items[0], sku: "OTHER" }],
      },
      x.id,
    );
    assert.throws(
      () => packingPlan(x.db, x.user, { order_id: x.id, revision: 3 }),
      /different warehouses/,
    );
  } finally {
    x.db.close();
  }
});
test("split and merge preserve quantities/value, cancel sources, record lineage and roll back failed replacements", () => {
  const x = setup();
  try {
    const input = {
      kind: "split",
      sources: [{ id: x.id, revision: 1 }],
      quantities: [2],
      reference_a: "PART-A",
      reference_b: "PART-B",
      packages_a: x.data.packages,
      packages_b: x.data.packages,
    };
    assert.throws(
      () => transformOrder(x.db, x.user, { ...input, reference_b: "P6-1" }),
      /exists/,
    );
    assert.equal(x.db.prepare("SELECT count(*) n FROM orders").get()!.n, 1);
    assert.equal(getOrder(x.db, x.user, x.id).status, "new");
    const split = transformOrder(x.db, x.user, input),
      children = split.results.map((r) => getOrder(x.db, x.user, r.id));
    assert.equal(
      children.reduce((n, o) => n + o.amount_paise, 0),
      50125,
    );
    assert.equal(getOrder(x.db, x.user, x.id).status, "cancelled");
    assert.equal(
      x.db.prepare("SELECT count(*) n FROM order_links").get()!.n,
      2,
    );
    assert.throws(() => transformOrder(x.db, x.user, input), /changed/);
    const merged = transformOrder(x.db, x.user, {
      kind: "merge",
      sources: children.map((o) => ({ id: o.id, revision: o.revision })),
      reference: "MERGED",
    });
    assert.equal(
      getOrder(x.db, x.user, merged.results[0].id).amount_paise,
      50125,
    );
    assert.throws(
      () =>
        transformOrder(x.db, x.stranger, {
          ...input,
          sources: [{ id: merged.results[0].id, revision: 1 }],
        }),
      /not found/,
    );
  } finally {
    x.db.close();
  }
});
test("international and appointment records validate, persist into bookings and split declared amounts", () => {
  const x = setup();
  try {
    const shipping = shippingDetails({
      country: "GB",
      currency: "GBP",
      declared_value: "50",
      description: "Cotton shirts",
      appointment_date: "2026-12-01",
      appointment_time: "10:30",
      timezone: "Europe/London",
    });
    assert.throws(
      () => shippingDetails({ ...shipping, timezone: "invalid" }),
      /time zone/,
    );
    assert.throws(
      () => shippingDetails({ ...shipping, appointment_time: "" }),
      /together/,
    );
    const id = saveOrder(x.db, x.user, {
      ...x.data,
      reference: "INTERNATIONAL",
      recipient: {
        ...x.data.recipient,
        pincode: "SW1A 1AA",
        city: "London",
        state: "London",
      },
      shipping,
    });
    const splitInput = {
      kind: "split",
      sources: [{ id, revision: 1 }],
      quantities: [2],
      reference_a: "INT-A",
      reference_b: "INT-B",
      packages_a: x.data.packages,
      packages_b: x.data.packages,
      declared_a: "20",
      declared_b: "30",
    };
    assert.throws(
      () => transformOrder(x.db, x.user, { ...splitInput, declared_b: "29" }),
      /add up/,
    );
    const split = transformOrder(x.db, x.user, splitInput);
    const merged = transformOrder(x.db, x.user, {
      kind: "merge",
      sources: split.results.map((r) => ({ id: r.id, revision: 1 })),
      reference: "INT-MERGED",
    });
    const mergedId = merged.results[0].id;
    assert.equal(
      (getOrder(x.db, x.user, mergedId).details as OrderData).shipping
        ?.declared_value,
      "50.00",
    );
    const quote = quoteShipment(x.db, x.user, { order_id: mergedId }).quotes[0];
    assert.equal(quote.service, "Simulated international");
    const result = bulkBook(x.db, x.user, {
      rows: [{ quote_id: quote.id, request_key: "p6-international-1" }],
    });
    assert.equal(
      getShipment(x.db, x.user, result.results[0].id).snapshot.order.shipping
        ?.appointment_time,
      "10:30",
    );
    assert.throws(
      () =>
        transformOrder(x.db, x.user, {
          kind: "split",
          sources: [{ id: mergedId, revision: 2 }],
          quantities: [2],
        }),
      /unbooked/,
    );
  } finally {
    x.db.close();
  }
});
test("review regressions: repeated SKUs, exact-limit weights, optional zones and merged notes", () => {
  const x = setup();
  try {
    assert.equal(shippingDetails({ timezone: "" }).timezone, "Asia/Kolkata");
    assert.throws(
      () =>
        shippingDetails({
          appointment_date: "2026-12-01",
          appointment_time: "10:00",
          timezone: "",
        }),
      /Time zone/,
    );
    saveProfile(x.db, x.staff, {
      ...x.packing,
      units: 1,
      unit_weight: 0.1,
      tare: 0.2,
      max_kg: 0.3,
      active: 0,
    });
    assert.throws(
      () =>
        saveProfile(x.db, x.staff, {
          ...x.packing,
          units: 1,
          unit_weight: 0.101,
          tare: 0.2,
          max_kg: 0.3,
        }),
      /exceeds/,
    );
    saveProfile(x.db, x.staff, { ...x.packing, units: 3, max_kg: 2 });
    const lines = Array.from({ length: 21 }, () => ({
      ...x.data.items[0],
      quantity: 1,
    }));
    const repeated = saveOrder(x.db, x.user, {
      ...x.data,
      reference: "REPEATED",
      items: lines,
    });
    const plan = packingPlan(x.db, x.user, { order_id: repeated, revision: 1 });
    assert.equal(plan.packages.length, 7);
    assert.deepEqual(
      (getOrder(x.db, x.user, repeated).details as OrderData).items,
      lines,
    );
    const noted = saveOrder(x.db, x.user, {
      ...x.data,
      reference: "NOTED",
      notes: "Call before delivery",
      shipping: shippingDetails({ declared_value: "10" }),
    });
    const merged = transformOrder(x.db, x.user, {
      kind: "merge",
      sources: [
        { id: x.id, revision: 1 },
        { id: noted, revision: 1 },
      ],
      reference: "NOTES-MERGED",
    });
    const details = getOrder(x.db, x.user, merged.results[0].id)
      .details as OrderData;
    assert.equal(details.notes, "Call before delivery");
    assert.equal(details.shipping?.declared_value, "10.00");
    const a = saveOrder(x.db, x.user, {
      ...x.data,
      reference: "LONG-A",
      notes: "a".repeat(300),
    });
    const b = saveOrder(x.db, x.user, {
      ...x.data,
      reference: "LONG-B",
      notes: "b".repeat(300),
    });
    assert.throws(
      () =>
        transformOrder(x.db, x.user, {
          kind: "merge",
          sources: [
            { id: a, revision: 1 },
            { id: b, revision: 1 },
          ],
          reference: "TOO-LONG",
        }),
      /Resolve source notes/,
    );
    assert.equal(getOrder(x.db, x.user, a).status, "new");
    assert.equal(getOrder(x.db, x.user, b).status, "new");
  } finally {
    x.db.close();
  }
});
test("tracking-file preview rolls back and imports retain duplicate/conflict/ownership results", () => {
  const x = setup();
  try {
    const q = bulkQuotes(x.db, x.user, { orders: [x.id] })[0].quote!,
      r = bulkBook(x.db, x.user, {
        rows: [{ quote_id: q.id, request_key: "p6-tracking-test" }],
      }),
      s = getShipment(x.db, x.user, r.results[0].id);
    const row = {
        awb: s.awb,
        event_key: "file-1",
        status: "in_transit",
        occurred_at: new Date().toISOString(),
        location: "Chennai",
        note: "Test file",
      },
      rows = [row, { ...row, awb: "missing" }, null];
    assert.equal(
      trackingImport(x.db, x.staff, { rows }).results[0].status,
      "valid",
    );
    assert.equal(getShipment(x.db, x.user, s.id).status, "info_received");
    assert.equal(
      trackingImport(x.db, x.staff, {
        rows: [row, { ...row, note: "Changed within file" }],
      }).results[1].status,
      "error",
    );
    assert.equal(
      x.db
        .prepare(
          "SELECT count(*) n FROM tracking_events WHERE event_key='file-1'",
        )
        .get()!.n,
      0,
    );
    assert.throws(() => trackingImport(x.db, x.user, { rows }, true), /staff/);
    const result = trackingImport(x.db, x.staff, { rows }, true);
    assert.equal(result.results[0].status, "saved");
    assert.equal(result.results[1].status, "error");
    assert.equal(result.results[2].status, "error");
    trackingImport(x.db, x.staff, { rows: [row] }, true);
    assert.equal(
      x.db
        .prepare(
          "SELECT count(*) n FROM tracking_events WHERE event_key='file-1'",
        )
        .get()!.n,
      1,
    );
    assert.equal(
      trackingImport(
        x.db,
        x.staff,
        { rows: [{ ...row, note: "Changed" }] },
        true,
      ).results[0].status,
      "error",
    );
  } finally {
    x.db.close();
  }
});
