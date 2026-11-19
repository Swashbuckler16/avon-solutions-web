"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "./ui";
import { operation } from "./operations-forms";
export type OrderRow = {
  id: string;
  reference: string;
  customer: string;
  destination: string;
  status: string;
  payment_mode: string;
  amount_paise: number;
  created_date: string;
  warehouse: string;
  revision: number;
  synthetic: number;
};
type Result = { id: string; status: string; message: string };
export function OrderList({
  rows,
  editable,
}: {
  rows: OrderRow[];
  editable: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]),
    [hidden, setHidden] = useState<string[]>([]),
    [action, setAction] = useState("hold"),
    [note, setNote] = useState(""),
    [results, setResults] = useState<Result[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const columns = [
    ["customer", "Customer"],
    ["destination", "Destination"],
    ["warehouse", "Pickup"],
    ["payment_mode", "Payment"],
    ["amount_paise", "Value"],
    ["created_date", "Created"],
  ] as const;
  return (
    <>
      <div className="list-tools">
        <details>
          <summary>Visible columns</summary>
          <div className="column-options">
            {columns.map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={!hidden.includes(key)}
                  onChange={() =>
                    setHidden(
                      hidden.includes(key)
                        ? hidden.filter((x) => x !== key)
                        : [...hidden, key],
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </details>
        <span>{selected.length} selected · current page only</span>
      </div>
      {editable && selected.length > 0 && (
        <form
          className="bulk-bar"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              setResults(
                await operation<Result[]>("bulk", {
                  action,
                  note,
                  orders: rows
                    .filter((r) => selected.includes(r.id))
                    .map((r) => ({ id: r.id, revision: r.revision })),
                }),
              );
              setSelected([]);
              router.refresh();
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Action
            <select
              aria-label="Bulk action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="hold">Mark unprocessed</option>
              <option value="ready">Mark ready (new)</option>
              <option value="cancel">Cancel orders</option>
            </select>
          </label>
          <label>
            Reason
            <input
              required
              maxLength={250}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label className="check-label">
            <input required type="checkbox" key={action + selected.join(",")} />
            Confirm for {selected.length} selected orders
          </label>
          <button className="button" disabled={busy}>
            {busy ? "Applying…" : "Apply action"}
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {results.length > 0 && (
        <div className="op-message" role="status">
          <h3>Bulk results</h3>
          <ul>
            {results.map((r) => (
              <li key={r.id}>
                {rows.find((o) => o.id === r.id)?.reference || r.id}:{" "}
                {r.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="table-scroll">
        <table>
          <caption className="sr-only">
            Orders. Bulk selection applies only to this page.
          </caption>
          <thead>
            <tr>
              {editable && (
                <th>
                  <input
                    aria-label="Select all orders on this page"
                    type="checkbox"
                    checked={!!rows.length && selected.length === rows.length}
                    onChange={(e) =>
                      setSelected(e.target.checked ? rows.map((r) => r.id) : [])
                    }
                  />
                </th>
              )}
              <th>Reference</th>
              <th>Status</th>
              {columns
                .filter(([key]) => !hidden.includes(key))
                .map(([key, label]) => (
                  <th key={key}>{label}</th>
                ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {editable && (
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.reference}`}
                      checked={selected.includes(row.id)}
                      onChange={() =>
                        setSelected(
                          selected.includes(row.id)
                            ? selected.filter((id) => id !== row.id)
                            : [...selected, row.id],
                        )
                      }
                    />
                  </td>
                )}
                <td>
                  <Link className="order-reference" href={`/orders/${row.id}`}>
                    {row.reference}
                  </Link>
                  {!!row.synthetic && (
                    <small className="sample-label">Sample</small>
                  )}
                </td>
                <td>
                  <Badge status={row.status} />
                </td>
                {columns
                  .filter(([key]) => !hidden.includes(key))
                  .map(([key]) => (
                    <td key={key}>
                      {key === "amount_paise"
                        ? (row[key] / 100).toLocaleString("en-IN", {
                            style: "currency",
                            currency: "INR",
                          })
                        : row[key]}
                    </td>
                  ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">
                    <h3>No orders match</h3>
                    <p>Adjust your filters or create an order.</p>
                    <Link href="/orders">Clear filters</Link>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
export function OrderAction({
  id,
  revision,
}: {
  id: string;
  revision: number;
}) {
  const router = useRouter(),
    [action, setAction] = useState("hold"),
    [note, setNote] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="op-panel card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const result = await operation<Result[]>("bulk", {
            action,
            note,
            orders: [{ id, revision }],
          });
          setMessage(result[0].message);
          router.refresh();
        } catch (error) {
          setMessage((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Order action</h2>
      <label className="op-field">
        Action
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="hold">Mark unprocessed</option>
          <option value="ready">Mark ready (new)</option>
          <option value="cancel">Cancel order</option>
        </select>
      </label>
      <label className="op-field">
        Reason *
        <input
          required
          maxLength={250}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <label className="check-label">
        <input key={action} type="checkbox" required />
        Confirm this change
      </label>
      <button className="button" disabled={busy}>
        Apply action
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
