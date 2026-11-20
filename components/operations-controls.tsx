"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { operation } from "./operations-forms";

export type FormField = {
  name: string;
  label: string;
  type?: string;
  value?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
};
export function OperationForm({
  action,
  title,
  fields = [],
  data = {},
  button = "Save",
}: {
  action: string;
  title: string;
  fields?: FormField[];
  data?: Record<string, unknown>;
  button?: string;
}) {
  const router = useRouter(),
    lock = useRef(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [results, setResults] = useState<
      { id?: string; event_key?: string; status: string; message: string }[]
    >([]);
  return (
    <form
      className="card op-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setMessage("");
        setResults([]);
        try {
          const values: Record<string, unknown> = { ...data };
          const form = new FormData(e.currentTarget);
          for (const field of fields) {
            const value = String(form.get(field.name) ?? "");
            values[field.name] =
              field.type === "json" ? JSON.parse(value) : value;
          }
          const result = await operation<{
            message?: string;
            results?: typeof results;
          }>(action, values);
          setMessage(result.message || "Saved.");
          setResults(result.results || []);
          router.refresh();
        } catch (error) {
          setMessage(
            error instanceof SyntaxError
              ? "Enter valid JSON."
              : (error as Error).message,
          );
        } finally {
          setBusy(false);
          lock.current = false;
        }
      }}
    >
      <h2>{title}</h2>
      <fieldset disabled={busy} className="op-fields">
        {fields.map((f) => (
          <label className="op-field" key={f.name}>
            <span>{f.label}</span>
            {f.options ? (
              <select
                name={f.name}
                defaultValue={f.value ?? f.options[0]?.value}
                required={f.required !== false}
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "json" || f.type === "textarea" ? (
              <textarea
                name={f.name}
                defaultValue={f.value ?? ""}
                required={f.required !== false}
                rows={f.type === "json" ? 10 : 3}
                maxLength={f.type === "json" ? 1000000 : 500}
              />
            ) : (
              <input
                name={f.name}
                type={f.type || "text"}
                defaultValue={f.value ?? ""}
                required={f.required !== false}
                min={f.min}
                max={f.max}
                step={f.type === "number" ? "any" : undefined}
                maxLength={500}
              />
            )}
          </label>
        ))}
      </fieldset>
      <button className="button" disabled={busy}>
        {busy ? "Saving…" : button}
      </button>
      <p role="status" className="op-message">
        {message}
      </p>
      {results.length > 0 && (
        <ul>
          {results.map((r, i) => (
            <li key={i}>
              {r.event_key || r.id}: {r.status} — {r.message}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
type CaseRow = {
  id: string;
  revision: number;
  kind: string;
  status: string;
  reason: string;
  follow_up_date: string;
  awb: string;
  reference: string;
  shipment_id: string;
  customer: string;
  history: { action: string; note: string; created_at: number }[];
};
export function ExceptionQueue({
  rows,
  staff,
  write,
}: {
  rows: CaseRow[];
  staff: boolean;
  write: boolean;
}) {
  const [kind, setKind] = useState(""),
    [status, setStatus] = useState(""),
    [q, setQ] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  const filtered = rows.filter(
    (r) =>
      (!kind || r.kind === kind) &&
      (!status || r.status === status) &&
      `${r.awb} ${r.reference} ${r.customer} ${r.reason}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  const visible = filtered.slice(0, 100),
    chosen = visible.filter((r) => selected.includes(r.id));
  return (
    <>
      <section className="card op-panel">
        <div className="op-fields">
          <label className="op-field">
            Search cases
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSelected([]);
              }}
            />
          </label>
          <label className="op-field">
            Queue
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setSelected([]);
              }}
            >
              <option value="">All</option>
              <option value="ndr">NDR · delivery</option>
              <option value="npr">NPR · pickup</option>
            </select>
          </label>
          <label className="op-field">
            Case status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setSelected([]);
              }}
            >
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="requested">Action requested</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
        </div>
        <p>
          {filtered.length} matching cases. Showing first {visible.length};
          narrow search for more. Selection covers these visible rows only.
        </p>
        {write && (
          <label>
            <input
              type="checkbox"
              checked={visible.length > 0 && chosen.length === visible.length}
              onChange={(e) =>
                setSelected(e.target.checked ? visible.map((r) => r.id) : [])
              }
            />{" "}
            Select visible cases
          </label>
        )}
        {visible.map((r) => (
          <article key={r.id} className="case-entry">
            <h3>
              {write && (
                <input
                  aria-label={`Select ${r.reference} ${r.kind}`}
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, r.id]
                        : selected.filter((id) => id !== r.id),
                    )
                  }
                />
              )}{" "}
              {r.kind.toUpperCase()} · {r.reference} · {r.status}
            </h3>
            <p>
              {r.customer} · <a href={"/shipments/" + r.shipment_id}>{r.awb}</a>
            </p>
            <p>{r.reason}</p>
            {r.follow_up_date && (
              <p>
                Requested follow-up: {r.follow_up_date} · local reminder only
              </p>
            )}
            <details>
              <summary>Case history ({r.history.length})</summary>
              <ol>
                {r.history.map((h, i) => (
                  <li key={i}>
                    {h.action} · {h.note} ·{" "}
                    {new Date(h.created_at).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}{" "}
                    IST
                  </li>
                ))}
              </ol>
            </details>
          </article>
        ))}
        {!visible.length && <p>No matching cases.</p>}
      </section>
      {write && chosen.length > 0 && (
        <OperationForm
          key={chosen.map((r) => r.id).join()}
          action="exception_action"
          title={`Update ${chosen.length} selected cases`}
          data={{
            cases: chosen.map((r) => ({ id: r.id, revision: r.revision })),
          }}
          fields={[
            {
              name: "follow_up_date",
              label: "Requested follow-up date (optional)",
              type: "date",
              required: false,
            },
            {
              name: "action",
              label: "Local action",
              options: [
                { value: "reattempt", label: "Request reattempt" },
                { value: "contact", label: "Request customer contact" },
                { value: "return_request", label: "Request return to origin" },
                ...(staff
                  ? [
                      { value: "resolve", label: "Mark case resolved" },
                      { value: "reopen", label: "Reopen case" },
                    ]
                  : []),
              ],
            },
            { name: "note", label: "Reason / response", type: "textarea" },
          ]}
          button="Record local action"
        />
      )}
    </>
  );
}
