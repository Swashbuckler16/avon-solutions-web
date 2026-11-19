import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../lib/db.ts";
import {
  saveCustomer,
  saveWarehouse,
  saveOrder,
  getOrder,
  changeOrder,
  listOrders,
  validateOrder,
  InputError,
  orderEvents,
  type OrderData,
} from "../lib/orders.ts";
import { importOrders } from "../lib/imports.ts";
import { csv, importFields, businessDate } from "../lib/order-format.ts";
import { overview } from "../lib/overview.ts";
import type { User } from "../lib/auth-core.ts";
const staff: User = {
  id: "staff",
  email: "staff@example.test",
  name: "Staff",
  role: "admin",
};
const contact = {
  name: "Test Shop",
  phone: "9999999999",
  address: "1 Fictional Road",
  city: "Chennai",
  state: "Tamil Nadu",
  pincode: "600001",
};

test("India business date crosses midnight correctly", () => {
  assert.equal(businessDate(new Date("2026-11-18T20:30:00Z")), "2026-11-19");
  assert.equal(businessDate(new Date("2026-11-18T18:29:00Z")), "2026-11-18");
});
test("new warehouse archive flag and immutable same-day order sequence are preserved", () => {
  const { db, data, userA, a } = fixture();
  try {
    const archived = saveWarehouse(db, userA, {
      ...contact,
      customer_id: a,
      code: "ARCHIVED",
      active: 0,
    });
    assert.equal(
      db.prepare("SELECT active FROM warehouses WHERE id=?").get(archived)!
        .active,
      0,
    );
    assert.throws(
      () => saveOrder(db, userA, { ...data, warehouse_id: archived }),
      /active pickup/,
    );
    const first = saveOrder(db, userA, { ...data, reference: "FIRST" });
    const second = saveOrder(db, userA, { ...data, reference: "SECOND" });
    saveOrder(
      db,
      userA,
      { ...data, reference: "FIRST", revision: 1, notes: "Edited later" },
      first,
    );
    assert.equal(
      listOrders(db, userA, new URLSearchParams("sort=newest")).rows[0].id,
      second,
    );
    assert.equal(
      listOrders(db, userA, new URLSearchParams("sort=oldest")).rows[0].id,
      first,
    );
    assert.equal(
      listOrders(db, userA, new URLSearchParams("sort=__proto__")).rows[0].id,
      second,
    );
  } finally {
    db.close();
  }
});
export function fixture() {
  const db = openDatabase(":memory:");
  db.prepare(
    "INSERT INTO users(id,email,name,role,password_hash,created_at) VALUES (?,?,?,?,?,?)",
  ).run(staff.id, staff.email, staff.name, staff.role, "unused", Date.now());
  const a = saveCustomer(db, staff, { ...contact, email: "a@example.test" }),
    b = saveCustomer(db, staff, {
      ...contact,
      name: "Second Shop",
      email: "b@example.test",
    });
  const wa = saveWarehouse(db, staff, {
      ...contact,
      customer_id: a,
      code: "TEST-A",
    }),
    wb = saveWarehouse(db, staff, {
      ...contact,
      customer_id: b,
      code: "TEST-B",
    });
  const userA: User = { ...staff, role: "operator", customer_id: a },
    userB: User = { ...staff, role: "operator", customer_id: b };
  const data: OrderData = {
    reference: "TEST-1",
    customer_id: a,
    warehouse_id: wa,
    payment_mode: "prepaid",
    recipient: contact,
    items: [
      {
        name: "Product",
        sku: "SKU-1",
        hsn: "6109",
        quantity: 3,
        price: "0.10",
      },
    ],
    packages: [{ weight: "0.2", length: "10", width: "12", height: "14" }],
    invoice_number: "INV-1",
    invoice_date: "2026-11-19",
    carrier: "DTDC",
    notes: "",
  };
  return { db, a, b, wa, wb, userA, userB, data };
}
test("order totals, revisions, audit, clone and status transitions", () => {
  const { db, data, userA } = fixture();
  try {
    const id = saveOrder(db, userA, data);
    assert.equal(getOrder(db, userA, id).amount_paise, 30);
    saveOrder(
      db,
      userA,
      {
        ...data,
        revision: 1,
        items: [{ ...data.items[0], quantity: 2, price: "12.34" }],
      },
      id,
    );
    assert.equal(getOrder(db, userA, id).amount_paise, 2468);
    assert.throws(
      () => saveOrder(db, userA, { ...data, revision: 1 }, id),
      /changed/,
    );
    changeOrder(db, userA, id, "hold", 2, "Needs review");
    assert.equal(getOrder(db, userA, id).status, "unprocessed");
    changeOrder(db, userA, id, "ready", 3, "Corrected");
    const clone = saveOrder(db, userA, {
      ...getOrder(db, userA, id).details,
      reference: "CLONE-1",
    });
    assert.equal(getOrder(db, userA, clone).status, "new");
    changeOrder(db, userA, id, "cancel", 4, "Customer requested cancellation");
    assert.throws(
      () => saveOrder(db, userA, { ...data, revision: 5 }, id),
      /unbooked/,
    );
    assert.equal(orderEvents(db, userA, id).length, 5);
    assert.throws(
      () => saveOrder(db, userA, { ...data, reference: "clone-1" }),
      /already exists/,
    );
  } finally {
    db.close();
  }
});
test("customer isolation covers details, writes, worklists, dashboard and export selection", () => {
  const { db, data, userA, userB, b, wb } = fixture();
  try {
    const id = saveOrder(db, userA, data);
    assert.throws(
      () => getOrder(db, userB, id),
      (e) => e instanceof InputError && e.status === 404,
    );
    assert.throws(() => saveOrder(db, userB, { ...data, reference: "FORGED" }));
    assert.throws(() =>
      saveWarehouse(db, userB, {
        ...contact,
        customer_id: userA.customer_id,
        code: "FORGED",
      }),
    );
    assert.throws(() =>
      saveCustomer(db, userA, { ...contact, email: "forged@example.test" }),
    );
    assert.equal(listOrders(db, userB, new URLSearchParams(), true).total, 0);
    assert.equal(overview(db, 30, "", new Date(), b).orders, 0);
    assert.equal(listOrders(db, userA, new URLSearchParams()).total, 1);
    assert.throws(() => saveOrder(db, userA, { ...data, warehouse_id: wb }));
    assert.throws(
      () => saveOrder(db, { ...staff, role: "viewer" }, data),
      /read-only/,
    );
    assert.throws(
      () => changeOrder(db, userB, id, "cancel", 1, "forged"),
      /not found/,
    );
  } finally {
    db.close();
  }
});
test("validation rejects invalid money, dates, quantities, addresses and archived pickup", () => {
  const { db, data, userA, wa } = fixture();
  try {
    for (const bad of ["-1", "1.001", "1e5", "NaN"])
      assert.throws(() =>
        validateOrder(db, userA, {
          ...data,
          items: [{ ...data.items[0], price: bad }],
        }),
      );
    assert.throws(() =>
      validateOrder(db, userA, { ...data, invoice_date: "2026-02-30" }),
    );
    assert.throws(() =>
      validateOrder(db, userA, {
        ...data,
        recipient: { ...contact, pincode: "000000" },
      }),
    );
    assert.throws(() =>
      validateOrder(db, userA, {
        ...data,
        items: [{ ...data.items[0], quantity: 1.5 }],
      }),
    );
    assert.throws(() =>
      validateOrder(db, userA, {
        ...data,
        packages: [{ ...data.packages[0], weight: "0" }],
      }),
    );
    db.prepare("UPDATE warehouses SET active=0 WHERE id=?").run(wa);
    assert.throws(() => saveOrder(db, userA, data), /active pickup/);
  } finally {
    db.close();
  }
});
test("bulk import previews without writes, reports per-row errors and safely retries", () => {
  const { db, data, userA } = fixture();
  try {
    const row = {
      reference: "IMPORT-1",
      recipient_name: contact.name,
      phone: contact.phone,
      address: contact.address,
      city: contact.city,
      state: contact.state,
      pincode: contact.pincode,
      product: "Shirt",
      sku: "SKU",
      hsn: "6109",
      quantity: "2",
      price: "9.99",
      weight: "0.5",
      length: "10",
      width: "10",
      height: "10",
      invoice_number: "INV-1",
      invoice_date: "2026-11-19",
      payment_mode: "cod",
      carrier: "Blue Dart",
    };
    const payload = {
      customer_id: data.customer_id,
      warehouse_id: data.warehouse_id,
      mapping: Object.fromEntries(importFields.map((f) => [f, f])),
      rows: [
        row,
        { ...row, reference: "IMPORT-2", pincode: "BAD" },
        row,
        { ...row, reference: "IMPORT-3" },
      ],
    };
    const preview = importOrders(db, userA, payload);
    assert.deepEqual(
      preview.map((r) => r.status),
      ["ready", "error", "error", "ready"],
    );
    assert.equal(listOrders(db, userA, new URLSearchParams()).total, 0);
    const imported = importOrders(db, userA, payload, true);
    assert.deepEqual(
      imported.map((r) => r.status),
      ["imported", "error", "error", "imported"],
    );
    assert.ok(
      importOrders(db, userA, payload, true).every((r) => r.status === "error"),
    );
    assert.equal(listOrders(db, userA, new URLSearchParams()).total, 2);
  } finally {
    db.close();
  }
});
test("filters, literal search, paging and formula-safe CSV preserve expected records", () => {
  const { db, data, userA } = fixture();
  try {
    for (let i = 0; i < 23; i++)
      saveOrder(db, userA, {
        ...data,
        reference: "PAGE-" + String(i).padStart(2, "0"),
      });
    assert.equal(listOrders(db, userA, new URLSearchParams()).rows.length, 20);
    assert.equal(
      listOrders(db, userA, new URLSearchParams("page=2")).rows.length,
      3,
    );
    assert.equal(listOrders(db, userA, new URLSearchParams("q=%25")).total, 0);
    assert.equal(
      listOrders(db, userA, new URLSearchParams("payment=cod")).total,
      0,
    );
    assert.equal(
      listOrders(db, userA, new URLSearchParams("sort=reference")).rows[0]
        .reference,
      "PAGE-00",
    );
    assert.throws(() =>
      listOrders(db, userA, new URLSearchParams("from=2026-02-30")),
    );
    assert.match(csv([['=HYPERLINK("bad")', "normal,comma"]]), /"'=HYPERLINK/);
  } finally {
    db.close();
  }
});
