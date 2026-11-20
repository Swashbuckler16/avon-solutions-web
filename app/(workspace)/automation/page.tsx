import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { customers, warehouses } from "@/lib/orders";
import { rules } from "@/lib/operations";
import { simulatorCarriers } from "@/lib/shipping-format";
import { PageHeading } from "@/components/ui";
import {
  OperationForm,
  type FormField,
} from "@/components/operations-controls";
export default async function Automation() {
  const user = await requireUser(),
    db = getDb(),
    staff = !user.customer_id && user.role !== "viewer",
    list = rules(db, user),
    cs = customers(db, user).filter((c) => c.active),
    ws = warehouses(db, user).filter((w) => w.active);
  const orders = db
    .prepare(
      `SELECT id,reference,revision FROM orders WHERE status IN ('new','unprocessed') ${user.customer_id ? "AND customer_id=?" : ""} ORDER BY creation_seq DESC LIMIT 100`,
    )
    .all(...(user.customer_id ? [user.customer_id] : []));
  const fields = (r?: (typeof list)[number]): FormField[] => [
    { name: "name", label: "Rule name", value: r ? String(r.name) : "" },
    {
      name: "customer_id",
      label: "Customer",
      value: r ? String(r.customer_id) : undefined,
      options: cs.map((c) => ({ value: c.id, label: c.name })),
    },
    {
      name: "priority",
      label: "Priority (lower runs first)",
      type: "number",
      value: r ? String(r.priority) : "100",
      min: 1,
      max: 1000,
    },
    {
      name: "active",
      label: "Enabled",
      value: r ? String(r.active) : "1",
      options: [
        { value: "1", label: "Enabled" },
        { value: "0", label: "Disabled" },
      ],
    },
    {
      name: "pin",
      label: "Destination PIN prefix (blank = any)",
      required: false,
      value: r?.config.pin,
    },
    {
      name: "payment",
      label: "Payment condition",
      value: r?.config.payment,
      options: [
        { value: "any", label: "Any" },
        { value: "prepaid", label: "Prepaid" },
        { value: "cod", label: "COD" },
      ],
    },
    {
      name: "max_kg",
      label: "Maximum total actual weight (kg)",
      type: "number",
      value: String(r?.config.max_kg ?? 100),
      min: 1,
      max: 20000,
    },
    {
      name: "carrier",
      label: "Carrier preference",
      value: r?.config.carrier,
      options: simulatorCarriers.map((c) => ({ value: c, label: c })),
    },
    {
      name: "warehouse_id",
      label: "Customer pickup location (optional)",
      value: r?.config.warehouse_id,
      required: false,
      options: [
        { value: "", label: "Keep current pickup" },
        ...ws.map((w) => ({ value: w.id, label: w.name + " · " + w.code })),
      ],
    },
    ...["length", "width", "height"].map((k) => ({
      name: k,
      label: `Package ${k} in cm (all three or leave blank)`,
      required: false,
      value: r?.config[k as "length" | "width" | "height"],
    })),
  ];
  return (
    <>
      <PageHeading
        eyebrow="SHIPPING RULES"
        title="Consistent choices, visible priorities."
        description="First matching active rule wins, then rule ID breaks ties. Preview before applying. Rules set preferences and dimensions; they never book shipments."
      />
      <p className="notice">
        Package dimensions apply to every package; actual weights and contents
        stay unchanged. Quote again after applying a rule.
      </p>
      {list.map((r) => (
        <details className="card op-panel" key={String(r.id)}>
          <summary>
            Priority {String(r.priority)} · {String(r.name)} ·{" "}
            {String(r.customer)} · {r.active ? "enabled" : "disabled"}
          </summary>
          <p>
            PIN {r.config.pin || "any"} · {r.config.payment} · up to{" "}
            {r.config.max_kg} kg → {r.config.carrier}
          </p>
          {staff && (
            <OperationForm
              key={String(r.revision)}
              title="Edit rule"
              action="rule_save"
              data={{ id: r.id, revision: r.revision }}
              fields={fields(r)}
            />
          )}
        </details>
      ))}
      {staff && cs.length > 0 && (
        <OperationForm
          title="Create a rule"
          action="rule_save"
          fields={fields()}
        />
      )}
      <section className="card op-panel">
        <h2>Preview and apply to an order</h2>
        <p>
          Most recent 100 eligible orders. Shipment creation still requires your
          confirmation.
        </p>
        {user.role !== "viewer" &&
          orders.map((o) => (
            <details key={String(o.id)}>
              <summary>{String(o.reference)}</summary>
              <OperationForm
                action="rule_preview"
                title="Preview matching rule"
                data={{ order_id: o.id, revision: o.revision }}
                button="Preview rule"
              />
              <OperationForm
                action="rule_apply"
                title="Apply current matching rule"
                data={{ order_id: o.id, revision: o.revision }}
                button="Apply rule to order"
              />
            </details>
          ))}
      </section>
    </>
  );
}
