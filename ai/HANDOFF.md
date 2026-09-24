# Current handoff

## Active goal

Finish the application through Phase 8, using the owner's completed Warm Editorial Finance
redesign. Presentation-only scope has ended. Owner prefers restrained color, legible button
pairs, compact management, fewer oversized rows. Do not revert the redesign or prior contrast
repairs. Full roadmap remains in NEXT_STEPS.md; no blocker.

## Latest work: VERIFIED, unreleased

Baseline e98f3fa, clean recovery. Added saved-rule persistence/CRUD and hypothetical preview UI
under Accounts, with exact amounts, optimistic revision, authorization/audit/idempotency and
ownership FKs. Rule application/transaction tags/manual-field locks are NOT implemented yet.
Migration 202609240003_automation_rules brings count to 14.

Design refinements: neutral outlined inline Assign/Rename buttons; compact Groups/Categories
grids and direct inline group names; no empty message space; 44px phone control targets;
Accounts selected on subpages. Rule UI shares typography/checkbox/control tokens.

Verified commands: npm run check (164 unit/property, lint/typecheck), npm run test:integration
(71), APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build,
APP_BASE_PATH=/mynab npm run test:e2e (44),
PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup (30 tables),
APP_BASE_PATH=/mynab npx playwright test --config tests/screenshots/shots.config.ts
(visual review and zero reported contrast failures; excludes gradients/unparseable colors).
Fresh mynab_rules_empty_test: 14 migrations, 38 composite ownership FKs. The final heading
font-role correction passed a repeated build and visual/contrast run.

## Next executable batch

Explicit rule application with persisted owner-field protection/tags and immutable financial
corrections, revalidated against current rules/transactions and reconciliation state. Then
finish Phase 4 worker/timezone/suggestions gaps and every remaining phase. See NEXT_STEPS.

## Operations

Prior notes report deployed 0.3.7, built 0.3.8 not yet deployed. Not verified remotely this
turn; no production access or deployment occurred. New code needs a new tag and migration;
do not overwrite built tags. Never print secrets or reset/reseed production. Preserve keys,
back up before release, use the capped Linux builder and full Portainer YAML, re-pull off.

## Rule application: VERIFIED, committed, unreleased

Resumed 2026-09-24 after a cutoff; the prior agent's edits were intact. Adds migration
202609240004_transaction_preferences (TransactionPreference: tags, locked fields, revision;
composite FK to FinancialTransaction), shared fingerprinted previews in application/rules.ts
(loadRulePreview), commands transaction.protect and rule.apply in finance.ts (rule.apply is
rewritten into a transaction.create reversal/replacement keeping date, amount, cleared state;
stale fingerprint, bank-change review, transfer suggestions and no-op changes are refused;
reconciled history needs acknowledgment). Manual entries default to all fields locked;
unapproved imported entries default to unlocked. Preferences carry across replacements, both
manual and ingestion. Controls live on Accounts > Rules.

Verified commands (all passed): npm run check (164 unit); npm run test:integration (74);
APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build;
APP_BASE_PATH=/mynab npm run test:e2e (46); PG_BIN=/opt/homebrew/opt/postgresql@17/bin
npm run test:backup (31 tables); screenshots/contrast config (0 failures). mynab_test has
39 composite FKs after the new migration.

Next: Phase 4 worker/timezone/suggestion
gaps and remaining phases per NEXT_STEPS. Release needs a new tag (0.3.9+) and migration.

## Batch: rule proposals in import review — VERIFIED, committed

Request: continue the roadmap (NEXT_STEPS item 2, first part). Acceptance: on Accounts >
Connections, an unapproved posted outflow whose enabled rules set a spendable category is
pre-filled with that category and names the rule; rules beat payee memory; protected
(locked) fields and archived/payment/system categories are ignored; when rules also propose
payee/memo/tags, a link opens the Rules preview for that transaction. Approval stays explicit
and unchanged (no new ledger writes). Plan: export the row->definition mapper from
application/rules.ts; use it in getConnections (application/ingestion.ts); hint + link in
connections/page.tsx; integration test in tests/integration/ingestion.test.ts.
Files: src/application/rules.ts, src/application/ingestion.ts,
src/app/(protected)/accounts/connections/page.tsx, tests/integration/ingestion.test.ts.
Verified (all passed): npm run check (164); npm run test:integration (75); /mynab build;
npm run test:e2e (46); npm run test:backup (31 tables); screenshots/contrast (0 failures).

Next executable batch (PLANNED): remaining Phase 4 items from NEXT_STEPS item 2: opt-in
suggested rules, schedule timezone eligibility, overdue summary, recurring dismissal,
durable worker lifecycle (no request-bound background jobs).

## Batch: schedule eligibility, overdue summary, recurring dismissal — VERIFIED, committed

Owner said "carry on" with Phase 4. Acceptance:
1. schedule.approve is due only when the date is <= today in the SCHEDULE's timezone and
   <= today in the budget timezone (ledger never gets a future date); getSchedules exposes
   `due` per occurrence and the page uses it.
2. getSchedules returns `overdue` (unhandled due occurrences of active schedules in the 365
   days before today, independent of the window: count + oldest date); page shows a notice
   with a link that widens the window to the oldest date.
3. Migration 202609250001_recurring_dismissals: RecurringDismissal(budgetId, key, createdAt),
   PK (budgetId,key), FK Budget. Commands recurring.dismiss / recurring.restore (audited,
   idempotent via executeFinance). Schedules page hides dismissed suggestions and lists them
   with Restore. No ledger effect.
Files: prisma/schema.prisma, new migration, src/app/api/health/ready/route.ts,
src/application/finance.ts, src/application/schedules.ts,
src/app/(protected)/accounts/schedules/page.tsx, tests/integration/finance.test.ts,
tests/e2e/finance.spec.ts (dismiss flow).
Verified (all passed): npm run check (164); npm run test:integration (78); /mynab build;
npm run test:e2e (48); npm run test:backup (32 tables); screenshots/contrast (0 failures).
Fresh database mynab_fresh_check_test: 16 migrations, 39 composite FKs (then dropped).
mynab_test was migrated with `node --env-file=.env.test node_modules/prisma/build/index.js
migrate deploy` (integration tests do not migrate by themselves).

Next executable batch (PLANNED): opt-in suggested rules from repeated owner choices, shown
on the Rules page with a prefilled rule.save; then the durable worker (see NEXT_STEPS).
