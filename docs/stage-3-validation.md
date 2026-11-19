# Stage 3 local shipping release

Date: 20 November 2026 (Asia/Calcutta). Stage 3 local implementation, validation, commit and push are authorized. The user explicitly excluded external carrier connections and chose Blue Dart as the first future integration. No hosting or Stage 4 work is included.

## Delivered scope

Shipment and return worklists; order-to-service selection; fictional serviceability/rates; expiring persisted quotes; booking snapshots; durable attempt keys; simulated success/failure/lost-response recovery; cancellation before pickup; printable original test labels and invoice summaries; normalized tracking replay/timelines; full reverse shipments; staff return QA; private PNG/JPEG POD upload and manual review.

Every operational route checks authentication and customer ownership. Viewers cannot mutate data. Only Avon staff can replay tracking, review POD or accept/reject return quality. Customers can book and cancel eligible own shipments, request full returns and upload own delivery proof after delivery.

## Checks

- 24 automated tests passed, including prior stages and new booking/retry, expiry/staleness, customer isolation, cancellation/rebooking, dashboard reconciliation, tracking deduplication/out-of-order/terminal behavior, full returns/QA, POD validation/review, exact weight boundaries and normalized date/sort regressions.
- Production build and TypeScript checks passed.
- Production HTTP tests passed for all staff roles and isolated customer sessions, including shipping creation/recovery, private documents/POD, forbidden tracking/review actions, repeated events, reverse delivery and QA.
- Browser walkthrough passed for Blue Dart simulated service selection, lost-response recovery, delivery replay, test-label display, reversed return addresses, return booking, receipt and staff QA. The accepted review persisted across server restart and a fresh sign-in. Desktop (1440 px) and mobile (390 px) return layouts were visually checked. POD upload/review was exercised by HTTP and unit tests, not the browser file chooser. Actual printer/PDF output was not exercised.

## Reviews

Ponytail applied: one existing app/database, explicit prepared SQL and transactions, shared validation/authorization, native forms and printing, and the existing Sharp decoder declared directly to sanitize proof images. No speculative service layer, queue, carrier SDK or public webhook was installed.

Initial authenticated CodeRabbit CLI review raised four minor issues: stale booking-result feedback, historical shipment sorting, date-bound normalization and floating-point weight rounding. All four were fixed; regression checks cover the backend edge cases. The completed follow-up CLI review raised one minor issue in the sort regression test: it did not distinguish all alternative orderings. The test now asserts the complete order of four deliberately shuffled records and passes. No application-code issues were raised in the follow-up. This final test-only adjustment was validated locally, not re-submitted for a third review. No manual review is represented as CodeRabbit evidence.

## Limits

- Everything involving a carrier is simulated. No Blue Dart authentication, real rates, AWB, label, pickup, tracking or POD API is connected or verified.
- The simulator serviceability/rate rules are invented test rules. Historical Stage 1 fixtures remain read-only shipping snapshots and cannot be used as operational bookings.
- Documents are printable HTML with browser Print/Save as PDF. Labels are visibly invalid for handover. Invoice summaries reproduce customer-supplied information and are not Avon tax invoices.
- Returns are full-shipment only, one non-cancelled return per delivered forward shipment. They return to the original pickup snapshot; the linked customer's pickup record must still be active for quoting. No refund, partial-return allocation or credit note is created.
- Proof uploads accept PNG/JPEG up to 1 MB and 16 megapixels, sanitized to PNG up to 2 MB, at most ten distinct versions per shipment. Documents stay in the private local database.
- Tracking replay uses unique event IDs and ISO timestamps; received/occurred times are retained. Replay is staff-only, not a live provider webhook.
- Live integration requires the documented provider contract and a network-safe intent/reconciliation flow described in [carrier-integration-contract.md](carrier-integration-contract.md). Adding API keys alone does not verify carrier behavior.

No credentials, real customer data, local database, proof files or session tokens are intended for source control. Full-scale performance, release hardening and broader accessibility remain Stage 5 checks.
