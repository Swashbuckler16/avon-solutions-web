# Stage 5 validation

20 November 2026. Stage 5 local implementation, validation and review fixes are complete. No hosting, external carrier connection, commit or push was performed.

## Changes

- Added SQLite online backup and new-file restore commands. Snapshots are checked for integrity, foreign keys and release schema; existing destinations cannot be overwritten. Restore clears sessions and pauses schedules. All private attachments and generated report files are stored within SQLite.
- Moved freight/feedback search into the scoped SQL query with a 50-row bound; it no longer fails just because the workspace has more than 5,000 shipments.
- Kept analytics filters and saved reports accessible when the cohort exceeds the report limit or dates are invalid. No partial aggregate is shown as a complete result.
- Restricted local channel configuration to Avon admins, matching the original role specification. Operators and customers retain authorized event replay; viewers remain read-only.
- Removed the obsolete dynamic placeholder module and updated stage labels. Improved filter spacing and button sizing without adding dependencies.
- Added the local release guide with safe environment handling, startup, migration, recovery, feature coverage and explicit exclusions.

## Checks

- 33 automated tests pass (one additional POSIX-only permission test is skipped on Windows), including WAL backup with the source open, restore, session revocation, schedule pause, invalid backup rejection and overwrite protection. Existing permission, import, duplicate booking, event replay, exception, reporting and customer-isolation tests remain green.
- TypeScript and production build pass. Turbopack required the ordinary Windows environment to create junctions; the sandbox-only build could not create those junctions.
- Complete HTTP workflow suite passes for admin/operator/viewer and isolated customers, including shipping recovery, private documents/POD, tracking, returns/QA, channels, exceptions, rules, freight/feedback, reports, logout and origin rejection.
- Browser checks at 1440 × 960 and 390 × 844: readable analytics filters, no page-level horizontal overflow, skip link moves focus to main content, mobile navigation opens with focus inside and Escape returns focus to its trigger, invalid date range shows a useful error with controls available. Preview: ignored `.local/stage-5-release.jpg`. These selected checks are not a complete accessibility certification.
- Large-dataset benchmark passed with 10,000 orders, 20,000 shipments, 100,000 tracking events and five simultaneous customer sessions. It also verifies staff report-limit recovery and cross-customer insight search isolation. Results below are the final measured run on Node 26.13.0 on this development computer.

| Warm query                        | Median ms | Maximum of 10 runs ms |
| --------------------------------- | --------: | --------------------: |
| Order list                        |       0.4 |                   0.6 |
| Shipment list                     |      10.2 |                  10.9 |
| Overview                          |     282.6 |                 293.6 |
| Freight/feedback search           |      16.0 |                  18.1 |
| Customer report (4,000 shipments) |     102.5 |                 113.7 |

| Five concurrent customer requests | Slowest complete HTML response ms |
| --------------------------------- | --------------------------------: |
| Overview                          |                               464 |
| Orders                            |                                37 |
| Shipments                         |                               106 |
| Freight/feedback                  |                               156 |
| Analytics                         |                               544 |

All measured warm queries were under 500 ms and HTML responses under two seconds. This does not measure browser painting, real carrier latency, proof storage volume, or five concurrent write transactions. Reproduce with `npm run test:performance`; private timing output lives in `.local/stage-5-performance.json`.

## Review and limits

Ponytail used throughout: SQLite's standard backup primitive, exclusive file publication, existing report SQL, native forms and existing test tools; no new package or service. The obsolete 129-line placeholder page was deleted. No further complexity layer was needed.

Authenticated CodeRabbit reviewed all 38 changed files and raised 1 major issue: POSIX backup files could have broader permissions than the source. Fixed by creating new destination directories with mode 0700 and restricting the staged snapshot to owner permissions allowed by the source before exclusive publication. Windows ACL behavior remains unchanged.

The second completed CodeRabbit review raised 2 minor issues: a global 100-order template cap could hide a customer's templates, and malformed bulk-exception entries could escape the per-entry error handler after earlier changes committed. Both were fixed: templates are fetched with customer ownership and a per-customer limit, and entry parsing occurs inside the error handler. Regression checks cover a customer's older template alongside 105 newer orders belonging to another customer, cross-customer access, and malformed entries after a successful action. No remaining reported issue is unaddressed. The final two fixes were locally validated after the second review snapshot; a zero-issue re-review is not claimed.

Final suite: 33 tests pass, one POSIX-only test is skipped on Windows, and none fail. Native POSIX permission execution is not claimed. Private review logs: `.local/stage5-final-review.jsonl` and `.local/stage5-followup-review.jsonl`.

A CLI backup/restore drill also succeeded against the local workspace: restored orders, shipments, tracking events, proof blobs, report CSVs and users exactly matched the snapshot. Sessions were cleared and schedules paused in the restored copy; the active database was not replaced.

See [local-release.md](local-release.md) for the completed local feature matrix and remaining provider/scope limits. All shipping remains explicitly simulated; external Blue Dart integration and hosting are still excluded. This is a reproducible local working model within the agreed reduced scope, not verified exact parity with every eShipz operation.
