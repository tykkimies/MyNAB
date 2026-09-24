# Current handoff

## Active goal

Complete the remaining application through Phase 8. Keep the persistent goal active until
all specification requirements and release gates are verified. Do not redefine completion
around the implemented subset. Production remains untouched by this work.

## Latest increment: VERIFIED, unreleased

Phase 4 schedules: persisted Schedule/ScheduleSplit/ScheduleOccurrence, create/archive/restore,
upcoming date window, approve and skip. Approval reuses transaction.create inside the same
budget-locked serializable transaction; occurrence uniqueness prevents concurrent duplicates.
No automatic income posting. Auth, CSRF, idempotency and audit use existing command boundaries.

Migration 202609240001_schedules applied only to synthetic local DB (12 migrations total).
New `/accounts/schedules` route is linked from Accounts. Prior financial review commits are
af07656 and 2183487. No new image/version or deployment yet.

## Verification

- npm run check: lint/typecheck + 156 unit/property tests.
- npm run test:integration: 64 passed, including concurrent occurrence approval.
- APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build: passed.
- APP_BASE_PATH=/mynab npm run test:e2e: 38 desktop/mobile tests passed.
- PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup: all 29 tables matched.
- Fresh mynab_schedule_empty_test: all 12 migrations, 34 composite ownership foreign keys.
- Initial browser failure was ambiguous form select labels; fixed and rerun successfully.

## Next step: finish Phase 4

Add schedule editing with preserved handled history and explicit linking to existing imported/
manual transactions without reposting. Current UI warns to check imports and permits skipping,
which is not a complete matching solution. Then persisted ordered rules with previews and
manual override protection, recurring suggestions and durable worker lifecycle. See fully
refreshed NEXT_STEPS.md for the full Phase 3-gap/Phase 5–8 checklist. No blockers at present.

## Operational constraints

Previous handoff reports production 0.3.5 with owner-authorized demo data, PNC removed by
seeding. Do not reset/reseed production. Never print secret files. New schema requires a new
image tag; do not deploy the existing 0.3.5 image against it. Build on capped Linux builder
at the release gate, preserve keys and take a backup. No production/provider access this turn.
