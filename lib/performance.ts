import type { reportRows } from "./reports.ts";
import type { ShippingSnapshot } from "./shipping.ts";

export function performance(
  rows: ReturnType<typeof reportRows>,
  now = Date.now(),
) {
  const regions = new Map<string, number>(),
    days = new Map<string, number>(),
    products = new Map<string, number>(),
    customers = new Map<string, number>();
  const payments = new Map<string, number>(),
    weights = new Map<string, number>();
  let early = 0,
    onTime = 0,
    late = 0,
    unknown = 0,
    overdue = 0,
    stale = 0;
  const counted = new Set<string>();
  for (const r of rows) {
    const s = JSON.parse(
      String(r.snapshot || "{}"),
    ) as Partial<ShippingSnapshot>;
    const country =
      r.direction === "reverse" ? "IN" : s.order?.shipping?.country || "IN";
    const region = s.recipient?.state
      ? `${country} / ${s.recipient.state.trim().toLowerCase()}`
      : "Unknown destination";
    regions.set(region, (regions.get(region) || 0) + 1);
    const day = String(r.created_date);
    days.set(day, (days.get(day) || 0) + 1);
    const expected = Number(r.expected_delivery_at),
      delivered = Number(r.delivered_at);
    if (r.status === "delivered") {
      if (!expected || !delivered) unknown++;
      else if (
        new Date(delivered).toISOString().slice(0, 10) <
        new Date(expected).toISOString().slice(0, 10)
      )
        early++;
      else if (
        delivered <=
        Date.parse(new Date(expected).toISOString().slice(0, 10)) + 86400000 - 1
      )
        onTime++;
      else late++;
    } else if (!["cancelled", "rto"].includes(String(r.status))) {
      if (
        expected &&
        now >=
          Date.parse(new Date(expected).toISOString().slice(0, 10)) + 86400000
      )
        overdue++;
      if (
        Number(r.last_event_at) > 0 &&
        now - Number(r.last_event_at) > 7 * 86400000
      )
        stale++;
    }
    const mode = s.order?.payment_mode || "unknown";
    payments.set(mode, (payments.get(mode) || 0) + 1);
    const kg = s.order?.packages?.reduce((n, p) => n + Number(p.weight), 0);
    const slab =
      kg == null
        ? "Unknown"
        : kg <= 0.5
          ? "Up to 0.5 kg"
          : kg <= 2
            ? "0.5–2 kg"
            : kg <= 5
              ? "2–5 kg"
              : "Over 5 kg";
    weights.set(slab, (weights.get(slab) || 0) + 1);
    if (r.direction === "forward" && !counted.has(String(r.order_id))) {
      counted.add(String(r.order_id));
      customers.set(
        String(r.customer),
        (customers.get(String(r.customer)) || 0) + 1,
      );
      for (const item of s.order?.items || []) {
        const key = item.sku || item.name;
        products.set(key, (products.get(key) || 0) + item.quantity);
      }
    }
  }
  const sorted = (m: Map<string, number>) =>
    [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    early,
    onTime,
    late,
    unknown,
    overdue,
    stale,
    regions: sorted(regions),
    days: [...days].sort(),
    products: sorted(products).slice(0, 20),
    customers: sorted(customers).slice(0, 20),
    payments: sorted(payments),
    weights: sorted(weights),
  };
}
