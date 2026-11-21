# Avon Operations

A small-scale, local shipping workspace with isolated customer logins, pickup locations, persistent orders, spreadsheet imports, simulated shipping, tracking, returns, POD review, exceptions, rules, analytics, scheduled reports, channel replay, freight comparisons and feedback. Stage 5 adds verified backup/restore, larger-dataset validation and release polish. No live carrier is connected. See [local release guide](docs/local-release.md) for startup, recovery, acceptance coverage and known limits.

## Run locally

Requires Node.js 24 or newer and npm. Tested runtime and package versions are recorded in the validation report and lockfile.

```powershell
npm ci
npm run db:setup
npm run dev
```

Open http://127.0.0.1:3000. Setup generates unique random passwords for `admin@avon.local`, `operator@avon.local` and `viewer@avon.local` in `.local/setup-credentials.txt`. Keep that file private, save the passwords in your password manager, and remove the file when no longer needed. It is ignored by Git. Running setup again preserves users, passwords and records.

Use the exact loopback URL above. Form origin checks default to `http://127.0.0.1:3000`; override `AVON_ORIGIN` if you intentionally change the port. Do not expose this local-development configuration to a network.

## Validate

```powershell
npm test
npm run typecheck
npm run build
npm run test:http
```

The HTTP check requires a production build and starts its own temporary database/server. It does not change the normal workspace. For a local production-mode preview, run `npm run start` after building. Do not run development and production servers on the same port at the same time.

## Data and access

- Database: `.local/avon.sqlite`, overridable with `AVON_DB_PATH`.
- Migration: `migrations/001-foundation.sql`, versioned and transaction-protected.
- Roles: Admin (including team directory), Operator, Viewer. Each user can edit their own display name; roles cannot be changed through that endpoint.
- Sample fixtures: three warehouses, 48 orders and related shipment snapshots. Fictional business names and simulator records only.
- Sessions: eight hours, HTTP-only cookie, opaque token hash at rest, immediate logout revocation.
- Backup: `npm run db:backup -- .local/backups/avon-backup.sqlite`. Restore to a new file with `npm run db:restore -- .local/backups/avon-backup.sqlite .local/avon-restored.sqlite`. Existing files are never overwritten. See the release guide before switching databases. Do not copy a live SQLite main file alone while its WAL is in use.

## Delivery workflow

Ponytail is mandatory for implementation simplicity; CodeRabbit is mandatory for meaningful reviews and stage completion. Review results and limitations are recorded honestly. Review commands may require the normal Windows environment because the sandbox cannot see the saved CLI login.

Stage 5 local implementation and validation are authorized. External carrier connections and hosting remain excluded. See `AGENTS.md` and `docs/five-stage-roadmap.md`.

## Assets

Original CSS/layout and wordmark. Lucide icons (ISC) and DM Sans/Manrope fonts (SIL Open Font License) are installed locally; see the packages' licenses. No runtime font/CDN request and no copied reference-site proprietary assets.

## Stage 2 workflow

An Avon administrator creates a customer under Customers, selects that record and creates its login. The random password is shown once; share it privately. Customer accounts use the operator permission set with a server-enforced customer scope. Deactivating a customer invalidates its sessions and blocks new logins. There is no public signup or password-reset flow in this local release.

Create a pickup location for the customer, then use Orders to create a dispatch with recipient, products, invoice reference and package details. Prices are final unit prices inclusive of any tax; the system stores an invoice reference rather than issuing a tax invoice. A preferred carrier preselects a matching available simulated service; booking still requires confirmation. Customers see only their own records; Avon staff can work across customers. Viewers cannot mutate records.

Imports accept CSV, TSV and XLSX (first sheet), up to 1 MB and 500 orders per file. One row creates one order with one item/package; edit it afterwards to add more. Download the template, map columns, validate, then import valid rows. Failed rows can be corrected and retried; existing platform-wide references are skipped, never overwritten. Mappings are private to the signed-in account. Exports cover all matching orders, up to 10,000 rows, and escape spreadsheet formulas. Files and real customer data must never be committed.

Split/merge operations are deliberately excluded until rules are agreed. Clone creates an independent order with a new reference; it does not split quantities, merge invoices or copy a booking. See docs/stage-2-validation.md for checks and limits.

## Stage 3 local shipping

Open a ready order and choose **Create shipment**. Fetch simulated services, select one and confirm. All carrier prices and AWBs are test data; no carrier account is connected. The failure/lost-response scenarios exercise safe retry with the same request key. **Check booking result** reconciles an uncertain response before starting over.

Shipment details provide test labels/invoice summaries, cancellation before pickup, and a staff-only event-replay form. Use unique event IDs and ISO 8601 occurrence times (blank uses now). Replaying the same event preserves its timestamp and does not duplicate it. Delivered forward shipments can create a full return; after reverse delivery, Avon staff record its quality result. Delivered shipments accept private PNG/JPEG proof images for staff verification.

Read docs/stage-3-validation.md for evidence and limits, and docs/carrier-integration-contract.md for the Blue Dart integration boundary. Do not use SIM-prefixed waybills or test labels with a real carrier.

## Stage 4 local operations

See docs/stage-4-validation.md for behavior, limits and validation. Use npm run scheduler for a single due-report pass, or npm run scheduler -- --watch while the computer is on. Reports stay in the private local outbox; no email, carrier or store service is contacted.

## Phase 6 shipping operations

Open **Dispatch planning** for manual rate cards, cost/delivery allocation, SKU packing and pickup allocation, safe split/merge, reviewed bulk simulated bookings and staff tracking-file imports. The order editor now records international declarations and appointment requests. See [Phase 6 guide and checks](docs/phase-6-validation.md) for exact rules and limits and [Phases 6–7 plan](docs/phase-6-and-7.md) for the remaining scope. SQLite remains in use; migration 007 preserves existing records. Carrier connections and hosting remain excluded.

The earlier split/merge exclusion described Stage 2; Phase 6 implements the documented unbooked-order rules. It does not merge different invoice references or already-booked shipments. Phase 7 is not started.
