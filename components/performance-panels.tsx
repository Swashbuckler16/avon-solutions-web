import { performance } from "@/lib/performance";
import type { reportRows } from "@/lib/reports";
// Original schematic tile map: adjacency is approximate, not a boundary or navigation map.
const states = [
  ["Ladakh", "LA", 3, 0],
  ["Jammu and Kashmir", "JK", 2, 1],
  ["Himachal Pradesh", "HP", 3, 2],
  ["Punjab", "PB", 2, 2],
  ["Chandigarh", "CH", 2, 3],
  ["Uttarakhand", "UK", 4, 2],
  ["Haryana", "HR", 3, 3],
  ["Delhi", "DL", 4, 3],
  ["Rajasthan", "RJ", 2, 4],
  ["Uttar Pradesh", "UP", 5, 3],
  ["Bihar", "BR", 6, 3],
  ["Sikkim", "SK", 7, 2],
  ["Arunachal Pradesh", "AR", 9, 2],
  ["Assam", "AS", 8, 3],
  ["Nagaland", "NL", 9, 3],
  ["Meghalaya", "ML", 7, 3],
  ["Manipur", "MN", 9, 4],
  ["Mizoram", "MZ", 8, 5],
  ["Tripura", "TR", 8, 4],
  ["Gujarat", "GJ", 1, 5],
  ["Madhya Pradesh", "MP", 3, 5],
  ["Jharkhand", "JH", 6, 4],
  ["West Bengal", "WB", 7, 4],
  ["Chhattisgarh", "CG", 5, 5],
  ["Odisha", "OD", 6, 5],
  ["Maharashtra", "MH", 3, 6],
  ["Dadra and Nagar Haveli and Daman and Diu", "DN", 1, 6],
  ["Telangana", "TS", 4, 7],
  ["Andhra Pradesh", "AP", 5, 7],
  ["Goa", "GA", 2, 7],
  ["Karnataka", "KA", 3, 8],
  ["Kerala", "KL", 3, 9],
  ["Tamil Nadu", "TN", 4, 9],
  ["Puducherry", "PY", 5, 9],
  ["Lakshadweep", "LD", 1, 9],
  ["Andaman and Nicobar Islands", "AN", 8, 9],
] as const;
export function PerformancePanels({
  rows,
}: {
  rows: ReturnType<typeof reportRows>;
}) {
  const p = performance(rows);
  return (
    <>
      <section className="stage4-metrics">
        {[
          ["Early deliveries", p.early],
          ["On estimated day", p.onTime],
          ["Late deliveries", p.late],
          ["No delivery estimate", p.unknown],
          ["Open & overdue", p.overdue],
          ["Stale tracking >7 days", p.stale],
        ].map(([label, value]) => (
          <article className="card op-panel" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      <p>
        Performance compares applied delivery events with the estimated UTC
        delivery day saved at booking. Older records without estimates remain
        unknown. Overdue excludes delivered, cancelled and RTO shipments. These
        are simulation estimates, not contracted carrier SLAs.
      </p>
      <section className="card op-panel">
        <h2>Destination distribution</h2>
        <p>
          India schematic tile map: approximate regional arrangement, not
          geographic boundaries. Counts use shipment delivery snapshots.
          International and unrecognized state names remain in the table.
        </p>
        <div className="table-scroll">
          <svg
            viewBox="0 0 650 620"
            role="img"
            aria-label="India state shipment counts; complete data in the following table"
            className="region-map"
          >
            {states.map(([name, code, x, y]) => {
              const count =
                p.regions.find(
                  (r) => r[0] === `IN / ${name.toLowerCase()}`,
                )?.[1] || 0;
              return (
                <g key={code} transform={`translate(${x * 61},${y * 60})`}>
                  <title>
                    {name}: {count} shipments
                  </title>
                  <rect
                    width="57"
                    height="54"
                    rx="7"
                    fill={count ? "var(--teal)" : "var(--line)"}
                  />
                  <text
                    x="28"
                    y="20"
                    textAnchor="middle"
                    fill={count ? "white" : "var(--ink)"}
                  >
                    {code}
                  </text>
                  <text
                    x="28"
                    y="41"
                    textAnchor="middle"
                    fill={count ? "white" : "var(--ink)"}
                  >
                    {count}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <Data
          title="All destination regions"
          headings={["Country / state", "Shipments"]}
          rows={p.regions}
        />
      </section>
      <div className="settings-grid">
        <Data
          title="Daily shipment creation"
          headings={["Date UTC", "Shipments"]}
          rows={p.days}
        />
        <Data
          title="Payment mix"
          headings={["Payment", "Shipments"]}
          rows={p.payments}
        />
        <Data
          title="Actual package weight"
          headings={["Weight slab", "Shipments"]}
          rows={p.weights}
        />
        <Data
          title="Top products"
          headings={["SKU / product", "Units"]}
          rows={p.products}
        />
        <Data
          title="Top customers"
          headings={["Customer", "Distinct forward orders"]}
          rows={p.customers}
        />
      </div>
      <p>
        Product and customer totals count each forward order once in this
        shipment cohort, including cancelled bookings. Top lists show up to 20
        entries.
      </p>
    </>
  );
}
function Data({
  title,
  headings,
  rows,
}: {
  title: string;
  headings: string[];
  rows: (string | number)[][];
}) {
  return (
    <section className="card op-panel">
      <h2>{title}</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {headings.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p>No matching records.</p>}
    </section>
  );
}
