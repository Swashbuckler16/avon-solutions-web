# Avon Operations

A small-scale, local shipping workspace. Stage 1 provides authentication, server-enforced roles, persistent SQLite storage, a sample-data overview and editable profiles. Operational modules are clearly marked for later stages. No live carrier is connected.

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
- Backup: stop all app processes, then copy the entire `.local/` directory to a private location. Restore it with the app stopped. Keep the matching migration/source version. Do not copy a live SQLite main file alone while its WAL is in use.

## Delivery workflow

Ponytail is mandatory for implementation simplicity; CodeRabbit is mandatory for meaningful reviews and stage completion. Review results and limitations are recorded honestly. Review commands may require the normal Windows environment because the sandbox cannot see the saved CLI login.

Stage 1 and its GitHub commit/push are authorized. Hosting and Stage 2 are not authorized. See `AGENTS.md`, `docs/five-stage-roadmap.md`, `docs/stage-1-specification.md` and `docs/stage-1-validation.md`.

## Assets

Original CSS/layout and wordmark. Lucide icons (ISC) and DM Sans/Manrope fonts (SIL Open Font License) are installed locally; see the packages' licenses. No runtime font/CDN request and no copied reference-site proprietary assets.
