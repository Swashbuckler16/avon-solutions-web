import { randomBytes, randomUUID } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { validOrigin, hashPassword } from "@/lib/auth-core";
import { getDb } from "@/lib/db";
import {
  InputError,
  record,
  text,
  writable,
  saveCustomer,
  saveWarehouse,
  saveOrder,
  getOrder,
  changeOrder,
  transaction,
} from "@/lib/orders";
import { importOrders } from "@/lib/imports";
import { reconcileFile, resolveFreight } from "@/lib/reconciliation";
import { saveProfile } from "@/lib/rate-cards";
import {
  packingPlan,
  transformOrder,
  bulkQuotes,
  bulkBook,
  trackingImport,
} from "@/lib/dispatch";
import {
  openException,
  exceptionAction,
  saveRule,
  applyRule,
  saveChannel,
  syncChannel,
  saveFreight,
  saveFeedback,
} from "@/lib/operations";
import { saveReport, runReport, runScheduledReports } from "@/lib/reports";
import {
  quoteShipment,
  bookShipment,
  reconcileBooking,
  cancelShipment,
  replayTracking,
  reviewReturn,
  uploadProof,
  reviewProof,
} from "@/lib/shipping";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!validOrigin(request.headers.get("origin")))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  try {
    writable(user);
    // Bound streamed input as well as Content-Length before parsing bulk JSON.
    const reader = request.body?.getReader();
    if (!reader) throw new InputError("Request body required.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) {
        await reader.cancel();
        throw new InputError("Request exceeds 2 MB.", 413);
      }
      chunks.push(value);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new InputError("Invalid JSON request.");
    }
    const body = record(parsed),
      data = body.data,
      db = getDb();
    let result: unknown;
    switch (body.action) {
      case "reconciliation_preview":
        result = reconcileFile(db, user, data);
        break;
      case "reconciliation_import":
        result = reconcileFile(db, user, data, true);
        break;
      case "freight_resolve":
        result = resolveFreight(db, user, data);
        break;
      case "dispatch_profile":
        result = saveProfile(db, user, data);
        break;
      case "packing_preview":
        result = packingPlan(db, user, data);
        break;
      case "packing_apply":
        result = packingPlan(db, user, data, true);
        break;
      case "order_transform":
        result = transformOrder(db, user, data);
        break;
      case "bulk_quotes":
        result = bulkQuotes(db, user, data);
        break;
      case "bulk_book":
        result = bulkBook(db, user, data);
        break;
      case "tracking_preview":
        result = trackingImport(db, user, data);
        break;
      case "tracking_import":
        result = trackingImport(db, user, data, true);
        break;
      case "exception_open":
        result = openException(db, user, data);
        break;
      case "exception_action":
        result = exceptionAction(db, user, data);
        break;
      case "rule_save":
        result = saveRule(db, user, data);
        break;
      case "rule_preview":
        result = applyRule(db, user, data);
        break;
      case "rule_apply":
        result = applyRule(db, user, data, true);
        break;
      case "channel_save":
        result = saveChannel(db, user, data);
        break;
      case "channel_sync":
        result = syncChannel(db, user, data);
        break;
      case "channel_replay": {
        const v = record(data),
          source = getOrder(db, user, text(v.source_id, "Source order"));
        result = syncChannel(db, user, {
          channel_id: v.channel_id,
          events: [
            {
              event_key: v.event_key,
              order: {
                ...source.details,
                reference: text(v.reference, "New reference"),
              },
            },
          ],
        });
        break;
      }
      case "freight_save":
        result = saveFreight(db, user, data);
        break;
      case "feedback_save":
        result = saveFeedback(db, user, data);
        break;
      case "report_save":
        result = saveReport(db, user, data);
        break;
      case "report_run":
        result = runReport(db, user, text(record(data).id, "Report"));
        break;
      case "report_tick":
        result = {
          message: "Due local schedules processed.",
          results: runScheduledReports(db, Date.now(), user),
        };
        break;
      case "shipping_quote":
        result = quoteShipment(db, user, data);
        break;
      case "shipping_book":
        result = bookShipment(db, user, data);
        break;
      case "shipping_reconcile":
        result = reconcileBooking(db, user, data);
        break;
      case "shipping_cancel":
        result = cancelShipment(db, user, data);
        break;
      case "tracking_replay":
        result = replayTracking(db, user, data);
        break;
      case "return_qa":
        result = reviewReturn(db, user, data);
        break;
      case "pod_upload":
        result = await uploadProof(db, user, data);
        break;
      case "pod_review":
        result = reviewProof(db, user, data);
        break;
      case "customer":
        result = { id: saveCustomer(db, user, data) };
        break;
      case "warehouse":
        result = { id: saveWarehouse(db, user, data) };
        break;
      case "order":
        result = {
          id: saveOrder(
            db,
            user,
            data,
            body.id ? text(body.id, "Order ID") : undefined,
          ),
        };
        break;
      case "bulk": {
        const v = record(data);
        if (
          !Array.isArray(v.orders) ||
          !v.orders.length ||
          v.orders.length > 100
        )
          throw new InputError("Select 1–100 orders.");
        const action = text(v.action, "Action"),
          note = text(v.note, "Reason", 250);
        result = v.orders.map((raw) => {
          const item = record(raw),
            id = text(item.id, "Order ID");
          try {
            changeOrder(db, user, id, action, Number(item.revision), note);
            return { id, status: "saved", message: "Updated" };
          } catch (error) {
            if (!(error instanceof InputError)) throw error;
            return { id, status: "error", message: error.message };
          }
        });
        break;
      }
      case "preview":
        result = importOrders(db, user, data);
        break;
      case "import":
        result = importOrders(db, user, data, true);
        break;
      case "mapping": {
        const v = record(data),
          name = text(v.name, "Mapping name", 60),
          mapping = record(v.mapping);
        if (
          Object.keys(mapping).length > 30 ||
          Object.values(mapping).some(
            (x) => typeof x !== "string" || x.length > 200,
          )
        )
          throw new InputError("Invalid mapping.");
        db.prepare(
          "INSERT INTO import_mappings VALUES (?,?,?) ON CONFLICT(user_id,name) DO UPDATE SET mapping=excluded.mapping",
        ).run(user.id, name, JSON.stringify(mapping));
        result = { saved: true };
        break;
      }
      case "account": {
        if (user.customer_id || user.role !== "admin")
          throw new InputError(
            "Only Avon administrators can create customer logins.",
            403,
          );
        const v = record(data),
          customerId = text(v.customer_id, "Customer"),
          email = text(v.email, "Email", 160).toLowerCase(),
          name = text(v.name, "Name", 80);
        if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email))
          throw new InputError("Enter a valid name and email.");
        const password = randomBytes(18).toString("base64url"),
          hash = await hashPassword(password);
        transaction(db, () => {
          if (
            !db
              .prepare("SELECT id FROM customers WHERE id=? AND active=1")
              .get(customerId)
          )
            throw new InputError("Choose an active customer.");
          db.prepare(
            "INSERT INTO users(id,email,name,role,password_hash,created_at,customer_id) VALUES (?,?,?,'operator',?,?,?)",
          ).run(randomUUID(), email, name, hash, Date.now(), customerId);
          db.prepare(
            "INSERT INTO audit_events(user_id,action,created_at) VALUES (?,?,?)",
          ).run(user.id, `customer_login_created:${customerId}`, Date.now());
        });
        result = { email, password };
        break;
      }
      default:
        throw new InputError("Unknown operation.");
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InputError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message.includes("UNIQUE constraint"))
      return Response.json(
        { error: "That reference, code or email is already in use." },
        { status: 409 },
      );
    console.error(
      "Operation failed",
      error instanceof Error ? error.name : "unknown",
    );
    return Response.json(
      { error: "Unable to save. Reload and try again." },
      { status: 500 },
    );
  }
}
