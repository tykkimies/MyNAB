# Development handoff — 0.3.3

Read PROJECT_SPEC.md, docs/PHASE2_ACCOUNTING.md, docs/PHASE5_INGESTION.md and
**docs/REVIEW_2026-09-23.md** before changing financial or provider behavior. This file
replaces the earlier handoff; old claims that all Phase 5 was finished were too broad.

## Current state

**0.3.3 adds Phase 3.** Targets reached YNAB parity (weekly cadence, refill/set-aside), and
debt planning landed: a pure payoff simulator and a real Debt page. Production ran 0.3.1
when this was written; 0.3.2 and 0.3.3 images are built and waiting.

Migrations `202609230008_target_cadence` and `202609230009_debt_terms` are new since 0.3.2.
Back up before deploying, and paste the whole `stack.yml` rather than editing image tags.

Phase 3 is implemented but not complete against the spec. Still missing:

- **Effective-dated terms and targets.** Changing an APR or a target amount overwrites the
  old value; PROJECT_SPEC sections 7 and 8 ask for versions and completion history.
- **Promotional rate periods.** A 0% intro card cannot be modelled honestly yet.
- **Debt payoff as a target type.** Section 7 lists it; targets currently cover categories
  only, and payment categories are refused a target because the Phase 2 engine computes
  their reserves.

**0.3.2 adds budgeting usability on top of the 0.3.1 ingestion repair.** Starter categories,
Phase 3 targets with one-click funding, payee memory for imports, and a standing decision to
match YNAB's behaviour where there is no strong reason to differ. Production ran 0.3.1 when
this was written; 0.3.2 images are built and waiting.

Two behaviours changed that a reader may expect to work the old way:

- **Ready to Assign may go negative.** Assigning more than the budget holds is accepted and
  shown in red with a standing notice, as YNAB does. `docs/PHASE2_ACCOUNTING.md` records
  this as superseding the earlier refusal. Future months still refuse a negative net
  assignment, because that borrows rollover that does not exist.
- **Serialization conflicts on the budget lock are retried.** The lock is taken with a raw
  statement, so a conflict carries PostgreSQL's 40001 rather than Prisma's P2034 and used to
  escape the retry, failing a legitimate concurrent command. See `src/infrastructure/retry.ts`.

Migration `202609230007_category_targets` is new in 0.3.2. Back up before deploying.

The owner requested a review of Claude's continuation from `f245877` and further building.
Phase 1 foundation and Phase 2 manual budgeting are implemented. Plaid ingestion was brought
forward by the owner ahead of Phase 3, and 0.3.0 was deployed. The review found critical
incremental-sync defects, so 0.3.1 prioritizes repairs and completes the missing manual-match,
transfer-match and bank-change review workflow. Goals/debt remains planned, not implemented.

Production is the existing Portainer stack at https://plexmanager.duckdns.org/mynab on
192.168.1.7. **0.3.1 is now deployed and healthy**: readiness 200, all seven migrations
applied, 26 composite ownership foreign keys intact, and one linked account. There are
still zero imported observations, so the pre-patch delta defect never had history to
destroy here. No production amounts, payees or tokens have been retrieved at any point.

The earlier warning against syncing applied to 0.3.0 and no longer does.

The earlier handoff reports one real PNC Production account linked going forward from
2026-09-23 and two discovered accounts left unlinked. That connection detail was not queried
again in this review. Do not assume Sandbox credentials or inspect secret files to discover
credentials; all automated tests here use synthetic values.

## Implemented by this change

- Incremental deltas only remove explicit IDs; absent/unchanged history remains.
- New pending observations have no ledger transaction, balance or budget effect.
- All posted imports persist before cursor advancement, even when matching is proposed.
- Connections UI shows both sides of suggested manual matches/transfers, accepts or declines
  them, and explains temporary duplicate effects. Acceptance revalidates, audits and reverses
  duplicates. Manual categories survive; a confirmed transfer has two independently cleared legs.
- Bank updates/removals persist as review proposals. Apply or keep decisions are explicit;
  reconciled corrections require acknowledgment. Bank metadata is separate from manual overrides.
- Per-budget serializable commands with bounded retries; random sync lease tokens fence stale
  completions, failures and disconnects. External HTTP calls remain outside DB transactions.
- New account links reset the fetch cursor for deduplicated replay through the opening boundary.
  Existing links cannot be reassigned over financial history.
- Manual transaction corrections retain imported identity. Unsafe changes to linked account legs
  are rejected. Pending/unreviewed imports prevent account closure.
- Plaid pagination-mutation restart, request body byte limits, conservative amount/currency
  rejection, pre-exchange authorization and cleanup of failed new connections.
- Readiness expects seven migrations; migration 007 is additive to accepted financial history.

## Verification from this review

| Check                                 | Actual result                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| Lint, TypeScript                      | Passed                                                                                    |
| Unit/property                         | 86 passed                                                                                 |
| PostgreSQL integration                | 47 passed                                                                                 |
| Production build, `/mynab`            | Passed                                                                                    |
| HTTPS browser workflows               | 22 passed across desktop/mobile Chromium                                                  |
| Backup/restore                        | All 24 tables matched, including synthetic imported observations and ledger               |
| Fresh database migrations             | All seven applied to `mynab_migration_review_031_test`; 26 composite ownership FKs remain |
| Dependency audit                      | Zero vulnerabilities                                                                      |
| Mobile review screenshot              | Inspected; skip-link clipping and stale footer text corrected afterward                   |
| Real provider calls                   | Not performed                                                                             |
| 0.3.1 Docker images / container smoke | Both built on Linux; non-root auth/ledger/review smoke passed                             |
| Production upgrade                    | Not performed                                                                             |

## Available images and container evidence

Images built from **`e673dec`** are already on 192.168.1.7, linux/amd64, user `node`:

- `mynab:0.3.1` — `de613b3b780b` (about 285 MB).
- `mynab-tools:0.3.1` — `0c25976b7162` (about 1.45 GB).

The capped builder stopped after successful builds. No shared cache/image pruning occurred.
Isolated project `mynab031verify` used synthetic secrets, DB `mynab031_test`, loopback port
33117 and its own volume/networks. Inside the non-root tools container, 86 unit and 48
integration tests passed using `--configLoader native --no-cache`: the default Vite loader
tries to write beside root-owned application files and initially failed with EACCES. No image
permissions were loosened. Auth/ledger/bank-review smoke passed afterward, as did seven
migrations, readiness, exact all-table digests after app/DB recreation, and backup/restore
into a new database. Docker health-check timing and deliberate DB-outage behavior were not
separately re-tested in this run; application readiness returned 200 after recreation.

Only the disposable project's containers, networks, volume, generated secrets and synthetic
dumps were removed. Production remains on 0.3.0. Logs: `.local/release-0.3.1.log` and
`.local/verify-0.3.1.log`; host test script `/home/plex/mynab/verify-031.sh`, source under
`/home/plex/mynab/releases/0.3.1`. The image source predates this final documentation-only
handoff update and release-script output wording correction; application code is unchanged.

## Deployment and migration

Source/Portainer tags are 0.3.1. Use **the entire** `deploy/portainer/stack.yml`, not just
changed image tags, so provider environment variables remain present. Keep existing secrets,
including SECRET_ENCRYPTION_KEY, unchanged. Custom images are local to the host; disable
re-pull in Portainer.

Before updating: take a consistent database backup and preserve the encryption key separately.
Migration `202609230006_sync_integrity` adds syncToken, nullable IngestedEntry.transactionId,
removed identities and JSON bank-change review. It removes the unique transaction link to
allow two external legs to reference one confirmed transfer; composite ownership FKs remain.
Legacy pending records with a ledger transaction are flagged for owner review, not silently
reversed. Do not use an old application image against the migrated schema. Full rollback
requires restoring a pre-upgrade backup into a clean environment.

After updating: migrate must exit 0; `/mynab/api/health/ready` must return 200. Sign in and
open Accounts → Bank sync. First real import: compare its date, amount and sign against PNC,
then sync again with no changes and confirm the existing transaction remains. Resolve possible
matches before relying on balances. Do not invent compensating opening entries.

## Next executable work

1. ~~Owner deploys the verified 0.3.1 images.~~ Done on 2026-09-23; verified healthy.
2. Verify the first real posted PNC transaction and a subsequent empty delta; no production
   credential or institution calls should be made by automated development tests.
3. Add Plaid update-mode reauthentication/OAuth completion. Current error state identifies
   reauthentication needs but cannot yet complete update-mode Link.
4. Begin Phase 3: pure, tested generic goal progress/contribution calculations and deterministic
   debt payoff simulations; then persistence/authorized commands/UI. Follow PROJECT_SPEC §§7–8.
   Scenario output never creates transactions or assignments. No new default categories imposed.
5. Add account-register and import-review pagination/search and indexed match queries before
   history grows. The current import view shows the newest 200 observations and matching loads
   history in memory. Refund purchase selection should replace pasted IDs.

## Remaining limitations

- Phase 5 is partial: no worker, webhooks, scheduled retry, durable ImportBatch staging, account
  discovery refresh, reconnect/OAuth workflow, or file imports. Explicit sync stages bounded
  pages in memory and commits cursor with observations/reviews; fetching failures leave it alone.
- Accepted changes to matched transfers require a manual correction of both register legs,
  followed by “Keep my ledger entry” in review. No automatic partial transfer correction.
- Applying a changed bank expense returns it to Uncategorized with explicit confirmation.
  “Keep my ledger entry” preserves the owner's category and amount choices.
- Start-date picker not built; linking uses the opening date unless an API caller supplies a date.
- Pre-patch skipped/reversed history cannot be blindly repaired. This deployment's read-only
  counts showed none. Other installations need institution-to-ledger inspection before repair.
- Safari, Firefox and assistive-technology review remain unverified. Remote CI not claimed run.
- Goals/debt, rules, schedules, reporting, portable exports and forecasting remain unimplemented.

## Local development and modules

Node 24.21.0: `~/.local/share/mynab-toolchain/node-v24.21.0-darwin-arm64/bin` (prepend PATH).
PostgreSQL 17: `/opt/homebrew/opt/postgresql@17/bin`. `.local/postgres` listens only on
127.0.0.1:55432. `.env.test` points to the synthetic `_test` database. Never print `.env` or
`.local/portainer-mynab.env`: the user now has real provider credentials configured.

```sh
npm run check
node --env-file=.env.test node_modules/prisma/build/index.js migrate deploy
npm run test:integration
APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build
APP_BASE_PATH=/mynab npm run test:e2e
PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup
```

Tests truncate synthetic tables, guarded by `_test` suffix; run backup after E2E seeds data.
The fresh-migration verification DB `mynab_migration_review_031_test` contains schema only
and was deliberately retained. No database reset was required for this review.

- `src/domain/ingestion.ts`: pure delta planning; `budget.ts`: unchanged envelope accounting.
- `src/application/ingestion.ts`: leases, sync, approval, correction review, manual/transfer matching.
- `src/application/finance.ts`: manual commands and imported identity continuity.
- `src/infrastructure/providers/plaid.ts`: amount/sign/currency normalization and page retries.
- `src/app/api/provider/route.ts`: authenticated CSRF-protected bounded command boundary.
- `src/app/(protected)/accounts/connections/page.tsx`, `src/components/provider-link.tsx`: review UI.
- `prisma/migrations/202609230006_sync_integrity`: no destructive ledger migration.
- `tests/integration/ingestion.test.ts`: offline stub, real PostgreSQL integrity/race coverage.
- `scripts/release.sh`: builds committed sources on Linux without updating the live stack.

## Operational traps retained

Prisma schema intentionally omits some relations enforced with raw SQL composite FKs.
Never apply generated DropForeignKey blocks without review; 26 composite FKs survive all
seven migrations. New migrations must also update readiness's expected list and any test
cleanup lists. Never reset the production database.

The Linux host also runs Plex/media/home automation. Dedicated builder is capped at two
CPUs by quota, 2 GB memory and blkio-weight 100. At this review's pre-build check the disk
had 102 GB free (78% used), about 9 GB memory available. Do not prune shared caches, images
or volumes automatically. A historical uncapped build locked the host; avoid repeating it.

## Earlier milestones

`3c37cef` Phase 1 Portainer · `3d4b830` Phase 2 · `aff9172` deployed 0.3.0 ·
`f245877` review baseline · `e673dec` 0.3.1 repair/review implementation and image source.
See DEVELOPMENT_LOG.md for final build evidence.
