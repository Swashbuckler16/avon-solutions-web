# Stage 1 validation

Validated 19 November 2026 (Asia/Calcutta). Stage 1 implements the local foundation; Stage 2 has not started. GitHub delivery is authorized. No hosting or public deployment is included.

## Delivered behavior

- Original Avon responsive shell, locally installed fonts/icons, sidebar and keyboard-operable workspace guide.
- SQLite migrations and persistent synthetic fixtures: 48 orders, 39 shipment snapshots and three warehouses.
- Randomly generated local accounts for Admin, Operator and Viewer; password hashing, expiring opaque sessions, logout revocation, origin checks and login throttling.
- Server-enforced admin team directory and self-service display-name updates that cannot change roles.
- Database-backed overview, reporting period selection, literal search and clear empty states. Later-stage modules explain their planned scope.
- Feature/acceptance matrix, domain states, carrier contract, design tokens and small-scale targets in stage-1-specification.md.

## Verification

Runtime: Node.js 26.13.0. Dependencies are recorded in package-lock.json.

| Check | Result |
| --- | --- |
| Production build | Passed |
| TypeScript check | Passed |
| Automated foundation tests | 6 passed |
| Production HTTP integration checks | Passed for Admin, Operator and Viewer |
| Browser desktop (1366 × 900) | Dashboard, search/empty result, 7/30-day periods, sidebar collapse/expand, guide open/Escape and sign-out passed |
| Browser mobile (390 × 844) | Layout inspected; page width equals viewport width; navigation opens/closes with Escape; hidden sidebar is not visible |

HTTP checks use a separate temporary database and server. They cover unauthenticated access, invalid credentials, cookie attributes, role restrictions, cross-origin rejection, profile validation/persistence, attempted role injection, planned-module navigation, search and revoked sessions. Foundation tests cover migration/seed repeatability, database persistence/constraints, password hashing, session expiry, permissions, throttling and metric reconciliation.

Pre-release fixes included serializing SQLite rows as plain objects at React boundaries, using the configured origin for authentication redirects, rejecting malformed stored hashes, handling repeated search parameters, guarding unknown module names, and improving mobile navigation focus behavior and text readability.

## Required reviews

Ponytail applied throughout: one Next.js application, built-in SQLite, native forms/dialogs, CSS and small focused modules. No separate API service, ORM, queue, chart framework or cloud infrastructure is required for this stage. Source was formatted for maintainability.

CodeRabbit CLI 0.9.3 completed an authenticated review of all 38 Stage 1 files using the free CLI allowance. It raised 2 minor issues and no major or critical issues: (1) HTTP test cleanup could wait forever after signal termination; fixed by checking both exitCode and signalCode; (2) appending setup credentials preserved overly broad existing POSIX permissions; fixed by opening the file, applying mode 0600 and appending through the same descriptor. TypeScript and all role-based HTTP checks passed after these fixes; repeat setup preserved existing accounts. Fixes were validated locally; a second remote review was not run. Windows file privacy still depends on the user directory ACL, since POSIX modes do not establish Windows ACLs.

## Limits and next stage

This is a working foundation, not the completed shipping replica. Order CRUD/imports/warehouses belong to Stage 2; shipping and returns to Stage 3; operational reporting and automation to Stage 4. Carrier records are synthetic snapshots. No carrier API, real booking, label generation or live tracking has been verified.

The local configuration is not a production deployment configuration. Stage 5 performance, broader accessibility, backup/restore and complete operational journey acceptance remain outstanding. Credentials, session tokens, the local database and browser screenshots are excluded from Git. Startup and backup instructions are in README.md.
