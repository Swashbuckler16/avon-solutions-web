import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { can, type User } from "./auth-core.ts";

export class InputError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
import { carriers } from "./order-format.ts";
export type Address = {
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
};
export type Customer = Address & {
  id: string;
  email: string;
  active: number;
  revision: number;
};
export type Warehouse = {
  id: string;
  name: string;
  code: string;
  city: string;
  customer_id: string | null;
  details: Address;
  active: number;
  revision: number;
};
export type Item = {
  name: string;
  sku: string;
  hsn: string;
  quantity: number;
  price: string;
};
export type Parcel = {
  weight: string;
  length: string;
  width: string;
  height: string;
};
export type OrderData = {
  reference: string;
  customer_id: string;
  warehouse_id: string;
  payment_mode: string;
  recipient: Address;
  items: Item[];
  packages: Parcel[];
  invoice_number: string;
  invoice_date: string;
  carrier: string;
  notes: string;
};
export type Order = {
  id: string;
  reference: string;
  customer_id: string | null;
  warehouse_id: string;
  customer: string;
  destination: string;
  status: string;
  payment_mode: string;
  amount_paise: number;
  created_date: string;
  synthetic: number;
  revision: number;
  details: OrderData | Record<string, never>;
};
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InputError("Expected an object.");
  return value as Record<string, unknown>;
}
export function text(
  value: unknown,
  label: string,
  max = 160,
  required = true,
) {
  if (typeof value !== "string") throw new InputError(`${label} must be text.`);
  const result = value.trim();
  if (
    (required && !result) ||
    result.length > max ||
    /[\x00-\x1f\x7f]/.test(result)
  )
    throw new InputError(
      `${label} is required and must be at most ${max} characters without control characters.`,
    );
  return result;
}
export function address(value: unknown): Address {
  const v = record(value);
  const result = {
    name: text(v.name, "Contact name", 80),
    phone: text(v.phone, "Phone", 16),
    address: text(v.address, "Street address", 250),
    city: text(v.city, "City", 80),
    state: text(v.state, "State", 80),
    pincode: text(v.pincode, "PIN code", 6),
  };
  if (!/^\+?[0-9]{10,15}$/.test(result.phone))
    throw new InputError(
      "Phone must contain 10–15 digits, optionally starting with +.",
    );
  if (!/^[1-9][0-9]{5}$/.test(result.pincode))
    throw new InputError("Enter a six-digit Indian PIN code.");
  return result;
}
export function money(value: unknown) {
  const s = text(value, "Unit price", 12);
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(s))
    throw new InputError(
      "Price must be non-negative with at most two decimals.",
    );
  const [whole, fraction = ""] = s.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function date(value: unknown, label: string) {
  const s = text(value, label, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    throw new InputError(`${label} must be a real YYYY-MM-DD date.`);
  return s;
}
export function writable(user: User) {
  if (!can(user.role, "operate"))
    throw new InputError("This account has read-only access.", 403);
}
export function transaction<T>(db: DatabaseSync, action: () => T): T {
  const savepoint = db.isTransaction
    ? "nested_" + randomUUID().replaceAll("-", "")
    : null;
  db.exec(savepoint ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
  try {
    const result = action();
    db.exec(savepoint ? `RELEASE ${savepoint}` : "COMMIT");
    return result;
  } catch (error) {
    if (savepoint) {
      db.exec(`ROLLBACK TO ${savepoint}`);
      db.exec(`RELEASE ${savepoint}`);
    } else db.exec("ROLLBACK");
    throw error;
  }
}
export function customers(db: DatabaseSync, user: User) {
  return db
    .prepare(
      `SELECT * FROM customers ${user.customer_id ? "WHERE id=?" : ""} ORDER BY name`,
    )
    .all(...(user.customer_id ? [user.customer_id] : []))
    .map((r) => ({ ...r })) as Customer[];
}
export function warehouses(db: DatabaseSync, user: User) {
  return db
    .prepare(
      `SELECT * FROM warehouses ${user.customer_id ? "WHERE customer_id=?" : ""} ORDER BY name`,
    )
    .all(...(user.customer_id ? [user.customer_id] : []))
    .map((r) => ({
      ...r,
      details: JSON.parse(String(r.details)),
    })) as Warehouse[];
}
function customerAccess(db: DatabaseSync, user: User, id: string) {
  if (user.customer_id && user.customer_id !== id)
    throw new InputError("Customer not found.", 404);
  if (!db.prepare("SELECT id FROM customers WHERE id=? AND active=1").get(id))
    throw new InputError("Choose an active customer.");
}
export function saveCustomer(db: DatabaseSync, user: User, input: unknown) {
  writable(user);
  if (user.customer_id)
    throw new InputError("Avon staff manage customer accounts.", 403);
  const v = record(input),
    a = address(v),
    email = text(v.email, "Email", 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new InputError("Enter a valid email.");
  const id = v.id ? text(v.id, "Customer ID") : randomUUID();
  const active = v.active === 0 ? 0 : 1;
  return transaction(db, () => {
    if (v.id) {
      const result = db
        .prepare(
          "UPDATE customers SET name=?,email=?,phone=?,address=?,city=?,state=?,pincode=?,active=?,revision=revision+1 WHERE id=? AND revision=?",
        )
        .run(
          a.name,
          email,
          a.phone,
          a.address,
          a.city,
          a.state,
          a.pincode,
          active,
          id,
          Number(v.revision),
        );
      if (!result.changes)
        throw new InputError("Customer changed. Reload before saving.", 409);
    } else
      db.prepare(
        "INSERT INTO customers(id,name,email,phone,address,city,state,pincode,active) VALUES (?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        a.name,
        email,
        a.phone,
        a.address,
        a.city,
        a.state,
        a.pincode,
        active,
      );
    db.prepare(
      "INSERT INTO audit_events(user_id,action,created_at) VALUES (?,?,?)",
    ).run(user.id, `customer_saved:${id}`, Date.now());
    return id;
  });
}
export function saveWarehouse(db: DatabaseSync, user: User, input: unknown) {
  writable(user);
  const v = record(input),
    a = address(v),
    customerId = text(v.customer_id, "Customer"),
    code = text(v.code, "Warehouse code", 30).toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(code))
    throw new InputError("Warehouse code accepts letters, digits, _ and -.");
  const id = v.id ? text(v.id, "Warehouse ID") : randomUUID();
  return transaction(db, () => {
    customerAccess(db, user, customerId);
    if (v.id) {
      const old = db
        .prepare("SELECT customer_id FROM warehouses WHERE id=?")
        .get(id);
      if (!old || (user.customer_id && old.customer_id !== user.customer_id))
        throw new InputError("Warehouse not found.", 404);
      if (
        old.customer_id !== customerId &&
        db.prepare("SELECT id FROM orders WHERE warehouse_id=? LIMIT 1").get(id)
      )
        throw new InputError(
          "A warehouse used by orders cannot be reassigned.",
          409,
        );
      const result = db
        .prepare(
          "UPDATE warehouses SET name=?,code=?,city=?,customer_id=?,details=?,active=?,revision=revision+1 WHERE id=? AND revision=?",
        )
        .run(
          a.name,
          code,
          a.city,
          customerId,
          JSON.stringify(a),
          v.active === 0 ? 0 : 1,
          id,
          Number(v.revision),
        );
      if (!result.changes)
        throw new InputError("Warehouse changed. Reload before saving.", 409);
    } else
      db.prepare(
        "INSERT INTO warehouses(id,name,code,city,customer_id,details,active) VALUES (?,?,?,?,?,?,?)",
      ).run(
        id,
        a.name,
        code,
        a.city,
        customerId,
        JSON.stringify(a),
        v.active === 0 ? 0 : 1,
      );
    db.prepare(
      "INSERT INTO audit_events(user_id,action,created_at) VALUES (?,?,?)",
    ).run(user.id, `warehouse_saved:${id}`, Date.now());
    return id;
  });
}
export function validateOrder(
  db: DatabaseSync,
  user: User,
  input: unknown,
): { data: OrderData; total: number } {
  const v = record(input);
  const customerId = text(v.customer_id, "Customer");
  customerAccess(db, user, customerId);
  const warehouseId = text(v.warehouse_id, "Pickup warehouse");
  const warehouse = db
    .prepare(
      "SELECT * FROM warehouses WHERE id=? AND customer_id=? AND active=1",
    )
    .get(warehouseId, customerId);
  if (!warehouse)
    throw new InputError(
      "Choose an active pickup warehouse belonging to this customer.",
    );
  address(JSON.parse(String(warehouse.details)));
  const reference = text(v.reference, "Order reference", 60);
  if (!/^[\w.-]+$/.test(reference))
    throw new InputError("Reference accepts letters, digits, _, . and -.");
  if (!["prepaid", "cod"].includes(String(v.payment_mode)))
    throw new InputError("Choose prepaid or COD.");
  if (!Array.isArray(v.items) || !v.items.length || v.items.length > 100)
    throw new InputError("Include 1–100 items.");
  let total = 0;
  const items = v.items.map((raw) => {
    const item = record(raw);
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000)
      throw new InputError("Item quantity must be 1–10,000.");
    const price = text(item.price, "Unit price", 12),
      unit = money(price);
    total += quantity * unit;
    const hsn = text(item.hsn ?? "", "HSN", 8, false);
    if (hsn && !/^\d{4}(\d{2}){0,2}$/.test(hsn))
      throw new InputError("HSN must contain 4, 6 or 8 digits.");
    return {
      name: text(item.name, "Product name", 120),
      sku: text(item.sku ?? "", "SKU", 60, false),
      hsn,
      quantity,
      price,
    };
  });
  if (total > 100000000000 || !Number.isSafeInteger(total))
    throw new InputError("Order total exceeds the supported limit.");
  if (
    !Array.isArray(v.packages) ||
    !v.packages.length ||
    v.packages.length > 20
  )
    throw new InputError("Include 1–20 packages.");
  const packages = v.packages.map((raw) => {
    const p = record(raw);
    const result = {} as Parcel;
    for (const key of ["weight", "length", "width", "height"] as const) {
      const val = text(p[key], `Package ${key}`, 10);
      if (
        !/^\d+(\.\d{1,3})?$/.test(val) ||
        Number(val) <= 0 ||
        Number(val) > (key === "weight" ? 1000 : 500)
      )
        throw new InputError(
          `Package ${key} must be positive and at most ${key === "weight" ? "1000 kg" : "500 cm"}.`,
        );
      result[key] = val;
    }
    return result;
  });
  const carrier = text(v.carrier ?? "No preference", "Preferred carrier", 40);
  if (!(carriers as readonly string[]).includes(carrier))
    throw new InputError("Choose a supported carrier preference.");
  const data: OrderData = {
    reference,
    customer_id: customerId,
    warehouse_id: warehouseId,
    payment_mode: String(v.payment_mode),
    recipient: address(v.recipient),
    items,
    packages,
    invoice_number: text(v.invoice_number, "Invoice number", 60),
    invoice_date: date(v.invoice_date, "Invoice date"),
    carrier,
    notes: text(v.notes ?? "", "Notes", 500, false),
  };
  return { data, total };
}
export function getOrder(db: DatabaseSync, user: User, id: string): Order {
  const row = db
    .prepare(
      `SELECT * FROM orders WHERE id=? ${user.customer_id ? "AND customer_id=?" : ""}`,
    )
    .get(id, ...(user.customer_id ? [user.customer_id] : []));
  if (!row) throw new InputError("Order not found.", 404);
  return { ...row, details: JSON.parse(String(row.details)) } as Order;
}
function event(
  db: DatabaseSync,
  user: User,
  id: string,
  action: string,
  note = "",
) {
  db.prepare(
    "INSERT INTO order_events(order_id,user_id,action,note,created_at) VALUES (?,?,?,?,?)",
  ).run(id, user.id, action, note, Date.now());
}
function editable(db: DatabaseSync, order: Order) {
  if (
    !["new", "unprocessed"].includes(order.status) ||
    db
      .prepare(
        "SELECT id FROM shipments WHERE order_id=? AND status<>'cancelled' LIMIT 1",
      )
      .get(order.id)
  )
    throw new InputError(
      "Only unbooked new or unprocessed orders can be changed.",
      409,
    );
}
export function saveOrder(
  db: DatabaseSync,
  user: User,
  input: unknown,
  id?: string,
) {
  writable(user);
  return transaction(db, () => {
    const v = record(input),
      old = id ? getOrder(db, user, id) : null;
    if (old) {
      editable(db, old);
      if (old.revision !== Number(v.revision))
        throw new InputError("Order changed. Reload before editing.", 409);
    }
    const { data, total } = validateOrder(db, user, input);
    if (
      db
        .prepare(
          "SELECT id FROM orders WHERE lower(reference)=lower(?) AND id<>?",
        )
        .get(data.reference, id || "")
    )
      throw new InputError(
        "That order reference already exists. Use a unique reference.",
        409,
      );
    const orderId = id || randomUUID();
    const merchant = db
      .prepare("SELECT name FROM customers WHERE id=?")
      .get(data.customer_id)!;
    if (old && old.customer_id && old.customer_id !== data.customer_id)
      throw new InputError(
        "An existing order cannot move between customers.",
        409,
      );
    if (old)
      db.prepare(
        "UPDATE orders SET reference=?,customer=?,destination=?,warehouse_id=?,customer_id=?,payment_mode=?,amount_paise=?,details=?,revision=revision+1,updated_at=? WHERE id=?",
      ).run(
        data.reference,
        String(merchant.name),
        data.recipient.city,
        data.warehouse_id,
        data.customer_id,
        data.payment_mode,
        total,
        JSON.stringify(data),
        Date.now(),
        orderId,
      );
    else
      db.prepare(
        "INSERT INTO orders(id,reference,customer,destination,warehouse_id,customer_id,status,payment_mode,amount_paise,created_date,synthetic,details,updated_at,creation_seq) VALUES (?,?,?,?,?,?,'new',?,?,?,0,?,?,(SELECT COALESCE(MAX(creation_seq),0)+1 FROM orders))",
      ).run(
        orderId,
        data.reference,
        String(merchant.name),
        data.recipient.city,
        data.warehouse_id,
        data.customer_id,
        data.payment_mode,
        total,
        new Date().toISOString().slice(0, 10),
        JSON.stringify(data),
        Date.now(),
      );
    event(db, user, orderId, old ? "updated" : "created");
    return orderId;
  });
}
export function changeOrder(
  db: DatabaseSync,
  user: User,
  id: string,
  action: string,
  revision: number,
  note: string,
) {
  writable(user);
  return transaction(db, () => {
    const order = getOrder(db, user, id);
    editable(db, order);
    if (order.revision !== revision)
      throw new InputError("Order changed. Reload before taking action.", 409);
    const status =
      action === "cancel"
        ? "cancelled"
        : action === "hold"
          ? "unprocessed"
          : action === "ready"
            ? "new"
            : null;
    if (!status) throw new InputError("Unknown order action.");
    const reason = text(note, "Reason", 250);
    db.prepare(
      "UPDATE orders SET status=?,revision=revision+1,updated_at=? WHERE id=?",
    ).run(status, Date.now(), id);
    event(db, user, id, action, reason);
    return id;
  });
}
export function orderEvents(db: DatabaseSync, user: User, id: string) {
  getOrder(db, user, id);
  return db
    .prepare(
      "SELECT action,note,created_at FROM order_events WHERE order_id=? ORDER BY id DESC",
    )
    .all(id);
}
export function listOrders(
  db: DatabaseSync,
  user: User,
  params: URLSearchParams,
  exportAll = false,
) {
  const clauses = ["1=1"],
    values: SQLInputValue[] = [];
  if (user.customer_id) {
    clauses.push("o.customer_id=?");
    values.push(user.customer_id);
  }
  const q = (params.get("q") || "").slice(0, 100);
  if (q) {
    clauses.push(
      "(o.reference LIKE ? ESCAPE '\\' OR o.customer LIKE ? ESCAPE '\\' OR o.destination LIKE ? ESCAPE '\\')",
    );
    const match = "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
    values.push(match, match, match);
  }
  for (const [key, column] of [
    ["status", "o.status"],
    ["customer", "o.customer_id"],
    ["warehouse", "o.warehouse_id"],
    ["payment", "o.payment_mode"],
  ]) {
    if (params.get(key)) {
      clauses.push(`${column}=?`);
      values.push(params.get(key)!);
    }
  }
  for (const [key, operator] of [
    ["from", ">="],
    ["to", "<="],
  ]) {
    if (params.get(key)) {
      clauses.push(`o.created_date${operator}?`);
      values.push(date(params.get(key), key));
    }
  }
  if (
    params.get("from") &&
    params.get("to") &&
    params.get("from")! > params.get("to")!
  )
    throw new InputError("Start date must be before end date.");
  const where = clauses.join(" AND ");
  const total = Number(
    db.prepare(`SELECT count(*) n FROM orders o WHERE ${where}`).get(...values)!
      .n,
  );
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(
    pages,
    Math.max(1, Math.floor(Number(params.get("page")) || 1)),
  );
  const sorts: Record<string, string> = {
    newest: "o.created_date DESC,o.creation_seq DESC,o.id DESC",
    oldest: "o.created_date,o.creation_seq,o.id",
    reference: "o.reference,o.id",
    value: "o.amount_paise DESC,o.id",
  };
  const sortKey = params.get("sort") || "newest";
  const sort = Object.hasOwn(sorts, sortKey) ? sorts[sortKey] : sorts.newest;
  if (exportAll && total > 10000)
    throw new InputError(
      "Narrow your filters to export at most 10,000 orders.",
    );
  const rows = db
    .prepare(
      `SELECT o.*,c.name merchant,w.name warehouse FROM orders o LEFT JOIN customers c ON c.id=o.customer_id JOIN warehouses w ON w.id=o.warehouse_id WHERE ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`,
    )
    .all(
      ...values,
      exportAll ? 10000 : pageSize,
      exportAll ? 0 : (page - 1) * pageSize,
    )
    .map((r) => ({ ...r, details: JSON.parse(String(r.details)) }));
  return {
    rows: rows as unknown as (Order & {
      warehouse: string;
      merchant: string | null;
    })[],
    total,
    page,
    pages,
  };
}
