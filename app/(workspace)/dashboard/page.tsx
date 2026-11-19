import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Box,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  FlaskConical,
  Search,
  Truck,
  Warehouse,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { overview } from "@/lib/overview";
import { PageHeading, Metric, Badge } from "@/components/ui";
import { WorkspaceGuide } from "@/components/guide";
import { requireUser } from "@/lib/auth";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; q?: string }>;
}) {
  const params = await searchParams;
  const days = params.days === "30" ? 30 : 7;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const user = await requireUser();
  const data = overview(getDb(), days, q, new Date(), user.customer_id || null);
  const max = Math.max(1, ...data.trend.map((d) => d.count));
  const rate = data.shipments
    ? Math.round((data.delivered / data.shipments) * 100)
    : 0;
  return (
    <>
      <PageHeading
        eyebrow="OPERATIONS OVERVIEW"
        title="Your day, in perspective."
        description="A little clarity for everything on the move."
      >
        <WorkspaceGuide />
        <a href="#activity" className="button">
          View activity <ArrowDown size={16} />
        </a>
      </PageHeading>
      <div className="sample-banner">
        <span>
          <FlaskConical size={17} />
          <strong>Local workspace</strong>
          <span className="banner-detail">
            Customer orders and labeled sample records. No live carrier
            connections.
          </span>
        </span>
        <span className="sample-tag">STAGE 2</span>
      </div>
      <div className="section-toolbar">
        <div className="section-title">
          <h2>At a glance</h2>
          <span className="muted">
            {new Date(data.start + "T00:00:00Z").toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              timeZone: "UTC",
            })}{" "}
            –{" "}
            {new Date(data.end + "T00:00:00Z").toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            })}{" "}
            · UTC
          </span>
        </div>
        <div className="period-switch" aria-label="Reporting period">
          <Link
            href={`/dashboard?days=7&q=${encodeURIComponent(q)}`}
            aria-current={days === 7 ? "true" : undefined}
            className={days === 7 ? "selected" : ""}
          >
            Last 7 days
          </Link>
          <Link
            href={`/dashboard?days=30&q=${encodeURIComponent(q)}`}
            aria-current={days === 30 ? "true" : undefined}
            className={days === 30 ? "selected" : ""}
          >
            Last 30 days
          </Link>
        </div>
      </div>
      <section className="metrics" aria-label="Activity totals">
        <Metric
          label="Total orders"
          value={data.orders}
          note="Orders in this period"
          icon={<Box size={20} />}
        />
        <Metric
          label="Total shipments"
          value={data.shipments}
          note="From persisted orders"
          icon={<Truck size={20} />}
        />
        <Metric
          label="Delivered"
          value={data.delivered}
          note={`${rate}% of period shipments`}
          icon={<CheckCheck size={20} />}
          accent
        />
        <Metric
          label="Needs attention"
          value={data.attention}
          note="Exceptions and returns"
          icon={<CircleAlert size={20} />}
        />
      </section>
      <div className="insight-grid">
        <section className="card trend-card">
          <div className="card-heading">
            <div>
              <h2>Shipment activity</h2>
              <p className="muted">A clear view of movement over time</p>
            </div>
            <div className="chart-legend">
              <span>
                <i />
                Created
              </span>
              <span>
                <i />
                Delivered
              </span>
            </div>
          </div>
          <div
            className="chart"
            role="img"
            aria-label={`Shipments created by date. ${data.trend.map((d) => `${d.day}: ${d.count} created, ${d.delivered} currently delivered`).join("; ")}`}
          >
            <div className="chart-axis">
              <span>{max}</span>
              <span>{Math.round(max / 2)}</span>
              <span>0</span>
            </div>
            <div className={`chart-bars ${days === 30 ? "chart-dense" : ""}`}>
              {data.trend.map((d, i) => (
                <div className="chart-day" key={d.day}>
                  <div
                    className="bar-pair"
                    title={`${d.day}: ${d.count} shipments, ${d.delivered} delivered`}
                  >
                    <div
                      className="bar"
                      style={{ height: `${(d.count / max) * 100}%` }}
                    />
                    <div
                      className="bar delivered-bar"
                      style={{ height: `${(d.delivered / max) * 100}%` }}
                    />
                  </div>
                  <span>
                    {days === 7
                      ? new Date(d.day + "T00:00:00Z").toLocaleDateString(
                          "en-IN",
                          { weekday: "short", timeZone: "UTC" },
                        )
                      : i % 5 === 0
                        ? d.day.slice(8)
                        : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-foot">
            <span>
              <span className="small-teal-dot" /> Shipment creation dates, UTC
            </span>
            <span>Delivered = current status</span>
          </div>
        </section>
        <section className="card status-card">
          <div className="card-heading">
            <div>
              <h2>Shipment breakdown</h2>
              <p className="muted">Every shipment, accounted for</p>
            </div>
          </div>
          <div className="delivery-rate">
            <strong>
              {rate}
              <span>%</span>
            </strong>
            <div>
              <strong>Delivered</strong>
              <span>of shipments in this period</span>
            </div>
            <CheckCheck size={29} />
          </div>
          <div className="distribution" aria-label="Status distribution">
            {data.groups.map((g) => (
              <span
                key={g.status}
                className={`segment-${g.status}`}
                style={{
                  width: `${data.shipments ? (g.count / data.shipments) * 100 : 0}%`,
                }}
                title={`${g.status}: ${g.count}`}
              />
            ))}
          </div>
          <ul className="status-list">
            {[
              ["delivered", "Delivered"],
              ["in_transit", "In transit"],
              ["out_for_delivery", "Out for delivery"],
              ["info_received", "Awaiting pickup"],
              ["exception", "Exception"],
              ["rto", "Return to origin"],
            ].map(([status, label]) => (
              <li key={status}>
                <span>
                  <i className={`segment-${status}`} />
                  {label}
                </span>
                <strong>
                  {data.groups.find((g) => g.status === status)?.count || 0}
                </strong>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="card activity-card" id="activity">
        <div className="card-heading">
          <div>
            <h2>
              Recent activity <span className="count-pill">{data.matches}</span>
            </h2>
            <p className="muted">The latest orders in your workspace</p>
          </div>
          <form className="search-form" action="/dashboard">
            <input type="hidden" name="days" value={days} />
            <Search size={17} />
            <label className="sr-only" htmlFor="activity-search">
              Search recent activity
            </label>
            <input
              id="activity-search"
              name="q"
              defaultValue={q}
              maxLength={100}
              placeholder="Search reference, customer or city"
            />
            <button className="search-submit" aria-label="Search activity">
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
        <div className="table-scroll">
          <table>
            <caption className="sr-only">
              Recent synthetic order and shipment activity
            </caption>
            <thead>
              <tr>
                <th>Order reference</th>
                <th>Customer</th>
                <th>Destination</th>
                <th>Status</th>
                <th className="number">Order value</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.activity.map((row) => (
                <tr key={row.reference}>
                  <td className="order-reference">
                    <span className="table-icon">
                      <Box size={16} />
                    </span>
                    {row.reference}
                  </td>
                  <td>{row.customer}</td>
                  <td>{row.destination}</td>
                  <td>
                    <Badge status={row.status} />
                  </td>
                  <td className="number">
                    {(row.amount_paise / 100).toLocaleString("en-IN", {
                      style: "currency",
                      currency: "INR",
                      maximumFractionDigits: 0,
                    })}
                  </td>
                  <td className="muted">
                    {new Date(
                      row.created_date + "T00:00:00Z",
                    ).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      timeZone: "UTC",
                    })}
                  </td>
                </tr>
              ))}
              {data.activity.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <Search size={25} />
                      <h3>No activity found</h3>
                      <p>Try another reference, customer or destination.</p>
                      <Link href={`/dashboard?days=${days}`}>Clear search</Link>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>
            Showing {data.activity.length} of {data.matches} matching orders
          </span>
          <span className="muted">Open Orders to manage activity</span>
        </div>
      </section>
      <section className="bottom-grid">
        <div className="workspace-summary">
          <span className="summary-icon">
            <Warehouse size={22} />
          </span>
          <div>
            <h3>Your workspace is taking shape.</h3>
            <p>Customer pickup locations. One connected workspace.</p>
          </div>
          <Link href="/settings" aria-label="Open workspace settings">
            <ArrowUpRight size={21} />
          </Link>
        </div>
        <Link href="/orders" className="next-stage-card">
          <div>
            <span className="eyebrow">ORDER MANAGEMENT</span>
            <h3>From orders to opportunity.</h3>
            <p>Order management, imports and warehouses</p>
          </div>
          <ChevronRight size={22} />
        </Link>
      </section>
    </>
  );
}
