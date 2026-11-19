import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { InputError } from "@/lib/orders";
import { getShipment, listShipments } from "@/lib/shipping";
import { PageHeading } from "@/components/ui";
import { BookingPanel } from "@/components/shipping-controls";
export default async function CreateReturn({
  searchParams,
}: {
  searchParams: Promise<{ shipment?: string; q?: string; page?: string }>;
}) {
  const user = await requireUser(),
    db = getDb(),
    params = await searchParams;
  if (user.role === "viewer") return <p>Read-only access.</p>;
  let shipment;
  if (typeof params.shipment === "string") {
    try {
      shipment = getShipment(db, user, params.shipment);
    } catch (error) {
      if (error instanceof InputError && error.status === 404) notFound();
      throw error;
    }
  }
  const q = typeof params.q === "string" ? params.q : "";
  const candidates = !shipment
    ? listShipments(
        db,
        user,
        new URLSearchParams({
          status: "delivered",
          mode: "simulator",
          q,
          page: typeof params.page === "string" ? params.page : "1",
        }),
      )
    : null;
  return (
    <>
      <PageHeading
        eyebrow="REVERSE LOGISTICS"
        title="Create a return"
        description="Return the full shipment from its delivery address to the original pickup address. No refund or credit note is created."
      >
        <Link className="button button-secondary" href="/returns">
          Back to returns
        </Link>
      </PageHeading>
      {shipment ? (
        <BookingPanel orderId={shipment.order_id} parentId={shipment.id} />
      ) : (
        <section className="card op-panel">
          <form action="/returns/new" className="search-form">
            <label className="op-field">
              Search delivered shipments
              <input name="q" defaultValue={q} />
            </label>
            <button className="button">Search</button>
          </form>
          <ul className="booking-candidates">
            {candidates!.rows.map((s) => (
              <li key={String(s.id)}>
                <div>
                  <strong>{String(s.awb)}</strong>
                  <span>
                    {String(s.reference)} · {String(s.customer)}
                  </span>
                </div>
                <Link
                  className="button button-secondary"
                  href={"/returns/new?shipment=" + s.id}
                >
                  Choose shipment
                </Link>
              </li>
            ))}
          </ul>
          {!candidates!.total && (
            <p>
              No delivered simulator shipments yet. Complete a forward journey
              first.
            </p>
          )}
          <div className="pagination">
            {candidates!.page > 1 && (
              <Link
                href={`/returns/new?q=${encodeURIComponent(q)}&page=${candidates!.page - 1}`}
              >
                ← Previous
              </Link>
            )}
            {candidates!.page < candidates!.pages && (
              <Link
                href={`/returns/new?q=${encodeURIComponent(q)}&page=${candidates!.page + 1}`}
              >
                Next →
              </Link>
            )}
          </div>
        </section>
      )}
    </>
  );
}
