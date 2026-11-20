"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { operation, Field } from "./operations-forms";
import {
  formatINR,
  simulationNotice,
  trackingStatuses,
} from "@/lib/shipping-format";
import type { Shipment, BookingResult, quoteShipment } from "@/lib/shipping";
type QuoteResult = ReturnType<typeof quoteShipment>;
export function BookingPanel({
  orderId,
  parentId,
}: {
  orderId: string;
  parentId?: string;
}) {
  const router = useRouter(),
    [result, setResult] = useState<QuoteResult | null>(null),
    [selected, setSelected] = useState(""),
    [scenario, setScenario] = useState("success"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [attempt, setAttempt] = useState<{
      quote_id: string;
      request_key: string;
      scenario: string;
    } | null>(null),
    [booking, setBooking] = useState<BookingResult | null>(null);
  const lock = useRef(false);
  async function fetchQuotes() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    setBooking(null);
    setAttempt(null);
    setResult(null);
    setSelected("");
    try {
      const response = await operation<QuoteResult>("shipping_quote", {
        order_id: orderId,
        parent_id: parentId,
      });
      setResult(response);
      setSelected(
        response.quotes.find(
          (q) => q.available && q.carrier === response.snapshot.order.carrier,
        )?.id ||
          response.quotes.find((q) => q.available)?.id ||
          "",
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function book() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    setBooking(null);
    const request = attempt || {
      quote_id: selected,
      request_key: crypto.randomUUID(),
      scenario,
    };
    setAttempt(request);
    try {
      const response = await operation<BookingResult>("shipping_book", request);
      setBooking(response);
      setMessage(response.message);
      if (response.id) {
        router.push("/shipments/" + response.id);
        router.refresh();
      }
    } catch (error) {
      setMessage(
        (error as Error).message +
          " If the response was lost, retry this same request before fetching new rates.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <section className="card op-panel">
      <p className="notice">{simulationNotice}</p>
      <h2>{parentId ? "Book a full return" : "Choose a delivery service"}</h2>
      <p>
        All packages travel together. Prices below are fictional test rates, not
        quotations from the named carriers.
      </p>
      <button
        type="button"
        className="button button-secondary"
        disabled={busy || !!attempt}
        onClick={fetchQuotes}
      >
        Fetch simulated services
      </button>
      {result && (
        <>
          <div className="shipping-addresses">
            <div>
              <h3>Pickup</h3>
              <address>
                {result.snapshot.pickup.name}
                <br />
                {result.snapshot.pickup.address}
                <br />
                {result.snapshot.pickup.city} {result.snapshot.pickup.pincode}
              </address>
            </div>
            <div>
              <h3>Deliver to</h3>
              <address>
                {result.snapshot.recipient.name}
                <br />
                {result.snapshot.recipient.address}
                <br />
                {result.snapshot.recipient.city}{" "}
                {result.snapshot.recipient.pincode}
              </address>
            </div>
          </div>
          <fieldset disabled={busy || !!attempt} className="service-options">
            <legend>Service selection · quotes expire after 15 minutes</legend>
            {result.quotes.map((q) => (
              <label
                key={q.carrier + q.service}
                className={
                  "service-option " + (selected === q.id ? "selected" : "")
                }
              >
                <input
                  type="radio"
                  name="service"
                  value={q.id || ""}
                  disabled={!q.available}
                  checked={selected === q.id}
                  onChange={() => setSelected(q.id || "")}
                />
                <span>
                  <strong>
                    {q.carrier} · {q.service}
                  </strong>
                  <small>
                    {q.available
                      ? `${q.chargeable_kg} kg chargeable · ${q.eta_days} simulated days`
                      : q.reason}
                  </small>
                </span>
                <strong>
                  {q.available ? formatINR(q.price_paise) : "Unavailable"}
                </strong>
              </label>
            ))}
          </fieldset>
          <label className="op-field">
            Test booking behavior
            <select
              disabled={busy || !!attempt}
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
            >
              <option value="success">Successful booking</option>
              <option value="fail_once">
                Fail once, then succeed on retry
              </option>
              <option value="timeout_after_booking">
                Lose response after booking; recover on retry
              </option>
            </select>
          </label>
          <p className="field-help">
            Blue Dart is the planned first real integration. No carrier
            credentials are used here.
          </p>
          {!!selected && (
            <button className="button" disabled={busy} onClick={book}>
              {busy
                ? "Processing…"
                : attempt
                  ? "Retry same booking safely"
                  : "Confirm simulated booking"}
            </button>
          )}
          {attempt && (
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={async () => {
                if (lock.current) return;
                lock.current = true;
                setBusy(true);
                setBooking(null);
                setMessage("");
                try {
                  const response = await operation<BookingResult>(
                    "shipping_reconcile",
                    attempt,
                  );
                  setBooking(response);
                  setMessage(response.message);
                  if (response.id) {
                    router.push("/shipments/" + response.id);
                    router.refresh();
                  }
                } catch (error) {
                  setMessage((error as Error).message);
                } finally {
                  setBusy(false);
                  lock.current = false;
                }
              }}
            >
              Check booking result
            </button>
          )}
          {attempt && booking?.state === "retryable" && (
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={() => {
                setAttempt(null);
                setBooking(null);
                setResult(null);
                setMessage("No shipment was created. Fetch services again.");
              }}
            >
              Abandon failed attempt
            </button>
          )}
        </>
      )}
      <p role="status" className="op-message">
        {message}
      </p>
    </section>
  );
}
export function ShipmentCancel({ shipment }: { shipment: Shipment }) {
  const router = useRouter(),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      className="card op-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const response = await operation<{ message: string }>(
            "shipping_cancel",
            { id: shipment.id, revision: shipment.revision, note },
          );
          setMessage(response.message);
          router.refresh();
        } catch (error) {
          setMessage((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Cancel before pickup</h2>
      <Field
        label="Cancellation reason"
        value={note}
        onChange={setNote}
        maxLength={250}
      />
      <label className="check-label">
        <input type="checkbox" required />
        Confirm cancellation of this simulated shipment
      </label>
      <button className="button button-secondary" disabled={busy}>
        Cancel shipment
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
export function TrackingReplay({ shipment }: { shipment: Shipment }) {
  const router = useRouter(),
    [status, setStatus] = useState("in_transit"),
    [key, setKey] = useState(""),
    [location, setLocation] = useState(""),
    [note, setNote] = useState(""),
    [time, setTime] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      className="card op-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const eventTime = time || new Date().toISOString();
          setTime(eventTime);
          const response = await operation<{ message: string }>(
            "tracking_replay",
            {
              id: shipment.id,
              event_key: key,
              status,
              location,
              note,
              occurred_at: eventTime,
            },
          );
          setMessage(response.message);
          router.refresh();
        } catch (error) {
          setMessage((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Replay a simulator event</h2>
      <p>
        Staff-only local test tool. Event IDs prevent duplicates; late events
        remain in the timeline without moving the shipment backwards.
      </p>
      <Field
        label="Unique event ID"
        value={key}
        onChange={setKey}
        maxLength={80}
      />
      <label className="op-field">
        Tracking status
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {trackingStatuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <Field
        label="Event time (ISO 8601; blank = now)"
        value={time}
        onChange={setTime}
        required={false}
      />
      <Field
        label="Location"
        value={location}
        onChange={setLocation}
        required={false}
      />
      <Field
        label="Tracking note"
        value={note}
        onChange={setNote}
        required={false}
      />
      <button className="button" disabled={busy}>
        Replay event
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
export function ReviewForm({
  id,
  revision,
  kind,
}: {
  id: string;
  revision: number;
  kind: "return" | "pod";
}) {
  const router = useRouter(),
    [decision, setDecision] = useState(
      kind === "pod" ? "verified" : "accepted",
    ),
    [note, setNote] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="review-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await operation(kind === "pod" ? "pod_review" : "return_qa", {
            id,
            revision,
            decision,
            note,
          });
          setMessage("Review saved.");
          router.refresh();
        } catch (error) {
          setMessage((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="op-field">
        {kind === "pod" ? "POD decision" : "Return quality decision"}
        <select value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value={kind === "pod" ? "verified" : "accepted"}>
            {kind === "pod" ? "Verified" : "Accepted"}
          </option>
          <option value="rejected">Rejected</option>
        </select>
      </label>
      <Field
        label="Review note"
        value={note}
        onChange={setNote}
        maxLength={500}
      />
      <button className="button" disabled={busy}>
        Save review
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
export function ProofUpload({ shipmentId }: { shipmentId: string }) {
  const router = useRouter(),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return;
        setBusy(true);
        try {
          if (file.size > 1_000_000)
            throw new Error("Choose an image of at most 1 MB.");
          const content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.onerror = () => reject(new Error("Unable to read file."));
            reader.readAsDataURL(file);
          });
          const result = await operation<{ message: string }>("pod_upload", {
            id: shipmentId,
            filename: file.name,
            content,
          });
          setMessage(result.message);
          router.refresh();
        } catch (error) {
          setMessage((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Upload delivery proof</h3>
      <label className="op-field">
        PNG or JPEG · max 1 MB
        <input
          type="file"
          required
          accept="image/png,image/jpeg"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </label>
      <p className="field-help">
        Images are decoded, sanitized and stored privately. Uploading a proof
        does not verify it.
      </p>
      <button className="button button-secondary" disabled={busy || !file}>
        Upload proof
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
export function PrintDocument() {
  return (
    <button
      type="button"
      className="button no-print"
      onClick={() => window.print()}
    >
      Print / save as PDF
    </button>
  );
}
