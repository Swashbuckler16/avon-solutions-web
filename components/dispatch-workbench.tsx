"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field, operation } from "./operations-forms";
import type { Order, OrderData, Parcel } from "@/lib/orders";
import type { bulkQuotes, packingPlan } from "@/lib/dispatch";
import { formatINR } from "@/lib/shipping-format";

type Result = { id: string; status: string; message: string };
const emptyBox = { weight: "", length: "", width: "", height: "" };
function BoxFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Parcel;
  onChange: (v: Parcel) => void;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="op-grid four">
        {(["weight", "length", "width", "height"] as const).map((key) => (
          <Field
            key={key}
            label={`${key} (${key === "weight" ? "kg" : "cm"})`}
            value={value[key]}
            type="number"
            min={0.001}
            max={key === "weight" ? 1000 : 500}
            step="0.001"
            onChange={(v) => onChange({ ...value, [key]: v })}
          />
        ))}
      </div>
    </fieldset>
  );
}
export function DispatchWorkbench({
  orders,
  write,
}: {
  orders: Order[];
  write: boolean;
}) {
  const router = useRouter(),
    lock = useRef(false),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [message, setMessage] = useState(""),
    [results, setResults] = useState<Result[]>([]),
    [strategy, setStrategy] = useState("cheapest"),
    [quotes, setQuotes] = useState<ReturnType<typeof bulkQuotes>>([]),
    [attempts, setAttempts] = useState<
      { quote_id: string; request_key: string; scenario: string }[]
    >([]),
    [plan, setPlan] = useState<ReturnType<typeof packingPlan> | null>(null),
    [quantities, setQuantities] = useState<number[]>([]),
    [a, setA] = useState(""),
    [b, setB] = useState(""),
    [boxA, setBoxA] = useState<Parcel>({ ...emptyBox }),
    [boxB, setBoxB] = useState<Parcel>({ ...emptyBox }),
    [declaredA, setDeclaredA] = useState(""),
    [declaredB, setDeclaredB] = useState("");
  const picked = orders.filter((o) => selected.includes(o.id)),
    single = picked.length === 1 ? picked[0] : null,
    data = single?.details as OrderData | undefined;
  const sources = picked.map((o) => ({ id: o.id, revision: o.revision }));
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function choose(id: string) {
    setSelected((v) =>
      v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
    );
    setQuotes([]);
    setAttempts([]);
    setPlan(null);
    setQuantities([]);
    setResults([]);
  }
  async function transform(kind: string) {
    const result = await operation<{ message: string; results: Result[] }>(
      "order_transform",
      {
        kind,
        sources,
        reference: a,
        reference_a: a,
        reference_b: b,
        quantities: data?.items.map((_, i) => quantities[i] || 0),
        packages_a: [boxA],
        packages_b: [boxB],
        declared_a: declaredA,
        declared_b: declaredB,
      },
    );
    setMessage(result.message);
    setResults(result.results);
    setSelected([]);
    setQuotes([]);
    setAttempts([]);
    setPlan(null);
    router.refresh();
  }
  return (
    <section className="card op-panel">
      <h2>Prepare orders</h2>
      <p>
        Select from the newest 500 matching unbooked orders. Search above to
        find older records. Selection applies only to this list.
      </p>
      <fieldset disabled={busy || !write} className="op-fields">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Select</th>
                <th>Reference</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Packages</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${o.reference}`}
                      checked={selected.includes(o.id)}
                      onChange={() => choose(o.id)}
                    />
                  </td>
                  <td>
                    <Link href={`/orders/${o.id}`}>{o.reference}</Link>
                  </td>
                  <td>{o.customer}</td>
                  <td>{(o.details as OrderData).items.length}</td>
                  <td>{(o.details as OrderData).packages.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!orders.length && (
            <p>
              No eligible orders match. Create an order or adjust the search.
            </p>
          )}
        </div>
      </fieldset>
      <p>
        {selected.length} selected. {!write && "Read-only access."}
      </p>
      {write && (
        <fieldset disabled={busy} className="op-fieldset">
          <details>
            <summary>SKU packing and warehouse allocation</summary>
            <p>
              Select exactly one order. Every SKU needs a matching profile; the
              first matching priority wins. Conflicting pickup locations require
              separate orders.
            </p>
            <button
              className="button"
              disabled={!single}
              onClick={() =>
                run(async () => {
                  const p = await operation<ReturnType<typeof packingPlan>>(
                    "packing_preview",
                    { order_id: single!.id, revision: single!.revision },
                  );
                  setPlan(p);
                  setMessage(p.message);
                })
              }
            >
              Preview packing
            </button>
            {plan && single && (
              <>
                <p>{plan.message}</p>
                <ul>
                  {plan.packages.map((p, i) => (
                    <li key={i}>
                      Box {i + 1}: {p.weight} kg · {p.length} × {p.width} ×{" "}
                      {p.height} cm
                    </li>
                  ))}
                </ul>
                <button
                  className="button"
                  onClick={() =>
                    run(async () => {
                      const p = await operation<{ message: string }>(
                        "packing_apply",
                        {
                          order_id: single.id,
                          revision: single.revision,
                          token: plan.token,
                        },
                      );
                      setMessage(p.message);
                      setPlan(null);
                      setQuotes([]);
                      setAttempts([]);
                      router.refresh();
                    })
                  }
                >
                  Apply this packing plan
                </button>
              </>
            )}
          </details>
          <details>
            <summary>Split an order</summary>
            <p>
              Select exactly one unbooked order. Quantities below go into the
              first replacement; the remainder goes into the second. Supply
              measured boxes for each. The original is retained as cancelled,
              with links to both replacements.
            </p>
            {single && data && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => transform("split"));
                }}
              >
                <div className="op-grid">
                  <Field
                    label="First replacement reference"
                    value={a}
                    onChange={setA}
                  />
                  <Field
                    label="Second replacement reference"
                    value={b}
                    onChange={setB}
                  />
                </div>
                {data.items.map((item, i) => (
                  <Field
                    key={i}
                    label={`${item.name} (${item.sku || "no SKU"}): first order quantity, out of ${item.quantity}`}
                    value={quantities[i] || 0}
                    min={0}
                    max={item.quantity}
                    step="1"
                    type="number"
                    onChange={(v) =>
                      setQuantities((old) =>
                        data.items.map((_, n) =>
                          n === i ? Number(v) : old[n] || 0,
                        ),
                      )
                    }
                  />
                ))}
                <BoxFields
                  label="First replacement package"
                  value={boxA}
                  onChange={setBoxA}
                />
                <BoxFields
                  label="Second replacement package"
                  value={boxB}
                  onChange={setBoxB}
                />
                {data.shipping && data.shipping.country !== "IN" && (
                  <div className="op-grid">
                    <Field
                      label={`First declared value (${data.shipping.currency})`}
                      value={declaredA}
                      onChange={setDeclaredA}
                      type="number"
                      min={0.01}
                      step="0.01"
                    />
                    <Field
                      label={`Second declared value (${data.shipping.currency})`}
                      value={declaredB}
                      onChange={setDeclaredB}
                      type="number"
                      min={0.01}
                      step="0.01"
                    />
                  </div>
                )}
                <button className="button">
                  Create two replacements and cancel source
                </button>
              </form>
            )}
          </details>
          <details>
            <summary>Merge for combined shipment preparation</summary>
            <p>
              Select 2–20 orders with the same customer, pickup, recipient,
              payment, invoice and shipping details. Items and boxes are
              retained; declared values are added. Sources are retained as
              cancelled. Review packing on the merged order before booking.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(() => transform("merge"));
              }}
            >
              <Field label="Merged reference" value={a} onChange={setA} />
              <button
                className="button"
                disabled={picked.length < 2 || picked.length > 20}
              >
                Merge selected orders and cancel sources
              </button>
            </form>
          </details>
          <details open>
            <summary>Allocate and book simulated shipments</summary>
            <p>
              Cost and delivery times are estimates. Matching manual rate cards
              replace fictional default services. Balanced gives equal weight to
              relative price and estimated days. No pickup, payment or carrier
              request occurs.
            </p>
            <label className="op-field">
              Allocation strategy
              <select
                value={strategy}
                onChange={(e) => {
                  setStrategy(e.target.value);
                  setQuotes([]);
                  setAttempts([]);
                }}
              >
                <option value="cheapest">Lowest estimated cost</option>
                <option value="fastest">Shortest estimated delivery</option>
                <option value="balanced">Balanced cost and delivery</option>
              </select>
            </label>
            <button
              className="button"
              disabled={!picked.length}
              onClick={() =>
                run(async () => {
                  const rows = await operation<ReturnType<typeof bulkQuotes>>(
                    "bulk_quotes",
                    { orders: selected, strategy },
                  );
                  setQuotes(rows);
                  setResults([]);
                  setAttempts(
                    rows.flatMap((r) =>
                      r.quote?.id
                        ? [
                            {
                              quote_id: r.quote.id,
                              request_key: crypto.randomUUID(),
                              scenario: "success",
                            },
                          ]
                        : [],
                    ),
                  );
                  setMessage(
                    "Review the proposed services and prices below before confirming.",
                  );
                })
              }
            >
              Prepare selected shipments
            </button>
            {quotes.length > 0 && (
              <>
                <ul>
                  {quotes.map((r, i) => (
                    <li key={i}>
                      <strong>{r.reference || r.id}</strong>:{" "}
                      {r.quote
                        ? `${r.quote.carrier} · ${r.quote.service} · ${formatINR(r.quote.price_paise)} · ${r.quote.eta_days} estimated days`
                        : r.status}
                      <br />
                      {r.message}
                    </li>
                  ))}
                </ul>
                <button
                  className="button"
                  disabled={!attempts.length}
                  onClick={() =>
                    run(async () => {
                      const r = await operation<{
                        message: string;
                        results: Result[];
                      }>("bulk_book", { rows: attempts });
                      setMessage(r.message);
                      setResults(r.results);
                      router.refresh();
                    })
                  }
                >
                  Confirm / safely retry {attempts.length} simulated bookings
                </button>
              </>
            )}
          </details>
        </fieldset>
      )}
      <p role="status">{busy ? "Processing…" : message}</p>
      {results.length > 0 && (
        <ul>
          {results.map((r, i) => (
            <li key={i}>
              {r.status}: {r.message}{" "}
              {r.status === "created" ? (
                <Link href={`/orders/${r.id}`}>Open order</Link>
              ) : r.status === "booked" ? (
                <Link href={`/shipments/${r.id}`}>Open shipment</Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
export function TrackingFile() {
  const router = useRouter(),
    lock = useRef(false),
    [rows, setRows] = useState<Record<string, string>[]>([]),
    [results, setResults] = useState<Result[]>([]),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(false),
    [message, setMessage] = useState("");
  async function run(commit: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const r = await operation<{ message: string; results: Result[] }>(
        commit ? "tracking_import" : "tracking_preview",
        { rows },
      );
      setResults(r.results);
      setMessage(r.message);
      setPreview(!commit);
      if (commit) router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="card op-panel">
      <h2>Import local tracking events</h2>
      <p>
        CSV/TSV, up to 1 MB and 1,000 rows. Headers:
        awb,event_key,status,occurred_at,location,note. Use ISO timestamps with
        Z or an offset. Unique event keys make repeat imports safe. Only
        simulator shipments are accepted.
      </p>
      <a
        download="tracking-template.csv"
        href={
          "data:text/csv;charset=utf-8," +
          encodeURIComponent(
            "awb,event_key,status,occurred_at,location,note\nSIM-REPLACE,event-001,in_transit,2026-11-20T10:00:00Z,Chennai,Test event\n",
          )
        }
      >
        Download CSV template
      </a>
      <label className="op-field">
        Tracking file
        <input
          type="file"
          accept=".csv,.tsv"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            setRows([]);
            setResults([]);
            setPreview(false);
            setMessage("");
            if (!file) return;
            setBusy(true);
            try {
              if (file.size > 1000000) throw new Error("File exceeds 1 MB.");
              const { parse } = await import("csv-parse/browser/esm/sync");
              const table = parse(await file.text(), {
                bom: true,
                skip_empty_lines: true,
                delimiter: file.name.toLowerCase().endsWith(".tsv")
                  ? "\t"
                  : ",",
              }) as string[][];
              const headers = table[0] || [];
              if (
                new Set(headers).size !== headers.length ||
                !["awb", "event_key", "status", "occurred_at"].every((h) =>
                  headers.includes(h),
                )
              )
                throw new Error(
                  "Use the template headers, without duplicates.",
                );
              if (table.length < 2 || table.length > 1001)
                throw new Error("Include 1–1,000 data rows.");
              setRows(
                table
                  .slice(1)
                  .map((row) =>
                    Object.fromEntries(
                      headers.map((h, i) => [h, row[i] || ""]),
                    ),
                  ),
              );
              setMessage("File read. Preview before importing.");
            } catch (error) {
              setMessage((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <button
        className="button button-secondary"
        disabled={busy || !rows.length}
        onClick={() => run(false)}
      >
        Preview tracking rows
      </button>
      {preview && (
        <button className="button" disabled={busy} onClick={() => run(true)}>
          Import valid rows
        </button>
      )}
      <p role="status">{busy ? "Processing…" : message}</p>
      <ul>
        {results.map((r, i) => (
          <li key={i}>
            Row {i + 1} · {r.id}: {r.status} — {r.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
