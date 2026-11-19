"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  Address,
  Customer,
  Warehouse,
  OrderData,
  Order,
  Item,
  Parcel,
} from "@/lib/orders";
import { carriers, businessDate } from "@/lib/order-format";

export async function operation<T>(
  action: string,
  data: unknown,
  id?: string,
): Promise<T> {
  const response = await fetch("/api/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data, id }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to save.");
  return result as T;
}
export function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  required = true,
  ...props
}: {
  label: string;
  name?: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  maxLength?: number;
}) {
  return (
    <label className="op-field">
      <span>
        {label}
        {required && " *"}
      </span>
      <input
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        required={required}
        {...props}
      />
    </label>
  );
}
export function AddressFields({
  value,
  onChange,
}: {
  value: Address;
  onChange: (a: Address) => void;
}) {
  return (
    <div className="op-grid">
      {(
        [
          ["name", "Contact name"],
          ["phone", "Phone"],
          ["address", "Street address"],
          ["city", "City"],
          ["state", "State"],
          ["pincode", "PIN code"],
        ] as const
      ).map(([key, label]) => (
        <Field
          key={key}
          label={label}
          value={value[key]}
          onChange={(s) => onChange({ ...value, [key]: s })}
          maxLength={
            key === "address"
              ? 250
              : key === "phone"
                ? 16
                : key === "pincode"
                  ? 6
                  : 80
          }
        />
      ))}
    </div>
  );
}
export const emptyAddress: Address = {
  name: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
};
export function DirectoryEditor({
  kind,
  customers,
  warehouses = [],
  editable,
  admin = false,
}: {
  kind: "customer" | "warehouse";
  customers: Customer[];
  warehouses?: Warehouse[];
  editable: boolean;
  admin?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [value, setValue] = useState<Address>(emptyAddress);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [customer, setCustomer] = useState(customers[0]?.id || "");
  const [active, setActive] = useState(true);
  const [revision, setRevision] = useState(1);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginName, setLoginName] = useState("");
  const [credentials, setCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);
  function choose(id: string) {
    setSelected(id);
    setMessage("");
    setCredentials(null);
    if (kind === "customer") {
      const c = customers.find((c) => c.id === id);
      setValue(
        c
          ? {
              name: c.name,
              phone: c.phone,
              address: c.address,
              city: c.city,
              state: c.state,
              pincode: c.pincode,
            }
          : emptyAddress,
      );
      setEmail(c?.email || "");
      setActive(c?.active !== 0);
      setRevision(c?.revision || 1);
    } else {
      const w = warehouses.find((w) => w.id === id);
      setValue(
        w
          ? { ...emptyAddress, ...w.details, name: w.name, city: w.city }
          : emptyAddress,
      );
      setCode(w?.code || "");
      setCustomer(w?.customer_id || customers[0]?.id || "");
      setActive(w?.active !== 0);
      setRevision(w?.revision || 1);
    }
  }
  return (
    <div className="op-directory">
      <section className="card op-panel">
        <h2>{kind === "customer" ? "Customers" : "Pickup locations"}</h2>
        <p className="muted">
          {kind === "customer"
            ? "Businesses sending with Avon."
            : "Complete pickup addresses, grouped by customer."}
        </p>
        <div className="directory-list">
          {(kind === "customer" ? customers : warehouses).map((entry) => (
            <button
              type="button"
              className={
                selected === entry.id
                  ? "directory-entry selected"
                  : "directory-entry"
              }
              key={entry.id}
              disabled={busy}
              onClick={() => choose(entry.id)}
            >
              <strong>{entry.name}</strong>
              <span>
                {entry.city} · {entry.active ? "Active" : "Archived"}
              </span>
            </button>
          ))}
          {!(kind === "customer" ? customers : warehouses).length && (
            <p>No records yet. Add your first {kind}.</p>
          )}
        </div>
        {editable && (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => choose("")}
            disabled={busy}
          >
            + New {kind}
          </button>
        )}
      </section>
      <section className="card op-panel">
        <h2>
          {selected ? "Edit" : "Add"}{" "}
          {kind === "customer" ? "customer" : "pickup location"}
        </h2>
        <p className="muted">Required fields are marked *. Country: India.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              await operation(kind, {
                ...value,
                email,
                code,
                customer_id: customer,
                id: selected || undefined,
                revision,
                active: active ? 1 : 0,
              });
              setMessage("Saved. Select the record to continue editing.");
              setSelected("");
              setValue(emptyAddress);
              setEmail("");
              setCode("");
              setActive(true);
              router.refresh();
            } catch (error) {
              setMessage((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={!editable || busy} className="op-fieldset">
            {kind === "warehouse" && (
              <div className="op-grid">
                <label className="op-field">
                  Customer *
                  <select
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                    required
                  >
                    <option value="">Choose customer</option>
                    {customers
                      .filter((c) => c.active)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                <Field
                  label="Warehouse code"
                  value={code}
                  onChange={setCode}
                  maxLength={30}
                />
              </div>
            )}
            <AddressFields value={value} onChange={setValue} />
            {kind === "customer" && (
              <Field
                label="Business email"
                value={email}
                onChange={setEmail}
                type="email"
                maxLength={160}
              />
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Active {kind} (uncheck to archive)
            </label>
            <p className="field-help">
              Archiving preserves history and prevents new orders. Archived
              customers cannot sign in.
            </p>
            <button className="button" disabled={busy}>
              {busy ? "Saving…" : "Save " + kind}
            </button>
          </fieldset>
        </form>
        <p role="status" className="op-message">
          {message}
        </p>
        {!editable && <p>Read-only access.</p>}
        {kind === "customer" && admin && selected && (
          <form
            className="login-provision"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setCredentials(null);
              try {
                setCredentials(
                  await operation("account", {
                    customer_id: selected,
                    email: loginEmail,
                    name: loginName,
                  }),
                );
                setMessage("Customer login created.");
                router.refresh();
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3>Create customer login</h3>
            <p>
              Access is restricted to this customer’s orders and warehouses.
            </p>
            <Field
              label="User name"
              value={loginName}
              onChange={setLoginName}
            />
            <Field
              label="Login email"
              value={loginEmail}
              onChange={setLoginEmail}
              type="email"
            />
            <button className="button button-secondary" disabled={busy}>
              Create login
            </button>
            {credentials && (
              <div className="credential-result" role="status">
                <strong>
                  Save these credentials privately—they are shown once.
                </strong>
                <p>{credentials.email}</p>
                <code>{credentials.password}</code>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setCredentials(null)}
                >
                  Hide password
                </button>
              </div>
            )}
          </form>
        )}
      </section>
    </div>
  );
}
const emptyItem: Item = { name: "", sku: "", hsn: "", quantity: 1, price: "" };
const emptyParcel: Parcel = { weight: "", length: "", width: "", height: "" };
export function OrderEditor({
  customers,
  warehouses,
  order,
  clone = false,
}: {
  customers: Customer[];
  warehouses: Warehouse[];
  order?: Order;
  clone?: boolean;
}) {
  const router = useRouter(),
    existing = order?.details as OrderData | undefined;
  const [value, setValue] = useState<OrderData>(() =>
    existing?.items
      ? { ...existing, reference: clone ? "" : existing.reference }
      : {
          reference: "",
          customer_id: customers[0]?.id || "",
          warehouse_id: "",
          payment_mode: "prepaid",
          recipient: emptyAddress,
          items: [{ ...emptyItem }],
          packages: [{ ...emptyParcel }],
          invoice_number: "",
          invoice_date: businessDate(),
          carrier: "No preference",
          notes: "",
        },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (key: keyof OrderData, v: unknown) =>
    setValue((old) => ({ ...old, [key]: v }));
  const total = value.items.reduce(
    (n, i) => n + Number(i.price || 0) * Number(i.quantity),
    0,
  );
  return (
    <form
      className="order-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const result = await operation<{ id: string }>(
            "order",
            { ...value, revision: order?.revision },
            clone ? undefined : order?.id,
          );
          router.push(`/orders/${result.id}`);
          router.refresh();
        } catch (error) {
          setError((error as Error).message);
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="op-fieldset">
        <section className="card op-panel">
          <h2>1. Customer & pickup</h2>
          <p className="muted">
            Avon coordinates the shipment. Your selected carrier will handle
            delivery.
          </p>
          <div className="op-grid">
            <Field
              label="Order reference"
              value={value.reference}
              onChange={(v) => set("reference", v)}
              maxLength={60}
            />
            <label className="op-field">
              Customer *
              <select
                required
                value={value.customer_id}
                onChange={(e) =>
                  setValue({
                    ...value,
                    customer_id: e.target.value,
                    warehouse_id: "",
                  })
                }
              >
                <option value="">Choose customer</option>
                {customers
                  .filter((c) => c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="op-field">
              Pickup location *
              <select
                required
                value={value.warehouse_id}
                onChange={(e) => set("warehouse_id", e.target.value)}
              >
                <option value="">Choose pickup location</option>
                {warehouses
                  .filter(
                    (w) => w.active && w.customer_id === value.customer_id,
                  )
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} · {w.code}
                    </option>
                  ))}
              </select>
            </label>
            <label className="op-field">
              Payment *
              <select
                value={value.payment_mode}
                onChange={(e) => set("payment_mode", e.target.value)}
              >
                <option value="prepaid">Prepaid</option>
                <option value="cod">Cash on delivery</option>
              </select>
            </label>
          </div>
          <Link className="text-link" href="/warehouses">
            Manage pickup locations →
          </Link>
        </section>
        <section className="card op-panel">
          <h2>2. Deliver to</h2>
          <p className="muted">Recipient details · India</p>
          <AddressFields
            value={value.recipient}
            onChange={(v) => set("recipient", v)}
          />
        </section>
        <section className="card op-panel">
          <h2>3. Products & invoice</h2>
          {value.items.map((item, index) => (
            <fieldset key={index} className="line-item">
              <legend>Item {index + 1}</legend>
              <div className="op-grid three">
                {(
                  [
                    ["name", "Product name"],
                    ["sku", "SKU"],
                    ["hsn", "HSN"],
                    ["quantity", "Quantity"],
                    ["price", "Unit price (INR)"],
                  ] as const
                ).map(([key, label]) => (
                  <Field
                    key={key}
                    label={label}
                    value={item[key]}
                    type={
                      key === "quantity" || key === "price" ? "number" : "text"
                    }
                    min={
                      key === "quantity" ? 1 : key === "price" ? 0 : undefined
                    }
                    step={
                      key === "price"
                        ? "0.01"
                        : key === "quantity"
                          ? "1"
                          : undefined
                    }
                    required={!["sku", "hsn"].includes(key)}
                    onChange={(v) =>
                      set(
                        "items",
                        value.items.map((it, i) =>
                          i === index
                            ? {
                                ...it,
                                [key]: key === "quantity" ? Number(v) : v,
                              }
                            : it,
                        ),
                      )
                    }
                  />
                ))}
              </div>
              {value.items.length > 1 && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    set(
                      "items",
                      value.items.filter((_, i) => i !== index),
                    )
                  }
                >
                  Remove item {index + 1}
                </button>
              )}
            </fieldset>
          ))}
          <button
            type="button"
            className="button button-secondary"
            disabled={value.items.length >= 100}
            onClick={() => set("items", [...value.items, { ...emptyItem }])}
          >
            + Add product
          </button>
          <div className="op-grid">
            <Field
              label="Invoice number"
              value={value.invoice_number}
              onChange={(v) => set("invoice_number", v)}
            />
            <Field
              label="Invoice date"
              value={value.invoice_date}
              onChange={(v) => set("invoice_date", v)}
              type="date"
            />
          </div>
          <p className="order-total">
            Order total:{" "}
            {Number.isFinite(total)
              ? total.toLocaleString("en-IN", {
                  style: "currency",
                  currency: "INR",
                })
              : "—"}
          </p>
          <p className="field-help">
            Enter final unit prices inclusive of any tax. This stores your
            invoice reference; it does not issue a tax invoice.
          </p>
        </section>
        <section className="card op-panel">
          <h2>4. Packages & carrier preference</h2>
          {value.packages.map((p, index) => (
            <fieldset key={index} className="line-item">
              <legend>Package {index + 1}</legend>
              <div className="op-grid four">
                {(
                  [
                    ["weight", "Weight (kg)"],
                    ["length", "Length (cm)"],
                    ["width", "Width (cm)"],
                    ["height", "Height (cm)"],
                  ] as const
                ).map(([key, label]) => (
                  <Field
                    key={key}
                    label={label}
                    value={p[key]}
                    type="number"
                    step="0.001"
                    min={0.001}
                    max={key === "weight" ? 1000 : 500}
                    onChange={(v) =>
                      set(
                        "packages",
                        value.packages.map((p, i) =>
                          i === index ? { ...p, [key]: v } : p,
                        ),
                      )
                    }
                  />
                ))}
              </div>
              {value.packages.length > 1 && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    set(
                      "packages",
                      value.packages.filter((_, i) => i !== index),
                    )
                  }
                >
                  Remove package {index + 1}
                </button>
              )}
            </fieldset>
          ))}
          <button
            type="button"
            className="button button-secondary"
            disabled={value.packages.length >= 20}
            onClick={() =>
              set("packages", [...value.packages, { ...emptyParcel }])
            }
          >
            + Add package
          </button>
          <label className="op-field">
            Preferred carrier
            <select
              value={value.carrier}
              onChange={(e) => set("carrier", e.target.value)}
            >
              {carriers.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <p className="notice">
            Preference only. Live serviceability, prices and carrier booking
            arrive in Stage 3.
          </p>
          <Field
            label="Notes"
            value={value.notes}
            onChange={(v) => set("notes", v)}
            maxLength={500}
            required={false}
          />
        </section>
      </fieldset>
      {error && (
        <p role="alert" className="alert alert-error">
          {error}
        </p>
      )}
      <div className="op-actions">
        <Link href="/orders" className="button button-secondary">
          Back to orders
        </Link>
        <button className="button" disabled={busy}>
          {busy
            ? "Saving…"
            : clone
              ? "Create cloned order"
              : order
                ? "Save order"
                : "Create order"}
        </button>
      </div>
    </form>
  );
}
