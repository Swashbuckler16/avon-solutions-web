# Stage 2 — Customer order preparation

Validated 19 November 2026 (Asia/Calcutta). Stage 2 implementation and GitHub delivery are authorized. Hosting and Stage 3 are excluded.

## Business model and scope

Avon coordinates shipping between customers (shops and other senders) and delivery companies. Customers prepare orders and select a preferred carrier. Blue Dart, DTDC and Delhivery are currently preference labels only: no serviceability check, rate, booking, AWB, label or live tracking is represented as working. Those belong to Stage 3 and require separately authorized provider access.

An Avon administrator creates customer records and customer logins. Customer users have the operator permission set plus an immutable customer scope loaded from their authenticated database account. Every order/warehouse read and mutation checks that scope. Staff work across customers; viewers cannot mutate records. Archiving a customer blocks login and invalidates existing sessions. Self-service signup and password reset are not part of this local stage.

## Delivered workflows

- Customer creation/edit/archive, admin-provisioned random login credentials shown once, customer-specific business view.
- Pickup address creation/edit/archive, customer ownership, revision checks and prevention of reassignment once referenced by orders.
- Persistent create/detail/edit/clone/cancel/hold/ready order flows; immutable creation sequence and per-order audit events. Shipped/booked or cancelled orders cannot be edited or cancelled through preparation actions.
- Recipient details, multiple items with SKU/HSN, integer-paise totals, invoice reference/date, multiple packages with explicit kg/cm units, and carrier preference.
- Search, status/customer/warehouse/payment/date filters, sorting, pagination, column controls, page-scoped selection, confirmed bulk actions and per-order results.
- CSV/TSV/XLSX first-sheet imports, reusable per-user column mappings, preview, per-row validation, duplicate checks, valid-row import and downloadable results.
- Filtered CSV export with formula escaping; dashboard, export, settings and directories restricted to the signed-in customer.

## Explicit small-scale rules

- India addresses and INR. Unit prices are final amounts inclusive of any tax. Invoice numbers/dates are stored; this stage does not issue a tax invoice.
- Order references are unique across the local platform, case-insensitively for new operational writes. Duplicate imports never overwrite records.
- Import ceiling: 1 MB, 500 orders, 40 columns; one row is one order with one item/package. Add further lines/packages in the editor. Mutation JSON is capped at 2 MB, bulk actions at 100 selected IDs, and export at 10,000 filtered orders.
- Date filters use stored UTC creation dates; invoice defaults use the Indian business date. Editing never changes creation sequence. Migrated records receive their existing SQLite insertion sequence.
- Archiving preserves history. Hard deletion, split and merge are excluded until rules are agreed. Clone creates a new independent order without transferring shipment state or quantities from the source.
- Existing Stage 1 fixtures retain their sample identity and may lack full dispatch details. Customer accounts cannot access those unassigned fixtures.
- Item/package/invoice data is stored as validated JSON on the order; customer, warehouse, user and event relationships remain relational. This keeps one small local application without extra services or an ORM.

## Verification

Runtime: Node.js 26.13.0; dependency versions are pinned by package-lock.json.

| Check | Result |
| --- | --- |
| Automated tests | 15 passed: foundation, ownership, totals, revisions, transitions, imports, sorting, dates and parser fixtures |
| Production build and typecheck | Passed after all four review fixes |
| Production HTTP integration | Passed: staff roles, customer provisioning/login, isolation across all read surfaces, forged ownership, stale updates, partial bulk errors and archived-session invalidation; passed after fixes |
| Desktop browser | Customer/pickup creation, order create/edit/clone/cancel, CSV mapping/preview/valid-row import and mapping persistence passed |
| Mobile browser | 390 × 844 worklist and create form fit the viewport; multi-item/package controls and mixed-result bulk actions passed |

The XLSX reader was checked using a minimal original synthetic workbook fixture. CSV and TSV parsing tests cover quoted commas, escaped quotes, BOM and text cells. Browser import verification used synthetic CSV; XLSX parsing is automated evidence, not a claimed browser walkthrough. HTTP tests use an isolated temporary database/server. Local browser QA records are synthetic and excluded from Git with the local database.

## Required reviews

Ponytail applied: reuse the Next.js/SQLite foundation and native forms, keep authorization in server operations, use prepared SQL and transactions, and add only maintained CSV/XLSX readers rather than writing parsers.

CodeRabbit CLI 0.9.3 completed an authenticated review of 34 changed files. It raised 4 issues (1 major, 3 minor):

1. Major: a pending account-provisioning result could appear under a newly selected customer. Fixed by disabling record selection/new-record controls while an operation is pending.
2. Minor: invoice defaults used UTC rather than the Indian calendar date. Fixed with an Asia/Kolkata date helper and midnight-boundary regression checks.
3. Minor: same-day orders sorted by random UUID. Fixed with persisted immutable creation sequences and sorting regression checks.
4. Minor: creating an archived warehouse ignored the inactive flag. Fixed the insert and added a regression check preventing its use for pickup.

All four issues were addressed. A second authenticated CodeRabbit review completed with 0 issues across 37 text files; the original synthetic XLSX binary fixture was excluded from remote review and validated by the parser test. The CLI uses the free allowance because the repository is not attached to an accessible CodeRabbit organization.

## Remaining stages

Carrier rates/booking/tracking, returns/POD, exception workflows, advanced reports and the full performance/accessibility release audit remain in Stages 3–5. No public hosting, external carrier call or real booking was performed.
