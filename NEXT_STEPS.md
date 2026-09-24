# Development handoff — review of 0.3.5

## Actual state

Baseline: `75e50de`, clean on recovery. Claude implemented Goals/Debt pages, target and
term effective dating, promotional APR periods, debt targets, completion history and a
deterministic demo seed. The old handoff mixed obsolete 0.3.1/0.3.3 deployment statements
with new work; this file replaces those statements entirely.

The prior deployment record reports 0.3.5 running on 192.168.1.7 with owner-authorized demo
data (381 transactions, six accounts). Production was not accessed or modified in this
review. That seed removed the PNC connection; reconnect through Link when real data is
wanted. Do not reseed or reset production as a development check.

## Review findings and implemented changes

- Avalanche previously kept its original ordering when a promotional APR expired. It now
  orders by each month's effective APR and remaining balances.
- A debt's final payment could use less than its minimum and lose the remainder for that
  month. The remainder now reaches the next debt immediately.
- Monthly debt targets subtracted assignments twice when the remaining debt gap was below
  the monthly target. Contribution now caps the unassigned monthly amount at the actual gap.
- Debt UI now describes effective rates and fixed starting minimums honestly.
- Phase 4 started with pure calendar recurrence: daily/weekly/monthly/yearly/one-off,
  intervals, inclusive end dates, anchored month-end/leap-year behavior, stable ID/date
  keys, validation and bounded expansion. No persistence, UI or posting yet.

## Verification this session

- `npm run check`: lint, typecheck and all 156 unit/property tests passed.
- `npm run test:integration`: 61 passed against the separate local `_test` database.
- `APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`: passed.
- `APP_BASE_PATH=/mynab npm run test:e2e`: all 36 desktop/mobile Chromium tests passed.
- Logs: `/tmp/mynab-review-{check,integration,build,e2e}.log` (temporary local evidence).
- No migrations added. No Docker build, production deployment, provider calls or production
  database access this session. Earlier container/backup evidence remains historical.

## Incomplete work and next executable tasks

1. Finish the debt contract: future minimum-payment terms currently do not alter the
   simulation; percentage-based minimum rules, a total affordability cap and statement
   balance capture are absent. Existing output assumes starting minimums continue.
2. Add Schedule and ScheduleOccurrence persistence with composite budget ownership FKs,
   occurrence uniqueness, revision/audit history, idempotent authenticated CRUD and approval.
   Approval must use the financial command transaction/lock rather than duplicate ledger logic.
3. Add upcoming bills/income UI and occurrence skip/approve controls. Merely reaching a date
   must never create budgetable income. Match imports explicitly to prevent duplicate approval.
4. Implement deterministic ordered rule previews, explanations and manual-field protection;
   recurring detection produces suggestions only. Durable automation needs a separate worker.
5. Build a new versioned release only after these changes are verified. Do not overwrite
   deployed 0.3.5 image tags. Back up before deployment; use the whole Portainer stack YAML.

Other retained gaps: Plaid reconnect/update-mode OAuth, worker/webhooks/durable import staging,
real PNC amount-sign verification, register/import pagination, refund selection UI, reporting,
file imports/portable exports, forecasts and non-Chromium/accessibility review.

## Relevant files

- `src/domain/debt.ts`, `goals.ts`: financial fixes; regression tests under `tests/unit`.
- `src/domain/schedules.ts`: Phase 4 recurrence primitives and documented boundaries.
- `src/application/finance.ts`, `finance-page.ts`: authorized commands and current queries.
- `src/app/(protected)/debt/page.tsx`: scenario controls and assumptions.
- `prisma/schema.prisma`: eleven migrations, no new schedule entities yet.
- `docs/PHASE2_ACCOUNTING.md`, `docs/PHASE5_INGESTION.md`: read before changing accounting/imports.

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
