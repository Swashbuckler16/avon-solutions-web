import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { reportRows } from "@/lib/reports";
import { formatINR } from "@/lib/shipping-format";
import { PageHeading } from "@/components/ui";
import { OperationForm } from "@/components/operations-controls";
import { ReconciliationFile } from "@/components/reconciliation-file";
export default async function Insights({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const user = await requireUser(),
    staff = !user.customer_id && user.role !== "viewer",
    rawQuery = (await searchParams).q,
    q = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery) || "",
    rows = reportRows(getDb(), user, { mode: "simulator" }, q);
  return (
    <>
      <PageHeading
        eyebrow="FREIGHT & FEEDBACK"
        title="Compare costs. Listen to customers."
        description="Supplied quote and invoice amounts are comparison records only. Feedback is one editable response per delivered forward shipment."
      >
        <Link href="/analytics" className="button">
          View summaries
        </Link>
      </PageHeading>
      <p className="notice">
        No payments, settlement, carrier invoices, refunds or customer surveys
        are sent. Simulator prices are not real quotations.
      </p>
      <form className="card op-panel">
        <label className="op-field">
          Order reference or waybill
          <input name="q" defaultValue={q} />
        </label>
        <button className="button">Search</button>
      </form>
      {staff && <ReconciliationFile kind="freight" />}
      {user.role !== "viewer" && <ReconciliationFile kind="feedback" />}
      <p>
        Showing up to 50 matching simulator shipments. Narrow the search to
        locate older records.
      </p>
      {rows.map((r) => (
        <section className="card op-panel" key={String(r.id)}>
          <h2>
            <Link href={"/shipments/" + r.id}>
              {String(r.reference)} · {String(r.awb)}
            </Link>
          </h2>
          <p>
            {String(r.carrier)} · {String(r.direction)} · {String(r.status)}
          </p>
          <p>
            Supplied freight variance:{" "}
            {r.invoiced_paise == null
              ? "Not recorded"
              : formatINR(Number(r.invoiced_paise) - Number(r.quoted_paise))}
            . Feedback: {r.score == null ? "Not recorded" : `${r.score}/10`}
          </p>
          {r.invoiced_paise != null && (
            <p>
              Invoice: {String(r.invoice_ref)} · Reconciliation:{" "}
              {String(r.resolution)} · Revision {String(r.freight_revision)}.{" "}
              {String(r.resolution_note || "")}
            </p>
          )}
          {r.score != null && (
            <p>
              Feedback revision {String(r.feedback_revision)} ·{" "}
              {String(r.feedback_note || "")}
            </p>
          )}
          {staff && r.invoiced_paise != null && (
            <details>
              <summary>Track freight discrepancy</summary>
              <OperationForm
                action="freight_resolve"
                title="Discrepancy resolution"
                data={{ shipment_id: r.id, revision: r.freight_revision }}
                fields={[
                  {
                    name: "resolution",
                    label: "Resolution",
                    value: String(r.resolution),
                    options: [
                      { value: "open", label: "Open" },
                      { value: "disputed", label: "Disputed" },
                      { value: "resolved", label: "Resolved" },
                    ],
                  },
                  {
                    name: "note",
                    label: "Resolution note",
                    value: String(r.resolution_note || ""),
                  },
                ]}
              />
            </details>
          )}
          {staff && (
            <details>
              <summary>Record or amend supplied freight comparison</summary>
              <OperationForm
                key={String(r.freight_revision)}
                action="freight_save"
                title="Freight comparison"
                data={{ shipment_id: r.id, revision: r.freight_revision ?? 0 }}
                fields={[
                  {
                    name: "quoted",
                    label: "Supplied quoted amount (INR)",
                    value:
                      r.quoted_paise == null
                        ? ""
                        : (Number(r.quoted_paise) / 100).toFixed(2),
                  },
                  {
                    name: "invoiced",
                    label: "Supplied invoice amount (INR)",
                    value:
                      r.invoiced_paise == null
                        ? ""
                        : (Number(r.invoiced_paise) / 100).toFixed(2),
                  },
                  {
                    name: "invoice_ref",
                    label: "Supplied invoice reference",
                    value: String(r.invoice_ref ?? ""),
                  },
                ]}
              />
            </details>
          )}
          {user.role !== "viewer" &&
            r.direction === "forward" &&
            r.status === "delivered" && (
              <details>
                <summary>Record or amend feedback</summary>
                <OperationForm
                  key={String(r.feedback_revision)}
                  action="feedback_save"
                  title="Delivery feedback"
                  data={{
                    shipment_id: r.id,
                    revision: r.feedback_revision ?? 0,
                  }}
                  fields={[
                    {
                      name: "score",
                      label: "Recommendation score (0–10)",
                      type: "number",
                      min: 0,
                      max: 10,
                      value: String(r.score ?? ""),
                    },
                    {
                      name: "note",
                      label: "Feedback note",
                      type: "textarea",
                      required: false,
                      value: String(r.feedback_note ?? ""),
                    },
                  ]}
                />
              </details>
            )}
        </section>
      ))}
      {!rows.length && <p>No matching shipments.</p>}
    </>
  );
}
