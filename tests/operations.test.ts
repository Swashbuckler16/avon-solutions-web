import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../lib/db.ts";
import {
  saveCustomer,
  saveWarehouse,
  saveOrder,
  getOrder,
  transaction,
} from "../lib/orders.ts";
import {
  quoteShipment,
  bookShipment,
  replayTracking,
} from "../lib/shipping.ts";
import {
  openException,
  exceptionCases,
  exceptionAction,
  saveRule,
  applyRule,
  saveChannel,
  channelTemplates,
  syncChannel,
  saveFreight,
  saveFeedback,
} from "../lib/operations.ts";
import {
  reportRows,
  analytics,
  saveReport,
  runReport,
  reportDownload,
  runScheduledReports,
  reportDefinitions,
} from "../lib/reports.ts";
import type { User } from "../lib/auth-core.ts";
function setup() {
  const db = openDatabase(":memory:"),
    staff: User = {
      id: "staff",
      email: "staff@example.test",
      name: "Staff",
      role: "admin",
    };
  for (const id of ["staff", "a", "b"])
    db.prepare(
      "INSERT INTO users(id,email,name,role,password_hash,created_at) VALUES (?,?,?,?,?,0)",
    ).run(
      id,
      id + "@example.test",
      id === "staff" ? "Staff" : "Customer",
      id === "staff" ? "admin" : "operator",
      "unused",
    );
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
    other = saveCustomer(db, staff, { ...address, email: "b@example.test" });
  db.prepare("UPDATE users SET customer_id=? WHERE id='a'").run(customer);
  db.prepare("UPDATE users SET customer_id=? WHERE id='b'").run(other);
  const user: User = {
      ...staff,
      id: "a",
      role: "operator",
      customer_id: customer,
      email: "a@example.test",
    },
    stranger: User = { ...user, id: "b", customer_id: other },
    viewer: User = { ...staff, role: "viewer" };
  const warehouse = saveWarehouse(db, staff, {
    ...address,
    customer_id: customer,
    code: "TEST",
  });
  const data = {
    reference: "OP-1",
    customer_id: customer,
    warehouse_id: warehouse,
    recipient: address,
    items: [{ name: "Product", sku: "", hsn: "", quantity: 1, price: "100" }],
    packages: [{ weight: "1", length: "10", width: "10", height: "10" }],
    payment_mode: "prepaid",
    invoice_number: "INV-1",
    invoice_date: "2026-11-20",
    carrier: "Blue Dart",
    notes: "",
  };
  const order = saveOrder(db, user, data),
    now = Date.now() - 10_000;
  const book = () => {
    const q = quoteShipment(db, user, { order_id: order }, now).quotes.find(
      (q) => q.available,
    )!;
    return bookShipment(
      db,
      user,
      { quote_id: q.id, request_key: "test-book-0001", scenario: "success" },
      now,
    ).id!;
  };
  return {
    db,
    staff,
    user,
    stranger,
    viewer,
    customer,
    other,
    warehouse,
    data,
    order,
    now,
    book,
  };
}
test("nested transactions roll back channel/order work together", () => {
  const x = setup();
  try {
    assert.throws(
      () =>
        transaction(x.db, () => {
          saveOrder(x.db, x.user, { ...x.data, reference: "ROLLBACK" });
          throw new Error("stop");
        }),
      /stop/,
    );
    assert.equal(
      x.db.prepare("SELECT id FROM orders WHERE reference='ROLLBACK'").get(),
      undefined,
    );
  } finally {
    x.db.close();
  }
});
test("exception queues scope records, retain partial bulk failures and do not change tracking", () => {
  const x = setup();
  try {
    const id = x.book();
    const opened = openException(x.db, x.staff, {
      shipment_id: id,
      kind: "npr",
      reason: "Pickup not attempted",
    });
    assert.equal(exceptionCases(x.db, x.stranger).length, 0);
    assert.equal(
      Object.getPrototypeOf(exceptionCases(x.db, x.user)[0].history[0]),
      Object.prototype,
    );
    assert.throws(
      () =>
        openException(x.db, x.user, {
          shipment_id: id,
          kind: "npr",
          reason: "No",
        }),
      /staff/,
    );
    const result = exceptionAction(x.db, x.user, {
      cases: [
        { id: opened.id, revision: 1 },
        { id: "missing", revision: 1 },
        { id: "", revision: 1 },
        null,
      ],
      action: "reattempt",
      note: "Please retry tomorrow",
      follow_up_date: "2026-11-21",
    });
    assert.equal(result.results[0].status, "saved");
    assert.equal(exceptionCases(x.db, x.user)[0].follow_up_date, "2026-11-21");
    assert.match(
      String(exceptionCases(x.db, x.user)[0].history[0].note),
      /2026-11-21/,
    );
    assert.throws(
      () =>
        exceptionAction(x.db, x.user, {
          cases: [{ id: opened.id, revision: 2 }],
          action: "contact",
          note: "Invalid date",
          follow_up_date: "2026-02-30",
        }),
      /real YYYY/,
    );
    assert.equal(result.results[1].status, "error");
    assert.equal(result.results[2].status, "error");
    assert.equal(result.results[3].status, "error");
    assert.match(result.message, /1 of 4/);
    assert.equal(
      x.db.prepare("SELECT status FROM shipments WHERE id=?").get(id)!.status,
      "info_received",
    );
    assert.throws(
      () =>
        exceptionAction(x.db, x.user, {
          cases: [{ id: opened.id, revision: 2 }],
          action: "resolve",
          note: "Close",
        }),
      /staff/,
    );
    assert.equal(
      exceptionAction(x.db, x.staff, {
        cases: [{ id: opened.id, revision: 1 }],
        action: "resolve",
        note: "Stale",
      }).results[0].status,
      "error",
    );
    assert.equal(
      exceptionAction(x.db, x.staff, {
        cases: [{ id: opened.id, revision: 2 }],
        action: "resolve",
        note: "Pickup arranged locally",
      }).results[0].status,
      "saved",
    );
    assert.equal(exceptionCases(x.db, x.user)[0].history.length, 3);
  } finally {
    x.db.close();
  }
});
test("applied tracking exceptions create one case and duplicate replay does not duplicate", () => {
  const x = setup();
  try {
    const id = x.book(),
      event = {
        id,
        event_key: "pickup-failed",
        status: "exception",
        occurred_at: new Date(x.now + 1000).toISOString(),
        note: "Vehicle unavailable",
      };
    replayTracking(x.db, x.staff, event, x.now + 2000);
    replayTracking(x.db, x.staff, event, x.now + 2000);
    assert.equal(exceptionCases(x.db, x.user).length, 1);
    assert.equal(exceptionCases(x.db, x.user)[0].kind, "npr");
  } finally {
    x.db.close();
  }
});
test("rules are prioritized, scoped, preview-only until applied and reject stale orders", () => {
  const x = setup();
  try {
    const base = {
      customer_id: x.customer,
      name: "Default",
      priority: 100,
      active: 1,
      pin: "",
      payment: "any",
      max_kg: 100,
      carrier: "DTDC",
    };
    saveRule(x.db, x.staff, base);
    saveRule(x.db, x.staff, {
      ...base,
      name: "Chennai",
      priority: 10,
      pin: "600",
      carrier: "Blue Dart",
      warehouse_id: x.warehouse,
      length: "20",
      width: "15",
      height: "10",
    });
    const revision = getOrder(x.db, x.user, x.order).revision;
    const result = applyRule(x.db, x.user, { order_id: x.order, revision });
    assert.match(result.message, /Chennai/);
    assert.equal(getOrder(x.db, x.user, x.order).revision, revision);
    applyRule(x.db, x.user, { order_id: x.order, revision }, true);
    assert.equal(
      getOrder(x.db, x.user, x.order).details.packages![0].length,
      "20",
    );
    assert.throws(
      () => applyRule(x.db, x.user, { order_id: x.order, revision }, true),
      /changed/,
    );
    assert.throws(
      () => applyRule(x.db, x.stranger, { order_id: x.order, revision }),
      /not found/,
    );
    assert.throws(() => saveRule(x.db, x.user, base), /staff/);
    assert.throws(
      () => applyRule(x.db, x.viewer, { order_id: x.order, revision }),
      /read-only/,
    );
  } finally {
    x.db.close();
  }
});
test("channel templates are capped per customer and preserve ownership", () => {
  const x = setup();
  try {
    const insert = x.db
      .prepare(`INSERT INTO orders(id,reference,customer,destination,warehouse_id,status,payment_mode,amount_paise,created_date,customer_id,details,creation_seq)
      SELECT ?,?,'Other','Chennai',warehouse_id,status,payment_mode,amount_paise,created_date,?,details,? FROM orders WHERE id=?`);
    for (let i = 0; i < 105; i++)
      insert.run(`template-${i}`, `TEMPLATE-${i}`, x.other, 1000 + i, x.order);
    assert.equal(channelTemplates(x.db, x.staff, x.customer).length, 1);
    assert.equal(channelTemplates(x.db, x.staff, x.other).length, 100);
    assert.equal(channelTemplates(x.db, x.user, x.other).length, 0);
    assert.equal(
      channelTemplates(x.db, x.stranger, x.other)[0].reference,
      "TEMPLATE-104",
    );
  } finally {
    x.db.close();
  }
});

test("channel event keys prevent duplicates, reject changed payloads and preserve failed rows", () => {
  const x = setup();
  try {
    assert.throws(
      () => saveChannel(x.db, { ...x.staff, role: "operator" }, {}),
      /administrators/,
    );
    assert.throws(() => saveChannel(x.db, x.user, {}), /staff/);
    const channel = saveChannel(x.db, x.staff, {
        customer_id: x.customer,
        name: "Test shop",
        active: 1,
        callbacks: 1,
      }),
      order = { ...x.data, reference: "CHANNEL-1" };
    const payload = {
      channel_id: channel.id,
      events: [
        { event_key: "evt1", order },
        {
          event_key: "bad",
          order: { ...order, reference: "BAD", customer_id: x.other },
        },
      ],
    };
    const first = syncChannel(x.db, x.user, payload);
    assert.equal(first.results[0].status, "imported");
    assert.equal(first.results[1].status, "failed");
    assert.equal(
      syncChannel(x.db, x.user, payload).results[0].status,
      "duplicate",
    );
    assert.equal(
      syncChannel(x.db, x.user, {
        channel_id: channel.id,
        events: [
          { event_key: "evt1", order: { ...order, reference: "CHANGED" } },
        ],
      }).results[0].status,
      "error",
    );
    assert.throws(() => syncChannel(x.db, x.stranger, payload), /not found/);
    assert.equal(x.db.prepare("SELECT count(*) n FROM orders").get()!.n, 2);
    assert.equal(
      x.db.prepare("SELECT count(*) n FROM channel_events").get()!.n,
      2,
    );
  } finally {
    x.db.close();
  }
});
test("reports reconcile freight and NPS without cross-customer leakage", () => {
  const x = setup();
  try {
    const id = x.book();
    replayTracking(
      x.db,
      x.staff,
      {
        id,
        event_key: "done",
        status: "delivered",
        occurred_at: new Date(x.now + 1000).toISOString(),
      },
      x.now + 2000,
    );
    saveFreight(x.db, x.staff, {
      shipment_id: id,
      quoted: "100.10",
      invoiced: "120.15",
      invoice_ref: "INV-A",
      revision: 0,
    });
    saveFeedback(x.db, x.user, {
      shipment_id: id,
      score: 9,
      note: "Good",
      revision: 0,
    });
    const result = analytics(x.db, x.user, {});
    assert.equal(result.total, 1);
    assert.equal(reportRows(x.db, x.staff, { customer_id: x.other }).length, 0);
    assert.equal(
      reportRows(x.db, x.staff, { customer_id: x.customer }).length,
      1,
    );
    assert.equal(
      reportRows(x.db, x.stranger, { customer_id: x.customer }).length,
      0,
    );
    assert.equal(result.orders, 1);
    assert.equal(result.variancePaise, 2005);
    assert.equal(result.nps, 100);
    assert.equal(reportRows(x.db, x.stranger, {}).length, 0);
    assert.throws(
      () =>
        saveFreight(x.db, x.user, {
          shipment_id: id,
          quoted: "1",
          invoiced: "1",
          invoice_ref: "X",
          revision: 1,
        }),
      /staff/,
    );
    assert.throws(
      () =>
        saveFeedback(x.db, x.stranger, {
          shipment_id: id,
          score: 0,
          revision: 0,
        }),
      /not found/,
    );
    assert.throws(
      () =>
        saveFeedback(x.db, x.user, { shipment_id: id, score: 0, revision: 0 }),
      /changed/,
    );
  } finally {
    x.db.close();
  }
});
test("saved reports, downloads and schedules are owner-isolated and replay-safe", () => {
  const x = setup();
  try {
    x.book();
    const report = saveReport(x.db, x.user, {
        name: "Daily",
        filters: {},
        interval_hours: 1,
      }),
      run = runReport(x.db, x.user, report.id);
    assert.match(reportDownload(x.db, x.user, run.id), /OP-1/);
    assert.throws(() => reportDownload(x.db, x.stranger, run.id), /not found/);
    assert.throws(() => runReport(x.db, x.stranger, report.id), /not found/);
    const due = Date.now() + 3600001;
    assert.equal(runScheduledReports(x.db, due, x.stranger).length, 0);
    assert.equal(runScheduledReports(x.db, due).length, 1);
    assert.equal(runScheduledReports(x.db, due).length, 0);
    x.db.prepare("UPDATE customers SET active=0 WHERE id=?").run(x.customer);
    const result = runScheduledReports(x.db, due + 3600001);
    assert.equal(result[0].status, "failed");
    assert.equal(reportDefinitions(x.db, x.user)[0].interval_hours, 0);
  } finally {
    x.db.close();
  }
});
