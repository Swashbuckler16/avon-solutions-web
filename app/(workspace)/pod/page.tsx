import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listShipments } from "@/lib/shipping";
import { PageHeading, Badge } from "@/components/ui";
export default async function Proofs({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; direction?: string }>;
}) {
  const user = await requireUser(),
    db = getDb(),
    params = await searchParams,
    direction = params.direction === "reverse" ? "reverse" : "forward",
    q = typeof params.q === "string" ? params.q : "";
  const data = listShipments(
    db,
    user,
    new URLSearchParams({
      q,
      status: "delivered",
      mode: "simulator",
      page: typeof params.page === "string" ? params.page : "1",
    }),
    direction,
  );
  return (
    <>
      <PageHeading
        eyebrow="PROOF OF DELIVERY"
        title="Evidence you can review."
        description="Upload private delivery images from a delivered shipment. Avon staff verify or reject each proof manually."
      />
      <section className="card">
        <form className="order-filters" action="/pod">
          <label>
            Search
            <input
              name="q"
              defaultValue={q}
              placeholder="AWB, order or customer"
            />
          </label>
          <label>
            Shipment direction
            <select name="direction" defaultValue={direction}>
              <option value="forward">Forward</option>
              <option value="reverse">Return</option>
            </select>
          </label>
          <button className="button">Apply filters</button>
        </form>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Shipment</th>
                <th>Customer</th>
                <th>Latest proof</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((s) => {
                const proof = db
                  .prepare(
                    "SELECT status,filename FROM delivery_proofs WHERE shipment_id=? ORDER BY created_at DESC,id DESC LIMIT 1",
                  )
                  .get(s.id!);
                return (
                  <tr key={String(s.id)}>
                    <td>
                      {String(s.awb)}
                      <small className="sample-label">
                        {String(s.reference)} · simulator
                      </small>
                    </td>
                    <td>{String(s.customer)}</td>
                    <td>
                      <Badge
                        status={proof ? String(proof.status) : "unavailable"}
                      />
                    </td>
                    <td>
                      <Link href={"/shipments/" + s.id}>
                        Open delivery proof →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!data.total && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">
                      No delivered simulator shipments match. Proof upload is
                      available after delivery.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>
            {data.total} deliveries · page {data.page} of {data.pages}
          </span>
          <div className="pagination">
            {data.page > 1 && (
              <Link
                href={`/pod?q=${encodeURIComponent(q)}&direction=${direction}&page=${data.page - 1}`}
              >
                ← Previous
              </Link>
            )}
            {data.page < data.pages && (
              <Link
                href={`/pod?q=${encodeURIComponent(q)}&direction=${direction}&page=${data.page + 1}`}
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
