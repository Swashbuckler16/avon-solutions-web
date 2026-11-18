# Stage 1 specification and acceptance matrix

## Product scope

One Avon organization, three roles, three fictional warehouses and 48 fictional orders with related shipment snapshots. This is a working local foundation, not a live carrier product. No production customer data, reference-site assets or credentials are reused. Unavailable reference functionality is independently specified below rather than claimed as inspected parity.

Small-scale target for later-stage acceptance: 5 concurrent local users, 10,000 orders, 20,000 shipments and 100,000 tracking events. Warm list queries should complete within 500 ms and typical local navigation within 2 seconds on this development computer. Stage 1 tests the 48-order fixture; the larger-volume target is a Stage 5 benchmark, not an achieved claim.

## Architecture decision

One Next.js App Router application, React, TypeScript, plain CSS with semantic tokens, Lucide icons and self-hosted open-source fonts. Use Node's SQLite and cryptographic primitives for the local database and opaque sessions. No separate API service, ORM, message broker, cloud account or microservice is necessary for Stage 1. This refines the earlier candidate stack: PostgreSQL, Tailwind, chart/table packages and a queue are not prerequisites. Reconsider them only for demonstrated requirements.

SQLite migrations run under a write transaction and are versioned. Seed setup is explicit and idempotent. The runtime does not generate default accounts or overwrite data. Prepared statements and database constraints enforce basic integrity. The database and onboarding credentials live in ignored `.local/` state. `npm ci` uses the lockfile.

Authentication uses salted scrypt hashes, randomly generated initial passwords, opaque 256-bit session tokens stored only as SHA-256 hashes, HTTP-only SameSite=Strict cookies, eight-hour expiry, and server-side logout revocation. Mutations require the configured exact Origin. A per-email 10-attempt/15-minute limit slows guessing. HTTPS cookies are secure when served through HTTPS; the authorized local preview uses loopback HTTP. Authentication is designed for a local workspace; public deployment needs a separate security/deployment review, global/IP rate controls and a maintained identity-provider decision.

## Roles

| Capability | Admin | Operator | Viewer |
|---|---|---|---|
| Login, overview, own profile | Yes | Yes | Yes |
| View team directory/API | Yes | No | No |
| Operational mutations (future stages) | Yes | Yes | No |
| User/integration configuration (future stages) | Yes | No | No |

Only profile editing is implemented as an authenticated data mutation in this stage. Users cannot change their own role or email through the profile endpoint. Team editing is not implemented. Session checks run on protected layouts/pages and each protected endpoint, not just navigation visibility.

## Stage 1 acceptance

| Requirement | Acceptance condition | Evidence/check |
|---|---|---|
| Local application | Development and production build run without a hosted service | Build and local browser verification |
| Migration | Fresh DB initializes; re-opening does not repeat migration | Automated database test |
| Sample data | Setup creates three roles/warehouses and 48 orders exactly once | Seed/idempotency test |
| Sign-in | Valid credentials establish a session; invalid ones fail | Auth test and HTTP/browser validation |
| Session | Token is hashed at rest, expires, and is invalid after logout | Session test and HTTP validation |
| Authorization | Viewer/operator cannot read the admin team endpoint | Permission and HTTP tests |
| Profile | Valid name saves, survives reopen; invalid or unauthenticated mutation rejected | DB and HTTP checks |
| Overview | Metrics/graph/table derive from the same persisted records | Reconciliation and literal-search tests |
| Shared UI | Sidebar, header, table, period filter, form, dialog and notification states work | Browser/keyboard checks |
| Scope clarity | Future operational screens name their delivery stage | Navigation verification |
| Review | CodeRabbit review is actually run and results recorded | Stage 1 validation report |

## Five-stage feature coverage

| Feature | Stage | Completion criterion |
|---|---|---|
| Authentication, roles, profile, layout | 1 | Working persisted foundation |
| Orders, warehouse CRUD, item/invoice/package records | 2 | Validated save/edit/cancel and correct totals |
| Bulk import, mapper, filters, columns, exports | 2 | Per-row errors; valid data imports without silent duplication |
| Carrier rate/service choice, booking, labels | 3 | Simulator plus separately verified authorized provider capabilities |
| Tracking history, cancellation, reverse shipments | 3 | Idempotent events and valid state transitions |
| Return QA and manual POD | 3 | Review state and audit history persist |
| NDR/NPR, rules and bulk action workflows | 4 | Explicit action results and conflict priorities |
| Analytics, saved/scheduled reports, local email outbox | 4 | Totals reconcile; exports and schedules work locally |
| Limited channel sync and outbound webhooks | 4 | Documented integration contracts, retries and delivery visibility |
| Freight comparison and feedback summaries | 4 | Calculations from supplied local records; no settlement claims |
| Accessibility, performance, restore and end-to-end release | 5 | Agreed matrix verified; reproducible local release |

## Domain and state decisions

- Order: New → Unprocessed (validation/fulfillment issue) → Shipped, with cancellation where not already booked. In Stage 2 specify legal transitions in server code; do not use mutable badges as the state machine.
- Shipment: Info received → In transit → Out for delivery → Delivered; Exception and RTO are separate operational paths. Cancellation depends on provider support. Retain raw carrier events and their occurrence/receipt times in Stage 3.
- Return: Requested → Authorized → Pickup pending → In transit → Received → QA complete, with Rejected/Cancelled exits. This is our proposed independent workflow, not a verified eShipz specification.
- POD: Unavailable → Available → Verified or Rejected; rejection records a reason. AI verification is not required for the small-scale manual-review equivalent.
- NDR/NPR: Action required → Action requested → Resolved or a new action-required event. Retain request/result history.
- Current schema: users, sessions, login attempts, warehouses, orders, shipments, audit events and schema migrations. Implemented order/shipment rows are synthetic snapshots, not a booking engine.
- Next-stage entities: addresses, items, invoices, packages, shipment-order links, tracking events, returns, POD reviews, exception actions and report runs. Store address/package snapshots when a shipment is booked. Use integer minor units for money, explicit weight/dimension units and UTC event times.

## Independent design system

Primary teal `#087f79`, navigation `#073e3e`, page `#f5f7f8`, surface white, text `#192d34`, muted `#68797f`, dividers `#e5ebed`. Manrope headings and DM Sans body text are served locally through licensed font packages. SVG icons use one Lucide family. Original typographic Avon wordmark; no eShipz assets.

Use 4/8px spacing increments, 8px controls, 14px cards, consistent status text plus color, labeled fields, visible keyboard focus, native dialog focus trapping/Escape support, responsive navigation and horizontal table overflow. The overview chart includes a text alternative. Design tokens and primitives reside in `app/globals.css` and `components/ui.tsx`. The shared dialog and form are exercised by real guide/profile interactions, not a disconnected component gallery.

## Carrier contract for Stage 3

Prioritize one provider selected by the user. Required documentation: serviceability, rates, booking/idempotency, label retrieval, cancellation, tracking/webhook signatures and POD. Credentials must be supplied through ignored environment configuration or a secret store. Real callbacks may require polling or local event replay while hosting is excluded. No invented production AWBs or copied proprietary endpoints. If credentials are unavailable, document the simulator limitation explicitly.
