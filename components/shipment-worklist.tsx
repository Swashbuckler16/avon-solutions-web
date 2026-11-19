import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listShipments } from "@/lib/shipping";
import { InputError } from "@/lib/orders";
import { PageHeading, Badge } from "./ui";
import {
  formatINR,
  simulationNotice,
  simulatorCarriers,
} from "@/lib/shipping-format";
export async function ShipmentWorklist({
  params,
  direction,
}: {
  params: Record<string, string | string[] | undefined>;
  direction: "forward" | "reverse";
}) {
  const user = await requireUser(),
    query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (typeof value === "string") query.set(key, value);
  const path = direction === "reverse" ? "/returns" : "/shipments";
  let data;
  try {
    data = listShipments(getDb(), user, query, direction);
  } catch (error) {
    if (error instanceof InputError)
      return (
        <p role="alert">
          {error.message} <Link href={path}>Clear filters</Link>
        </p>
      );
    throw error;
  }
  const pageLink = (page: number) => {
    const q = new URLSearchParams(query);
    q.set("page", String(page));
    return path + "?" + q;
  };
  return (
    <>
      <PageHeading
        eyebrow={
          direction === "reverse" ? "REVERSE LOGISTICS" : "SHIPPING OPERATIONS"
        }
        title={
          direction === "reverse"
            ? "Returns, without the runaround."
            : "Every shipment. Every milestone."
        }
        description={
          direction === "reverse"
            ? "Book full returns, follow reverse delivery and record quality checks."
            : "Choose a service, prepare documents and follow each delivery."
        }
      >
        <Link className="button button-secondary" href="/pod">
          Delivery proofs
        </Link>
        {user.role !== "viewer" && (
          <Link
            className="button"
            href={direction === "reverse" ? "/returns/new" : "/shipments/new"}
          >
            {direction === "reverse" ? "+ Create return" : "+ Create shipment"}
          </Link>
        )}
      </PageHeading>
      <p className="notice">{simulationNotice}</p>
      <section className="card">
        <nav className="status-tabs" aria-label="Shipment worklists">
          {[
            "",
            "info_received",
            "in_transit",
            "out_for_delivery",
            "delivered",
            "exception",
            "rto",
            "cancelled",
          ].map((status) => {
            const q = new URLSearchParams(query);
            q.set("status", status);
            q.delete("page");
            return (
              <Link
                key={status}
                href={path + "?" + q}
                aria-current={
                  (query.get("status") || "") === status ? "page" : undefined
                }
              >
                {status ? status.replaceAll("_", " ") : "All"}
              </Link>
            );
          })}
        </nav>
        <form className="order-filters" action={path}>
          <label>
            Search
            <input
              name="q"
              placeholder="AWB, order or customer"
              defaultValue={query.get("q") || ""}
            />
          </label>
          <input
            type="hidden"
            name="status"
            value={query.get("status") || ""}
          />
          <label>
            Carrier
            <select name="carrier" defaultValue={query.get("carrier") || ""}>
              <option value="">All carriers</option>
              {simulatorCarriers.map((c) => (
                <option key={c}>{c}</option>
              ))}
              <option>Local simulator</option>
            </select>
          </label>
          <label>
            Data type
            <select name="mode" defaultValue={query.get("mode") || ""}>
              <option value="">All</option>
              <option value="simulator">Simulator bookings</option>
              <option value="fixture">Historical fixtures</option>
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              name="from"
              defaultValue={query.get("from") || ""}
            />
          </label>
          <label>
            To
            <input type="date" name="to" defaultValue={query.get("to") || ""} />
          </label>
          {direction === "reverse" && (
            <label>
              Quality check
              <select name="qa" defaultValue={query.get("qa") || ""}>
                <option value="">All QA states</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          )}
          <button className="button">Apply filters</button>
          <Link href={path}>Reset</Link>
        </form>
        <div className="table-scroll">
          <table>
            <caption className="sr-only">
              {direction === "reverse" ? "Return" : "Shipment"} worklist
            </caption>
            <thead>
              <tr>
                <th>Waybill / reference</th>
                <th>Customer</th>
                <th>Carrier / service</th>
                <th>Status</th>
                <th>Created (UTC)</th>
                <th>
                  {direction === "reverse" ? "Quality check" : "Test charge"}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={String(r.id)}>
                  <td>
                    <Link
                      className="order-reference"
                      href={"/shipments/" + r.id}
                    >
                      {String(r.awb || r.reference)}
                    </Link>
                    <small className="sample-label">
                      {String(r.reference)} ·{" "}
                      {r.mode === "fixture"
                        ? "Historical fixture"
                        : "Simulator"}
                    </small>
                  </td>
                  <td>{String(r.customer)}</td>
                  <td>
                    {String(r.carrier)}
                    <small className="sample-label">{String(r.service)}</small>
                  </td>
                  <td>
                    <Badge status={String(r.status)} />
                  </td>
                  <td>{String(r.created_date)}</td>
                  <td>
                    {direction === "reverse"
                      ? String(r.qa_status)
                      : formatINR(Number(r.price_paise))}
                  </td>
                </tr>
              ))}
              {!data.rows.length && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <h3>No shipments match</h3>
                      <p>
                        Create a shipment from a ready order or adjust the
                        filters.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>
            {data.total} results · page {data.page} of {data.pages}
          </span>
          <div className="pagination">
            {data.page > 1 && (
              <Link href={pageLink(data.page - 1)}>← Previous</Link>
            )}
            {data.page < data.pages && (
              <Link href={pageLink(data.page + 1)}>Next →</Link>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
