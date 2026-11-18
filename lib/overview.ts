import type { DatabaseSync } from "node:sqlite";

export type Activity = {
  reference: string;
  customer: string;
  destination: string;
  created_date: string;
  status: string;
  amount_paise: number;
  payment_mode: string;
};
export function overview(
  db: DatabaseSync,
  days: number,
  query = "",
  now = new Date(),
) {
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - (days - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
  const count = (sql: string) =>
    Number((db.prepare(sql).get(start, end) as { count: number }).count);
  const orders = count(
    "SELECT count(*) count FROM orders WHERE created_date BETWEEN ? AND ?",
  );
  const shipments = count(
    "SELECT count(*) count FROM shipments WHERE created_date BETWEEN ? AND ?",
  );
  const delivered = count(
    "SELECT count(*) count FROM shipments WHERE created_date BETWEEN ? AND ? AND status='delivered'",
  );
  const attention = count(
    "SELECT count(*) count FROM shipments WHERE created_date BETWEEN ? AND ? AND status IN ('exception','rto')",
  );
  const groups = db
    .prepare(
      "SELECT status,count(*) count FROM shipments WHERE created_date BETWEEN ? AND ? GROUP BY status",
    )
    .all(start, end) as { status: string; count: number }[];
  const dates = db
    .prepare(
      `SELECT created_date day,count(*) count,sum(CASE WHEN status='delivered' THEN 1 ELSE 0 END) delivered
    FROM shipments WHERE created_date BETWEEN ? AND ? GROUP BY created_date`,
    )
    .all(start, end) as { day: string; count: number; delivered: number }[];
  const trend = Array.from({ length: days }, (_, i) => {
    const day = new Date(
      new Date(start + "T00:00:00Z").getTime() + i * 86400000,
    )
      .toISOString()
      .slice(0, 10);
    return dates.find((d) => d.day === day) || { day, count: 0, delivered: 0 };
  });
  // Escape LIKE metacharacters: a literal % in search should not match every order.
  const search = "%" + query.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
  const where = `o.created_date BETWEEN ? AND ? AND (o.reference LIKE ? ESCAPE '\\' OR o.customer LIKE ? ESCAPE '\\' OR o.destination LIKE ? ESCAPE '\\')`;
  const activity = db
    .prepare(
      `SELECT o.reference,o.customer,o.destination,o.created_date,o.amount_paise,o.payment_mode,COALESCE(s.status,o.status) status
    FROM orders o LEFT JOIN shipments s ON s.order_id=o.id WHERE ${where} ORDER BY o.created_date DESC,o.reference DESC LIMIT 8`,
    )
    .all(start, end, search, search, search) as Activity[];
  const matches = Number(
    (
      db
        .prepare(`SELECT count(*) count FROM orders o WHERE ${where}`)
        .get(start, end, search, search, search) as { count: number }
    ).count,
  );
  return {
    orders,
    shipments,
    delivered,
    attention,
    groups,
    trend,
    activity,
    matches,
    start,
    end,
  };
}
