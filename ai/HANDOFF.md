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
