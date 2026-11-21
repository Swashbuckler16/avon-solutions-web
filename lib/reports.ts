import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { User } from "./auth-core.ts";
import {
  InputError,
  record,
  text,
  date,
  writable,
  transaction,
} from "./orders.ts";
import { csv } from "./order-format.ts";
import { integer } from "./operations.ts";
import { performance } from "./performance.ts";

export type ReportFilters = {
  from: string;
  to: string;
  carrier: string;
  status: string;
  mode: string;
  direction: string;
  customer_id: string;
  last_days: string;
};
export function reportFilters(input: unknown): ReportFilters {
  const v = record(input),
    from = v.from ? date(v.from, "From") : "",
    to = v.to ? date(v.to, "To") : "";
  if (from && to && from > to)
    throw new InputError("Start date must not follow end date.");
  const carrier = text(v.carrier ?? "", "Carrier", 40, false),
    status = text(v.status ?? "", "Status", 30, false),
    mode = text(v.mode ?? "simulator", "Mode", 20),
    direction = text(v.direction ?? "", "Direction", 10, false);
  if (
    !["simulator", "fixture", "all"].includes(mode) ||
    !["", "forward", "reverse"].includes(direction) ||
    ![
      "",
      "info_received",
      "in_transit",
      "out_for_delivery",
      "delivered",
      "exception",
      "rto",
      "cancelled",
    ].includes(status)
  )
    throw new InputError("Invalid report filter.");
  const customer_id = text(v.customer_id ?? "", "Customer", 160, false);
  const last_days = String(integer(v.last_days || 0, "Rolling days", 0, 365));
  if (last_days !== "0" && (from || to))
    throw new InputError("Choose fixed dates or a rolling window, not both.");
  return { from, to, carrier, status, mode, direction, customer_id, last_days };
}
export function reportRows(
  db: DatabaseSync,
  user: User,
  input: unknown,
  search?: string,
) {
  const f = reportFilters(input),
    where: string[] = [],
    values: SQLInputValue[] = [];
  if (Number(f.last_days)) {
    f.to = new Date().toISOString().slice(0, 10);
    f.from = new Date(Date.parse(f.to) - (Number(f.last_days) - 1) * 86400000)
      .toISOString()
      .slice(0, 10);
  }
  if (user.customer_id) {
    where.push("o.customer_id=?");
    values.push(user.customer_id);
  }
  if (search !== undefined) {
    where.push(
      "(instr(lower(o.reference),lower(?))>0 OR instr(lower(coalesce(s.awb,'')),lower(?))>0)",
    );
    values.push(search, search);
  }
  for (const [value, column, operator] of [
    [f.customer_id, "o.customer_id", "="],
    [f.from, "s.created_date", ">="],
    [f.to, "s.created_date", "<="],
    [f.carrier, "s.carrier", "="],
    [f.status, "s.status", "="],
    [f.direction, "s.direction", "="],
    [f.mode === "all" ? "" : f.mode, "s.mode", "="],
  ])
    if (value) {
      where.push(`${column}${operator}?`);
      values.push(value);
    }
  const rows = db
    .prepare(
      `SELECT s.id,s.order_id,s.awb,s.status,s.carrier,s.service,s.mode,s.direction,s.created_date,s.created_at,s.price_paise,s.qa_status,s.expected_delivery_at,s.last_event_at,s.snapshot,o.reference,o.customer,o.customer_id,
    (SELECT MIN(occurred_at) FROM tracking_events t WHERE t.shipment_id=s.id AND t.status='delivered' AND t.applied=1) delivered_at,
    (SELECT count(*) FROM exception_cases e WHERE e.shipment_id=s.id AND e.status<>'resolved') open_cases,
    (SELECT status FROM delivery_proofs p WHERE p.shipment_id=s.id ORDER BY created_at DESC,id DESC LIMIT 1) proof_status,
    f.quoted_paise,f.invoiced_paise,f.invoice_ref,f.resolution,f.resolution_note,f.revision freight_revision,b.score,b.note feedback_note,b.revision feedback_revision
    FROM shipments s JOIN orders o ON o.id=s.order_id LEFT JOIN freight_entries f ON f.shipment_id=s.id LEFT JOIN shipment_feedback b ON b.shipment_id=s.id
    ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY s.created_date DESC,s.created_at DESC,s.id DESC LIMIT ${search === undefined ? 5001 : 50}`,
    )
    .all(...values);
  if (rows.length > 5000)
    throw new InputError(
      "Report exceeds 5,000 shipments. Narrow the date range.",
    );
  return rows.map((r) => ({ ...r }));
}
export function analytics(db: DatabaseSync, user: User, input: unknown) {
  const rows = reportRows(db, user, input),
    delivered = rows.filter((r) => r.status === "delivered"),
    timed = delivered.filter(
      (r) => r.delivered_at != null && Number(r.created_at) > 0,
    ),
    responses = rows.filter((r) => r.score != null),
    freight = rows.filter((r) => r.invoiced_paise != null);
  const carriers = [...new Set(rows.map((r) => String(r.carrier)))].map(
    (carrier) => {
      const group = rows.filter((r) => r.carrier === carrier);
      return {
        carrier,
        total: group.length,
        delivered: group.filter((r) => r.status === "delivered").length,
        exceptions: group.reduce((sum, r) => sum + Number(r.open_cases), 0),
      };
    },
  );
  return {
    rows,
    carriers,
    total: rows.length,
    orders: new Set(rows.map((r) => r.order_id)).size,
    delivered: delivered.length,
    deliveryPercent: rows.length
      ? Math.round((delivered.length / rows.length) * 100)
      : null,
    averageHours: timed.length
      ? timed.reduce(
          (sum, r) =>
            sum + (Number(r.delivered_at) - Number(r.created_at)) / 3600000,
          0,
        ) / timed.length
      : null,
    returns: rows.filter((r) => r.direction === "reverse").length,
    openCases: rows.reduce((sum, r) => sum + Number(r.open_cases), 0),
    verifiedProofs: rows.filter((r) => r.proof_status === "verified").length,
    feedbackCount: responses.length,
    nps: responses.length
      ? Math.round(
          ((responses.filter((r) => Number(r.score) >= 9).length -
            responses.filter((r) => Number(r.score) <= 6).length) /
            responses.length) *
            100,
        )
      : null,
    freightCount: freight.length,
    variancePaise: freight.reduce(
      (sum, r) => sum + Number(r.invoiced_paise) - Number(r.quoted_paise),
      0,
    ),
  };
}
export function reportCsv(db: DatabaseSync, user: User, filters: unknown) {
  const rows = reportRows(db, user, filters);
  return csv([
    [
      "Reference",
      "Waybill",
      "Customer",
      "Carrier",
      "Service",
      "Mode",
      "Direction",
      "Status",
      "Created UTC",
      "Test charge INR",
      "Open cases",
      "Latest POD",
      "Return QA",
      "Supplied quote INR",
      "Supplied invoice INR",
      "Variance INR",
      "Invoice reference",
      "Feedback score",
    ],
    ...rows.map((r) => [
      String(r.reference),
      String(r.awb ?? ""),
      String(r.customer),
      String(r.carrier),
      String(r.service),
      String(r.mode),
      String(r.direction),
      String(r.status),
      String(r.created_date),
      Number(r.price_paise) / 100,
      Number(r.open_cases),
      String(r.proof_status ?? "none"),
      String(r.qa_status),
      r.quoted_paise == null ? "" : Number(r.quoted_paise) / 100,
      r.invoiced_paise == null ? "" : Number(r.invoiced_paise) / 100,
      r.invoiced_paise == null
        ? ""
        : (Number(r.invoiced_paise) - Number(r.quoted_paise)) / 100,
      String(r.invoice_ref ?? ""),
      r.score == null ? "" : Number(r.score),
    ]),
  ]);
}
export function reportDefinitions(db: DatabaseSync, user: User) {
  return db
    .prepare(
      "SELECT * FROM report_definitions WHERE user_id=? ORDER BY name,id",
    )
    .all(user.id)
    .map(
      (r) =>
        ({ ...r, filters: JSON.parse(String(r.filters)) }) as {
          id: string;
          name: string;
          interval_hours: number;
          next_run: number;
          revision: number;
          format: string;
          filters: ReportFilters;
        },
    );
}
export function saveReport(db: DatabaseSync, user: User, input: unknown) {
  writable(user);
  const v = record(input),
    name = text(v.name, "Name", 80),
    filters = reportFilters(v.filters),
    hours = integer(v.interval_hours, "Schedule hours", 0, 720);
  const format = text(v.format ?? "csv", "Report format");
  if (!["csv", "xlsx"].includes(format))
    throw new InputError("Choose CSV or XLSX.");
  if (hours && hours < 1)
    throw new InputError("Schedule must be hourly or slower.");
  return transaction(db, () => {
    const id = v.id ? text(v.id, "Report") : randomUUID();
    if (v.id) {
      const old = db
        .prepare("SELECT * FROM report_definitions WHERE id=? AND user_id=?")
        .get(id, user.id);
      if (!old) throw new InputError("Report not found.", 404);
      if (old.revision !== Number(v.revision))
        throw new InputError("Report changed. Reload.", 409);
      db.prepare(
        "UPDATE report_definitions SET name=?,filters=?,interval_hours=?,next_run=?,revision=revision+1 WHERE id=?",
      ).run(
        name,
        JSON.stringify(filters),
        hours,
        Date.now() + hours * 3600000,
        id,
      );
    } else
      db.prepare(
        "INSERT INTO report_definitions(id,user_id,name,filters,interval_hours,next_run) VALUES (?,?,?,?,?,?)",
      ).run(
        id,
        user.id,
        name,
        JSON.stringify(filters),
        hours,
        Date.now() + hours * 3600000,
      );
    db.prepare("UPDATE report_definitions SET format=? WHERE id=?").run(
      format,
      id,
    );
    return {
      id,
      message: "Report saved. Scheduled output stays in the local outbox.",
    };
  });
}
export function runReport(
  db: DatabaseSync,
  user: User,
  id: string,
  now = Date.now(),
) {
  writable(user);
  return transaction(db, () => {
    const definition = db
      .prepare("SELECT * FROM report_definitions WHERE id=? AND user_id=?")
      .get(id, user.id);
    if (!definition) throw new InputError("Report not found.", 404);
    let content = "",
      workbook = "",
      status = "ready",
      message = "CSV generated in local outbox. No email sent.";
    try {
      content = reportCsv(db, user, JSON.parse(String(definition.filters)));
      if (definition.format === "xlsx")
        workbook = JSON.stringify(
          reportWorkbook(db, user, JSON.parse(String(definition.filters))),
        );
    } catch (error) {
      if (!(error instanceof InputError)) throw error;
      status = "failed";
      message = error.message;
    }
    const run = randomUUID();
    db.prepare(
      "INSERT INTO report_runs(id,definition_id,user_id,created_at,status,message,content,recipient) VALUES (?,?,?,?,?,?,?,?)",
    ).run(run, id, user.id, now, status, message, content, user.email);
    if (status === "ready")
      message = `${String(definition.format).toUpperCase()} snapshot generated locally. No email sent.`;
    db.prepare(
      "UPDATE report_runs SET format=?,workbook=?,message=? WHERE id=?",
    ).run(definition.format, workbook, message, run);
    return { id: run, message, status };
  });
}
export function runScheduledReports(
  db: DatabaseSync,
  now = Date.now(),
  owner?: User,
) {
  if (owner) writable(owner);
  return transaction(db, () => {
    const due = db
      .prepare(
        `SELECT d.id,d.user_id,d.interval_hours FROM report_definitions d WHERE interval_hours>0 AND next_run<=? ${owner ? "AND user_id=?" : ""} ORDER BY next_run,id LIMIT 50`,
      )
      .all(now, ...(owner ? [owner.id] : []));
    return due.map((d) => {
      const row = db
        .prepare(
          "SELECT u.id,u.email,u.name,u.role,u.customer_id FROM users u WHERE id=? AND (customer_id IS NULL OR EXISTS(SELECT 1 FROM customers c WHERE c.id=u.customer_id AND c.active=1))",
        )
        .get(d.user_id) as User | undefined;
      if (!row || row.role === "viewer") {
        db.prepare(
          "UPDATE report_definitions SET interval_hours=0,revision=revision+1 WHERE id=?",
        ).run(d.id);
        db.prepare(
          "INSERT INTO report_runs(id,definition_id,user_id,created_at,status,message,recipient) VALUES (?,?,?,?,'failed','Schedule paused: owner no longer has operational access.','')",
        ).run(randomUUID(), d.id, d.user_id, now);
        return {
          id: String(d.id),
          status: "failed",
          message: "Owner unavailable; schedule paused.",
        };
      }
      const result = runReport(db, { ...row }, String(d.id), now);
      // Coalesce missed intervals after downtime into one run; no duplicate catch-up storm.
      db.prepare(
        "UPDATE report_definitions SET next_run=?,revision=revision+1 WHERE id=?",
      ).run(now + Number(d.interval_hours) * 3600000, d.id);
      return result;
    });
  });
}
export function reportRuns(db: DatabaseSync, user: User) {
  return db
    .prepare(
      "SELECT r.id,r.created_at,r.status,r.message,r.recipient,r.delivery,r.format,d.name FROM report_runs r JOIN report_definitions d ON d.id=r.definition_id WHERE r.user_id=? ORDER BY r.created_at DESC,r.id DESC LIMIT 100",
    )
    .all(user.id)
    .map((r) => ({ ...r }));
}
export function reportDownload(db: DatabaseSync, user: User, id: string) {
  const row = db
    .prepare("SELECT content,status FROM report_runs WHERE id=? AND user_id=?")
    .get(id, user.id);
  if (!row) throw new InputError("Report run not found.", 404);
  if (row.status !== "ready")
    throw new InputError("Failed report has no download.", 409);
  return String(row.content);
}

export type Workbook = { name: string; rows: (string | number)[][] }[];
export function reportWorkbook(
  db: DatabaseSync,
  user: User,
  input: unknown,
): Workbook {
  const data = analytics(db, user, input),
    p = performance(data.rows);
  return [
    {
      name: "Summary",
      rows: [
        ["Metric", "Value"],
        ["Shipments", data.total],
        ["Distinct orders", data.orders],
        ["Delivered", data.delivered],
        ["Early", p.early],
        ["On estimated day", p.onTime],
        ["Late", p.late],
        ["Unknown estimate", p.unknown],
        ["Open overdue", p.overdue],
        ["Stale over 7 days", p.stale],
        ["NPS", data.nps ?? "No responses"],
        ["Freight variance INR", data.variancePaise / 100],
        [
          "Definition",
          "Creation-date cohort, UTC. Estimated dates are local simulation estimates, not carrier SLAs.",
        ],
      ],
    },
    {
      name: "Shipments",
      rows: [
        [
          "Reference",
          "Waybill",
          "Customer",
          "Carrier",
          "Status",
          "Direction",
          "Created UTC",
          "Estimated delivery UTC",
          "Actual delivery UTC",
          "Simulated INR",
          "Invoice INR",
          "Variance INR",
          "Resolution",
          "Feedback score",
        ],
        ...data.rows.map((r) => [
          String(r.reference),
          String(r.awb || ""),
          String(r.customer),
          String(r.carrier),
          String(r.status),
          String(r.direction),
          String(r.created_date),
          r.expected_delivery_at
            ? new Date(Number(r.expected_delivery_at)).toISOString()
            : "",
          r.delivered_at ? new Date(Number(r.delivered_at)).toISOString() : "",
          Number(r.price_paise) / 100,
          r.invoiced_paise == null ? "" : Number(r.invoiced_paise) / 100,
          r.invoiced_paise == null
            ? ""
            : (Number(r.invoiced_paise) - Number(r.quoted_paise)) / 100,
          String(r.resolution || ""),
          r.score == null ? "" : Number(r.score),
        ]),
      ],
    },
    {
      name: "Regions",
      rows: [["Destination country / state", "Shipments"], ...p.regions],
    },
    { name: "Daily", rows: [["Created UTC", "Shipments"], ...p.days] },
    {
      name: "Products",
      rows: [
        ["SKU or product (top 20)", "Units in distinct forward orders"],
        ...p.products,
      ],
    },
    {
      name: "Customers",
      rows: [["Customer (top 20)", "Distinct forward orders"], ...p.customers],
    },
    {
      name: "Filters",
      rows: [
        ["Filter", "Value"],
        ...Object.entries(reportFilters(input)),
        ["Generated UTC", new Date().toISOString()],
      ],
    },
  ];
}
export function savedWorkbook(
  db: DatabaseSync,
  user: User,
  id: string,
): Workbook {
  const r = db
    .prepare(
      "SELECT workbook,status,format FROM report_runs WHERE id=? AND user_id=?",
    )
    .get(id, user.id);
  if (!r) throw new InputError("Report run not found.", 404);
  if (r.status !== "ready" || r.format !== "xlsx")
    throw new InputError("This run has no Excel snapshot.", 409);
  return JSON.parse(String(r.workbook));
}
