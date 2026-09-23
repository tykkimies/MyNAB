# Development handoff

Read this, then PROJECT_SPEC.md, docs/PHASE2_ACCOUNTING.md and docs/PHASE5_INGESTION.md
before changing the accounting or ingestion models. Those three documents record decisions
that are deliberate and were expensive to reach; do not quietly revise them in code.

## Where this is right now

MyNAB is **live and in real use**. Version 0.3.0 is deployed on the owner's Portainer
stack at https://plexmanager.duckdns.org/mynab and is healthy. A real bank (PNC) is
connected through Plaid **Production**, not sandbox.

Phases 1, 2 and 5 are implemented. Phase 3 (goals and debt) was deliberately deferred and
is the intended next feature: the owner had no practical way to get real data in, so
ingestion was brought forward ahead of it.

### Live production state as of 2026-09-23

| Thing               | State                                                               |
| ------------------- | ------------------------------------------------------------------- |
| Deployed version    | 0.3.0, app and admin containers healthy                             |
| Migrations applied  | All six, readiness returns 200                                      |
| Provider            | Plaid **Production**, institution PNC, connection ACTIVE            |
| Accounts in MyNAB   | 1 (`Spend`), created with today's balance                           |
| Provider accounts   | 3 discovered; only `Spend ····9251` linked, from 2026-09-23         |
| Unlinked            | `Growth ····6904`, `Reserve ····3924` — never synced while unlinked |
| Imported entries    | 0, correctly: the boundary is today, so nothing qualifies yet       |
| Categories / budget | **None yet.** No groups, no categories, no assignments              |

The owner chose to "go forward" rather than backfill history. The first real transaction
should arrive the day after linking. **Verify the sign on it**: a real outflow must be
negative and must reduce the account balance. Sandbox proved this; real PNC data has not.

The empty budget is the owner's immediate task, not a code task. Until categories exist,
imported spending can only be approved as-is into `Uncategorized`.

## Not yet deployed

Three commits sit ahead of the deployed 0.3.0 image and ship as 0.3.1 whenever the next
release happens. None are urgent; batch them with the next real change.

- `46d1edb` — release script caps the builder with a CPU quota rather than `--cpus`
- `1ac1a04` — connections page links to account creation instead of dead-ending
- `e9d66d4` — a linked account reads "Linked", not a permanent "Syncing"

## Verified on 2026-09-23

| Check                       | Result                                                       |
| --------------------------- | ------------------------------------------------------------ |
| Lint, TypeScript, Prettier  | Passed                                                       |
| Unit/property tests         | 81 passed                                                    |
| PostgreSQL integration      | 34 passed                                                    |
| HTTPS browser tests         | 20 passed, desktop and mobile Chromium                       |
| Backup/restore roundtrip    | All 24 tables match, ledger included                         |
| Dependency audit            | Zero vulnerabilities                                         |
| Plaid adapter, live sandbox | `npm run plaid:check`: link, exchange, accounts, sync, signs |
| Production deployment       | 0.3.0 healthy, all six migrations, readiness 200             |

## Known gaps, in the order they are likely to bite

1. **Match proposals are computed but never shown.** `planIngestion` returns
   `propose-match` and `propose-transfer` decisions and counts them, but the connections
   page does not present them for a decision, and the commands to accept or decline a
   proposal do not exist. A transaction entered by hand that the bank later delivers will
   therefore appear **twice**. Low risk while the owner imports rather than hand-enters.
   `DeclinedMatch` already exists and the planner already honours it.
2. **No start-date picker when linking.** `linkAccount` accepts `startDate` and the API
   forwards it, but the UI always uses the default, which is the account's opening entry.
   Pulling in history therefore means deleting and recreating the account with an opening
   balance as of the earlier date. The owner declined this for now; build the picker if it
   comes up, and keep the warning that the opening balance must match the chosen date or
   the same transactions are counted twice.
3. **The register has no pagination or search.** Fine now, not at a thousand rows.
4. **Refund attribution is by pasting a transaction ID.** Validates correctly, unpleasant.
5. **Only Chromium is covered.** No Safari, Firefox, or real assistive-technology review.
   Select and amount-field accessible names were corrected in Phase 2, but no screen
   reader has walked the forms.
6. **Sandbox and production differ in ways only live testing showed.** See "Bank sync".

## Bank sync (Phase 5) — things that are not obvious

- Set `PLAID_CLIENT_ID`, `PLAID_SECRET` and `PLAID_ENV` together or not at all. A partial
  set fails at startup, and `PLAID_ENV` has no default, because silently falling back to
  sandbox in production would show a working sync that touched no real account.
- **Plaid reports a POSITIVE amount when money LEAVES an account**, the opposite of this
  ledger. The sign is inverted once, at the adapter boundary, in `normalizeAmount`.
- **A freshly linked item returns an EMPTY cursor** while Plaid assembles history
  asynchronously. Storing it as a real position would permanently skip that history, so an
  empty cursor is stored as null. The first sync is often incomplete; later syncs converge.
- Amounts arrive as JSON floats. An amount that is not an exact number of cents is
  **refused**, not rounded, because `toFixed(2)` would silently discard it.
- Imported spending lands in a system `Uncategorized` category and shows as overspending
  until assigned. Plaid cannot say what an inflow was for, so an inflow reaches Ready to
  Assign and a card inflow becomes a statement credit, never income.
- A linked account imports only transactions dated **after** its start date. Everything at
  or before it is already inside the owner's opening balance; importing it would double the
  balance and invent months of unassigned spending. This was specified in
  PHASE5_INGESTION.md, initially not implemented, and fixed in `e534eab` before any
  production credential was used. Do not remove that filter.
- `npm run plaid:check` verifies credentials and the adapter end to end. It is sandbox-only
  by design, creates a throwaway item, prints no tokens, and removes the item afterwards.
- Losing `SECRET_ENCRYPTION_KEY` makes every stored access token unrecoverable and requires
  re-linking every institution.

## Traps that will cost you time

**`prisma migrate dev` tries to delete every composite foreign key.** They are declared in
raw SQL rather than as Prisma relations, so drift detection does not see them and emits a
`DropForeignKey` block for all of them. Those keys are the only thing preventing
cross-budget references, per PROJECT_SPEC section 16. Delete that block by hand every time,
then confirm:

```sh
psql -c "SELECT count(*) FROM pg_constraint WHERE contype='f' AND array_length(conkey,1)=2;"
```

It was 26 after the provider migration. If it drops, the migration ate the constraints.

**Upgrading the Portainer stack must replace the whole YAML, not just the image tags.**
Compose passes through only what the YAML declares. 0.3.0 added three provider variables;
editing only the tags left them unset with **no error anywhere** — the app started, passed
its health check, and reported bank sync as unconfigured. Always paste the current
`deploy/portainer/stack.yml`.

**Images are local to the Docker host and are in no registry.** Never enable re-pull in
Portainer; it would look on Docker Hub and fail.

**The host is shared.** It runs Plex, the \*arr stack and Home Assistant. A build with
unlimited block IO on a nearly full disk locked it hard enough to need a force reboot.
`scripts/release.sh` now caps the builder (2 CPUs by quota, 2 GB, blkio-weight 100) and
stops it afterwards. Watch free space; `docker builder prune -af` reclaimed 65 GB once.

## Releasing

Development is on an arm64 Mac with **no Docker**; the host is linux/amd64, and
`APP_BASE_PATH` is compiled into the client assets. Images can therefore only be built on
the host, and copying source across is not enough.

```sh
# bump version in package.json AND deploy/portainer/stack.yml, commit
npm run release           # add --prune when the host disk is tight
```

It refuses a dirty tree or a tag that already exists, uploads the committed revision to
`/home/plex/mynab/releases/<version>/`, builds both images capped, and stops the builder.
It never touches the running stack. Then, in Portainer: back up, paste the whole
`stack.yml`, update with re-pull **disabled**, confirm `migrate` reaches Exited (0) and
`/mynab/api/health/ready` returns 200. Old tags are kept for rollback; rollback only works
if the database has not been migrated.

## Suggested next work

1. **Confirm the first real transaction imports with the correct sign.** Highest value,
   smallest effort, and wrong signs would corrupt everything downstream.
2. **Match proposals in the UI**, closing gap 1 above, once the owner starts entering
   anything by hand.
3. **Phase 3: goals and debt.** The original plan, now unblocked. Goals must only guide
   assignment and never create money; debt planning reads real card balances.
4. **Phase 6: reports.** The ledger already holds everything these need, but they stay
   thin until a month or two of history exists, so do them after goals.

Do not start Plaid webhooks, scheduling or rules before the manual and imported paths have
been trusted through a full real month.

## Modules

- `src/domain`: pure money/date primitives, `budget.ts` (deterministic replay engine) and
  `ingestion.ts` (pure sync planner). No persistence or framework imports. Accounting and
  matching changes belong here, with tests, before anything else moves.
- `src/application`: `auth`, `session`, `finance.ts` (thirteen authorized commands),
  `ingestion.ts` (provider commands), `finance-page.ts` (server-component entry points).
- `src/infrastructure`: DB, config validation, cryptography, logging, HTTP security, and
  `providers/` (the `Provider` interface and the Plaid adapter, which uses raw fetch to
  keep the audited dependency surface unchanged).
- `src/app`, `src/components`, `src/proxy.ts`: routes, shell, forms, nonce/security headers.
- `prisma`: schema and six migrations.
- `scripts`: owner commands, backup/restore, HTTPS test server, `release.sh`,
  `plaid-check.ts`, `container-smoke.mjs`.
- `tests`: unit/property, PostgreSQL integration, HTTPS browser suites.

## Local setup

Node lives at `~/.local/share/mynab-toolchain/node-v24.21.0-darwin-arm64/bin`; prepend it
to PATH. PostgreSQL 17 is at `/opt/homebrew/opt/postgresql@17/bin`. Ignored
`.local/postgres` hosts loopback-only `mynab_dev` and `mynab_test` on port 55432. Start and
stop it with the commands in README. This is synthetic development infrastructure with
trust authentication and is never a deployment configuration.

```sh
npm run check              # lint, typecheck, unit tests
npm run test:integration   # needs the local cluster and a _test database
npm run test:e2e           # needs a production build first; see README
npm run test:backup        # run AFTER test:e2e, which seeds the ledger it verifies
```

`test:backup` discovers tables from the database rather than a fixed list and refuses to
pass over an empty ledger, so it cannot silently skip a new table. Integration tests
truncate application tables and refuse any database whose name does not end in `_test`.

On a new migration, update `expectedMigrations` in `src/app/api/health/ready/route.ts` (a
unit test fails if it drifts from the directories on disk) and the truncation list in
`tests/e2e/finance.spec.ts`. **Never reset the production database.**

## Commit milestones

- `842fa21` specification · `6f3dd14` Phase 1 foundation · `3c37cef` Portainer and /mynab
- `3d4b830` Phase 2 manual budgeting through the interface
- `bf0d212` Phase 5 ingestion contract · `9fb3f57` pure planner · `147bad3` Plaid adapter
- `2c8467c` ingestion commands · `ca335bb` bank sync interface · `e534eab` start-date fix
- `aff9172` release 0.3.0
