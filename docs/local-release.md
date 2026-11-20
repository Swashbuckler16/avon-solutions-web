# Local release guide

This is an independently built local working model, not a certified copy of every eShipz behavior. The reference audit records screens that could not be inspected. Carrier prices, waybills, tracking and labels are simulated; no real dispatch, payment, email or external callback is sent.

## Start and stop

Use Node 24 or newer (validated on 26.13.0), npm and a private local folder. From the repository root:

```powershell
npm ci
npm run db:setup
npm run build
npm run start
```

Open `http://127.0.0.1:3000`. Setup writes generated credentials to the ignored `.local/setup-credentials.txt`; rerunning setup preserves existing accounts and records. Admin creates customer accounts through Customers. Customer logins are scoped to their own records; staff operators handle shared operations; viewers are read-only. Only administrators configure local channels and provision customer logins. For source editing use `npm run dev` instead of `start`. Stop with Ctrl+C.

`.env.example` contains only safe defaults. Next reads `.env.local`; standalone setup/scheduler/backup commands read shell environment variables, so set `$env:AVON_DB_PATH` explicitly when using an alternate database. All six migrations apply automatically and transactionally when the app opens the database. Do not edit applied migrations. Keep the source version with each backup.

Use `npm run scheduler -- --watch` in another terminal only when you want automatic local report generation; Ctrl+C stops it. Missed intervals coalesce. The app also has a Run due reports button. The private local outbox does not deliver email.

## Backup and restore drill

The database contains orders, customer information, password hashes, proof image blobs, audit trails and report CSVs. Backups are sensitive and unencrypted: keep them in private storage, outside Git. New POSIX backup directories are owner-only, and snapshot files retain only owner permissions allowed by the source. On Windows, folder ACL inheritance governs access; use a private destination folder. SQLite's [online backup API](https://nodejs.org/api/sqlite.html#sqlitebackupsourcedb-path-options) is used to include committed WAL data rather than copying a live main file. The source may remain open during backup; heavy continuous writes can delay it.

```powershell
npm run db:backup -- .local/backups/avon-2026-11-20.sqlite
npm run db:restore -- .local/backups/avon-2026-11-20.sqlite .local/avon-restored.sqlite
```

Both commands require a new destination filename and reject overwrites, mismatched schemas, corrupt databases and foreign-key violations. A checked temporary snapshot is published only after validation. Restore does not modify the source or current database; it creates a separate copy with sessions revoked and report schedules paused. Passwords remain those from the backup. Keep those credentials in a password manager; setup does not reset them.

After restore succeeds, stop the app and scheduler, then in the same PowerShell window:

```powershell
$env:AVON_DB_PATH = '.local/avon-restored.sqlite'
npm run start
```

Sign in again, verify an order, tracking history, proof image and report download, then re-enable desired schedules. For a persistent choice, update the ignored `.env.local` too; shell variables take precedence. To revert, stop the app, set `AVON_DB_PATH` back to the original database and restart. No database file needs to be deleted or overwritten. Backup copies data as of its snapshot; later writes remain only in the original.

## Release checks

```powershell
npm test
npm run typecheck
npm run build
npm run test:http
npm run test:performance
```

HTTP checks use temporary databases and loopback port 3011. Performance checks use a separate temporary database and port 3012 with 10,000 orders, 20,000 shipments, 100,000 tracking events and five customer sessions. Neither modifies workspace records. The benchmark writes timings to ignored `.local/stage-5-performance.json`, checks warm queries under 500 ms and five-user complete HTML responses under two seconds. HTTP timing is not browser paint timing or proof of concurrent write capacity. Temporary benchmark accounts cannot sign in with a password; sessions are generated inside the isolated test.

On Windows, Turbopack needs permission to create junctions. If build reports access denied creating a junction, use an ordinary terminal with the necessary local permissions. Stop app processes before rebuilding. Do not expose the local server or database to the Internet.

## Completed local feature matrix

| Area                        | Working behavior and validation                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Login and roles             | Salted password hashes, session expiry/logout, origin checks, customer ownership, viewer restrictions; automated and HTTP checks                             |
| Orders and pickup locations | Persistent create/edit/clone/cancel, items/packages/invoice references, validation, revisions and audit; automated and HTTP checks                           |
| Bulk data                   | CSV/TSV/XLSX mapping, preview, per-row errors, duplicate recovery, filters/paging/columns and formula-safe exports; automated, HTTP and prior browser checks |
| Shipping                    | Simulated service choice, booking retry/lost-response reconciliation, labels, cancellation; automated and HTTP journey                                       |
| Tracking/returns/POD        | Duplicate/late event handling, full reverse shipments, staff QA and private image review; automated and HTTP journey                                         |
| Exceptions and rules        | NDR/NPR requests, follow-up dates, bulk partial results, histories, priority rules, preview/apply; automated, HTTP and Stage 4 browser journey               |
| Reports                     | Scoped analytics, bounded CSV, saved schedules, local outbox and private downloads; automated, HTTP and browser checks                                       |
| Channels, freight, feedback | Authenticated create-only event replay, duplicate recovery, supplied cost comparison and stored feedback; automated and HTTP checks                          |
| Recovery and scale          | Checked backup/new-file restore, session revocation, paused schedules and reproducible benchmark                                                             |

## Explicit limits

- Blue Dart, DTDC and Delhivery names identify simulated service choices. Real rates, AWBs, booking, cancellation, tracking, POD and webhook signatures remain unverified until documentation/access is provided and integration is authorized.
- External storefront sync, outbound webhooks, email/SMS, live payments/COD settlement, credit notes, contract pricing, AI POD scoring and GPS are not implemented. Local channel replay and the local outbox are the tested equivalents within the reduced scope.
- Split/merge rules were never agreed and remain excluded. Clone creates an independent order; returns are full-shipment only.
- Imports: 1 MB / 500 orders, one row creates one item/package; export: 10,000 orders. Reports: 5,000 shipments per filtered cohort, with an actionable filter error rather than silent truncation. Insight search: first 50 matches. Exception action selection: first 100 filtered cases. Rule candidates: newest 100 orders. Channel templates: newest 100 eligible orders per customer. Channel history: latest 50; report history: latest 100.
- One SQLite writer, one local organization, no public signup/reset or hosted multi-tenant service. Larger deployments, encryption-at-rest, external identity and operational monitoring require a separately authorized deployment review.
- Synthetic benchmark data exercises list/query volume, not realistic attachment storage, all mixed write workloads, or a live carrier. Accessibility validation covers selected keyboard and responsive workflows, not a WCAG certification.

Stage 5 does not authorize hosting, external bookings or Git publication.
