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
- `prisma/` — schema plus fifteen migrations. `scripts/` — owner CLI, backup/restore,
  `release.sh`, `plaid-check.ts`. `tests/` — unit, integration, e2e.

## Commands

```sh
export PATH="$HOME/.local/share/mynab-toolchain/node-v24.21.0-darwin-arm64/bin:$PATH"
npm run check              # lint + typecheck + unit
npm run test:integration   # needs local PostgreSQL, a *_test database
npm run test:e2e           # needs a production build first
npm run test:backup        # run AFTER test:e2e, which seeds the ledger it verifies
npm run release            # build images on the Linux host; refuses a dirty tree
```

PostgreSQL 17 at `/opt/homebrew/opt/postgresql@17/bin`; project cluster in `.local/postgres`
on 127.0.0.1:55432 (`mynab_dev`, `mynab_test`). Start/stop commands are in README.

## Constraints that are not negotiable

- **Only budget money that exists**, except where YNAB parity says otherwise (see below).
- Money is integer cents (`bigint`). Never floats. Sub-cent input is refused, not rounded.
- Accepted transactions are immutable. Corrections void and append a reversing journal.
- Cross-budget references are prevented by **composite foreign keys in SQL**, not service
  checks. `prisma migrate dev` tries to DROP all of them — delete that block by hand and
  verify: `SELECT count(*) FROM pg_constraint WHERE contype='f' AND array_length(conkey,1)=2;`
- Provider adapters never write ledger tables. External calls never happen inside a
  financial transaction.
- Never reset the production database. Never print `.env` or `.local/portainer-mynab.env`.

## Key decisions

- **Match YNAB** where there is no strong reason to differ (PROJECT_SPEC §1). First
  application: Ready to Assign may go negative, shown in red, rather than being refused.
- Imported spending lands in a system `Uncategorized` category and reads as overspending
  until assigned. Inflows go to Ready to Assign; card inflows are statement credits.
- A linked account imports only transactions dated **after** its start date; earlier
  history is already inside the opening balance.
- Plaid reports a POSITIVE amount when money LEAVES an account; the sign is inverted once,
  in the adapter. A fresh item returns an EMPTY cursor, stored as null.
- Scenarios (debt payoff) live in the query string and are never stored.

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
