# Carrier boundary and future Blue Dart integration

The user selected Blue Dart first, then explicitly requested **no external connection** because API documentation/access is not yet available. Stage 3 is therefore a local simulator release. There are no Blue Dart endpoints, credentials or network calls in the application. Carrier names on test services are labels, not verified products or rate cards.

## Implemented boundaries

- `lib/carrier-simulator.ts`: deterministic fictional serviceability/rate calculation. The artificial PIN `999999` and chargeable weights above 100 kg return unavailable services.
- `lib/shipping.ts`: authenticated order ownership, quote expiry/revision checks, booking-attempt journal, atomic local booking, snapshots, cancellation, tracking ingestion, returns and proof review.
- `shipping_quotes`: selected service, integer-paise price, expiry, order and warehouse revisions, and a complete dispatch snapshot.
- `booking_attempts`: unique `(user_id, request_key)`, quote and scenario binding, outcome, attempt count and shipment link. A lost response can be reconciled without creating a second shipment. A database unique index permits at most one non-cancelled forward shipment per order and one non-cancelled full return per parent.
- `tracking_events`: per-shipment provider event key, normalized status, occurrence/receipt timestamps, normalized raw payload and whether the event was applied. Duplicate keys with different content are rejected; late/regressive events remain visible without rolling state backwards. Terminal states are protected.
- `delivery_proofs`: private sanitized images with content hashes and versioned staff review. No public file path or object URL is exposed.

Snapshot data includes the sender, recipient, products, packages, customer-supplied invoice reference/date, payment mode and declared amount. Future carrier code should consume this snapshot rather than reread mutable customer addresses.

## Contract to implement when access is supplied

Keep provider-specific request/response mapping outside the UI and domain authorization. Implement these operations using the provider's actual documented capabilities:

| Operation | Input | Normalized result |
| --- | --- | --- |
| Serviceability/rate | Pickup/destination, parcels, payment, declared value | Supported services, price provenance, chargeable weight and expiry; explicit unsupported capability |
| Booking | Frozen snapshot, selected service, stable request reference | Provider booking ID, actual AWB, service, document references, accepted/rejected/unknown outcome |
| Reconciliation | Stable client reference or provider ID | Existing booking, confirmed absent, or still unknown |
| Cancellation | Provider reference and reason | Confirmed cancellation, rejected/unsupported, or unresolved |
| Tracking | Provider reference plus poll response or authenticated callback | Stable event ID, raw provider status, normalized state, occurrence time, location and notes |
| Documents/POD | Provider booking reference | Authenticated download bytes and validated MIME type; no public credential-bearing URLs |

The current simulator performs no network I/O inside its SQLite transaction. A real adapter **must not** simply add an awaited HTTP call inside that transaction. Persist the outbound intent first, release the write lock, call the provider with bounded timeouts, then finalize the confirmed outcome in a new transaction. Retain unknown outcomes and reconcile by the same reference before attempting a new booking. Never assume Blue Dart supports idempotency headers, refund semantics, rate endpoints or cancellation at every stage without its documentation.

Before connecting Blue Dart, obtain the official onboarding/API specification, sandbox approval, authentication requirements, customer/product codes, service entitlements, documented request examples, cancellation rules, tracking signatures or polling rules, document support and rate-source agreement. Use ignored environment configuration or a secret store; never customer-entered arbitrary URLs or committed credentials. Verify the adapter with contract fixtures and sandbox evidence before enabling real mode. Provider authentication, a webhook endpoint and scheduled polling are intentionally not scaffolded with guessed protocols.

## Simulator-specific rules

Two fictional services per named carrier; prices use invented per-weight arithmetic. Quotes last 15 minutes. Booking scenarios cover success, one failure before acceptance, and a lost response after acceptance. Simulated AWBs begin with `SIM-`; generated documents prominently prohibit carrier handover. Cancellation is supported only before pickup. Returns cover the whole delivered forward shipment, with prepaid reverse movement to the original pickup snapshot; no refund or credit note is generated. Return QA is staff-only after reverse delivery.

Tracking replay is a staff-authenticated local command through `/api/operations`, not a public webhook and not evidence of a carrier callback integration. No tunnel, external email, booking or charge is used.

## Research provenance

The existing [reference audit](reference-audit.md) records inspected eShipz workflow entry points and unverified final operations. Blue Dart's [business integration page](https://www.bluedart.com/business-integrations) describes its shipping/tracking/POD offerings, and its [ShippingAPI overview](https://www.bluedart.com/documents/20182/0/EcomPdf.pdf/8e1af2b5-b8ea-2b4c-3e64-04e1f936b36a) mentions sandbox onboarding. The [official DHL Blue Dart tracking documentation entry](https://developer.dhl.com/api-reference/shipment-tracking-dhl-ecommerce-india-blue-dart) was discoverable, but opening it returned “Request Rejected” on 19 November 2026. No protocol implementation was inferred from unofficial examples.
