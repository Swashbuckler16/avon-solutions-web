import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { exceptionCases } from "@/lib/operations";
import { reportRows } from "@/lib/reports";
import { PageHeading } from "@/components/ui";
import {
  ExceptionQueue,
  OperationForm,
} from "@/components/operations-controls";
export default async function Exceptions() {
  const user = await requireUser(),
    db = getDb(),
    staff = !user.customer_id && user.role !== "viewer",
    write = user.role !== "viewer",
    rows = exceptionCases(db, user);
  const shipments = staff
    ? reportRows(db, user, { mode: "simulator" }).filter(
        (s) => !["delivered", "rto", "cancelled"].includes(String(s.status)),
      )
    : [];
  return (
    <>
      <PageHeading
        eyebrow="EXCEPTION DESK"
        title="A clear next step for every delay."
        description="NDR tracks delivery failures; NPR tracks pickup failures. Case closure does not change shipment tracking."
      />
      <p className="notice">
        Local simulation only. Requests, contact notes and resolutions are
        stored here; no carrier receives them. Applied tracking exceptions open
        cases automatically.
      </p>
      <ExceptionQueue
        rows={rows as unknown as Parameters<typeof ExceptionQueue>[0]["rows"]}
        staff={staff}
        write={write}
      />
      {staff && shipments.length > 0 && (
        <OperationForm
          title="Open a local exception"
          action="exception_open"
          fields={[
            {
              name: "shipment_id",
              label: "Active shipment",
              options: shipments.map((s) => ({
                value: String(s.id),
                label: `${s.reference} · ${s.awb} · ${s.status}`,
              })),
            },
            {
              name: "kind",
              label: "Queue",
              options: [
                { value: "npr", label: "NPR · pickup failure" },
                { value: "ndr", label: "NDR · delivery failure" },
              ],
            },
            { name: "reason", label: "Failure reason", type: "textarea" },
          ]}
          button="Open case"
        />
      )}
    </>
  );
}
