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
  `retry.ts`, `providers/` (Provider interface + SimpleFIN adapter + window delta).
- `src/app`, `src/components`, `src/proxy.ts` — routes, forms, nonce/security headers.
- `prisma/` — schema plus twenty migrations. `scripts/` — owner CLI, backup/restore,
  `release.sh`. `tests/` — unit, integration, e2e.

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
- SimpleFIN signs amounts from the account's side (positive is money in), MyNAB's own
  convention: nothing is flipped. It has no cursor; the stored cursor is the last sync date.
- Scenarios (debt payoff) live in the query string and are never stored, except
  the one plan a budget adopts (owner decision 2026-09-26): `DebtPlan` keeps its
  settings only, never its projection. The worker applies it each month (job
  `debt.plan.track`, daily by the budget's calendar), re-planning from the
  ledger and setting card payment targets and managed schedules; a target
  changed by hand is left alone unless reclaimed. A plan card that owes nothing
  is retired for good (`paidOff`): no target, managed schedule archived, and it
  stays out after new spending unless the owner adds it back. Cards only.
- Debt reminders (owner decision 2026-09-27): what the bank must do is tracked
  in `DebtReminder` (rules in `src/domain/debt-reminders.ts`, reconciled by
  `src/application/debt-reminders.ts` after debt/target commands and daily).
  "What the bank pays" is the last PAYMENT_CHANGE marked done; there is no
  other store. `debt.terms.set` re-applies an adopted plan immediately. Phone
  push via ntfy (`NTFY_*`, job `notify.push`), outside transactions, no
  amounts unless `NTFY_DETAIL=full`. A promotion covers the whole card.

- Bank provider (owner decision 2026-09-28): SimpleFIN Bridge only (owner pays
  ~$15/yr, 25 banks). Plaid removed; old PLAID connections are retired rows
  (history kept, never synced; accounts moved with "Move here"). See
  docs/PHASE5_INGESTION.md "SimpleFIN replaces Plaid". The content policy
  allows nothing third-party in the browser.

- Layout (owner decision 2026-09-26, Stitch "Unified Ledger & Drawer"): a
  260px rail and a workspace that scrolls on its own (#workspace; header
  sticky). Record-level detail opens in a non-modal right drawer that
  overlays the workspace and never narrows it: `Drawer` for URL-driven
  panels (?inspect=, ?account=, ?schedule=, drill), `DETAILS_DRAWER` for
  <details> rows. Controls on the right edge are covered while it is open.

- Phone app (owner decision 2026-09-28): a phone gets its own presentation,
  not the shrunk desktop. `src/proxy.ts` resolves it (`src/infrastructure/
  device.ts`: cookie `mynab-view` phone|desktop wins, else `Sec-CH-UA-Mobile`,
  else User-Agent; iPad/tablets get desktop) into `x-mynab-view`; pages read
  `isPhone()` and return a `phone.tsx` beside them early, over the same
  loaders and commands. Phone areas only: Budget, Accounts/registers, Add,
  Reports (4 tabs), Debt (read-mostly); `phonePage()` is the allow-list and
  everything else shows "On the desktop site" (client `PhoneGate`, since the
  layout does not re-render on navigation). Shell in `src/components/phone/`,
  styles `.phone-*` in globals.css. Tests: playwright `mobile` = phone with
  the desktop cookie; `phone` project runs only `tests/e2e/phone.spec.ts`.

- Transaction review (2026-09-29): Budget's notice and desktop review link open
  `/accounts/register?review=unapproved`. Counts share `unapprovedImports()`'s
  live-transaction eligibility; search/filtering happens before paging and bulk approval.
  `ReviewRefresh` refreshes persistent shell counts on navigation/foreground, without polling.
- Phone sheets (2026-09-29): `components/phone/mobile-sheets.tsx` adds modal
  backdrop, focus/scroll isolation, animated dismissal and touch dragging to Drawer
  and Popover. Details occupy 90% of the visual viewport; menus are content-sized
  (40% minimum). Desktop drawers stay non-modal. Keep the sheet backdrop free of
  page margins and end animations with `transform: none` for nested fixed panels.

## Deployment

Images build only on the Linux host (Mac is arm64 with no Docker; `APP_BASE_PATH` is
compiled in). Images are local, never in a registry: **re-pull must stay disabled**.
Upgrading the Portainer stack must **paste the whole `stack.yml`**, not edit image tags —
Compose passes through only what the YAML declares, and tag-only edits have silently
dropped new environment variables before.

Full detail: `PROJECT_SPEC.md`, `docs/PHASE2_ACCOUNTING.md`, `docs/PHASE5_INGESTION.md`,
`NEXT_STEPS.md`.

## Current design contract

"Ink ledger" (owner decision 2026-09-26; full plan in the approved redesign proposal,
copied in `ai/HANDOFF.md`): one typeface (IBM Plex Sans, `--font-sans`), ink neutrals on
`--canvas`/`--surface` separated by hairlines, one navy accent (`--accent*`) for
interaction and selection only, money state on figures and pills (`--positive`,
`--warning`, `--negative`), no gradient hero cards, no stat-card grids, no serif.
Every route is `PageHeader` (functional title + toolbar) → `SummaryStrip` → the ledger or
list; secondary tools live in `Popover` (`<details class="popover">`) or the `Drawer`.
Shared primitives are in `src/components/ui/`; tables use `.ledger`, buttons `.btn*`.
The Warm Editorial names (`primary-button`, `text-text-secondary`, `bg-surface-card`,
`font-headline-*`, `text-body-*`, …) no longer exist in `globals.css`; a class that is not
in the token list or the controls layer renders unstyled.
Controls stay in the controls cascade layer. Keep marker classes and accessible names
required by browser tests; do not roll back the redesign when adding features.
Every rendered money figure goes inside `<Amount>` (or `<MaybeAmount>`) so Hide Amounts masks it.
In-page controls never full-reload: use `Link`, `next/form` `Form`, `FinanceForm` or `ActionForm`, with `scroll={false}` for same-page changes.
Route-level `loading.tsx` skeletons are not used: `page.goto` resolves before streamed
content replaces them, which would blind the screenshot, axe and contrast suites.
