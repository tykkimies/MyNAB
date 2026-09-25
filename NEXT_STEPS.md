# Development handoff

> **Current work (2026-09-25): YNAB alignment.** The owner wants MyNAB to operate the same
> as YNAB. The work list, behaviours and status live in `docs/YNAB_ALIGNMENT.md` (items
> A1-A4 and B1-B4). Work through it in its stated order; the guide is still the last step.
 — saved rules and design refinement

## Goal and current state

The full goal through Phase 8 remains active. Resume functional work using the owner's new
Warm Editorial Finance design; the old presentation-only restriction no longer applies.
This continuation started from clean `e98f3fa`, after the redesign and 0.3.8 contrast repair.
Prior notes report deployed 0.3.7 and built-but-not-deployed 0.3.8. Production was not queried
or changed in this turn. Do not infer a live version from source tags. New code needs a new
release tag; do not overwrite built/deployed images.

## Owner design feedback and implemented response

Owner dislikes excess color, button text/background clashes, and oversized management rows.
Repeated Assign/Rename buttons are now neutral outlined actions. Forest remains the primary
CTA color; previous independent button/hero contrast pairs stay intact. Category management
uses compact responsive grids. Groups use direct inline name + Rename controls. Empty form
messages no longer reserve space. Mobile controls have 44px minimum heights. Accounts stays
selected on its nested routes. New Rules uses the same type roles, controls and dark tokens.

## Functional progress

- Persisted AutomationRule with name, enabled state, priority and optimistic revision.
- Conditions: account, exact/contains payee, memo text, inclusive signed amount range.
- Proposed actions: payee, category, memo, tags, transfer destination suggestion.
- Authorized/idempotent/audited save/edit through executeFinance. Disabling is an edit;
  conditions/actions must be nonempty, range valid, references owned, tags bounded.
- `/accounts/rules` provides creation/edit/enable/priority controls and hypothetical previews
  using the pure deterministic engine. Source transactions remain unchanged. Multi-split
  categories are protected. Preview description currently uses the ledger memo.
- Explicit reviewed application (VERIFIED): migration 202609240004_transaction_preferences
  persists tags/protected fields/revision per transaction. `transaction.protect` saves field
  protection against a fingerprinted preview; `rule.apply` revalidates the fingerprint and
  becomes a transaction.create reversal/replacement keeping date, amount and cleared state.
  Refuses stale previews, pending bank-change review, transfer suggestions and no-ops;
  reconciled history requires acknowledgment. Manual entries default fully protected,
  unapproved imports unprotected; preferences carry across manual and ingested replacements.
  No automatic categorization.
- Import review (VERIFIED): on Connections, an unapproved outflow's enabled rules pre-fill a
  spendable, unprotected category ahead of payee memory and name the rule; other proposed
  changes link to the Rules preview. Approval remains explicit; nothing is written early.

Schedules/versioning/explicit matching/recurring suggestions from earlier commits remain
implemented. Goals/debt retains the previously documented contract gaps.

## Rule application verification (2026-09-24)

15 migrations; mynab_test has 39 composite ownership FKs. Passed: `npm run check` (164),
`npm run test:integration` (74), the /mynab build, `npm run test:e2e` (46),
`npm run test:backup` (31 tables), screenshots/contrast (0 failures).

## Schema and actual verification (previous batch)

14 migrations through `202609240003_automation_rules`. New rule table adds three composite
ownership FKs without modifying ledger rows. Test database migrated; production untouched.

- `npm run check`: lint/typecheck and 164 unit/property tests passed.
- `npm run test:integration`: 71 PostgreSQL tests passed, including rules ownership, stale
  revisions, idempotency, audit, preview immutability and exact large amounts.
- `APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`: passed.
- `APP_BASE_PATH=/mynab npm run test:e2e`: 44 desktop/mobile tests passed.
- `PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup`: all 30 tables matched,
  with synthetic saved rules present, before the visual harness reseeded the test database.
- Fresh `mynab_rules_empty_test`: 14 migrations, 38 composite ownership FKs. Retained schema-only.
- Visual harness: screenshots inspected for compact management and rule layout; contrast
  checks now assert zero reported failures in both themes. Gradients/unparseable colors are
  excluded, so this is not proof of full WCAG compliance. Final heading type-role adjustment
  passed a fresh build/visual pass.
- Logs `/tmp/mynab-rules-{check,integration,build,e2e,backup,visual}.log`.

## Next executable work

1. (Done, verified) explicit reviewed rule application; see Functional progress.
2. (Done, verified) Phase 4 including the durable worker: PostgreSQL Job table with leases,
   `npm run worker` service in compose/stack, automatic provider sync every
   SYNC_INTERVAL_HOURS, daily maintenance, heartbeat shown on Connections. Suggested-rule
   dismissal is not implemented; suggestions disappear once any rule covers the payee. No request-bound background jobs.
3. (Done, verified 2026-09-24) Phase 3 gaps: effective-dated and percentage minimum rules,
   monthly budget cap with shortfall months, statement balance/date, minimums-only baseline.
4. (Done, verified) Phase 5: worker sync with backoff, REAUTH pause, update-mode sign-in,
   OAuth return page (PLAID_REDIRECT_URI), Sandbox check. Decided against a durable
   ImportBatch table: pages are staged in bounded memory and committed with the cursor, which
   meets the spec; webhooks are unnecessary with periodic worker sync. Unverified: a live OAuth
   institution round trip.
5. (Done, verified) Phase 6: /reports on pure domain/reports.ts: spending by category and
   payee, income vs spending by month, reconciling cash flow, net worth, balances, savings
   rate, previous-period/prior-year comparison, drilldown to lines. Goal progress and debt
   payoff/interest stay on Goals and Debt (linked). Category trend beyond the period chart
   and per-account history charts are Phase 8 "advanced reports".
6. Phase 7: (Done, verified) CSV/OFX/QFX import with mapping, dry run, idempotency and
   batch undo; versioned JSON + formula-safe CSV exports at /accounts/export. Automated backups:
   declined by the owner (2026-09-24).
7. (Done, verified) Phase 8: in-app needs-attention summary (notification channel), 1/3/6/12
   month forecasts, paged/searchable registers, category trends and balance history, axe
   WCAG 2.1 AA audit at zero violations. Manual screen-reader/Safari/Firefox review remains.
9. LAST (owner request 2026-09-24): a comprehensive in-app user guide as part of the site,
   written after Phases 6-8 so it describes the finished app: the monthly routine, bank
   sync and import review, assigning, rules, schedules, goals, debt plans, reports.
8. Final gate: requirement-by-requirement spec audit; clean install, full checks, dependency
   audit, fresh migrations, actual Linux Docker health/persistence/backup tests, new tagged
   images and documented Portainer upgrade. Keep the goal active until all requirements hold.

## Relevant modules

`src/application/finance.ts`: rule/schedule/ledger commands. `src/application/rules.ts`:
authorized previews and reads. `src/domain/rules.ts`: ordering/protected-field semantics.
`src/components/rule-fields.tsx` and `/accounts/rules/page.tsx`: redesigned rule UI.
`src/app/globals.css`: token layers/mobile control sizes; `finance-form.tsx`: quiet inline
buttons; `/budget/page.tsx`: compact manager. Visual tests live under tests/screenshots;
keep the harness now that contrast failures are assertions.

## Known limits and operations

Rules preview lists newest 100 income/expense entries. Registers page 50 at a time with search.
Tags are stored but not yet shown or filterable outside Rules. Financial pages still load full history.
Schedule approval needs the date to have arrived in both the schedule and budget zones; recurring detection omits groups above 1,000 rows.
Manual approvals can intentionally post despite possible matching candidates. Real PNC
sign verification and Safari/Firefox/screen-reader review remain pending.

Read AGENTS.md and ai/PROJECT.md/HANDOFF.md, run `sh ai/checkpoint.sh recover`.
Node PATH: ~/.local/share/mynab-toolchain/node-v24.21.0-darwin-arm64/bin.
PostgreSQL: /opt/homebrew/opt/postgresql@17/bin, local loopback port 55432. Use .env.test;
never print .env or .local/portainer-mynab.env. Never reset/reseed production.
Build on the existing capped Linux builder at release gates, preserve keys, back up first,
and paste the whole Portainer YAML with re-pull disabled. No new image was built this turn.
