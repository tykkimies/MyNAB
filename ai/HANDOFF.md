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

## Batch: opt-in suggested rules — VERIFIED, committed

Acceptance: Rules page lists suggestions only where the owner filed the same normalised payee
to one spendable category >= 3 times with no exceptions (non-voided history), and no rule
(enabled or not) already has a payee condition matching it. Each has "Create this rule",
which sends rule.save (EXACT payee, category). Nothing is created or applied otherwise.
Plan: pure suggestRules() in src/domain/rules.ts + unit tests (tests/unit/automation.test.ts);
move the filing-history loader from getConnections into application/rules.ts
(filingHistory) and reuse it; getRules returns suggestions; UI in accounts/rules/page.tsx;
e2e creates a rule from a suggestion. No migration. Dismissal of rule suggestions deferred.
Verified (all passed): npm run check (167); npm run test:integration (79); /mynab build;
npm run test:e2e (50); npm run test:backup (32 tables); screenshots/contrast (0 failures).

Next executable batch (PLANNED): the durable worker (last Phase 4 item, prerequisite for
Phase 5 scheduled syncs). Needs a design pass first: PostgreSQL job table with leases,
separate `worker` entrypoint/service in Docker + deploy/portainer/stack.yml, graceful
shutdown, health. Changes deployment, so confirm scope with the owner before building.

## Owner instruction 2026-09-24: close Phase 3 gaps, finish Phase 4 (worker), then Phase 5

Owner approved all three, including worker deployment changes (files only; no production
deploy without asking). Order: (A) Phase 3 gaps, (B) durable worker, (C) remaining Phase 5.

## Batch A: Phase 3 debt gaps — VERIFIED, committed

Acceptance: (1) simulator uses effective-dated minimum versions per month; (2) minimum rule:
fixed, or greater of floor and percent-of-balance (+ interest optionally), capped at owed;
(3) optional total monthly payment budget: infeasible when it cannot cover minimums, extra =
budget - minimums; (4) DebtTerms stores optional statement balance + date. Domain first
(src/domain/debt.ts + tests/unit), then migration, finance.ts debt.terms command,
finance-page.ts, debt/page.tsx, integration/e2e tests.
Done: MinimumRule (floor, percent bp, +interest) with effective-dated `minimums`; constant
first-month commitment (or `monthlyBudget`) rolls freed money; `minimumsOnly` baseline;
`shortfallMonths`; migration 202609250002_debt_minimum_rules (percent, includesInterest,
statementBalance/Date). Debt page: new term fields, statement under account name, budget
scenario, shortfall notice. Verified: check (172), integration (80), build, e2e (52),
backup (32 tables), contrast (0).

## Batch B: durable worker — VERIFIED, committed

Design: migration 202609250003_jobs: Job(id, budgetId?, kind provider.sync|maintenance,
subjectId?, dedupeKey, status QUEUED|RUNNING|DONE|FAILED, runAt, attempts, maxAttempts,
leaseToken, leasedUntil, lastError, createdAt, finishedAt) with a PARTIAL unique index on
dedupeKey for QUEUED/RUNNING (raw SQL; prisma migrate dev would drop it) + WorkerHeartbeat.
Pure backoff in src/domain/jobs.ts. src/application/jobs.ts: enqueue (ON CONFLICT DO
NOTHING), claim (FOR UPDATE SKIP LOCKED, lease token), complete/fail guarded by lease token,
scheduleDue (connections ACTIVE, or ERROR but not REAUTH_REQUIRED, stale by
SYNC_INTERVAL_HOURS default 6; daily maintenance), runJob (provider.sync as budget owner via
syncConnection; REAUTH -> FAILED no retry; maintenance = pruneExpired + old jobs).
scripts/worker.ts loop with SIGTERM drain, heartbeat row + /tmp file for healthcheck.
npm script `worker`. Worker service in docker-compose.yml and deploy/portainer/stack.yml
(tools image, networks database+frontend for Plaid egress). Connections page shows automatic
sync status. Tests: unit backoff; integration claim/lease/stale-token/retry/dedupe/schedule.
Verified: check (175), integration (86), /mynab build, e2e (52), backup (34 tables),
contrast (0); fresh DB 18 migrations, 39 composite FKs, partial index present. Local smoke:
worker against mynab_test with no Plaid ran maintenance and exited 0 within 1s of SIGTERM.
stack.yml still references 0.3.8 tags; the next release must bump them (release.sh does).

## Batch C: remaining Phase 5 — VERIFIED, committed

Acceptance: (1) config treats empty optional env values as unset (bug: stack's
`${PLAID_CLIENT_ID:-}` made startup fail without Plaid); optional PLAID_REDIRECT_URI, https,
under APP_ORIGIN+APP_BASE_PATH. (2) Provider.createLinkToken(ref, {accessToken?,
redirectUri?}); update mode omits products. (3) link.reauth.start/complete in
application/ingestion.ts + /api/provider; complete sets ACTIVE, clears errorCode, audits,
enqueues provider.sync. (4) ConnectBank handles reauth and stores {token, mode,
connectionId} in sessionStorage; new page accounts/connections/oauth resumes Link with
receivedRedirectUri. (5) Sign-in-again button on REAUTH connections. (6) Sandbox check only
if credentials exist. Webhooks and durable ImportBatch staging deliberately out of scope
(spec satisfied by in-memory staging + periodic worker sync).
Previous heading: Batch C PLANNED (next)
Plaid update mode for REAUTH_REQUIRED connections, OAuth redirect support, Sandbox
verification via scripts/plaid-check.ts (only if sandbox credentials exist; never print
them), provider health on Connections. Durable fetch staging: decide after reading
docs/PHASE5_INGESTION.md.
Verified: check (177), integration (88), /mynab build, e2e (54), backup (34 tables),
contrast (0), and `npm run plaid:check` against Plaid Sandbox (49 entries, signs correct,
reset_login -> REAUTH_REQUIRED, update-mode link token accepted, item removed).
Not verified: a real OAuth institution round trip (needs PLAID_REDIRECT_URI registered with
Plaid on the public host) and the worker inside Docker on the Linux host.

Owner's requested scope (Phase 3 gaps, Phase 4, Phase 5) is complete and committed.
Next per NEXT_STEPS: Phase 6 reports, Phase 7 import/export, Phase 8 polish, final gate,
then a 0.3.9+ release (needs owner go-ahead; stack adds the worker service).

## Release 0.3.9 — BUILT on host (2026-09-24), not deployed

Owner asked to build 0.3.9 so they can deploy it in Portainer themselves. Commit 1cbe151
bumps package.json/package-lock.json/stack.yml. `npm run release` exited 0: mynab:0.3.9 and mynab-tools:0.3.9
exist on 192.168.1.7 (APP_BASE_PATH=/mynab, user=node). Host disk 84% used. Owner deploys: back up DB, paste whole stack.yml (adds worker +
PLAID_REDIRECT_URI/SYNC_INTERVAL_HOURS), re-pull disabled; 5 new migrations run.
After that: Phase 6 (reports). Owner also asked about how to use the app; guide offered.
Owner decision: build a comprehensive in-app guide as the very LAST step, after Phases
6-8 and the final gate (NEXT_STEPS item 9). Do not write it earlier.

## Phase 6 (reports) — VERIFIED, committed

Design: pure src/domain/reports.ts over active (unvoided) transactions+splits:
consumption = EXPENSE+REFUND (budget accounts by category split; tracking accounts as
off-budget rows); income = INCOME; credits = CREDIT (card statement credits, shown apart);
internal = TRANSFER between two budget accounts (excluded, incl. card payments); financing =
TRANSFER crossing budget/tracking; adjustments = ADJUSTMENT; OPENING only in balances.
Cash-flow components reconcile exactly to on-budget balance change. Savings rate =
(income - consumption)/income, null when income <= 0. Monthly series, net worth and
liability balances at month ends, drilldown rows for category/payee/flow. Comparison =
previous equal-length period or same period last year, computed by the same function.
src/application/reports.ts (authorized read), /reports page + nav, unit/property tests,
integration test, e2e. No migration.
Verified: check (183), integration (89), /mynab build, e2e (56 incl. reports drilldown,
desktop+mobile screenshots inspected), backup (34 tables), contrast (0, /reports included).
Chart colours: blue #2a78d6/#3987e5 income, orange #eb6834/#d95926 spending, validated with
the dataviz validator against both card surfaces.

Next: Phase 7 (CSV mapping/preview/dry-run/idempotency/undo, safe QFX/OFX, versioned
JSON/CSV exports, restore/backup UX). Then Phase 8, final gate, then the in-app guide LAST.

## Phase 7 (import/export) — IN PROGRESS

Owner: "lets do phase 7" (2026-09-24). Spec section 10: files feed the SAME ingestion.
Batch 7A file import (VERIFIED, committed; check 193, integration 94, e2e 58, backup 35,
contrast 0): (1) refactor syncConnection's commit loop into
commitEntries(tx, userId, budgetId, connectionId, {entries, removed}) shared by sync and
files; (2) per-budget FILE connection (provider "FILE"; scheduleDue, syncConnection and the
Connections panels exclude it; its entries still appear in import review); ProviderAccount
per imported account, externalAccountId `account:<id>`, linkedFrom = opening date; refuse
accounts linked to a bank; (3) pure parsers in src/domain/files.ts: RFC 4180 CSV, mapping
(date format, signed/inverted/debit-credit amounts, payee, memo), exact cents, OFX/QFX
STMTTRN extractor (no DTD/entity processing, size/record limits, USD only); CSV identity
sha256(account,date,amount,payee,occurrence), OFX identity FITID; (4) migration: ImportBatch
+ IngestedEntry.batchId; undo only while no batch entry approved/reviewed, voids via
voidTransaction and deletes the batch's identity rows so re-import works; (5) /api/import
(inspect/preview/commit/undo, 2 MB, 5000 rows) + /accounts/import page; tests.
Batch 7B (VERIFIED, committed; check 195, integration 95, e2e 60, backup 35, contrast 0): domain/export.ts (CSV writer, formula escaping for text cells only;
money emitted as typed decimal numbers), application/exports.ts (versioned JSON
format mynab.export v1: every budget table incl. voided history, splits, states,
reconciliations, assignments, targets, debt terms, schedules, rules, preferences, import
batches, connection metadata WITHOUT tokens/cursors; no users/sessions/audit), GET
/api/export (json | csv&table=), /accounts/export page with backup guidance.

OPEN DECISION (asked owner 2026-09-24): production has NO automated backups. scripts/backup.sh
is manual, unencrypted, prints "encrypt before transferring". Spec section 13 wants nightly
pg_dump, 7 daily + 4 weekly retention, encryption (e.g. age) before off-host transfer.
Proposal: a `backup` service in stack.yml (postgres image, nightly loop, host-mounted dir,
retention, optional age encryption with an operator public key). Needs owner choices:
host path, off-host destination, key. Remaining Phase 7 item depends on it.
Next otherwise: Phase 8.

Owner deferred the backup decision ("move to phase 8", 2026-09-24): revisit BEFORE the final
release gate.

## Phase 8 — IN PROGRESS

Plan (owner: "move to phase 8"): 8A in-app "Needs attention" summary on Budget (pure
domain/attention.ts ordering + application/attention.ts counts: unapproved imports, bank
change reviews, reauth/error connections, worker down, overdue schedule occurrences,
overspent categories, negative Ready to Assign, affected reconciliations); 8B forecasts
1/3/6/12 months (schedules, average discretionary spending, loan minimums, goal earmarks;
query-string assumptions, never stored, never assigns); 8C paginated/searchable account
register; 8D category trend + account balance history; 8E axe accessibility audit
(@axe-core/playwright dev dependency) and fixes. Notification channel = in-app (spec left
it open; no email/push infrastructure).
8A: VERIFIED, committed (check 197, integration 96, e2e 60, backup 35, contrast 0).
8B forecasts: VERIFIED, committed (check 202, integration 97, e2e 62, backup 35, contrast 0).
8C register: VERIFIED, committed (50/page, payee/memo search, Map lookups; e2e 64).
8D: VERIFIED, committed (category trend in report drilldown; 12-month balance line on
account pages; shared components/trend-line.tsx).
8E: VERIFIED, committed. tests/e2e/zz-a11y.spec.ts runs axe (WCAG 2.1 A/AA) on every page,
both themes, desktop + mobile, after the other suites fill the ledger: 0 violations. Fixed:
scrollable tables were not keyboard-focusable (now labelled focusable regions).
Phase 8 COMPLETE. Remaining before the guide: (1) owner decision on automated encrypted
backups; (2) final gate per NEXT_STEPS item 8 (spec audit, clean install, dependency audit,
fresh migrations, Linux Docker health incl. worker, new tag); (3) release; then (4) guide.

OWNER DECISION 2026-09-24: "i don't care about backups". Automated backups are declined; do
not raise them again unless the owner does. (scripts/backup.sh remains available.)

## Release 0.3.10 — BUILT on host (2026-09-24), not deployed by agent
Owner asked to build the newest version to deploy themselves. Contains everything since
0.3.9 (Phases 6, 7, 8). Migration added since 0.3.9: 202609250004_import_batches.
npm run release exited 0: mynab:0.3.10 and mynab-tools:0.3.10 on 192.168.1.7
(APP_BASE_PATH=/mynab, user=node, host disk 85%). Owner deploys by pasting the whole
stack.yml with re-pull disabled. Next: final gate, then the in-app guide.

## Final gate + YNAB parity + onboarding research — DONE, see docs/FINAL_GATE.md (2026-09-25)

Owner: "do the final release checks from our initial idea. Do a feature parity check with
youneedabudget. See if features that are the same across the two sites work the same. Look
at how ynab does its tutorial ... and lets look into doing the same for ourselves."
Plan: (1) gate mechanics: clean clone + npm ci, full checks, npm audit, fresh migrations,
live host health (read-only; production 0.3.10 running healthy); (2) requirement-by-
requirement PROJECT_SPEC audit; (3) YNAB behaviour research from its public help centre and
comparison of shared features; (4) YNAB onboarding research -> guide proposal. Findings go
in docs/FINAL_GATE.md; fixes for real mismatches are separate commits.
Gate passed (clean install, audit 0, all suites, production healthy with 19 migrations).
Parity gaps found (owner to choose): auto-assign variants; match with differing amount
(tips); Age of Money; bulk approve; category notes/hide/reorder/flags. Deliberate
differences documented. Guide proposal in docs/FINAL_GATE.md section 5 (build LAST).

## YNAB alignment — IN PROGRESS (owner /goal, 2026-09-25)

Owner: make the four "different on purpose" behaviours work like YNAB, and implement the
top four gaps. Plan and status: docs/YNAB_ALIGNMENT.md (A1-A4, B1-B4). Order: A1+B4, A2+B2,
A3, A4, B1, B3. Each item: tests, docs status update, its own commit.
A1 + B4: VERIFIED, committed (check 202, integration 98, e2e 68, backup 35, contrast 0).
Current: A2 + B2 (automatic matching; match with a different amount) — IN PROGRESS.
