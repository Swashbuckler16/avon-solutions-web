import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { InputError, customers } from "@/lib/orders";
import {
  analytics,
  reportFilters,
  reportDefinitions,
  reportRuns,
} from "@/lib/reports";
import {
  formatINR,
  simulatorCarriers,
  trackingStatuses,
} from "@/lib/shipping-format";
import { PageHeading } from "@/components/ui";
import { OperationForm } from "@/components/operations-controls";
export default async function Analytics({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser(),
    db = getDb(),
    raw = await searchParams;
  let filters = reportFilters({}),
    data,
    filterError = "";
  try {
    filters = reportFilters(raw);
    data = analytics(db, user, filters);
  } catch (error) {
    if (error instanceof InputError) filterError = error.message;
    else throw error;
  }
  const definitions = reportDefinitions(db, user),
    runs = reportRuns(db, user),
    write = user.role !== "viewer",
    query = new URLSearchParams(filters).toString();
  return (
    <>
      <PageHeading
        eyebrow="ANALYTICS & REPORTS"
        title="Numbers you can trace."
        description="Shipment cohort by creation date (UTC). Default: simulator records only. Metrics below describe the filtered shipments, not all orders."
      >
        <Link className="button button-secondary" href="/insights">
          Freight & feedback
        </Link>
        {data && (
          <a className="button" href={"/api/reports?" + query}>
            Download filtered CSV
          </a>
        )}
      </PageHeading>
      <form className="card op-panel op-fields">
        <label className="op-field">
          Customer
          <select name="customer_id" defaultValue={filters.customer_id}>
            <option value="">All accessible customers</option>
            {customers(db, user).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="op-field">
          From
          <input type="date" name="from" defaultValue={filters.from} />
        </label>
        <label className="op-field">
          To
          <input type="date" name="to" defaultValue={filters.to} />
        </label>
        <label className="op-field">
          Carrier
          <select name="carrier" defaultValue={filters.carrier}>
            <option value="">All</option>
            {[...simulatorCarriers, "Local simulator"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="op-field">
          Status
          <select name="status" defaultValue={filters.status}>
            <option value="">All</option>
            {[...trackingStatuses, "cancelled"].map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="op-field">
          Data type
          <select name="mode" defaultValue={filters.mode}>
            <option value="simulator">Simulator bookings</option>
            <option value="fixture">Historical fixtures</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="op-field">
          Direction
          <select name="direction" defaultValue={filters.direction}>
            <option value="">Both</option>
            <option value="forward">Forward</option>
            <option value="reverse">Reverse</option>
          </select>
        </label>
        <button className="button">Apply filters</button>
      </form>
      {filterError && (
        <p className="notice" role="alert">
          {filterError} Adjust the filters above and try again.
        </p>
      )}
      {data && (
        <>
          <section className="stage4-metrics">
            {[
              ["Shipments", data.total],
              ["Distinct orders in cohort", data.orders],
              [
                "Currently delivered",
                `${data.delivered} (${data.deliveryPercent ?? 0}%)`,
              ],
              ["Returns", data.returns],
              ["Open cases", data.openCases],
              ["Latest POD verified", data.verifiedProofs],
              [
                "Average delivery hours",
                data.averageHours === null
                  ? "No timed deliveries"
                  : data.averageHours.toFixed(1),
              ],
              ["Feedback score (NPS)", data.nps ?? "No responses"],
              ["Feedback responses", data.feedbackCount],
              ["Supplied freight variance", formatINR(data.variancePaise)],
            ].map(([label, value]) => (
              <article className="card op-panel" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </section>
          <p>
            Delivery percentage includes all selected shipment statuses,
            including cancellations. Duration uses applied delivery events where
            booking time exists. NPS = % scoring 9–10 minus % scoring 0–6; one
            current response per delivered forward shipment. Freight variance
            covers {data.freightCount} supplied comparisons, invoice minus
            quote.
          </p>
          <section className="card op-panel">
            <h2>Carrier comparison</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Carrier</th>
                    <th>Shipments</th>
                    <th>Delivered</th>
                    <th>Open cases</th>
                  </tr>
                </thead>
                <tbody>
                  {data.carriers.map((c) => (
                    <tr key={c.carrier}>
                      <td>{c.carrier}</td>
                      <td>{c.total}</td>
                      <td>{c.delivered}</td>
                      <td>{c.exceptions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.total && <p>No shipments match these filters.</p>}
          </section>
        </>
      )}
      {write && data && (
        <OperationForm
          action="report_save"
          title="Save these report filters"
          data={{ filters }}
          fields={[
            { name: "name", label: "Report name" },
            {
              name: "interval_hours",
              label: "Repeat every hours (0 = manual)",
              type: "number",
              min: 0,
              max: 720,
              value: "0",
            },
          ]}
        />
      )}
      <section className="card op-panel">
        <h2>My saved reports</h2>
        <p>
          Only you can view your definitions and generated files. Scheduled
          output is addressed to your account email in the local outbox; nothing
          is emailed. Run <code>npm run scheduler -- --watch</code> locally for
          minute-by-minute processing while this computer is on. Missed
          intervals coalesce into one run.
        </p>
        {definitions.map((d) => (
          <details key={String(d.id)}>
            <summary>
              {String(d.name)} ·{" "}
              {d.interval_hours
                ? `${d.interval_hours} hourly interval`
                : "manual"}
            </summary>
            <p>
              Filters:{" "}
              {Object.entries(d.filters)
                .filter(([, v]) => v)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}
            </p>
            <p>
              Next scheduled run:{" "}
              {d.interval_hours
                ? new Date(Number(d.next_run)).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  }) + " IST"
                : "disabled"}
            </p>
            {write && (
              <>
                <OperationForm
                  action="report_run"
                  title="Generate now"
                  data={{ id: d.id }}
                  button="Generate CSV"
                />
                <OperationForm
                  key={String(d.revision)}
                  action="report_save"
                  title="Edit schedule / pause"
                  data={{ id: d.id, revision: d.revision, filters: d.filters }}
                  fields={[
                    {
                      name: "name",
                      label: "Report name",
                      value: String(d.name),
                    },
                    {
                      name: "interval_hours",
                      label: "Interval hours (0 pauses)",
                      type: "number",
                      value: String(d.interval_hours),
                      min: 0,
                      max: 720,
                    },
                  ]}
                />
              </>
            )}
          </details>
        ))}
      </section>
      {write && (
        <OperationForm
          action="report_tick"
          title="Process my due schedules"
          button="Run due reports now"
        />
      )}
      <section className="card op-panel">
        <h2>Local outbox & report history</h2>
        <p>Latest 100 runs. Local only — no messages sent.</p>
        {runs.map((r) => (
          <article className="case-entry" key={String(r.id)}>
            <strong>
              {String(r.name)} · {String(r.status)}
            </strong>
            <p>
              {new Date(Number(r.created_at)).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
              })}{" "}
              IST · To: {String(r.recipient)}
            </p>
            <p>{String(r.message)}</p>
            {r.status === "ready" && (
              <a href={"/api/reports?run=" + r.id}>Download generated CSV</a>
            )}
          </article>
        ))}
      </section>
    </>
  );
}
