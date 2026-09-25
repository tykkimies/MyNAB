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
A2 + B2: VERIFIED, committed (check 202, integration 101, e2e 68). Migration 20.
Current: A3 (worker enters scheduled transactions on their date, unapproved) — IN PROGRESS.

## Codex continuation — A3 review (2026-09-24 local clock)

Request: review Claude's Phase 8 and YNAB alignment work, then continue the next item. Recovery found HEAD 293333e with four uncommitted A3 files; treat them as unverified and preserve them. Acceptance for this batch: scheduled entries post once on their due date via worker, remain unapproved until confirmed or matched, can be rejected with audited reversal, UI exposes status/actions, tests and docs record actual results. First step IN PROGRESS: inspect and repair interrupted A3 in `src/application/{finance,jobs,schedules}.ts`, `prisma/migrations`, schedule UI, and focused integration coverage. Avoid editing the already committed alignment migration; use a new migration for new constraints. No production deployment or mutation.

A3 update: IMPLEMENTED and locally VERIFIED. Moved new checks into migration
202609250006_scheduled_entry, added schedule UI confirmation/removal and bank-match
approval, kept older unapproved entries visible. Commands passed: test DB `prisma
migrate deploy`; `npm run check` (202); `npm run test:integration` (104);
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`;
`APP_BASE_PATH=/mynab npm run test:e2e` (70); `PG_BIN=/opt/homebrew/opt/postgresql@17/bin
npm run test:backup` (35 tables). Earlier simultaneous integration/e2e caused a synthetic
owner collision; sequential reruns passed. No production mutation or image build.
Fresh empty DB migration and worker enqueue/claim test passed. Next: commit A3,
then A4 editing/delete/undo. Keep the old committed alignment migration byte-for-byte.

## A4 register editing — IN PROGRESS (after e3fac62)

Request continues YNAB alignment. Acceptance: owner-facing Edit/Delete/Undo on the account register, one visible current version, immutable audited postings retained, explicit confirmation for reconciled history, idempotent authorized commands and integration/browser coverage. First step: inspect current correction and void paths in `src/application/finance.ts`, `src/components/finance-fields.tsx`, and `src/app/(protected)/accounts/[id]/page.tsx`; then design the smallest safe command/UI change. No release or production mutation.

A4 batch 1 IN PROGRESS: implement `transaction.undo` in `src/application/finance.ts` by restoring the prior version through the existing transaction.create validation/journal path, with a narrowly scoped exception for an already-voided deletion; change register labels and hide correction history in `src/app/(protected)/accounts/[id]/page.tsx` and `src/components/finance-fields.tsx`; add integration coverage. Keep prior versions in storage/export. Check linked imports and reconciliations before finalizing.

A4 batch 1 IMPLEMENTED, unverified beyond one focused integration run: `transaction.undo` reconstructs the prior row using the same finance command and journal path; the register shows Edit/Delete/Undo and hides lineage. Focused finance integration passed 42 tests before the reconciliation acknowledgment check and browser test update. New risk to resolve before marking VERIFIED: opening-balance transactions use kind OPENING, which the generic editor/undo cannot reconstruct. Validate and narrow UI or implement a safe opening-balance path. Run full gates sequentially; production untouched.

A4 batch 1 update: ordinary transaction edit/delete/undo implemented; integration 105,
check 202, build and desktop browser 35 passed. `OPENING` is excluded until dedicated
editing is designed. Final reconciliation assertion was added to finance integration and
focused rerun is pending after mobile browser completes. A4 remains PARTIAL. Update
NEXT_STEPS/DEVELOPMENT_LOG with exact final results, then checkpoint and commit a bounded
partial A4 milestone or continue the opening-balance path. No production mutation.

A4 batch 2 IN PROGRESS: implement guarded editing/undo for opening balances in `src/application/finance.ts`, `src/components/finance-fields.tsx`, account register UI, and integration tests. Permit OPENING only when replacing the same account's existing opening transaction (or undoing a prior edit/delete), so no new budgetable opening can be forged. Then rerun gates and update A4 status. Production untouched.

A4 batch 2 VERIFIED: opening-balance Edit/Delete/Undo with a guard against creating
extra OPENING entries. Focused finance integration 43, full integration 106, check 202,
production build, browser 36 desktop + 36 mobile (axe 0), backup/restore 35 tables passed.
No schema change or production mutation. A4 ready to commit after final diff review; B1
Auto-Assign variants is next, then B3 Age of Money and the guide last.

## B1 Auto-Assign variants — IN PROGRESS (after 25ec289)

Request continues YNAB alignment. Acceptance: implement documented variants across every category or one category row, derived from actual historical assignments/spending and current target needs, with exact cents, idempotency and ledger conservation; add tests and UI. First step: inspect `target.fund` and Budget assignment controls, record a pure calculation contract before editing code. Preserve A4 and current visual design. No release or production mutation.

B1 research step VERIFIED (read-only): existing `target.fund` in finance.ts plans
underfunded targets from `projectBudget`, while the Budget page offers only that bulk
action and per-row manual assignment. Next executable B1 step is a pure domain helper for
history and reset variants; no B1 app code edited. A3/A4 are committed, HEAD 25ec289 before
this handoff-doc commit, but not deployed. Do not infer Portainer version from HEAD.

## Release image build request — IN PROGRESS (2026-09-25)

Owner explicitly requested new Docker images for the Linux/Portainer host. Acceptance: assign a new immutable version after 0.3.10, update package/lockfile and the full Portainer stack image references, keep docs honest about which features are included, run local release gates appropriate to these release-only edits, commit the reviewable release tree, then run `npm run release` to build `mynab` and `mynab-tools` on 192.168.1.7. Do not deploy, update Portainer, or mutate production data. First batch IN PROGRESS: inspect version references and host capacity, then edit package version, stack tags, release notes and deployment docs. Preserve all credentials.

Release 0.3.11 batch 1 IMPLEMENTED: package/lockfile version, four stack image references,
root README, Portainer guide, PROJECT_SPEC, NEXT_STEPS and DEVELOPMENT_LOG updated.
Host read-only check: 76 GB free; running app/worker/db healthy on 0.3.10. Next: run
release-only local validation, commit reviewable tree, `npm run release` on Linux host,
inspect both resulting tags. No Portainer update or production mutation.

Release 0.3.11 batch 1 VERIFIED locally: `npm run check` passed (202 unit/property),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build` passed,
`git diff --check` passed. Only version, stack and documentation changed since the
A3/A4 full gates recorded above; no new application behavior. Next: commit release tree,
then build both tags remotely with capped builder. Production still 0.3.10.

Release 0.3.11 image build VERIFIED: `npm run release` exited 0 from commit
e86648b414f2303f0a588565763eca08fd6f8aa2. On 192.168.1.7 it built
mynab:0.3.11 (f9d87b5e64ca, 287 MB) and mynab-tools:0.3.11 (557f89139c67,
1.46 GB). Runner has APP_BASE_PATH=/mynab and user=node. Host has 72 GB free after
build; old 0.3.10 images remain. Running stack was not touched. Next batch IN PROGRESS:
read-only verify both image configurations and live container tags, then update
NEXT_STEPS/DEVELOPMENT_LOG/PROJECT_SPEC with actual build evidence and commit docs.

Release 0.3.11 final host verification VERIFIED: read-only SSH confirmed SOURCE_COMMIT
matches e86648b414f2303f0a588565763eca08fd6f8aa2, both image tags are amd64,
user=node, APP_BASE_PATH=/mynab; running app/worker remain healthy on 0.3.10. Docs
updated with actual results. Next: commit documentation, then user may paste the full
0.3.11 stack into Portainer with re-pull disabled. No production migration/deployment yet.

## YNAB feature parity continuation — IN PROGRESS (2026-09-25)

Owner requests sustained work toward full YNAB experience and asks whether debt payoff
simulation exists. Read-only review confirms MyNAB has `simulatePayoff` and a Debt page with
strategy comparison, effective-dated rates/minimums and payoff/interest outputs. YNAB also
has a loan payoff simulator; do not claim simulation as absent or uniquely MyNAB.
Acceptance for the current batch: implement B1 Auto-Assign history/reset variants with exact
cents, explicit preview, authorized idempotent application, domain/integration/UI coverage;
then B3 Age of Money and the remaining parity audit. First step IN PROGRESS: add a pure
Auto-Assign planner in `src/domain/auto-assign.ts` and focused unit tests. Next wire
`src/application/finance.ts` and Budget UI. Keep production untouched; preserve 0.3.11 tags
until a new release is built and verified. Current worktree recovered clean at ec79b81.

B1 domain batch VERIFIED: `src/domain/auto-assign.ts` provides a pure, non-mutating
preview for seven history/reset modes, with projection-derived before/after Ready to Assign
and exact-cent deltas; `tests/unit/auto-assign.test.ts` covers 13 cases. Command
`PATH="$HOME/.local/share/mynab-toolchain/node-v24.21.0-darwin-arm64/bin:$PATH" npm test -- tests/unit/auto-assign.test.ts`
passed (13 tests). Next batch IN PROGRESS: wire `src/application/finance.ts` and
`src/app/(protected)/budget/page.tsx` (and a small client preview control if needed),
add integration/browser coverage. This domain batch has not yet run full check.

B1 application/UI batch IMPLEMENTED: authorized `getAutoAssignPreview`, stale-preview
fingerprint, idempotent `auto.assign` command, and a Budget-page GET preview with per-row
entry points. Focused integration command
`PATH="$HOME/.local/share/mynab-toolchain/node-v24.21.0-darwin-arm64/bin:$PATH" npm run test:integration -- tests/integration/finance.test.ts`
passed (45); `npm run check` passed (215 unit) before the last base-path/invalid-category
UI fix. Next: run full check/build/browser gates, examine semantics and update docs.

B1 VERIFIED locally, unreleased: `npm run check` passed (216 unit/property),
`npm run test:integration` passed (108),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build` passed,
`APP_BASE_PATH=/mynab npm run test:e2e` passed (74 desktop/mobile, axe 0), and
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` passed (35 tables).
All commands used pinned Node 24 PATH. No production mutation or new image build.
Next step PLANNED: B3 Age of Money, then a broader parity inventory because owner
expanded scope to full user-visible YNAB parity (including prior deliberate limits).

B1 committed as `15857e8` after local verification. B3 batch IN PROGRESS: implement
FIFO cash-lot age in `src/domain/age-of-money.ts` with pure tests, then expose through
`src/application/finance.ts`, Budget and Reports UI with integration/browser coverage.
YNAB's current support guide defines the last ten cash outflow transactions, including
card payments; starting balances/transfers are not outflow samples. Resolve inflow
lot and rounding details transparently in the spec. No production mutation.

B3 domain/application/UI batch IMPLEMENTED: `src/domain/age-of-money.ts` computes
FIFO cash-lot age across budget cash accounts, counts cash expenses and card payments,
excludes internal cash transfers and card purchases until payment. `getFinance` and
`getReports` expose the same reading on Budget and Reports. `npm run check` passed
(221 unit/property); focused finance integration passed (46), including a ten-outflow
card payment scenario. Next: browser coverage, full gates and docs; algorithm parity
details remain to be documented. No image build or production mutation.

B3 VERIFIED locally, unreleased: `npm run check` passed (221 unit/property),
`npm run test:integration` passed (109),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build` passed,
`APP_BASE_PATH=/mynab npm run test:e2e` passed (76 desktop/mobile, axe 0),
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` passed (35 tables).
All used pinned Node 24. No image build or production mutation. Next: broader
YNAB parity inventory and debt payoff-date solver gap; document the exact
source/behavior comparison before code.

Debt simulator parity batch IN PROGRESS: YNAB's official loan planner also lets
the owner choose a payoff date and computes the monthly payment (source in
`docs/YNAB_PARITY.md` forthcoming). MyNAB currently shows payoff date for a
monthly amount and tests lump sums, but has no inverse payoff-date solver.
Add a pure solver to `src/domain/debt.ts`, expose a payoff-month control on
`src/app/(protected)/debt/page.tsx` via `src/application/finance-page.ts`, and
cover exact-cent/interest/promotional-rate behavior in tests. No ledger write.

Debt payoff-date solver IMPLEMENTED: `monthlyBudgetForPayoffDate` binary-searches
the least whole-cent monthly budget that pays every debt by the requested month,
using existing dated APR/minimum/lump-sum simulation. Debt page has an optional
payoff-month field and a read-only estimate. Focused domain unit (22) and
desktop browser scenario passed. An initial browser test used the wrong existing
account-type label (`Loan` vs `Installment loan`); corrected test passed. Full
gates and final docs remain. No image build or production mutation.

Combined B3 + debt solver VERIFIED locally: `npm run check` passed (224
unit/property), `npm run test:integration` passed (109),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build` passed,
`APP_BASE_PATH=/mynab npm run test:e2e` passed (78 desktop/mobile, axe 0),
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` passed (35
tables). `docs/YNAB_PARITY.md` now records the broader feature inventory and
source links. Next executable work: commit this milestone, then implement
current-month target snooze. No Docker build or production mutation.

B3 and payoff-date simulator committed as `d7f04aa`. Target snooze batch
IN PROGRESS: add a budget/category/month scoped record via a new migration and
Prisma model, authorized `target.snooze` command, derived underfunded exclusion
while preserving target progress, and Goal/Budget page controls. Only the
current budget month may be snoozed, and card payment targets remain ineligible.
First step: inspect current target storage/summary flows before editing schema.

Target snooze IMPLEMENTED: migration `202609250007_target_snooze` and Prisma model
with composite budget/category FK; readiness list updated. Authorized
`target.snooze` toggles only current-month non-card targets, `getFinance`
retains underlying progress but excludes snoozed contribution, and
`target.fund` skips it. Goals/ Budget pages show snoozed state and Goals offers
Snooze/Resume. Test DB `node --env-file=.env.test node_modules/prisma/build/index.js migrate deploy`
passed (22 migrations). `npm run check` passed (224), focused finance integration
passed (47), `/mynab` build passed, targeted desktop browser workflow passed
(4 tests). Full integration/browser/backup gates and docs still pending.

Target snooze VERIFIED locally, unreleased: `npm run check` passed (224),
`npm run test:integration` passed (110),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build` passed,
`APP_BASE_PATH=/mynab npm run test:e2e` passed (78 desktop/mobile, axe 0),
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` passed (36
tables). Upgraded test DB and fresh temporary DB both accepted all 22 migrations;
fresh DB has the target ownership FK. Docs updated; next: commit the milestone,
then category organization per `docs/YNAB_PARITY.md`. No image build or
production migration.

Target snooze committed as `320c80a`. Category organization batch IN PROGRESS:
add category notes, a separate hidden state that retains funds and
history, and stable manual ordering. Expected files: `prisma/schema.prisma`,
new migration, `src/application/finance.ts`, Budget page, integration/browser
tests, readiness list, docs. First step: inspect current category/group create,
update and load order; then migrate non-destructively. Do not conflate hidden
with archived. Expose any funds in hidden categories as an aggregate so owners
do not lose sight of them. No production mutation.

Category organization VERIFIED locally, unreleased: migration 23 adds category
notes and group/category hidden and sort fields. Reordering and hiding are
authorized and audited; hidden money stays in the budget and is summarized.
`npm run check` passed (224), `npm run test:integration` passed (111),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build` passed,
`APP_BASE_PATH=/mynab npm run test:e2e` passed (80 desktop/mobile, axe 0),
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` passed (36
tables), all with pinned Node 24. The upgraded test DB accepted migration 23;
fresh DB and Docker checks remain pending. An initial mobile browser test had a
Playwright nested-disclosure click hit-testing failure; direct mobile touch
passed. Next: commit this batch, then implement saved focused views and
continue parity audit. Production remains on 0.3.10; 0.3.11 images are built
but contain none of the post-release parity additions.

Focused Views batch IN PROGRESS (2026-09-25): implement YNAB-like preset
Underfunded, Overfunded, Snoozed, Overspent, Money Available views plus up to
12 budget-scoped custom category sets, edit/delete/reorder, and budget-only
filtering without changing balances or reports. Hidden categories stay out of
all views. The selected view should persist per browser; bulk Underfunded must
honor the selected view. First step: add persistence and pure filtering helper,
then command/query/UI and integration/browser coverage. Expected files:
`prisma/schema.prisma`, migration 24, `src/domain/focused-views.ts`,
`src/application/finance.ts`, Budget page, a small client selector,
`src/components/finance-form.tsx`, tests, readiness and continuity docs.
Current HEAD d1e983c is clean; no production mutation or image build.

Focused Views: Claude resumed (2026-09-25) after Codex cutoff. Recovery shows schema,
migration 202609250009_focused_views, `src/domain/focused-views.ts` + unit test,
`view.save/delete/reorder` and view-scoped `target.fund` in `src/application/finance.ts`,
Budget page tabs/manage panel and `src/components/focused-view-tabs.tsx` all written but
UNVERIFIED (no test run recorded). Step IN PROGRESS: review for correctness, wire the bulk
Underfunded button to the selected view, add integration/browser coverage, run gates.

Focused Views VERIFIED locally, unreleased (Claude, 2026-09-25). Review fixes: reverted an
unrequested global `target.fund` change (it funded overspending on every call, disagreeing
with the "Targets need" amount); the bulk button now passes the selected view and shows the
view's own need; e2e reset list now truncates FocusedView/FocusedViewCategory. Added
integration test (save/rename/duplicate refusal/reorder/view-scoped fund/hidden/delete) and
desktop+mobile browser test. Commands (pinned Node 24): `npm run check` passed (226),
`npm run test:integration` passed (112), `APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`
passed, `APP_BASE_PATH=/mynab npm run test:e2e` passed (82, axe 0),
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` passed (38 tables).
Fresh temp DB accepted 24 migrations; 44 two-column FKs incl. both FocusedViewCategory FKs.
No image build or production mutation.
Next PLANNED: Money Moves / recent-moves explainability UI per `docs/YNAB_PARITY.md`.

## Money Moves — IN PROGRESS (Claude, 2026-09-25, after a46e5a0)

Owner /goal: continue until full YNAB parity; Codex alternates on the same goal. Acceptance:
month-scoped list of plan money moves (assign from/to Ready to Assign, category-to-category
moves, Auto-Assign and target-fund batches grouped as one move) with when/who/source/
destination, filter to one category, no ledger change. Plan: migration 25 adds nullable
`origin` and `actorId` to BudgetAssignment (history inferred: moveId → MOVE, else ASSIGN);
batch commands share a moveId; pure `src/domain/money-moves.ts` grouping + unit tests;
`getFinance` exposes moves; Budget page panel with `?moves=<categoryId>` filter; integration +
browser coverage. Step IN PROGRESS: schema/migration + domain helper.

Money Moves VERIFIED locally, unreleased: migration `202609250010_money_moves` (origin +
actorId on BudgetAssignment, SET NULL actor FK, origin CHECK), `src/domain/money-moves.ts`
+ unit test, assign/move/auto.assign/target.fund tag origin/actor and share a batch moveId,
`getFinance().moves`, Budget "Money moves" panel with `?moves=<categoryId>`. Commands (pinned
Node 24): `npm run check` passed (228), `npm run test:integration` passed (113), `/mynab`
build passed, `APP_BASE_PATH=/mynab npm run test:e2e` passed (84, axe 0),
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` passed (38 tables).
Next PLANNED: Hide Amounts / privacy, then reports parity, Fresh Start, multiple plans.

## Hide Amounts — IN PROGRESS (Claude, 2026-09-25, after 76d37fb)
Acceptance: a per-device toggle in the app shell masks every money figure (blur, with
screen-reader text preserved), persists across reloads, no server state. Step IN PROGRESS:
find theme toggle + amount markup; expected files: layout/shell component, globals.css,
a small client toggle, e2e test.
Hide Amounts VERIFIED locally, unreleased: `src/components/amount.tsx` (Amount/MaybeAmount),
money JSX across pages wrapped, `src/components/hide-amounts-toggle.tsx` in the app header,
`mynab-hide-amounts` cookie → `<html data-hide-amounts>`, blur rule in globals.css utilities
layer. `npm run check` passed (228), `/mynab` build passed, `APP_BASE_PATH=/mynab npm run
test:e2e` passed (86, axe 0), backup passed (38 tables). New money JSX must use <Amount>.
Next PLANNED: reports parity (Spending Breakdown filters), then Fresh Start, multiple plans.

## Reports parity — IN PROGRESS (Claude, 2026-09-25, after 8cbcd64)
Acceptance (YNAB Reflect): (1) account and category multi-select filters applied to every
flow report (category filter narrows spending lines only; net worth/balances narrow by
account); (2) spending by category group with drill to categories; (3) Income v Expense
table: income by payee, expenses by group/category, one column per month plus total and
monthly average. Pure functions in `src/domain/reports.ts` with unit tests first, then
`src/application/reports.ts`, `src/app/(protected)/reports/page.tsx`, integration/e2e.
Step IN PROGRESS: domain filter + byGroup + incomeExpense.
Reports parity VERIFIED locally, unreleased: `ReportFilter`/`filtered`, `byGroup`,
`incomeExpense` in `src/domain/reports.ts` (+ `tests/unit/reports-reflect.test.ts`);
`getReports` accepts `accounts[]`/`categories[]`; Reports page filter disclosures, Spending
by group (links narrow to the group's categories), Income v Expense table (focusable scroll
region for axe). `npm run check` passed (232), `npm run test:integration` passed (114),
`/mynab` build passed, `APP_BASE_PATH=/mynab npm run test:e2e` passed (86, axe 0), backup
passed (38 tables). Next PLANNED: Fresh Start (reversible plan reset), then multiple plans.

## Multiple plans — IN PROGRESS (Claude, 2026-09-25, after c02957d)
Acceptance: create, rename and switch between plans (YNAB "plans"); active plan kept in a
`mynab-plan` cookie validated against membership (falls back to the oldest plan); every page
and API route that used `listBudgets(...)[0]` uses the active plan; Plans page + sidebar
indicator; audit via FINANCE_COMMAND details. No schema change needed. Files:
`src/application/plans.ts`, `src/app/api/plans/route.ts`, `src/app/(protected)/plans/page.tsx`,
layout, finance-page.ts, forecast page, export/import/provider routes, tests.
Then Fresh Start builds on this. Step IN PROGRESS: plans.ts + route + replacements.
Multiple plans VERIFIED locally, unreleased: `src/application/plans.ts` (activeBudget,
createPlan, renamePlan, selectPlan), `src/app/api/plans/route.ts` (origin-checked form POST,
sets httpOnly `mynab-plan`), `/plans` page, sidebar + mobile "Switch plan" link,
`openBudget()` in finance-page.ts replaces every `listBudgets()[0]`. Tests/scripts that used
unordered `budget.findFirstOrThrow()` now order by createdAt (a second plan broke one e2e).
`npm run check` passed (232), `npm run test:integration` passed (115), `/mynab` build
passed, `APP_BASE_PATH=/mynab npm run test:e2e` passed (88, axe 0 incl. /plans), backup passed.
Next PLANNED: Fresh Start (new plan copying groups/categories/targets and accounts at current
balances; old plan kept and renamed "(Archived …)"; provider links stay with old plan).

## Fresh Start — IN PROGRESS (Claude, 2026-09-25, after 3105811)
Acceptance (YNAB Fresh Start): new plan with the same open accounts (current balance as an
opening balance dated today), groups/categories (notes, hidden, order), targets and debt
terms (in-force + future versions from this month), active schedules (+ consumed
occurrences from today skipped, so nothing posts twice), focused views; old plan untouched
until the end, then renamed "<name> (Archived YYYY-MM-DD)"; new plan takes the name and
opens. Built by replaying finance commands (journal-correct); items that cannot carry over
are recorded as warnings in the audit event and shown on /plans. Linked-bank connections stay
with the old plan. Files: `src/application/fresh-start.ts`, plans route/page, tests.
Fresh Start VERIFIED locally, unreleased: `src/application/fresh-start.ts`; `/api/plans`
intent `fresh-start` (requires confirm checkbox) opens the new plan and shows warnings from
the `plan.fresh-start` audit event on `/plans?fresh=done`. Automation rules are NOT copied.
`npm run check` passed (232), `npm run test:integration` passed (116), `/mynab` build passed,
`APP_BASE_PATH=/mynab npm run test:e2e` passed (90, axe 0), backup passed (38 tables).
Next PLANNED: remaining parity items in docs/YNAB_PARITY.md (targets colors/cadence review,
household sharing, mobile quick entry, onboarding guide).

## Register parity — IN PROGRESS (Claude, 2026-09-25, after 7115887)
Acceptance: YNAB-style colour flags (red/orange/yellow/green/blue/purple) on transactions,
carried across edits, with renameable flag names per plan; an all-accounts register
(`/accounts/register`) with account/category/flag/cleared/date/text filters and paging; bulk
flag and bulk categorize (single-category expense/refund only; reconciled rows skipped and
reported). Migration 26 adds `TransactionPreference.flag` + `FlagName`. Step IN PROGRESS:
migration + `transaction.flag`/`flag.rename` commands.
Register parity VERIFIED locally, unreleased: migration `202609250011_transaction_flags`
(TransactionPreference.flag + FlagName), `src/domain/flags.ts`, `transaction.flag` and
`flag.rename` commands, flags carried in edits and ingestion replacements, `load()` exposes
`flags`/`flagNames`; `src/application/register.ts` bulk categorize (derived per-row keys; the
finance API route dispatches `transaction.categorize`); `/accounts/register` page +
`src/components/register-bulk.tsx`; per-row flag in account register. `npm run check`
passed (232), `npm run test:integration` passed (117), `/mynab` build passed,
`APP_BASE_PATH=/mynab npm run test:e2e` passed (92, axe 0), backup passed.
Next PLANNED: household sharing (members/roles) or onboarding guide; see docs/YNAB_PARITY.md.

## Household sharing — IN PROGRESS (Claude, 2026-09-25, after 48dd4a3)
Acceptance (YNAB Together): installation owner adds people (own username/passphrase, own
personal plan; max 6 people) and can reset their passphrase; a plan owner shares/unshares a
plan with a person (role "member": full budgeting; rename/share/Fresh Start stay owner-only);
anyone changes their own passphrase (signs out their sessions). Migration 27 adds AuditAction
values USER_CREATED, MEMBERSHIP_CHANGED, PASSWORD_CHANGED. Files: `src/application/household.ts`,
`src/app/api/household/route.ts`, `src/app/(protected)/household/page.tsx`, tests.
Household sharing VERIFIED locally, unreleased: migrations `202609250012_household` (audit
enum values) and `202609250013_member_role` (foundation CHECK allowed only 'owner'; now
owner|member); `src/application/household.ts`, `/api/household`, `/household` page, Plans
page link. e2e owner lookups now filter username "owner". `npm run check` passed (232),
`npm run test:integration` passed (120), `/mynab` build passed,
`APP_BASE_PATH=/mynab npm run test:e2e` passed (94, axe 0), backup passed.
Next PLANNED: onboarding guide (Setup and learning), then pinned categories/home priorities.

## Setup and learning — IN PROGRESS (Claude, 2026-09-25, after a3d803f)
Per docs/FINAL_GATE.md §5: (1) Budget-page getting-started checklist derived from the ledger
(categories, accounts, first transaction, target, Ready to Assign at zero), dismissible by
cookie; (2) `/guide` page in MyNAB's own words (principles, routine, task topics); (3)
"What is this?" links from key concepts. Files: `src/domain/setup.ts` (+unit test),
`src/app/(protected)/guide/page.tsx`, budget page, layout link, e2e/a11y.
Setup and learning VERIFIED locally, unreleased: `src/domain/setup.ts` (+unit test),
`src/components/dismiss-setup.tsx` (cookie `mynab-setup-hidden=<budgetId>`), Budget-page
checklist and RTA help link, `/guide` page, sidebar Household/Guide links. `npm run check`
passed (235), `/mynab` build passed, `APP_BASE_PATH=/mynab npm run test:e2e` passed (96,
axe 0), backup passed. Integration unaffected (no server changes beyond pages).
Next PLANNED: re-audit docs/YNAB_PARITY.md partial rows (targets, debt loan pairing, mobile
quick entry, currency) and pick the next concrete gap.

## Quick add (mobile entry) — IN PROGRESS (Claude, 2026-09-25, after 6a57ef9)
Acceptance: `/add` page for fast entry (account, outflow/inflow, amount, payee with
suggestions, category pre-filled from payee memory via `suggestCategory`, date defaults to
today, memo, cleared) posting ordinary `transaction.create`; form clears after save; linked
from Budget/Accounts and the mobile header. Files: `src/components/quick-add.tsx`,
`src/app/(protected)/add/page.tsx`, `finance-form.tsx` (onSaved), e2e.
Quick add VERIFIED locally, unreleased: `src/components/quick-add.tsx`, `/add` page (payee
memory via `suggestCategory`), header + link, `FinanceForm` `onSaved`. The e2e test sits at
the END of finance.spec.ts because it changes Checking's balance (serial ledger chain).
`npm run check` passed (235), `/mynab` build passed, `APP_BASE_PATH=/mynab npm run test:e2e`
passed (98, axe 0), backup passed.
Next PLANNED: installable web-app manifest; then loan accounts parity review.
Installable web app VERIFIED locally, unreleased: `src/app/manifest.ts`, `src/app/icon.tsx`
(192/512 via next/og), `src/app/apple-icon.tsx`; foundation e2e checks manifest + icons.
`npm run check` passed (235), `/mynab` build passed, e2e passed (100, axe 0), backup passed.
Next PLANNED: loan accounts parity review (YNAB loans are budget accounts with payment
categories; MyNAB forces tracking) — assess before changing accounting.

## Budget conveniences — IN PROGRESS (Claude, 2026-09-25, after 7d80514)
Acceptance: (1) `move.undo {moveId}` appends reversing assignment rows (origin UNDO,
`undoOf` = original group key), validated like assign (future-rollover rule), refused twice;
Money moves shows Undo buttons and marks undone moves; (2) Budget activity figure links to
`/accounts/register?category=…&from=…&through=…`; (3) overspent rows get a Cover control
(move from a chosen category). Migration 28 extends BudgetAssignment origin CHECK and adds
`undoOf`. Files: migration, schema, finance.ts, money-moves.ts (+test), budget page, tests.
Budget conveniences VERIFIED locally, unreleased: migration `202609250014_undo_moves`
(`undoOf`, origin UNDO, paired CHECK), `move.undo` shares the assign/move branch (same
future-rollover validation), money-moves domain `undone`/`undoOf`, Budget activity links,
Cover control, Undo buttons. `npm run check` passed (236), `npm run test:integration`
passed (121), `/mynab` build passed, e2e passed (102, axe 0), backup passed.
Next PLANNED: payee management (rename/combine payees) page.

## Payee management — IN PROGRESS (Claude, 2026-09-25, after ac646fb)
Acceptance: `/accounts/payees` lists payees (case-insensitive) with count, last used and
remembered category; rename/combine selected payees into one name via journaled per-row
edits (reconciled rows skipped and counted; idempotent retry), optionally saving EXACT
rename rules for future imports. Files: `src/application/register.ts` (renamePayees),
finance API dispatch, page, tests.
Payee management VERIFIED locally, unreleased: `renamePayees` in `src/application/register.ts`
(finance API dispatches `payee.rename`), `/accounts/payees` page, Accounts link, FinanceForm
collects `from[]`/`rule`. `npm run check` passed (236), `npm run test:integration` passed
(122), `/mynab` build passed, e2e passed (104, axe 0), backup passed.
Next PLANNED: re-audit remaining YNAB gaps (plan currency/date format settings; target
cadence review; loan planner per-account extra payment view).

## Loan Planner per account — IN PROGRESS (Claude, 2026-09-25, after 78ddd61)
Acceptance (YNAB Loan Planner): on a debt account's page with terms, a GET form (extra
monthly, one-time amount + month) shows payoff month at minimums vs with the scenario,
months saved and interest saved, from `simulatePayoff` on that single debt using the same
versioned terms as the Debt page. No ledger write. Files: `src/application/finance-page.ts`
(`loanPlan`), `src/app/(protected)/accounts/[id]/page.tsx`, e2e.
Loan Planner VERIFIED locally, unreleased: `loanPlan()` in finance-page.ts (reuses
`debtPage` debts), section on `/accounts/[id]` for debts with terms. `npm run check` passed
(236), `/mynab` build passed, e2e passed (106, axe 0), backup passed.
Next PLANNED: plan settings (date/number format) assessment; targets due-day review.

## Category inspector — IN PROGRESS (Claude, 2026-09-25, after e3fb917)
Acceptance (YNAB inspector): clicking a category name opens `?inspect=<id>` panel at the top
of the Budget right column: available, left over from last month, assigned, cash spending,
credit spending, target summary, note, recent transactions this month, and links (moves,
register, Auto-Assign, Goals). Read-only; no schema change. Files: budget page, e2e.
Category inspector VERIFIED locally, unreleased (Budget `?inspect=<id>`; category names link
to it). Also fixed: Payees page unmounted its form when a search emptied the list, hiding
the rename result (flaky e2e) — form now stays mounted. `npm run check` passed (236),
`/mynab` build passed, e2e passed (108, axe 0), backup passed.
Next PLANNED: final parity sweep of docs/YNAB_PARITY.md; decide currency/date settings.

## Twice-a-month schedules — IN PROGRESS (Claude, 2026-09-25, after 8542ba8)
YNAB semantics (support.ynab.com scheduled-transactions guide): chosen day D and D+15 each
month (capped at month end). Add cadence TWICE_MONTHLY to domain occurrences, zod enums,
any DB CHECK, schedule UI options, unit tests.
Twice-a-month schedules VERIFIED locally, unreleased: migration
`202609250015_twice_monthly` (cadence VARCHAR(16), CHECK adds TWICE_MONTHLY), domain
occurrences (D and D+15, capped at month end, interval = months between pairs), zod enum,
schedule form option and labels. `npm run check` passed (237), `npm run test:integration`
passed (123), `/mynab` build passed, e2e: one run had a single mobile failure in "downloads
a complete export" (390ms, no artifacts); immediate full rerun passed (108, axe 0) — treat
that export test as possibly flaky. Backup passed after the green run.

## Target due day — IN PROGRESS (Claude, 2026-09-25, after b842986)
Optional `dueDay` (1–31, capped at month end; MONTHLY/PERIODIC only) on CategoryTarget via
migration 30; target.set accepts it; Goals form input and display; inspector shows "due on
the Nth"; Fresh Start copies it. No change to funding math.
Target due day VERIFIED locally, unreleased: migration `202609250016_target_due_day`,
`target.set.targetDueDay`, Goals form/display, inspector, Fresh Start copy. `npm run check`
passed (237), `npm run test:integration` passed (124), `/mynab` build passed, e2e passed
(108, axe 0), backup passed.
Remaining gaps (see docs/YNAB_PARITY.md): plan currency/date formatting (USD-only by design
so far), native app/widgets/offline entry, real-bank verification by the owner.
