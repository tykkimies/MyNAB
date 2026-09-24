# Development handoff — Phase 4 schedules in progress

## Actual state

Baseline: `75e50de`, clean on recovery. Claude implemented Goals/Debt pages, target and
term effective dating, promotional APR periods, debt targets, completion history and a
deterministic demo seed. The old handoff mixed obsolete 0.3.1/0.3.3 deployment statements
with new work; this file replaces those statements entirely.

The prior deployment record reports 0.3.5 running on 192.168.1.7 with owner-authorized demo
data (381 transactions, six accounts). Production was not accessed or modified in this
review. That seed removed the PNC connection; reconnect through Link when real data is
wanted. Do not reseed or reset production as a development check.

## Active objective

Complete the full remaining roadmap through Phase 8. The persistent goal remains active;
this increment does not constitute Phase 4 or overall completion.

## Current changes

Prior review commits `af07656` and `2183487` repaired three debt/target regressions and
started recurrence primitives. This increment adds persisted Schedule/ScheduleSplit/
ScheduleOccurrence entities and `/accounts/schedules`: create with categories/splits,
upcoming date range, approve, skip, archive and restore. Approval reuses the financial
transaction command inside the same budget lock/serializable transaction. Creation and
skip never affect balances; unique occurrence keys protect concurrent approvals.
The finance API retains authentication, CSRF checks, audit and request idempotency.

Migration `202609240001_schedules` is additive (12 total), with six composite ownership
references for the new tables. Applied to the synthetic local test database only.
No images built and no production changes. Do not deploy the old 0.3.5 image with the new
schema; build a new tagged release at the proper verification gate.

## Verification

- `npm run check`: lint/typecheck and 156 unit/property tests passed.
- `npm run test:integration`: 64 PostgreSQL tests passed, including concurrent approval,
  authorization, future/invalid dates, skipping, archival and split validation.
- `APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`: passed.
- `APP_BASE_PATH=/mynab npm run test:e2e`: 38 desktop/mobile Chromium tests passed.
- `PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup`: all 29 tables matched.
- Fresh `mynab_schedule_empty_test`: 12 migrations applied, 34 composite ownership FKs.
  Empty synthetic schema retained; no production or existing database was reset.
- Initial browser run caught ambiguous select accessible names; explicit labels corrected.
- Logs under `/tmp/mynab-schedule-{check,integration,build,e2e}.log`.

## Next executable tasks — preserve this full scope

1. Finish Phase 4 schedules: edit/revision behavior preserving handled history, match an
   existing imported/manual transaction to an occurrence without reposting, useful overdue
   review and full timezone eligibility tests. Current UI warns to check imports before
   approval; skipping prevents a duplicate but is not a completed matching implementation.
2. Rules: persisted deterministic priority, predicates (payee/description/account/amount),
   preview/explanation, rename/category/memo/tag/transfer-suggestion actions, manual override
   protection; recurring transaction/rule suggestions remain opt-in. Separate worker for
   durable jobs, never request-bound background execution.
3. Close debt gaps: future minimum terms, percentage minimum formulas, affordability cap,
   statement balances. Current estimates vary APR but hold starting minimum payments.
4. Phase 5: provider-neutral durable staging, retry/backoff, health, Plaid update-mode/OAuth,
   Sandbox verification and worker lifecycle. Preserve explicit review and cursor fencing.
5. Phase 6: shared report semantics, date/comparison filters, category/payee spending, income/
   expense, cash flow, net worth, savings/debt/account/category/goal reports and drilldown.
6. Phase 7: CSV mapping/preview/dry-run/idempotency/undo, safe QFX/OFX, complete versioned
   portable JSON and CSV export, restore/backup UX, consistent/off-host resilience evidence.
7. Phase 8: responsive/accessibility review, pagination/indexed queries/performance, in-app
   notifications, advanced reports and separate 1/3/6/12-month forecast scenarios.
8. Release completion gate: audit every specification requirement, full tests/build, fresh
   migrations/ownership constraints, Docker startup/persistence/backups on actual Linux,
   versioned images and documented Portainer upgrade. Do not call the site complete merely
   because tests pass for the currently implemented subset.

## Relevant modules and known limits

- `src/application/finance.ts`: shared authorized commands, including schedules and approval.
- `src/application/schedules.ts`: authorized consistent upcoming query, default 90-day window.
- `src/app/(protected)/accounts/schedules/page.tsx`: create/upcoming/manage controls.
- `src/domain/schedules.ts`: recurrence; bounds throw instead of silently truncating.
- `prisma/migrations/202609240001_schedules`: additive ownership constraints.
- `tests/integration/finance.test.ts`, `tests/e2e/finance.spec.ts`: schedule coverage.
- `docs/PHASE2_ACCOUNTING.md`, `docs/PHASE5_INGESTION.md`: contracts for future changes.

Large histories still need pagination/indexed matching. Schedule query has per-schedule
bounds, not an overall result limit. UI offers four splits; API supports fifty. Schedule
mutation does not yet support edits or explicit matching. Refund selection still uses IDs.
Real PNC sign verification, Safari/Firefox and assistive-technology review remain open.

## Setup and operations

Read `AGENTS.md`, `ai/PROJECT.md`, `ai/HANDOFF.md`, then run `sh ai/checkpoint.sh recover`.
Node: prepend `~/.local/share/mynab-toolchain/node-v24.21.0-darwin-arm64/bin` to PATH.
PostgreSQL 17: `/opt/homebrew/opt/postgresql@17/bin`; project cluster is loopback port 55432.
Use `.env.test` for integration tests. Never print `.env` or `.local/portainer-mynab.env`.

```sh
npm run check
npm run test:integration
APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build
APP_BASE_PATH=/mynab npm run test:e2e
```

Remote Docker builds use `npm run release` only from committed versioned sources, with the
existing capped builder. Never prune shared server volumes/images. Owner updates Portainer;
local images require re-pull disabled. Keep existing encryption keys and secrets unchanged.
