# Current handoff

## Request

Review Claude's Phase 3 work and continue the next phase after addressing defects.

## Status: VERIFIED, unreleased

Baseline `75e50de`; recovery found a clean tree. Review fixed three defects in pure financial
logic: promotional APR avalanche order, same-month released minimums, and monthly debt target
double subtraction. Regression tests added. Phase 4 started with pure recurrence primitives
only (src/domain/schedules.ts); there is no schedule UI/persistence/posting yet.

Verified: `npm run check` (lint/typecheck + 156 unit/property tests),
`npm run test:integration` (61),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`,
`APP_BASE_PATH=/mynab npm run test:e2e` (36 desktop/mobile tests).

## Next action

See refreshed NEXT_STEPS.md. Finish the remaining debt contract (future minimum changes,
minimum formulas, affordability cap, statement balances), then Schedule/ScheduleOccurrence
schema and authorized, audited, idempotent approvals using existing ledger commands. Keep
scheduled income out of the budget until approved. Rules follow schedules.

## Deployment boundary

Previous handoff reports 0.3.5 deployed with owner-authorized demo data and PNC removed by
seeding. This review did not query or modify production, build images or add migrations.
Do not reseed/reset production. Eleven migrations remain. Never print secret files.
Use a new version for the next release; never overwrite deployed 0.3.5 image tags.
