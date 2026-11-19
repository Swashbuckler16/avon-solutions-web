# Five-stage local development roadmap

Status: Stage 1 foundation implemented; validation and review status are recorded in stage-1-validation.md. Stage 2 is complete and validated; see stage-2-validation.md. Stage 3 has not started. No hosting, public deployment, domain setup or cloud publishing is included in any stage. This roadmap supersedes the phase sequence in build-plan.md.

## Target

By the end of Stage 5, deliver a locally runnable Avon shipping application with persistent data, authentication, operational workflows, reporting, and tested end-to-end behavior at small scale. Preserve useful reference layout patterns and improve clarity, bulk workflows, feedback, error recovery and accessibility.

Small scale means one Avon organization with isolated customer accounts, staff roles, a limited number of carrier integrations, and a modest test dataset. It does not mean nonfunctional buttons or hardcoded dashboard results. Set a concrete dataset and performance budget in Stage 1.

Carrier-generated bookings, real AWBs, rates, tracking and POD require authorized carrier services. Develop and test a clearly labeled simulator alongside integrations. Live or sandbox carrier parity is conditional on credentials and documented provider capabilities; a simulator is not evidence of a working live integration. External systems are not hosting for our application. Do not make real bookings without specific user authorization.

## Stage 1 — Product definition, design and foundation

- Turn the reference audit into a feature/acceptance matrix; resolve inaccessible reference behavior through explicit independent product specifications.
- Define the small-scale scope, roles, order/shipment/return states, carrier requirements and data model.
- Establish original Avon design tokens and reusable layouts: sidebar, header, tables, filters, forms, dialogs and notifications.
- Set up the local application, local database, migrations, authentication, authorization and synthetic sample data.
- Establish testing and the CodeRabbit/Ponytail workflow. Choose the smallest suitable stack and dependencies; no microservices or mandatory separate queue infrastructure without need.

Exit: the app runs locally; users can log in with defined roles; the shell and database work; the feature matrix and design are ready for implementation.

## Stage 2 — Orders, warehouses and bulk data workflows

- Build warehouse/address management, customer data, items, package dimensions and SKU/HSN mapping.
- Implement persistent order creation/detail/edit/clone/cancel flows, items, invoices and packages with validation and audit records.
- Implement status worklists, date/filter/search behavior, pagination, sorting, column controls and bulk selection with clear selection scope.
- Add spreadsheet/CSV import, reusable field mapping, preview, per-row errors, duplicate handling and export.
- Define split/merge behavior and implement only the agreed rules.

Exit: an operator can import or create orders, correct invalid records, manage warehouses, find orders, and reload without losing data. Bulk failures are explainable and recoverable.

## Stage 3 — Shipping, tracking, returns and delivery proof

- Implement the shipment workflow: orders, addresses, packages, serviceability/rates, service selection, booking result, labels and invoices.
- Connect one priority carrier sandbox when access is supplied; implement the simulator for repeatable local testing. Add more providers only within the agreed scope.
- Handle retries and duplicate prevention, tracking event ingestion and normalization, shipment details/timeline, and supported cancellation.
- Implement reverse shipments/returns, return quality state, and manual POD upload/view/review.
- Provide a local event-replay mechanism for tracking and callback tests; no public tunnel is required by this plan.

Exit: order-to-delivery and return scenarios work end to end locally; booking failures and duplicate callbacks do not corrupt state. Document separately which carrier operations have been verified against a real sandbox.

## Stage 4 — Exceptions, automation, analytics and reports

- Implement NDR/NPR queues, action requests, reasons, histories and bulk updates.
- Implement a small, deterministic shipping-rule system for the agreed packaging, warehouse and carrier allocation requirements, with visible rule priorities.
- Build dashboards from persisted records: shipment/order totals, delivery performance, carrier/status comparisons, returns, exceptions and POD.
- Add filtered report downloads, saved report definitions, local scheduling and report history. Use a local email outbox during testing; external delivery requires a configured provider.
- Add basic channel import/sync and webhook configuration within the defined integration scope. Expose unavailable provider capabilities clearly.
- Define small-scale finance/NPS equivalents: freight comparison against supplied rate/invoice data and stored feedback summaries. Advanced AI POD scoring, production settlement and embedded BI remain explicitly separate from basic workflow parity unless added to scope.

Exit: summaries reconcile with source records; exception actions and rules behave predictably; reports export accurate data; scheduled work and simulated integration failures are observable.

## Stage 5 — Complete integration, usability polish and local release

- Close the agreed feature matrix and remove broken controls or unexplained placeholder screens.
- Verify realistic journeys covering login, roles, imports, orders, shipping, tracking, exceptions, returns, POD and reports.
- Fix defects and improve keyboard navigation, responsive layouts, readable tables, empty/error/loading states and long-running operation feedback.
- Test permission enforcement, import boundaries, duplicate booking prevention, callback replay, backups/restores and performance against Stage 1's small-scale dataset.
- Run CodeRabbit reviews and Ponytail simplification passes; resolve material issues and disclose any remaining limitations.
- Provide local startup instructions, environment template without secrets, migrations, seed data, tests, backup/restore instructions and a local release checklist.

Exit: a reproducible working local model with persistent data and verified core workflows, plus a transparent list of simulator versus real-provider capabilities. No website is hosted or publicly published.

## Required skills and readiness

- Ponytail: available; mandatory for development and simplicity reviews.
- CodeRabbit: skill available, CLI version 0.9.3 verified; authentication verified on 19 November 2026; authenticated CLI review is part of the Stage 1 validation.
- UI/UX Pro Max and existing UI styling/accessibility skills: available for design and usability work. Its optional Python search helper was unavailable in the earlier audit; do not make it a prerequisite for development.
- Computer Use/browser tools: available for reference walkthroughs and local browser verification.
- Git and terminal tooling: available. Next.js, React, TypeScript and built-in Node SQLite are configured and tested locally.

No new plugin installation is currently necessary. See stage-1-validation.md for actual review results. CodeRabbit login requires the user's own browser sign-in; never store OAuth tokens or credentials in this repository.
