import type { DatabaseSync } from "node:sqlite";
import type { User } from "./auth-core.ts";
import {
  InputError,
  record,
  text,
  validateOrder,
  saveOrder,
  type OrderData,
} from "./orders.ts";

export { importFields, csv } from "./order-format.ts";
export type Mapping = Record<string, string>;
export function importOrders(
  db: DatabaseSync,
  user: User,
  input: unknown,
  commit = false,
) {
  const v = record(input);
  if (!Array.isArray(v.rows) || !v.rows.length || v.rows.length > 500)
    throw new InputError("Import between 1 and 500 rows.");
  const customerId = text(v.customer_id, "Customer"),
    warehouseId = text(v.warehouse_id, "Warehouse");
  const mapping = record(v.mapping);
  const seen = new Set<string>();
  return v.rows.map((raw, index) => {
    let reference = "";
    try {
      const row = record(raw);
      const get = (field: string) => {
        const key = mapping[field];
        return typeof key === "string" && Object.hasOwn(row, key)
          ? String(row[key] ?? "").trim()
          : "";
      };
      reference = get("reference");
      if (seen.has(reference.toLowerCase()))
        throw new InputError(
          "Duplicate reference within this file. One row represents one order.",
        );
      seen.add(reference.toLowerCase());
      const data: OrderData = {
        reference,
        customer_id: customerId,
        warehouse_id: warehouseId,
        recipient: {
          name: get("recipient_name"),
          phone: get("phone"),
          address: get("address"),
          city: get("city"),
          state: get("state"),
          pincode: get("pincode"),
        },
        items: [
          {
            name: get("product"),
            sku: get("sku"),
            hsn: get("hsn"),
            quantity: Number(get("quantity")),
            price: get("price"),
          },
        ],
        packages: [
          {
            weight: get("weight"),
            length: get("length"),
            width: get("width"),
            height: get("height"),
          },
        ],
        invoice_number: get("invoice_number"),
        invoice_date: get("invoice_date"),
        payment_mode: get("payment_mode"),
        carrier: get("carrier") || "No preference",
        notes: "",
      };
      validateOrder(db, user, data);
      if (
        db
          .prepare("SELECT id FROM orders WHERE lower(reference)=lower(?)")
          .get(reference)
      )
        throw new InputError(
          "Reference already exists; skipped without overwriting.",
        );
      const id = commit ? saveOrder(db, user, data) : undefined;
      return {
        row: index + 2,
        reference,
        status: commit ? "imported" : "ready",
        message: commit ? "Saved" : "Valid",
        id,
      };
    } catch (error) {
      if (!(error instanceof InputError)) throw error;
      return {
        row: index + 2,
        reference,
        status: "error",
        message: error.message,
      };
    }
  });
}
