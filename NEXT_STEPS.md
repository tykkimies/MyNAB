# Development handoff

## Current phase

Phase 2 manual budgeting is implemented and locally verified. MyNAB is now usable for real
budgeting: accounts, transactions, envelopes, credit-card payment reserves, corrections, and
reconciliation all work end to end. Version 0.2.0. Read PROJECT_SPEC.md and
docs/PHASE2_ACCOUNTING.md before extending the accounting model. Do not jump to Plaid.

## What works

- Local-password owner bootstrap and recovery, Argon2id, hashed opaque sessions, seven-day
  absolute/24-hour idle expiry, logout/reset revocation, DB throttles, and audit events.
- Balanced, append-only double-entry journals with deferred SQL constraint triggers.
  Accepted transactions are immutable; corrections void, append an exact reversing journal,
  and optionally a replacement, retaining reason, actor, timestamp, and lineage.
- Thirteen authorized finance commands behind one `/api/finance` endpoint, each serializing
  on the budget row in a SERIALIZABLE transaction with bounded retry, budget-scoped
  idempotency keys bound to a payload hash, audit rows, and a financial revision counter.
- Deterministic month projection: prior-month rollover, cash vs credit overspending, card
  payment reserves capped at debt with excess released, refunds netted per card and category,
  cash advances as financing rather than income, tracking accounts excluded from the budget,
  and future assignments that reserve only money that already exists.
- Budget page: month navigation, Ready to Assign, assignment and moves, deficit disclosure,
  category and group management. Accounts page and a full per-account register with running
  balances, cleared/uncleared totals, clearing, voiding, correction, and reconciliation.
- PostgreSQL foundation and finance schema with SQL ownership and balance constraints,
  budget membership authorization, exact BIGINT cents/date primitives, AES-GCM provider-secret
  utility, bounded form input, configured-origin CSRF protection, liveness/readiness.
- Docker/Compose/nginx configuration, Portainer stack, and backup/restore scripts.

## Verified on 2026-09-22

| Check                            | Result                                                            |
| -------------------------------- | ----------------------------------------------------------------- |
| Clean `npm ci`                   | Passed; legacy ESLint plugin peer warnings only                   |
| Lint, TypeScript, Prettier       | Passed                                                            |
| Unit/property tests              | 54 passed; includes generated order-independent conservation      |
| PostgreSQL integration           | 21 passed; constraints, idempotency, concurrency, lineage         |
| HTTPS browser tests              | 18 passed: desktop and mobile Chromium                            |
| Visual review                    | Budget and account register, desktop and phone, light theme       |
| Production standalone build      | Passed with `APP_BASE_PATH=/mynab`                                |
| Native PostgreSQL backup/restore | Passed at 0.1.1; re-run against the finance tables before release |
| Dependency audit                 | Zero vulnerabilities at 0.1.1; re-run on release                  |

Browser tests use the actual standalone production artifact behind a local TLS proxy.
Generated screenshots/traces remain in ignored `test-results/`.

## Incomplete / unverified

- Goals, debt payoff planning, reporting, scheduled/recurring transactions, CSV import, and
  any bank/provider synchronization are not implemented. The Goals and Debt pages are still
  honest placeholders and say so.
- There is no undo for a void beyond recording a replacement; this is intentional.
- `backup/restore` and `npm audit` were last run against 0.1.1, before the finance tables
  existed. Re-run both before deploying 0.2.0; the restore check must now match all
  twenty tables, not eight.
- Only Chromium is covered; Safari/Firefox and a real assistive-technology review remain
  later work. Select and amount-field accessible names were corrected during Phase 2, but
  the forms have not been walked with an actual screen reader.
- The register lists every transaction for an account with no pagination or search. This is
  fine for a new budget and will need attention before a large history exists.
- Refund attribution is entered by pasting a transaction ID. It validates correctly but is
  not a comfortable interface yet.
- ESLint legacy plugin peer ranges do not advertise version 10; compatibility wrappers work.
  Prisma transitive security overrides are documented in PROJECT_SPEC.md; reassess on upgrades.
- No known failing local tests.

## Immediate next tasks

1. Deploy 0.2.0. The migration service runs `202609230001_finance` and
   `202609230002_trigger_dispatch` against the existing database. Back up first; readiness
   reports 503 until all three migrations are recorded.
2. Use the app for a real month before adding features. The accounting decisions in
   docs/PHASE2_ACCOUNTING.md are deliberate and are best judged in practice.
3. Add reporting over the existing journals: spending by category and month, net worth, and
   income versus expense. The ledger already holds everything these need.
4. Then goals and targets, which should only guide assignment and never create money.
5. Keep bank integration deferred until the manual system has been trusted for real months.

## Relevant modules and setup

- `src/domain`: pure money/date primitives and `budget.ts`, the deterministic replay engine.
  It has no persistence or framework imports and is the right place for accounting changes.
- `src/application`: auth/session/budget authorization, `finance.ts` (commands and queries),
  and `finance-page.ts` (the server-component entry point).
- `src/infrastructure`: DB, environment validation, cryptography, logs, HTTP security.
- `src/app`, `src/components`, `src/proxy.ts`: routes, shell, forms, nonce/security headers.
- `prisma`: schema plus `202609220001_foundation`, `202609230001_finance`, and
  `202609230002_trigger_dispatch`.
- `scripts`: owner commands, cleanup, standalone preparation, backup/restore, HTTPS server.
- `tests`: unit/property, PostgreSQL integration, HTTPS browser suites; see README.

Node is installed at `~/.local/share/mynab-toolchain/node-v24.21.0-darwin-arm64/bin`.
PostgreSQL 17 is at `/opt/homebrew/opt/postgresql@17/bin`. Ignored `.local/postgres` hosts
loopback-only `mynab_dev` and `mynab_test` on port 55432. This is synthetic development
infrastructure with local trust authentication, never a deployment configuration.
Start/stop commands are in README. The cluster was left stopped after verification;
no web/test server or boot-time service was left running.

Ignored `.env` and `.env.test` contain local-only configuration and a random encryption key.
The development database has no owner; the real user must run `npm run owner:create`.
Tests refuse databases without an `_test` suffix and truncate their application tables.
Do not point them at real data. `npm run typecheck` generates Prisma and Next route types
from a fresh checkout. `npm run build` removes traced environment files from standalone output.

On future migrations, update readiness's expected migration set in
`src/app/api/health/ready/route.ts`, schema documentation, backup/restore verification, the
browser suite's finance truncation list, and this handoff. Never reset the production database.

## Releasing to the Linux host

Development is on an arm64 Mac with no Docker; the host is amd64. Portainer deploys images,
not source, and `APP_BASE_PATH` is compiled in at build time, so every release must be built
on the host. `npm run release` uploads the committed revision and builds both image tags
there on a capped builder, then leaves the stack alone for a manual Portainer update with
re-pull disabled. Bump the version in `package.json` and `deploy/portainer/stack.yml` first;
the script refuses a tag that already exists. See deploy/portainer/README.md.

An uncapped build once saturated the host and locked it. The builder is now limited to
2 CPUs, 2 GB and low block-IO weight, and is stopped afterwards. Watch the host disk:
`docker builder prune -af` reclaimed 65 GB on 2026-09-22, taking it from 87% to 77%.

## Commit milestones

- `842fa21`: specification and continuity documents, before application code.
- `6f3dd14`: tested Phase 1 foundation and operational documentation.
- `3c37cef`: Portainer deployment and `/mynab` base path, version 0.1.1.
