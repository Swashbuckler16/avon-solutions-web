# Stage 4 — Local operations

Date: 20 November 2026 (Asia/Calcutta). Stage 4 implementation is authorized; hosting and real carrier/store connections remain excluded.

## Scope and explicit local behavior

- Exceptions: NDR (delivery) and NPR (pickup) queues; staff case creation; automatic case creation from applied tracking exceptions; customer action requests on own cases; staff resolution/reopening; optimistic revisions, per-case bulk results and history. Case resolution does not fabricate a carrier scan. Terminal shipments allow case closure but no new retry request. At most one unresolved case per shipment.
- Shipping rules: customer-specific, staff-managed rules ordered by numeric priority then ID; first active match wins. Conditions are destination PIN prefix, payment mode and total actual weight. Actions select carrier preference, an optional customer pickup location, and optional dimensions for all packages. Preview is read-only; applying explicitly updates only editable orders using existing validation/revisions. Service selection prefers the order's carrier when available, but still requires booking confirmation. No rules automatically dispatch parcels.
- Analytics: filtered shipment cohort by UTC creation date, simulator-only by default; distinct orders represented by those shipments, current delivery percentage, timed delivery average, carrier comparison, returns, open cases and latest proof status. Historical fixtures are explicitly selectable and may lack event timings. Denominators and NPS calculations are shown in the UI.
- Reports: formula-safe CSV downloads; per-user saved filters and manual/hourly-or-slower schedules; private immutable generated snapshots; latest 100 run records with failed/ready state. The local outbox stores the account email and generated report; no email is sent. A local CLI scheduler processes up to 50 due definitions per tick; missed intervals coalesce to one run. Archived-customer or viewer owners pause their schedules with a recorded failure. The process must be running for automatic execution; there is no hosted job or OS service installation.
- Channels: named customer-scoped local channels with enabled/disabled replay configuration; single order-template replay and advanced batch import; event keys bind to payload hashes; successful duplicate events reuse the original order; failed validation is recorded and retryable. Structurally malformed batches are rejected before writing. This is authenticated local simulation, not an external shop integration or public webhook.
- Freight: staff enter supplied quote/invoice amounts and invoice reference; report invoice-minus-quote differences. No invoice is fetched or issued and no settlement/payment occurs.
- Feedback: one revision-protected response per delivered forward simulator shipment; customers can submit their own, staff can enter supplied feedback. NPS uses 9–10 promoters and 0–6 detractors. It is a local feedback summary, not a live survey service.

## Local use

Run `npm run db:setup`, `npm run build`, then `npm run start`. New navigation: Exceptions, Analytics & reports, Shipping rules, Local integrations, Freight & feedback.

Run `npm run scheduler` once or `npm run scheduler -- --watch` for minute-by-minute due report processing. The authenticated UI can process the current user's due schedules without starting the watcher. Report filters are fixed saved date bounds, not rolling periods. Set interval to zero to pause.

Batch channel replay accepts an array of `{event_key, order}`. `order` uses the same validated schema as order entry: reference, customer_id, warehouse_id, recipient {name,phone,address,city,state,pincode}, items [{name,sku,hsn,quantity,price}], packages [{weight,length,width,height}], payment_mode, invoice_number, invoice_date, carrier and notes. Weights/dimensions/prices are decimal strings. The single-event UI copies these fields from a visible existing order and asks for a new reference. Corrected event payloads require a new event key; replay is create-only, never an overwrite of fulfilled orders.

## Validation status

- 31 automated tests pass, including nested transaction rollback, exception ownership/bulk revisions, automatic case creation, rule priority/preview, channel duplicates/failures, freight/NPS reconciliation, private reports and schedule idempotency/owner invalidation.
- Production build and HTTP checks pass, including all existing stages and the new scoped pages/actions/downloads.
- Browser validation passed: saved/generated/paused a report, replayed a channel order twice with duplicate recovery, previewed/applied a shipping rule and verified DTDC preselection, opened an NPR case via tracking replay, saved action/follow-up history, retained per-case action results after refresh, and selected a customer report filter. Analytics layouts checked at 390 px and 1440 px. Freight/feedback writes and private download bytes were validated by HTTP and automated tests; the browser download dialog was not exercised.
- Browser validation found and fixed SQLite history rows needing conversion to plain objects for the client component. HTTP regression now checks the rendered error boundary as well as response codes. Bulk action results also remain visible after revision refresh.
- Authenticated CodeRabbit review of the initial Stage 4 implementation completed with 0 issues. The final review including reference-inspired additions raised 1 minor issue: repeated `q` parameters could break the insights page. It was fixed by normalizing the parameter and adding an HTTP regression check. The one-line bulk-feedback key fix and final search normalization were locally validated after the review snapshot; no zero-issue re-review is claimed. Interrupted review sessions were restarted rather than reported as completed.
- The production build, TypeScript, 31 automated tests, extended HTTP checks and `npm run scheduler` smoke check passed. No background scheduler was left running.

The manager's supplied HTML was inspected as source only; see [manager-reference-notes.md](manager-reference-notes.md). Its client-report focus informed the customer filter, and its NDR reattempt date informed optional exception follow-up dates. These remain scoped local workflows with real server-side authentication. No demo credentials or HTML assets were imported.

Ponytail applied throughout: reuse existing authentication, validation, order imports, SQLite and native forms; nested savepoints keep channel writes and rule updates atomic. No queue framework, extra database, carrier SDK, email provider or external webhook service was added.

## Small-scale limits

Reports reject cohorts above 5,000 shipments rather than silently truncate. Exception selection covers the first 100 filtered rows. Rule application and single-event templates show the newest 100 candidate orders; channel results show the latest 50 events; freight/feedback lists show 50 search matches. Case history is retained. Advanced reconciliation, public integrations, AI POD scoring, automated settlement and broader Stage 5 accessibility/load validation remain outside this release.

Local credentials, databases, generated CSV contents and browser screenshots are ignored by Git.
