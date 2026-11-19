import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { simulatedServices } from "../lib/carrier-simulator.ts";
import { openDatabase } from "../lib/db.ts";
import {
  saveCustomer,
  saveWarehouse,
  saveOrder,
  getOrder,
  InputError,
  type OrderData,
} from "../lib/orders.ts";
import {
  quoteShipment,
  bookShipment,
  reconcileBooking,
  cancelShipment,
  getShipment,
  replayTracking,
  reviewReturn,
  uploadProof,
  getProof,
  reviewProof,
  listShipments,
} from "../lib/shipping.ts";
import { overview } from "../lib/overview.ts";
import type { User } from "../lib/auth-core.ts";

test("simulator keeps exact weight boundaries and rounds fractional volume up", () => {
  const address = { name: "Test", phone: "9999999999", address: "Test road", city: "Test", state: "Test", pincode: "600001" };
  const parcel = (weight: string) => ({ weight, length: "1", width: "1", height: "1" });
  const packages = [parcel("99"), ...Array.from({length: 5}, () => parcel("0.2"))];
  assert.equal(simulatedServices(address, address, packages)[0].chargeable_kg, 100);
  assert.equal(simulatedServices(address, address, packages)[0].available, true);
  assert.equal(simulatedServices(address, address, [...packages, parcel("0.001")])[0].available, false);
  assert.equal(simulatedServices(address, address, [{weight: "0.1", length: "25", width: "10", height: "10"}])[0].chargeable_kg, 0.5);
  assert.equal(simulatedServices(address, address, [{weight: "0.1", length: "25.001", width: "10", height: "10"}])[0].chargeable_kg, 1);
});

test("shipment worklists normalize dates and sort historical records chronologically", () => {
  const x = setup();
  try {
    const insert = x.db.prepare("INSERT INTO shipments(id,order_id,status,carrier,created_date,mode) VALUES (?,?,?,?,?,?)");
    for (const [id, date] of [["m-mid", "2026-11-18"], ["z-old", "2026-11-17"], ["b-new", "2026-11-19"], ["a-oldest", "2026-11-16"]]) {
      insert.run(id, x.order, "cancelled", "Local simulator", date, "fixture");
    }
    assert.deepEqual(listShipments(x.db,x.user,new URLSearchParams()).rows.map((row) => row.id), ["b-new", "m-mid", "z-old", "a-oldest"]);
    assert.equal(listShipments(x.db,x.user,new URLSearchParams({from:"2026-11-19",to:" 2026-11-19"})).total,1);
    assert.throws(() => listShipments(x.db,x.user,new URLSearchParams({from:"2026-11-19",to:"2026-11-18"})),/Start date/);
  } finally { x.db.close(); }
});

function setup() {
  const db = openDatabase(":memory:");
  const staff: User = {
    id: "staff",
    email: "staff@example.test",
    name: "Test Staff",
    role: "admin",
  };
  db.prepare(
    "INSERT INTO users(id,email,name,role,password_hash,created_at) VALUES (?,?,?,?,?,?)",
  ).run(staff.id, staff.email, staff.name, staff.role, "unused", 0);
  const pickup = {
    name: "Synthetic Shop",
    phone: "9999999999",
    address: "1 Example Road",
    city: "Chennai",
    state: "Tamil Nadu",
    pincode: "600001",
  };
  const a = saveCustomer(db, staff, { ...pickup, email: "a@example.test" }),
    b = saveCustomer(db, staff, { ...pickup, email: "b@example.test" });
  const warehouse = saveWarehouse(db, staff, {
    ...pickup,
    customer_id: a,
    code: "SHIP-A",
  });
  const user: User = { ...staff, role: "operator", customer_id: a },
    other: User = { ...staff, role: "operator", customer_id: b };
  const data: OrderData = {
    reference: "SHIP-1",
    customer_id: a,
    warehouse_id: warehouse,
    recipient: {
      ...pickup,
      name: "Test Recipient",
      city: "Bengaluru",
      pincode: "560001",
    },
    items: [
      {
        name: "Test item",
        sku: "TEST",
        hsn: "6109",
        quantity: 2,
        price: "100.25",
      },
    ],
    packages: [{ weight: "0.5", length: "20", width: "15", height: "10" }],
    payment_mode: "prepaid",
    invoice_number: "TEST-INVOICE",
    invoice_date: "2026-11-19",
    carrier: "Blue Dart",
    notes: "",
  };
  const order = saveOrder(db, user, data),
    now = Date.now() - 10000;
  const quote = () =>
    quoteShipment(db, user, { order_id: order }, now).quotes.find(
      (q) => q.carrier === "Blue Dart" && q.available,
    )!;
  return { db, staff, user, other, data, order, warehouse, now, quote };
}
test("simulated booking snapshots, ownership and duplicate prevention", () => {
  const x = setup();
  try {
    const q = x.quote();
    const request = {
      quote_id: q.id,
      request_key: "request-0001",
      scenario: "success",
    };
    const booked = bookShipment(x.db, x.user, request, x.now);
    assert.equal(booked.state, "booked");
    const s = getShipment(x.db, x.user, booked.id!);
    assert.match(s.awb!, /^SIM-/);
    assert.equal(s.snapshot.pickup.city, "Chennai");
    assert.equal(s.snapshot.recipient.city, "Bengaluru");
    assert.equal(getOrder(x.db, x.user, x.order).status, "shipped");
    assert.equal(
      bookShipment(x.db, x.user, request, x.now + 99999999).id,
      s.id,
    );
    assert.throws(
      () =>
        bookShipment(
          x.db,
          x.user,
          { ...request, request_key: "request-0002" },
          x.now,
        ),
      /ready|active shipment/,
    );
    assert.throws(
      () => getShipment(x.db, x.other, s.id),
      (e) => e instanceof InputError && e.status === 404,
    );
    assert.equal(listShipments(x.db, x.other, new URLSearchParams()).total, 0);
    assert.throws(
      () => bookShipment(x.db, x.other, request, x.now),
      /not found/,
    );
    assert.throws(
      () =>
        quoteShipment(
          x.db,
          { ...x.staff, role: "viewer" },
          { order_id: x.order },
        ),
      /read-only/,
    );
  } finally {
    x.db.close();
  }
});
test("quote expiration, stale order/pickup revisions and unserviceable test PIN", () => {
  const x = setup();
  try {
    const q = x.quote();
    assert.throws(
      () =>
        bookShipment(
          x.db,
          x.user,
          { quote_id: q.id, request_key: "expired-0001" },
          x.now + 900001,
        ),
      /expired/,
    );
    assert.equal(
      reconcileBooking(x.db, x.user, { request_key: "expired-0001" }).state,
      "retryable",
    );
    x.db
      .prepare("UPDATE warehouses SET revision=revision+1 WHERE id=?")
      .run(x.warehouse);
    assert.throws(
      () =>
        bookShipment(
          x.db,
          x.user,
          { quote_id: q.id, request_key: "stale-0001" },
          x.now,
        ),
      /changed/,
    );
    const q2 = x.quote();
    saveOrder(
      x.db,
      x.user,
      { ...x.data, notes: "Changed", revision: 1 },
      x.order,
    );
    assert.throws(
      () =>
        bookShipment(
          x.db,
          x.user,
          { quote_id: q2.id, request_key: "stale-0002" },
          x.now,
        ),
      /changed/,
    );
    saveOrder(
      x.db,
      x.user,
      {
        ...x.data,
        recipient: { ...x.data.recipient, pincode: "999999" },
        revision: 2,
      },
      x.order,
    );
    assert.ok(
      quoteShipment(x.db, x.user, { order_id: x.order }, x.now).quotes.every(
        (q) => !q.available,
      ),
    );
  } finally {
    x.db.close();
  }
});
test("failure and lost-response retries recover exactly one shipment", () => {
  for (const scenario of ["fail_once", "timeout_after_booking"]) {
    const x = setup();
    try {
      const request = {
        quote_id: x.quote().id,
        request_key: "retry-request",
        scenario,
      };
      const initial = bookShipment(x.db, x.user, request, x.now);
      assert.equal(
        initial.state,
        scenario === "fail_once" ? "retryable" : "unknown",
      );
      if (scenario === "timeout_after_booking")
        assert.equal(reconcileBooking(x.db, x.user, request).state, "booked");
      const recovered = bookShipment(x.db, x.user, request, x.now + 1);
      assert.equal(recovered.state, "booked");
      assert.equal(
        bookShipment(x.db, x.user, request, x.now + 2).id,
        recovered.id,
      );
      assert.equal(
        x.db.prepare("SELECT count(*) n FROM shipments").get()!.n,
        1,
      );
      assert.throws(
        () =>
          bookShipment(
            x.db,
            x.user,
            {
              ...request,
              scenario: scenario === "fail_once" ? "success" : "fail_once",
            },
            x.now,
          ),
        /different booking/,
      );
    } finally {
      x.db.close();
    }
  }
});
test("cancellation restores editability; rebooking does not duplicate dashboard activity", () => {
  const x = setup();
  try {
    const first = bookShipment(
      x.db,
      x.user,
      { quote_id: x.quote().id, request_key: "cancel-0001" },
      x.now,
    ).id!;
    cancelShipment(x.db, x.user, {
      id: first,
      revision: 1,
      note: "Customer request",
    });
    assert.equal(getOrder(x.db, x.user, x.order).status, "new");
    saveOrder(
      x.db,
      x.user,
      { ...x.data, notes: "Changed after cancellation", revision: 3 },
      x.order,
    );
    const second = bookShipment(
      x.db,
      x.user,
      { quote_id: x.quote().id, request_key: "rebook-0001" },
      x.now,
    ).id!;
    assert.notEqual(first, second);
    assert.equal(
      overview(x.db, 7, "", new Date(), x.user.customer_id!).activity.length,
      1,
    );
    replayTracking(x.db, x.staff, {
      id: second,
      event_key: "pickup-1",
      status: "in_transit",
      occurred_at: new Date(x.now + 1000).toISOString(),
    });
    assert.throws(
      () =>
        cancelShipment(x.db, x.user, {
          id: second,
          revision: 2,
          note: "Too late",
        }),
      /before pickup/,
    );
  } finally {
    x.db.close();
  }
});
test("tracking replay deduplicates, retains late events and protects terminal states", () => {
  const x = setup();
  try {
    const id = bookShipment(
      x.db,
      x.user,
      { quote_id: x.quote().id, request_key: "events-0001" },
      x.now,
    ).id!;
    const event = {
      id,
      event_key: "evt-1",
      status: "in_transit",
      location: "Chennai",
      note: "Pickup scan",
      occurred_at: new Date(x.now + 1000).toISOString(),
    };
    assert.throws(() => replayTracking(x.db, x.user, event), /staff access/);
    assert.equal(replayTracking(x.db, x.staff, event).applied, true);
    assert.equal(replayTracking(x.db, x.staff, event).disposition, "duplicate");
    assert.throws(
      () => replayTracking(x.db, x.staff, { ...event, note: "Different" }),
      /different content/,
    );
    assert.equal(
      replayTracking(x.db, x.staff, {
        ...event,
        event_key: "late",
        status: "info_received",
        occurred_at: new Date(x.now + 500).toISOString(),
      }).disposition,
      "out_of_order",
    );
    assert.equal(
      replayTracking(x.db, x.staff, {
        ...event,
        event_key: "delivered",
        status: "delivered",
        occurred_at: new Date(x.now + 3000).toISOString(),
      }).applied,
      true,
    );
    assert.equal(
      replayTracking(x.db, x.staff, {
        ...event,
        event_key: "regress",
        occurred_at: new Date(x.now + 4000).toISOString(),
      }).disposition,
      "terminal_state",
    );
    assert.equal(getShipment(x.db, x.user, id).status, "delivered");
    assert.equal(
      x.db.prepare("SELECT count(*) n FROM tracking_events").get()!.n,
      5,
    );
  } finally {
    x.db.close();
  }
});
test("full return reverses snapshots, prevents duplicates and requires staff QA after receipt", () => {
  const x = setup();
  try {
    const id = bookShipment(
      x.db,
      x.user,
      { quote_id: x.quote().id, request_key: "return-fwd" },
      x.now,
    ).id!;
    assert.throws(
      () =>
        quoteShipment(
          x.db,
          x.user,
          { order_id: x.order, parent_id: id },
          x.now,
        ),
      /delivered/,
    );
    replayTracking(x.db, x.staff, {
      id,
      event_key: "delivered",
      status: "delivered",
      occurred_at: new Date(x.now + 1000).toISOString(),
    });
    const q = quoteShipment(
      x.db,
      x.user,
      { order_id: x.order, parent_id: id },
      x.now + 2000,
    ).quotes[0];
    const reverse = bookShipment(
      x.db,
      x.user,
      { quote_id: q.id, request_key: "return-rev" },
      x.now + 2000,
    ).id!;
    const s = getShipment(x.db, x.user, reverse);
    assert.equal(s.snapshot.pickup.city, "Bengaluru");
    assert.equal(s.snapshot.recipient.city, "Chennai");
    assert.equal(s.snapshot.order.payment_mode, "prepaid");
    assert.throws(
      () =>
        quoteShipment(
          x.db,
          x.user,
          { order_id: x.order, parent_id: id },
          x.now + 2000,
        ),
      /return already exists/,
    );
    assert.throws(
      () =>
        reviewReturn(x.db, x.staff, {
          id: reverse,
          revision: 1,
          decision: "accepted",
          note: "Test",
        }),
      /received return/,
    );
    replayTracking(x.db, x.staff, {
      id: reverse,
      event_key: "received",
      status: "delivered",
      occurred_at: new Date(x.now + 3000).toISOString(),
    });
    assert.equal(getShipment(x.db, x.user, reverse).qa_status, "pending");
    assert.throws(
      () =>
        reviewReturn(x.db, x.user, {
          id: reverse,
          revision: 2,
          decision: "accepted",
          note: "Test",
        }),
      /staff access/,
    );
    reviewReturn(x.db, x.staff, {
      id: reverse,
      revision: 2,
      decision: "accepted",
      note: "Items intact",
    });
    assert.equal(getShipment(x.db, x.user, reverse).qa_status, "accepted");
  } finally {
    x.db.close();
  }
});
test("POD image validation, private access, duplicate uploads and review concurrency", async () => {
  const x = setup();
  try {
    const id = bookShipment(
      x.db,
      x.user,
      { quote_id: x.quote().id, request_key: "proof-0001" },
      x.now,
    ).id!;
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const input = {
      id,
      filename: "synthetic-proof.png",
      content: png.toString("base64"),
    };
    await assert.rejects(uploadProof(x.db, x.user, input), /delivered/);
    replayTracking(x.db, x.staff, {
      id,
      event_key: "delivered",
      status: "delivered",
      occurred_at: new Date(x.now + 1000).toISOString(),
    });
    await assert.rejects(
      uploadProof(x.db, x.user, {
        ...input,
        content: Buffer.from("<svg></svg>").toString("base64"),
      }),
      /valid PNG/,
    );
    const proof = await uploadProof(x.db, x.user, input);
    assert.equal((await uploadProof(x.db, x.user, input)).id, proof.id);
    assert.throws(() => getProof(x.db, x.other, proof.id), /not found/);
    assert.throws(
      () =>
        reviewProof(x.db, x.user, {
          id: proof.id,
          revision: 1,
          decision: "verified",
          note: "Test",
        }),
      /staff access/,
    );
    reviewProof(x.db, x.staff, {
      id: proof.id,
      revision: 1,
      decision: "verified",
      note: "Manual check complete",
    });
    assert.equal(getProof(x.db, x.user, proof.id).status, "verified");
    assert.throws(
      () =>
        reviewProof(x.db, x.staff, {
          id: proof.id,
          revision: 1,
          decision: "rejected",
          note: "Stale",
        }),
      /already reviewed/,
    );
  } finally {
    x.db.close();
  }
});
