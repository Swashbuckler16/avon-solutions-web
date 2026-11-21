import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { customers, warehouses, type Order } from "@/lib/orders";
import { profiles, type DispatchProfile } from "@/lib/rate-cards";
import { PageHeading } from "@/components/ui";
import {
  OperationForm,
  type FormField,
} from "@/components/operations-controls";
import {
  DispatchWorkbench,
  TrackingFile,
} from "@/components/dispatch-workbench";
import { simulatorCarriers } from "@/lib/shipping-format";
export default async function Dispatch({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser(),
    db = getDb(),
    params = await searchParams,
    cs = customers(db, user).filter((c) => c.active),
    ws = warehouses(db, user),
    customer =
      typeof params.customer === "string" &&
      cs.some((c) => c.id === params.customer)
        ? params.customer
        : cs[0]?.id || "",
    q = (typeof params.q === "string" ? params.q : "").slice(0, 100),
    staff = !user.customer_id && user.role !== "viewer",
    write = user.role !== "viewer";
  const orders = db
    .prepare(
      `SELECT * FROM orders o WHERE customer_id=? AND (customer_id=? OR ? IS NULL) AND status IN ('new','unprocessed') AND json_extract(details,'$.items') IS NOT NULL AND instr(lower(reference),lower(?))>0 AND NOT EXISTS(SELECT 1 FROM shipments s WHERE s.order_id=o.id AND s.status<>'cancelled') ORDER BY creation_seq DESC LIMIT 100`,
    )
    .all(customer, user.customer_id || null, user.customer_id || null, q)
    .map((o) => ({ ...o, details: JSON.parse(String(o.details)) }) as Order);
  function fields(kind: string, p?: DispatchProfile): FormField[] {
    const c = p?.config;
    const common: FormField[] = [
      { name: "name", label: "Profile name", value: p?.name },
      {
        name: "priority",
        label: "Priority (1 first)",
        type: "number",
        min: 1,
        max: 1000,
        value: String(p?.priority || 100),
      },
      {
        name: "active",
        label: "Profile enabled",
        value: String(p?.active ?? 1),
        options: [
          { value: "1", label: "Enabled" },
          { value: "0", label: "Disabled" },
        ],
      },
      {
        name: "country",
        label: "Destination country code",
        value: c?.country || "IN",
      },
      {
        name: "prefix",
        label: "Destination postal prefix (blank = any)",
        value: c?.prefix || "",
        required: false,
      },
      {
        name: "warehouse_id",
        label:
          kind === "rate" ? "Pickup restriction" : "Allocate pickup warehouse",
        value: c?.warehouse_id || "",
        required: false,
        options: [
          {
            value: "",
            label:
              kind === "rate" ? "Any customer pickup" : "Keep current pickup",
          },
          ...ws
            .filter((w) => w.customer_id === customer && w.active)
            .map((w) => ({ value: w.id, label: w.name })),
        ],
      },
    ];
    return [
      ...common,
      ...(kind === "rate"
        ? [
            {
              name: "carrier",
              label: "Carrier name (estimate only)",
              value: c?.carrier,
              options: simulatorCarriers.map((x) => ({ value: x, label: x })),
            },
            {
              name: "service",
              label: "Service name",
              value: c?.service || "Surface",
            },
            {
              name: "base",
              label: "Base amount (INR)",
              value: c?.base || "50",
            },
            {
              name: "per_kg",
              label: "Amount per chargeable kg (INR)",
              value: c?.per_kg || "15",
            },
            {
              name: "max_kg",
              label: "Maximum chargeable weight (kg)",
              type: "number",
              min: 0.001,
              max: 20000,
              value: String(c?.max_kg || 100),
            },
            {
              name: "eta_days",
              label: "Estimated delivery days",
              type: "number",
              min: 1,
              max: 365,
              value: String(c?.eta_days || 4),
            },
          ]
        : [
            { name: "sku", label: "Exact product SKU", value: c?.sku },
            {
              name: "units",
              label: "Maximum units per box",
              type: "number",
              min: 1,
              max: 10000,
              value: String(c?.units || 1),
            },
            {
              name: "unit_weight",
              label: "Weight per item (kg)",
              type: "number",
              min: 0.001,
              max: 1000,
              value: String(c?.unit_weight || 1),
            },
            {
              name: "tare",
              label: "Empty box weight (kg)",
              type: "number",
              min: 0,
              max: 1000,
              value: String(c?.tare ?? 0.1),
            },
            {
              name: "length",
              label: "Box length (cm)",
              type: "number",
              min: 0.001,
              max: 500,
              value: String(c?.length || 20),
            },
            {
              name: "width",
              label: "Box width (cm)",
              type: "number",
              min: 0.001,
              max: 500,
              value: String(c?.width || 20),
            },
            {
              name: "height",
              label: "Box height (cm)",
              type: "number",
              min: 0.001,
              max: 500,
              value: String(c?.height || 20),
            },
            {
              name: "max_kg",
              label: "Maximum packed box weight (kg)",
              type: "number",
              min: 0.001,
              max: 1000,
              value: String(c?.max_kg || 20),
            },
          ]),
    ];
  }
  return (
    <>
      <PageHeading
        eyebrow="DISPATCH PLANNING"
        title="Prepare together. Ship with confidence."
        description="Manual estimates, SKU packing, split/merge and bulk simulated bookings. No carrier connection required."
      >
        <Link href="/orders/new" className="button">
          Create order
        </Link>
      </PageHeading>
      <form className="card op-panel op-fields">
        <label className="op-field">
          Customer
          <select name="customer" defaultValue={customer}>
            {cs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="op-field">
          Order reference search
          <input name="q" defaultValue={q} maxLength={100} />
        </label>
        <button className="button">Apply filters</button>
      </form>
      {!customer && (
        <p className="notice">
          Create an active customer and pickup location before preparing
          shipments.
        </p>
      )}
      <DispatchWorkbench
        key={`${customer}:${q}`}
        orders={orders}
        write={write}
      />
      {(["rate", "packing"] as const).map((kind) => (
        <section className="card op-panel" key={kind}>
          <h2>
            {kind === "rate"
              ? "Manual rate cards"
              : "SKU packing & warehouse profiles"}
          </h2>
          <p>
            {kind === "rate"
              ? "Estimates use base + per-kg × chargeable weight (rounded up to half a kilogram using a 5000 volumetric divisor). Enter final all-inclusive estimates; taxes, surcharges and carrier contracts are not calculated. Matching cards replace fictional defaults; otherwise defaults remain clearly labeled."
              : "Each box contains one SKU, based on your supplied unit capacity, weight and dimensions. We do not infer physical fit or stock availability. Lowest priority number wins; ties use profile ID."}
          </p>
          {staff && customer && (
            <details>
              <summary>Add {kind} profile</summary>
              <OperationForm
                action="dispatch_profile"
                title={`New ${kind} profile`}
                data={{ kind, customer_id: customer }}
                fields={fields(kind)}
              />
            </details>
          )}
          {profiles(db, user, kind)
            .filter((p) => p.customer_id === customer)
            .map((p) => (
              <details key={p.id}>
                <summary>
                  {p.name} · priority {p.priority} ·{" "}
                  {p.active ? "enabled" : "disabled"}
                </summary>
                <p>
                  {p.config.country} · postal prefix {p.config.prefix || "any"}{" "}
                  ·{" "}
                  {kind === "rate"
                    ? `${p.config.carrier} / ${p.config.service}, INR ${p.config.base} + ${p.config.per_kg}/kg, ${p.config.eta_days} days`
                    : `SKU ${p.config.sku}, ${p.config.units} units/box, ${p.config.length}×${p.config.width}×${p.config.height} cm`}
                </p>
                {staff && (
                  <OperationForm
                    key={p.revision}
                    action="dispatch_profile"
                    title={`Edit ${p.name}`}
                    data={{
                      id: p.id,
                      revision: p.revision,
                      kind,
                      customer_id: customer,
                    }}
                    fields={fields(kind, p)}
                  />
                )}
              </details>
            ))}
        </section>
      ))}
      {staff && <TrackingFile />}
      <p>
        <Link href="/automation">Existing payment/weight/carrier rules →</Link>
      </p>
    </>
  );
}
