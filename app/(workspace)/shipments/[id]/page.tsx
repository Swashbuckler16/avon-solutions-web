import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { InputError } from "@/lib/orders";
import { shipmentDetail } from "@/lib/shipping";
import { formatINR, simulationNotice } from "@/lib/shipping-format";
import { PageHeading, Badge } from "@/components/ui";
import {
  ShipmentCancel,
  TrackingReplay,
  ReviewForm,
  ProofUpload,
} from "@/components/shipping-controls";
export default async function ShipmentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  let data;
  try {
    data = shipmentDetail(getDb(), user, (await params).id);
  } catch (error) {
    if (error instanceof InputError && error.status === 404) notFound();
    throw error;
  }
  const { shipment: s, events, proofs, history } = data,
    editable = user.role !== "viewer",
    isStaff = !user.customer_id && editable;
  return (
    <>
      <PageHeading
        eyebrow={
          s.direction === "reverse" ? "RETURN SHIPMENT" : "SHIPMENT DETAILS"
        }
        title={s.awb || s.reference}
        description={`${s.carrier} · ${s.service || "Historical fixture"} · ${s.reference}`}
      >
        <Link
          className="button button-secondary"
          href={s.direction === "reverse" ? "/returns" : "/shipments"}
        >
          Back to worklist
        </Link>
        {s.mode === "simulator" && (
          <>
            <Link
              className="button button-secondary"
              href={`/shipments/${s.id}/documents?type=label`}
            >
              Print label
            </Link>
            <Link
              className="button button-secondary"
              href={`/shipments/${s.id}/documents?type=invoice`}
            >
              Invoice summary
            </Link>
          </>
        )}
      </PageHeading>
      <p className="notice">
        {s.mode === "simulator"
          ? simulationNotice
          : "Historical synthetic fixture. No operational tracking, documents or booking are available."}
      </p>
      <div className="order-detail-grid">
        <div>
          <section className="card op-panel">
            <Badge status={s.status} />
            <h2>{s.direction === "reverse" ? "Return" : "Dispatch"} summary</h2>
            <dl className="op-details">
              <div>
                <dt>Customer</dt>
                <dd>{s.customer}</dd>
              </div>
              <div>
                <dt>Order</dt>
                <dd>
                  <Link href={"/orders/" + s.order_id}>{s.reference}</Link>
                </dd>
              </div>
              <div>
                <dt>Simulated shipping charge</dt>
                <dd>{formatINR(s.price_paise)}</dd>
              </div>
              {s.parent_id && (
                <div>
                  <dt>Original shipment</dt>
                  <dd>
                    <Link href={"/shipments/" + s.parent_id}>
                      View forward shipment
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
            {s.mode === "simulator" && (
              <>
                <div className="shipping-addresses">
                  {[
                    ["Pickup", s.snapshot.pickup],
                    ["Delivery", s.snapshot.recipient],
                  ].map(([label, a]) => {
                    const address = a as typeof s.snapshot.pickup;
                    return (
                      <div key={String(label)}>
                        <h3>{String(label)} snapshot</h3>
                        <address>
                          {address.name}
                          <br />
                          {address.address}
                          <br />
                          {address.city}, {address.state} {address.pincode}
                          <br />
                          {address.phone}
                        </address>
                      </div>
                    );
                  })}
                </div>
                <h3>Packages</h3>
                <ul>
                  {s.snapshot.order.packages.map((p, i) => (
                    <li key={i}>
                      {p.weight} kg · {p.length} × {p.width} × {p.height} cm
                    </li>
                  ))}
                </ul>
              </>
            )}
            {editable &&
              s.mode === "simulator" &&
              s.direction === "forward" &&
              s.status === "delivered" && (
                <Link className="button" href={"/returns/new?shipment=" + s.id}>
                  Create full return
                </Link>
              )}
          </section>
          <section className="card op-panel">
            <h2>Tracking timeline</h2>
            <p className="field-help">
              Occurrence and receipt times are shown separately. Ignored events
              are retained for diagnosis.
            </p>
            <ol className="event-list">
              {events.map((e) => (
                <li key={String(e.id)}>
                  <Badge status={String(e.status)} />
                  <strong> {String(e.location)}</strong>
                  <time>
                    Occurred{" "}
                    {new Date(Number(e.occurred_at)).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}{" "}
                    IST
                  </time>
                  <time>
                    Received{" "}
                    {new Date(Number(e.received_at)).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}{" "}
                    IST
                  </time>
                  <p>{String(e.note)}</p>
                  <small>
                    {String(e.event_key)} · {String(e.disposition)}
                  </small>
                </li>
              ))}
            </ol>
            {!events.length && <p>No operational tracking events.</p>}
          </section>
          <section className="card op-panel">
            <h2>Delivery proof</h2>
            {proofs.map((p) => (
              <article key={String(p.id)} className="proof-card">
                <Badge status={String(p.status)} />
                <p>
                  {String(p.filename)} ·{" "}
                  {new Date(Number(p.created_at)).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}{" "}
                  IST
                </p>
                <a
                  href={"/api/proofs/" + p.id}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open private proof image
                </a>
                <p>{String(p.review_note)}</p>
                {isStaff && p.status === "pending" && (
                  <ReviewForm
                    id={String(p.id)}
                    revision={Number(p.revision)}
                    kind="pod"
                  />
                )}
              </article>
            ))}
            {!proofs.length && <p>No delivery proof uploaded.</p>}
            {editable && s.mode === "simulator" && s.status === "delivered" && (
              <ProofUpload shipmentId={s.id} />
            )}
          </section>
        </div>
        <div>
          {editable &&
            s.mode === "simulator" &&
            s.status === "info_received" && <ShipmentCancel shipment={s} />}
          {s.direction === "reverse" && (
            <section className="card op-panel">
              <h2>Return quality check</h2>
              <Badge status={s.qa_status} />
              <p>
                {s.qa_note ||
                  "Review becomes available after the return is received (delivered)."}
              </p>
              {isStaff && s.qa_status === "pending" && (
                <ReviewForm id={s.id} revision={s.revision} kind="return" />
              )}
            </section>
          )}
          {isStaff && s.mode === "simulator" && <TrackingReplay shipment={s} />}
          <section className="card op-panel">
            <h2>Audit history</h2>
            <ul className="event-list">
              {history.map((e, i) => (
                <li key={i}>
                  <strong>{String(e.action).replaceAll("_", " ")}</strong>
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
          </section>
        </div>
      </div>
    </>
  );
}
