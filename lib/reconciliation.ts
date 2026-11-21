import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { User } from "./auth-core.ts";
import {
  InputError,
  record,
  text,
  money,
  transaction,
  writable,
} from "./orders.ts";
import { getShipment } from "./shipping.ts";
import { saveFreight, saveFeedback, staffOnly } from "./operations.ts";

export function reconcileFile(
  db: DatabaseSync,
  user: User,
  input: unknown,
  commit = false,
) {
  writable(user);
  const v = record(input),
    kind = text(v.kind, "File kind");
  if (!["freight", "feedback"].includes(kind))
    throw new InputError("Unknown file kind.");
  if (kind === "freight") staffOnly(user);
  if (!Array.isArray(v.rows) || !v.rows.length || v.rows.length > 1000)
    throw new InputError("Include 1–1,000 rows.");
  const rows = v.rows;
  const process = () => ({
    message: commit
      ? "File processed locally. No payment or message sent."
      : "Preview only. No records saved.",
    results: rows.map((raw) => {
      let id = "Invalid row";
      try {
        return transaction(db, () => {
          const r = record(raw);
          id = text(r.awb, "Waybill", 80);
          const found = db
            .prepare("SELECT id FROM shipments WHERE awb=?")
            .get(id);
          if (!found) throw new InputError("Shipment not found.", 404);
          const s = getShipment(db, user, String(found.id));
          if (kind === "feedback") {
            const old = db
              .prepare(
                "SELECT revision,score,note FROM shipment_feedback WHERE shipment_id=?",
              )
              .get(s.id);
            if (
              old &&
              Number(r.score) === old.score &&
              String(r.note || "").trim() === old.note
            )
              return {
                id,
                status: "duplicate",
                message: "Same feedback already recorded.",
              };
            saveFeedback(db, user, {
              shipment_id: s.id,
              revision: r.revision || 0,
              score: r.score,
              note: r.note || "",
            });
          } else {
            const key = text(r.event_key, "Unique invoice row key", 120),
              invoice = text(r.invoice_ref, "Invoice reference", 100),
              quoted = money(r.quoted),
              invoiced = money(r.invoiced);
            const hash = createHash("sha256")
              .update(JSON.stringify([s.id, invoice, quoted, invoiced]))
              .digest("hex");
            const prior = db
              .prepare(
                "SELECT payload_hash FROM freight_imports WHERE event_key=?",
              )
              .get(key);
            if (prior) {
              if (prior.payload_hash !== hash)
                throw new InputError(
                  "Invoice row key was used with different values.",
                  409,
                );
              return {
                id,
                status: "duplicate",
                message: "Invoice row already imported.",
              };
            }
            saveFreight(db, user, {
              shipment_id: s.id,
              revision: r.revision || 0,
              quoted: r.quoted,
              invoiced: r.invoiced,
              invoice_ref: invoice,
            });
            db.prepare("INSERT INTO freight_imports VALUES(?,?,?,?)").run(
              key,
              hash,
              s.id,
              Date.now(),
            );
          }
          return {
            id,
            status: commit ? "saved" : "valid",
            message:
              kind === "freight"
                ? "Supplied invoice compared with supplied quote."
                : "Delivery feedback validated.",
          };
        });
      } catch (error) {
        if (!(error instanceof InputError)) throw error;
        return { id, status: "error", message: error.message };
      }
    }),
  });
  if (commit) return process();
  db.exec("SAVEPOINT reconciliation_preview");
  try {
    return process();
  } finally {
    db.exec(
      "ROLLBACK TO reconciliation_preview; RELEASE reconciliation_preview",
    );
  }
}
export function resolveFreight(db: DatabaseSync, user: User, input: unknown) {
  staffOnly(user);
  const v = record(input),
    id = text(v.shipment_id, "Shipment"),
    resolution = text(v.resolution, "Resolution"),
    note = text(v.note, "Resolution note", 500);
  if (!["open", "disputed", "resolved"].includes(resolution))
    throw new InputError("Invalid resolution.");
  return transaction(db, () => {
    getShipment(db, user, id);
    const changed = db
      .prepare(
        "UPDATE freight_entries SET resolution=?,resolution_note=?,revision=revision+1,updated_at=? WHERE shipment_id=? AND revision=?",
      )
      .run(resolution, note, Date.now(), id, Number(v.revision));
    if (!changed.changes)
      throw new InputError("Freight record changed. Reload.", 409);
    db.prepare(
      "INSERT INTO audit_events(user_id,action,created_at) VALUES(?,?,?)",
    ).run(user.id, `freight_${resolution}:${id}:${note}`, Date.now());
    return { message: "Discrepancy status saved. No settlement performed." };
  });
}
