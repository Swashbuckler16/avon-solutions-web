import type { ShippingDetails } from "@/lib/orders";
export function ShippingDetailsSummary({ value }: { value?: ShippingDetails }) {
  if (!value) return null;
  return (
    <section className="card op-panel">
      <h2>Order destination & appointment</h2>
      <p>Destination country: {value.country}. Order accounting is INR.</p>
      {value.country !== "IN" && (
        <p>
          Declared contents: {value.description} · {value.currency}{" "}
          {value.declared_value} · {value.purpose} · {value.incoterm}. HS/HSN
          codes are listed with the order items. Preparation only; no customs
          filing or clearance.
        </p>
      )}
      {value.appointment_date && (
        <p>
          Requested appointment: {value.appointment_date} at{" "}
          {value.appointment_time} ({value.timezone}). Not confirmed by a
          carrier.
        </p>
      )}
    </section>
  );
}
