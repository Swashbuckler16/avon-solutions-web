# Stage 7 — Final local expansion

Completed locally on 21 November 2026. SQLite stays local. No hosting, carrier connection, outbound survey or payment is enabled. The user authorized the Stage 7 commit and GitHub push on 22 November 2026.

## Working scope

- Analytics: creation-date shipment cohorts, saved estimated delivery dates for new bookings, early/on-day/late/unknown deliveries, open overdue and stale tracking, daily counts, payment and weight mix, top products/customers, and an original India regional tile map with a complete destination table. The map is schematic, not geographic boundaries. Unknown/international destinations remain in the table. Historical bookings without estimates are not assigned invented delivery promises. Estimates are simulator values, not carrier SLAs.
- Excel: real `.xlsx` workbooks with Summary, Shipments, Regions, Daily, Products, Customers and Filters sheets. Numeric cells remain numeric and user text is never emitted as formulas. CSV remains available. Saved Excel runs retain immutable JSON data snapshots; downloads build the workbook from that snapshot, not current records. Reports remain private to their owner, capped at 5,000 shipments per cohort.
- Schedules: CSV or Excel, manual or 1–720 hour intervals; rolling 7/30/90/365-day windows or fixed dates. Rolling windows are evaluated when a run occurs. Run `npm.cmd run scheduler -- --watch` to process due reports while the computer is on. Missed intervals coalesce; no email is sent.
- Freight: staff CSV/TSV/XLSX imports of supplied quote and invoice amounts. Preview rolls back the entire file, including duplicate detection across rows. Valid rows save independently; unique invoice-row keys make retries safe and changed payloads fail. Amendments require the current freight revision. Open/disputed/resolved discrepancy states require a note and reject stale updates. Changing the comparison reopens it. No payment, carrier invoice retrieval or settlement occurs.
- Feedback: customer-scoped CSV/TSV/XLSX entry for delivered forward simulator shipments, with preview, revision protection and identical-response retries. Existing single-shipment feedback remains available. No survey messages are sent.
- Branding: admin-only company display name, initials and teal/blue/violet palettes in the authenticated shell. Per-account light/dark/device theme and comfortable/compact table density persist in SQLite, including viewer preferences. Login and print documents retain their existing identity/paper presentation.
- Larger batches: order files accept 5 MB/5,000 rows, sequentially submitted in batches of 250 while retaining partial results. Existing references are never overwritten on retry. Dispatch preparation/booking supports 500 orders, tracking imports 1,000 rows; freight/feedback imports support 1,000 rows/1 MB. HTTP JSON stays bounded at 2 MB. These limits are safeguards for the local model, not a production concurrency guarantee.

## Validation status

- 45 automated tests: 44 passed, one POSIX-only permissions check skipped on Windows. Includes 5,000 imported orders, 500 booked/retried shipments, Excel read-back, report ownership/snapshot consistency, freight preview rollback/duplicates/revisions, feedback isolation and per-account settings.
- Production build and extended HTTP validation passed, including Excel download/read-back, private report snapshots, settings permissions/origin checks and freight reconciliation.
- Browser checks passed for saved Excel generation/download, freight file preview/save and disputed resolution, feedback preview/save, persistent dark/compact preferences and restoration to light/comfortable. The finance screen had no page-width overflow at a 390-pixel viewport. Visual checks caught and corrected dark table contrast and form button alignment. Synthetic QA records and screenshots remain local.
- CodeRabbit completed an initial review with two minor findings, both fixed: print theme specificity and preserving discrepancy resolution when comparison values are unchanged. A regression test covers the latter. The final CodeRabbit review completed with zero findings. Subsequent dark-table contrast polish was verified in the production build and browser.
- Ponytail: reused shipment snapshots, report filters/scheduler, existing CSV/XLSX reader, native forms, SQLite transactions and existing validation. One focused dependency added: `write-excel-file` for real XLSX output rather than a custom ZIP/XML writer. Its installed documentation/API was checked; package installation reported no vulnerabilities.

## Upgrade and reference limits

Migration 008 is additive. Restore an older backup using its matching code version, then start this version to migrate; do not replace an active database. New backup validation expects migrations 1–8. Credentials, database files, review logs and browser evidence remain outside source control.

The reference audit in `reference-audit.md` documents inspected and inaccessible eShipz features. Completion of this stage means completion of the agreed local phases, not verified exact parity with proprietary APIs, inaccessible premium dashboards, AI POD scoring, carrier-confirmed appointments or live marketplace integrations.
