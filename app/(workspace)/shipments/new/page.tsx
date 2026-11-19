import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getOrder, listOrders, InputError } from "@/lib/orders";
import { PageHeading } from "@/components/ui";
import { BookingPanel } from "@/components/shipping-controls";
export default async function CreateShipment({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; q?: string; page?: string }>;
}) {
  const user = await requireUser(),
    db = getDb(),
    params = await searchParams;
  if (user.role === "viewer")
    return (
      <p>
        Read-only access. <Link href="/shipments">View shipments</Link>
      </p>
    );
  let order;
  if (typeof params.order === "string") {
    try {
      order = getOrder(db, user, params.order);
    } catch (error) {
      if (error instanceof InputError && error.status === 404) notFound();
      throw error;
    }
  }
  const q = typeof params.q === "string" ? params.q : "";
  const candidates = !order
    ? listOrders(
        db,
        user,
        new URLSearchParams({
          status: "new",
          q,
          page: typeof params.page === "string" ? params.page : "1",
        }),
      )
    : null;
  return (
    <>
      <PageHeading
        eyebrow="ORDER TO SHIPMENT"
        title={order ? "Ship " + order.reference : "Choose an order to ship"}
        description="Review addresses and packages, compare simulated services, then confirm booking."
      >
        <Link className="button button-secondary" href="/shipments">
          Back to shipments
        </Link>
      </PageHeading>
      {order ? (
        <>
          <p className="notice">
            Order {order.reference} · {order.customer}.{" "}
            <Link href={"/orders/" + order.id}>Review order details →</Link>
          </p>
          <BookingPanel orderId={order.id} />
        </>
      ) : (
        <section className="card op-panel">
          <form action="/shipments/new" className="search-form">
            <label className="op-field">
              Search ready orders
              <input
                name="q"
                defaultValue={q}
                placeholder="Reference, customer or city"
              />
            </label>
            <button className="button">Find orders</button>
          </form>
          <ul className="booking-candidates">
            {candidates!.rows.map((o) => (
              <li key={o.id}>
                <div>
                  <strong>{o.reference}</strong>
                  <span>
                    {o.customer} · {o.destination}
                    {o.synthetic
                      ? " · sample: complete missing details first"
                      : ""}
                  </span>
                </div>
                <Link
                  className="button button-secondary"
                  href={"/shipments/new?order=" + o.id}
                >
                  Choose order
                </Link>
              </li>
            ))}
          </ul>
          {!candidates!.total && (
            <p>
              No ready orders. <Link href="/orders/new">Create an order</Link>{" "}
              or mark an unprocessed order ready.
            </p>
          )}
          <div className="pagination">
            {candidates!.page > 1 && (
              <Link
                href={`/shipments/new?q=${encodeURIComponent(q)}&page=${candidates!.page - 1}`}
              >
                ← Previous
              </Link>
            )}
            {candidates!.page < candidates!.pages && (
              <Link
                href={`/shipments/new?q=${encodeURIComponent(q)}&page=${candidates!.page + 1}`}
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
