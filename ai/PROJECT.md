# MyNAB — stable project context

Self-hosted envelope budgeting. Live and in real use; treat the production database as real
money. Read this once per session, then `ai/HANDOFF.md` for what is actually in flight.

## Architecture

Next.js App Router + React + TypeScript, PostgreSQL via Prisma, Zod validation. Layered,
and the layering is load-bearing:

- `src/domain` — pure money/date/accounting logic. **No framework, persistence or provider
  imports.** `budget.ts` (envelope replay), `ingestion.ts` (sync planner), `goals.ts`
  (targets), `debt.ts` (payoff), `payees.ts`, `money.ts`, `dates.ts`, `starter.ts`.
  Accounting changes belong here first, with tests, before anything else moves.
- `src/application` — authorization, commands, transactions. `finance.ts` (the command
  layer), `ingestion.ts` (provider commands), `auth.ts`, `session.ts`, `finance-page.ts`.
- `src/infrastructure` — `db.ts`, `config.ts`, `crypto.ts`, `http-security.ts`, `log.ts`,
  `retry.ts`, `providers/` (Provider interface + Plaid adapter on raw fetch).
- `src/app`, `src/components`, `src/proxy.ts` — routes, forms, nonce/security headers.
- `prisma/` — schema plus twenty migrations. `scripts/` — owner CLI, backup/restore,
  `release.sh`, `plaid-check.ts`. `tests/` — unit, integration, e2e.

## Commands

```sh
export PATH="$HOME/.local/share/mynab-toolchain/node-v24.21.0-darwin-arm64/bin:$PATH"
npm run check              # lint + typecheck + unit
npm run test:integration   # needs local PostgreSQL, a *_test database
npm run test:e2e           # needs a production build first
npm run test:backup        # run AFTER test:e2e, which seeds the ledger it verifies
npm run release            # build images on the Linux host; refuses a dirty tree
npm run worker             # background worker (jobs: provider.sync, maintenance)
```

PostgreSQL 17 at `/opt/homebrew/opt/postgresql@17/bin`; project cluster in `.local/postgres`
on 127.0.0.1:55432 (`mynab_dev`, `mynab_test`). Start/stop commands are in README.

## Constraints that are not negotiable

- **Only budget money that exists**, except where YNAB parity says otherwise (see below).
- Money is integer cents (`bigint`). Never floats. Sub-cent input is refused, not rounded.
- The journal is append-only: storage-level corrections void and append a reversing journal.
  The owner sees YNAB-style edit/delete/undo on top of that (YNAB_ALIGNMENT A4).
- Cross-budget references are prevented by **composite foreign keys in SQL**, not service
  checks. `prisma migrate dev` tries to DROP all of them — delete that block by hand and
  verify: `SELECT count(*) FROM pg_constraint WHERE contype='f' AND array_length(conkey,1)=2;`
  (39 as of migration 18). It also drops the partial unique index `Job_live_dedupeKey`
  (Prisma cannot express it); keep it.
- Integration tests do not migrate: run
  `node --env-file=.env.test node_modules/prisma/build/index.js migrate deploy` after adding one.
- Provider adapters never write ledger tables. External calls never happen inside a
  financial transaction.
- Never reset the production database. Never print `.env` or `.local/portainer-mynab.env`.

## Key decisions

- **Operate the same as YNAB** (owner decision 2026-09-25). Read `docs/YNAB_ALIGNMENT.md`
  before touching imports, matching, schedules, register editing or assigning: it lists the
  behaviours being aligned and their status. Ready to Assign may go negative, as in YNAB.
- Imports arrive categorised (rules, then payee memory) and unapproved; see YNAB_ALIGNMENT A1.
  Inflows go to Ready to Assign; card inflows are statement credits.
- A linked account imports only transactions dated **after** its start date; earlier
  history is already inside the opening balance.
- Plaid reports a POSITIVE amount when money LEAVES an account; the sign is inverted once,
  in the adapter. A fresh item returns an EMPTY cursor, stored as null.
- Scenarios (debt payoff) live in the query string and are never stored, except
  the one plan a budget adopts (owner decision 2026-09-26): `DebtPlan` keeps its
  settings only, never its projection. The worker applies it each month (job
  `debt.plan.track`, daily by the budget's calendar), re-planning from the
  ledger and setting card payment targets and managed schedules; a target
  changed by hand is left alone unless reclaimed. A plan card that owes nothing
  is retired for good (`paidOff`): no target, managed schedule archived, and it
  stays out after new spending unless the owner adds it back. Cards only.

- Layout (owner decision 2026-09-26, Stitch "Unified Ledger & Drawer"): a
  260px rail and a workspace that scrolls on its own (#workspace; header
  sticky). Record-level detail opens in a non-modal right drawer that
  overlays the workspace and never narrows it: `Drawer` for URL-driven
  panels (?inspect=, ?account=, ?schedule=, drill), `DETAILS_DRAWER` for
  <details> rows. Controls on the right edge are covered while it is open.

## Deployment

Images build only on the Linux host (Mac is arm64 with no Docker; `APP_BASE_PATH` is
compiled in). Images are local, never in a registry: **re-pull must stay disabled**.
Upgrading the Portainer stack must **paste the whole `stack.yml`**, not edit image tags —
Compose passes through only what the YAML declares, and tag-only edits have silently
dropped new environment variables before.

Full detail: `PROJECT_SPEC.md`, `docs/PHASE2_ACCOUNTING.md`, `docs/PHASE5_INGESTION.md`,
`NEXT_STEPS.md`.

## Current design contract

Warm Editorial Finance: Tailwind utilities over shared light/dark tokens; Newsreader role
classes are `font-headline-hero`, `font-headline-md` (not generic font-headline/display).
Controls stay in the controls cascade layer. Preserve independent hero/button color pairs.
Owner prefers restrained color, outlined repeated actions and compact category/group editing.
Keep marker classes required by browser tests; do not roll back the redesign when adding features.
Every rendered money figure goes inside `<Amount>` (or `<MaybeAmount>`) so Hide Amounts masks it.
In-page controls never full-reload: use `Link`, `next/form` `Form`, `FinanceForm` or `ActionForm`, with `scroll={false}` for same-page changes.
