# Development handoff — Phase 4 schedule review and recurring suggestions

## Active objective and deployment state

Finish the complete application through Phase 8; the persistent goal remains active.
Do not call the site complete based on tests for an implemented subset. No current blocker.

Baseline for this increment: `7849892`, clean on recovery. Earlier financial review fixes
are `af07656` / `2183487`. Previous deployment notes report 0.3.5 on 192.168.1.7 with
owner-authorized demo data and the former PNC connection removed by seeding. This turn did
not inspect or modify production, call providers, build images or deploy. Never reset/reseed
production. Reconnect PNC only when the owner wants real data again.

## Implemented and verified

- Schedule creation, date-range upcoming view, approve/skip, archive/restore.
- Future edits create a linked successor, retain prior splits/history, and reject stale
  revisions or changes across handled dates. Replaced versions cannot be restored.
- Explicit matching to a same-account/type/amount existing transaction within seven days
  writes an occurrence link only. Destination must match for transfers. One transaction
  cannot handle two occurrences; matching preserves the owner's payee/categories.
- Archived schedules retain handled history. Corrected/voided linked entries are flagged
  without reopening an occurrence. Query bounds are one year, 2,000 occurrences and 500
  candidate transactions; candidate truncation is disclosed.
- Recurring suggestions now appear with evidence and editable defaults. At least three
  records, date tolerance two days, amount tolerance 20%; exact/approximate labels. Owner
  acceptance creates only a schedule. Existing active payee/account schedules suppress
  repeat suggestions. No auto-posting or auto-acceptance.
- Pure rule previews: original-input matching, stable priority/ID ordering, per-field first
  writer, locked owner fields preserved, explanations, transfer suggestion only. This is
  NOT yet saved rules or an application UI.

## Schema and verification

13 migrations through `202609240002_schedule_revisions`; additive schedule revision/link
metadata and occurrence transaction uniqueness. Readiness updated. No ledger migration.

- `npm run check`: lint/typecheck and 164 unit/property tests passed.
- `npm run test:integration`: 68 PostgreSQL tests passed.
- `APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`: passed.
- `APP_BASE_PATH=/mynab npm run test:e2e`: 42 desktop/mobile Chromium tests passed.
- `PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup`: 29 tables identical.
- Fresh `mynab_schedule_revisions_empty_test`: 13 migrations, 35 composite ownership FKs.
  Schema-only synthetic DB retained; no existing database reset.
- Logs: `/tmp/mynab-automation-check.log` and `/tmp/mynab-revision-{integration,build,e2e,backup}.log`.

## Next executable batch

1. Persist automation rules with composite account/category ownership, revisions, authorized
   audited CRUD, validation and explicit previews. Add rule builder/order/enable controls.
   Connect preview/application to manual/import review without silently changing accepted
   transactions or locked fields. Actions: rename payee, category, memo/tag, suggest transfer.
   Transfers still require two sides and owner confirmation. Rule suggestions from repeated
   category choices must remain opt-in. Domain semantics are in `src/domain/rules.ts`.
2. Finish Phase 4 operational gaps: timezone eligibility tests (approval currently uses the
   budget timezone even though schedule timezone is stored), visible overdue summaries,
   recurring suggestion dismissal/history and duplicate-warning acknowledgment as needed.
   Durable job work belongs in a separate worker, not request-scoped fire-and-forget work.
3. Close remaining debt contract gaps: future minimum terms, percentage minimum formulas,
   affordability cap and statement balances. Current simulator varies APR but uses starting
   minimum amounts throughout.

## Preserve the remaining full roadmap

- Phase 5: provider-neutral durable staging, retry/backoff, health, Plaid update-mode/OAuth,
  Sandbox verification, worker lifecycle. Preserve cursor fencing and explicit corrections.
- Phase 6: shared report semantics, filters/comparisons and drilldown for spending, income/
  expenses, cash flow, net worth, savings, debt, accounts, categories and goals.
- Phase 7: CSV mapping/preview/dry-run/idempotency/undo; safe QFX/OFX; complete versioned JSON
  and CSV exports; restoration/backup UX, off-host resilience verification.
- Phase 8: mobile/accessibility, pagination/indexed matching/performance, notifications,
  advanced reports and isolated 1/3/6/12-month forecast scenarios.
- Final release: audit every spec requirement, clean install/full tests/build/dependency
  audit, fresh migrations, real Linux container health/persistence/backup tests, new tagged
  images and Portainer upgrade. Do not overwrite deployed 0.3.5 tags or claim deployment.

## Relevant modules and remaining limitations

`src/application/finance.ts` owns schedule mutations/ledger approval. `schedules.ts` reads
upcoming/history/candidates. `src/components/schedule-fields.tsx` shares editable defaults.
`src/app/(protected)/accounts/schedules/page.tsx` includes recurring evidence/review.
`src/domain/schedules.ts`, `recurring.ts`, `rules.ts` are framework-independent.
Integration/browser coverage is in finance tests; pure automation tests in automation.test.ts.
Read docs/PHASE2_ACCOUNTING.md and docs/PHASE5_INGESTION.md before changing their contracts.

Finance page still loads full history; recurring detection has per-group limits and silently
omits groups above 1,000 rows. Broader pagination/query optimization remains Phase 8 work.
Manual schedule approval can still intentionally post despite a possible matching candidate;
the page presents matching as a separate explicit choice. Rules are not applied anywhere yet.
Safari/Firefox, screen readers and a real PNC transaction sign remain unverified.

## Development and operations

Read AGENTS.md, ai/PROJECT.md, ai/HANDOFF.md, then `sh ai/checkpoint.sh recover`.
Node PATH: `~/.local/share/mynab-toolchain/node-v24.21.0-darwin-arm64/bin`.
PostgreSQL 17: `/opt/homebrew/opt/postgresql@17/bin`; loopback cluster on 55432. Tests use
`.env.test` and a `_test` database. Never print `.env` or `.local/portainer-mynab.env`.
New migrations require a new application image; do not run old 0.3.5 against the new schema.
Remote release builds use the existing capped builder on 192.168.1.7. Never prune shared
images or volumes. Take a backup and preserve encryption keys before a release; paste the
whole Portainer stack YAML with re-pull disabled for host-local images.
