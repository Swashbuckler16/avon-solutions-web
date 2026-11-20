import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { customers } from "@/lib/orders";
import { channels, channelTemplates } from "@/lib/operations";
import { PageHeading } from "@/components/ui";
import {
  OperationForm,
  type FormField,
} from "@/components/operations-controls";
export default async function Integrations() {
  const user = await requireUser(),
    db = getDb(),
    staff = !user.customer_id && user.role === "admin",
    cs = customers(db, user).filter((c) => c.active),
    list = channels(db, user);
  const fields = (c?: (typeof list)[number]): FormField[] => [
    {
      name: "name",
      label: "Local channel name",
      value: c ? String(c.name) : "",
    },
    {
      name: "customer_id",
      label: "Customer",
      value: c ? String(c.customer_id) : undefined,
      options: cs.map((x) => ({ value: x.id, label: x.name })),
    },
    {
      name: "active",
      label: "Channel enabled",
      value: c ? String(c.active) : "1",
      options: [
        { value: "1", label: "Enabled" },
        { value: "0", label: "Disabled" },
      ],
    },
    {
      name: "callbacks",
      label: "Authenticated local event replay",
      value: c ? String(c.callbacks) : "1",
      options: [
        { value: "1", label: "Enabled" },
        { value: "0", label: "Disabled" },
      ],
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="LOCAL INTEGRATIONS"
        title="Test the flow before connecting."
        description="Channel replay creates orders from a selected local template. Use a stable event key to safely retry; changed content needs a new key."
      >
        <Link className="button" href="/orders/import">
          Import CSV / spreadsheet
        </Link>
      </PageHeading>
      <p className="notice">
        Blue Dart and external stores are disconnected. Public webhooks,
        automatic external sync and secret storage are unavailable until
        documented providers are authorized. This authenticated replay tests the
        local boundary only.
      </p>
      {staff && cs.length > 0 && (
        <OperationForm
          action="channel_save"
          title="Create local channel"
          fields={fields()}
        />
      )}{" "}
      {list.map((c) => {
        const choices = channelTemplates(db, user, String(c.customer_id));
        return (
          <section className="card op-panel" key={String(c.id)}>
            <h2>
              {String(c.name)} · {String(c.customer)}
            </h2>
            <p>
              {c.active ? "Enabled" : "Disabled"} · Local callback replay{" "}
              {c.callbacks ? "enabled" : "disabled"}
            </p>
            {staff && (
              <details>
                <summary>Edit channel configuration</summary>
                <OperationForm
                  key={String(c.revision)}
                  action="channel_save"
                  title="Channel settings"
                  data={{ id: c.id, revision: c.revision }}
                  fields={fields(c)}
                />
              </details>
            )}
            {user.role !== "viewer" && choices.length > 0 && (
              <OperationForm
                action="channel_replay"
                title="Replay one local order event"
                data={{ channel_id: c.id }}
                fields={[
                  {
                    name: "source_id",
                    label: "Use order details as template",
                    options: choices.map((o) => ({
                      value: String(o.id),
                      label: String(o.reference),
                    })),
                  },
                  { name: "reference", label: "New order reference" },
                  { name: "event_key", label: "Unique channel event key" },
                ]}
                button="Replay local event"
              />
            )}
            <details>
              <summary>Advanced batch replay (1–100 events)</summary>
              <p>
                For local integration testing, submit a JSON array of{" "}
                <code>
                  {
                    '{"event_key":"unique-key","order":{...complete order fields...}}'
                  }
                </code>
                . The order schema is documented in docs/stage-4-validation.md.
                Existing CSV import remains the normal file-entry workflow.
              </p>
              {user.role !== "viewer" && (
                <OperationForm
                  action="channel_sync"
                  title="Batch event payload"
                  data={{ channel_id: c.id }}
                  fields={[
                    {
                      name: "events",
                      label: "Local order events JSON",
                      type: "json",
                      value: "[]",
                    },
                  ]}
                  button="Replay batch"
                />
              )}
            </details>
            <h3>Latest 50 event results</h3>
            {c.events.map((e) => (
              <p key={String(e.event_key)}>
                {String(e.event_key)} · {String(e.status)} · {String(e.message)}{" "}
                {e.order_id && (
                  <Link href={"/orders/" + e.order_id}>Open order</Link>
                )}
              </p>
            ))}
          </section>
        );
      })}
    </>
  );
}
