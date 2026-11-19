import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/auth-core";
import { getDb } from "@/lib/db";
import {
  getOrder,
  orderEvents,
  InputError,
  type OrderData,
} from "@/lib/orders";
import { PageHeading, Badge } from "@/components/ui";
import { OrderAction } from "@/components/order-list";
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser(),
    db = getDb(),
    { id } = await params;
  let order;
  try {
    order = getOrder(db, user, id);
  } catch (error) {
    if (error instanceof InputError && error.status === 404) notFound();
    throw error;
  }
  const d = order.details as OrderData,
    editable = can(user.role, "operate"),
    unbooked =
      ["new", "unprocessed"].includes(order.status) &&
      !db.prepare("SELECT id FROM shipments WHERE order_id=? AND status<>'cancelled'").get(id);
  return (
    <>
      <PageHeading
        eyebrow="ORDER DETAILS"
        title={order.reference}
        description={`${order.customer} · ${order.created_date} · ${order.synthetic ? "Synthetic sample" : "Local order"}`}
      >
        <Link className="button button-secondary" href="/orders">
          All orders
        </Link>
        {editable && (
          <Link
            className="button button-secondary"
            href={`/orders/new?clone=${id}`}
          >
            Clone
          </Link>
        )}
        {editable && unbooked && (
          <Link className="button" href={`/orders/${id}/edit`}>
            Edit order
          </Link>
        )}
      </PageHeading>
      {editable&&unbooked&&order.status==='new'&&<p className="notice"><Link className="button" href={'/shipments/new?order='+id}>Create shipment</Link> Compare simulated services and prepare a booking.</p>}
      <p><Link href={'/shipments?q='+encodeURIComponent(order.reference)}>View this order’s shipments →</Link></p>
      <div className="order-detail-grid">
        <section className="card op-panel">
          <Badge status={order.status} />
          <h2>Dispatch summary</h2>
          <dl className="op-details">
            <div>
              <dt>Order value</dt>
              <dd>
                {(order.amount_paise / 100).toLocaleString("en-IN", {
                  style: "currency",
                  currency: "INR",
                })}
              </dd>
            </div>
            <div>
              <dt>Payment</dt>
              <dd>{order.payment_mode}</dd>
            </div>
            <div>
              <dt>Carrier preference</dt>
              <dd>
                {d.carrier || "Not supplied"} · preference only; see shipment records for bookings
              </dd>
            </div>
            <div>
              <dt>Invoice reference</dt>
              <dd>
                {d.invoice_number || "Not supplied"} · {d.invoice_date || "—"}
              </dd>
            </div>
          </dl>
          {d.recipient ? (
            <>
              <h3>Delivery address</h3>
              <address>
                {d.recipient.name}
                <br />
                {d.recipient.address}
                <br />
                {d.recipient.city}, {d.recipient.state} {d.recipient.pincode}
                <br />
                {d.recipient.phone}
              </address>
              <h3>Products</h3>
              <ul>
                {d.items.map((item, i) => (
                  <li key={i}>
                    {item.name} · {item.quantity} × ₹{item.price} · SKU{" "}
                    {item.sku || "—"} · HSN {item.hsn || "—"}
                  </li>
                ))}
              </ul>
              <h3>Packages</h3>
              <ul>
                {d.packages.map((p, i) => (
                  <li key={i}>
                    {p.weight} kg · {p.length} × {p.width} × {p.height} cm
                  </li>
                ))}
              </ul>
              <p>{d.notes}</p>
            </>
          ) : (
            <p className="notice">
              This Stage 1 sample has no complete address, product or package
              details. Clone it or edit an unbooked sample to supply them.
            </p>
          )}
        </section>
        <div>
          {editable && unbooked && (
            <OrderAction id={id} revision={order.revision} />
          )}
          <section className="card op-panel">
            <h2>Activity history</h2>
            <ul className="event-list">
              {orderEvents(db, user, id).map((e, i) => (
                <li key={i}>
                  <strong>{String(e.action)}</strong>
                  <time>
                    {new Date(Number(e.created_at)).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}{" "}
                    IST
                  </time>
                  <p>{String(e.note)}</p>
                </li>
              ))}
            </ul>
            <p className="field-help">
              Historical sample records may have no operational events.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
