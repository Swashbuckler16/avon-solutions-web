import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { InputError, money } from "@/lib/orders";
import { getShipment } from "@/lib/shipping";
import { formatINR } from "@/lib/shipping-format";
import { PrintDocument } from "@/components/shipping-controls";
import { ShippingDetailsSummary } from "@/components/shipping-details";
export default async function Documents({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await requireUser();
  let s;
  try {
    s = getShipment(getDb(), user, (await params).id);
  } catch (error) {
    if (error instanceof InputError && error.status === 404) notFound();
    throw error;
  }
  if (s.mode !== "simulator")
    return <p>Documents are unavailable for historical fixtures.</p>;
  const kind = (await searchParams).type === "invoice" ? "invoice" : "label",
    d = s.snapshot;
  return (
    <>
      <div className="op-actions no-print">
        <Link className="button button-secondary" href={"/shipments/" + s.id}>
          Back to shipment
        </Link>
        <PrintDocument />
      </div>
      <article className="print-sheet">
        {s.direction === "forward" && (
          <ShippingDetailsSummary value={d.order.shipping} />
        )}
        <div className="print-warning">
          SIMULATION ONLY · {s.status === "cancelled" ? "CANCELLED · " : ""}NOT
          VALID FOR CARRIER HANDOVER
        </div>
        <header>
          <strong className="print-brand">avon.</strong>
          <span>
            {kind === "label" ? "Shipping label" : "Order invoice summary"}
          </span>
        </header>
        <h1>{s.awb}</h1>
        <p>
          {s.carrier} · {s.service} ·{" "}
          {s.direction === "reverse" ? "RETURN" : "FORWARD"}
        </p>
        <p>
          Order {d.reference} · Customer {d.customer}
        </p>
        <div className="shipping-addresses">
          {[
            ["FROM", d.pickup],
            ["TO", d.recipient],
          ].map(([label, entry]) => {
            const a = entry as typeof d.pickup;
            return (
              <section key={String(label)}>
                <h2>{String(label)}</h2>
                <address>
                  {a.name}
                  <br />
                  {a.address}
                  <br />
                  {a.city}, {a.state} {a.pincode}
                  <br />
                  India · {a.phone}
                </address>
              </section>
            );
          })}
        </div>
        {kind === "label" ? (
          <>
            <h2>Package details</h2>
            <ol>
              {d.order.packages.map((p, i) => (
                <li key={i}>
                  {p.weight} kg · {p.length} × {p.width} × {p.height} cm
                </li>
              ))}
            </ol>
            <p>
              Payment: {d.order.payment_mode.toUpperCase()} ·{" "}
              {d.order.payment_mode === "cod"
                ? "Test collection amount"
                : "Declared order value"}
              : {formatINR(d.total_paise)}
            </p>
            <p className="print-warning">
              No real AWB, barcode, pickup request or carrier label has been
              issued.
            </p>
          </>
        ) : (
          <>
            <h2>Invoice reference: {d.order.invoice_number}</h2>
            <p>
              Date: {d.order.invoice_date}. Summary of the customer-supplied
              invoice record, not a tax invoice or credit note issued by Avon.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU / HSN</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Line total</th>
                </tr>
              </thead>
              <tbody>
                {d.order.items.map((item, i) => (
                  <tr key={i}>
                    <td>{item.name}</td>
                    <td>
                      {item.sku || "—"} / {item.hsn || "—"}
                    </td>
                    <td>{item.quantity}</td>
                    <td>{formatINR(money(item.price))}</td>
                    <td>{formatINR(money(item.price) * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="order-total">
              Order total: {formatINR(d.total_paise)}
            </p>
            <p>
              Final unit prices include any customer-supplied tax. No tax split
              is calculated.
            </p>
          </>
        )}
        <footer>
          Original Avon local test document · Created{" "}
          {new Date(s.created_at).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          })}{" "}
          IST
        </footer>
      </article>
    </>
  );
}
