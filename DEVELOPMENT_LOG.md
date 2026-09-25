# Development log

## 2026-09-22 — Specification

- Inspected empty workspace and tool availability; Git present, Node/npm/Docker absent from PATH.
- Recorded owner decisions: USD, cash/debt rollover, nginx HTTPS, local password login, MFA deferred.
- Established product scope, accounting conservation model, future domain schema, roadmap,
  security boundaries, and Phase 1 acceptance criteria in PROJECT_SPEC.md before application code.

## 2026-09-22 — Phase 1 foundation

- Implemented Next.js/React/TypeScript modular shell, PostgreSQL/Prisma foundation schema,
  owner CLI, sessions, authorization, throttling, audits, exact money/date primitives,
  provider-secret encryption utility, and health/security boundaries.
- Added non-root Docker images, migration service, Compose persistence, nginx examples,
  backup/restore operations, CI, and reproducible verification commands.
- Installed user-local Node 24.21.0 and Homebrew PostgreSQL 17 for real local verification;
  created only loopback synthetic development/test databases, no real owner or finances.
- Resolved registry prerelease selection, transitive audit findings, and ESLint plugin
  compatibility. Pinned versions and committed a lockfile. Audit: zero vulnerabilities.
- Production HTTPS browser testing caught Origin:null caused by no-referrer on native
  forms. Changed referrer policy to same-origin while retaining exact-Origin CSRF checks.
- Verified clean install, lint/typecheck, 36 unit/property tests, 14 PostgreSQL integration
  tests, production standalone build, 10 desktop/mobile HTTPS browser tests, and an actual
  backup/restore roundtrip matching all 8 tables. Interactive owner create/reset also passed
  in a temporary database, with hidden passphrases confirmed not echoed.
- Inspected responsive light/dark screenshots. Shell explicitly labels future functionality.
- Docker/Compose runtime and the owner's nginx remain unverified because Docker is absent.
  Added an explicit release checklist. No remote CI, push, or deployment performed.

- Final handoff: committed the foundation, confirmed no staged local secrets, and stopped
  the project-local PostgreSQL test cluster. No app or test server was left running.

## 2026-09-22 — Portainer images and /mynab deployment

- Owner selected 192.168.1.7 (existing SSH user plex) and URL
  https://plexmanager.duckdns.org/mynab through nginx Proxy Manager.
- Added build-time APP_BASE_PATH, native-form/API-redirect path handling, configuration
  validation, prefixed health checks, root/subpath CI matrix, and regression tests.
  Version is 0.1.1. HTTPS desktop/mobile tests all pass with /mynab.
- Prepared Portainer Standalone stack with local image tags, PostgreSQL named volume,
  one-shot migration service, web app, and an idle operator console container. Production
  secrets are in a private ignored environment file, not Git or image layers.
- Built linux/amd64 images directly on Docker 29.4.1 / Compose 5.1.3 using a dedicated
  builder limited to two CPUs and 1.5 GiB RAM; kept existing services unchanged.
- Runner image: mynab:0.1.1, sha256:81095a96591551f6d6a2e2387c851e9247d81c799e89629744acd720370d3b6c.
- Tools image: mynab-tools:0.1.1, sha256:85546a14f3a0052fbfc440064e2dfb07d8365af199ede8e5dcd1b42226109540.
- Isolated Compose checks passed: migrations, UID 1000, health checks, auth/CSRF/cookies,
  prefixed pages/assets/redirects, logout/recovery, restart persistence, real backup/restore
  equality across eight tables, DB-outage 503 readiness / 200 liveness and recovery.
- Interactive password recovery inside the Linux admin container passed with no echo.
- Local verification: 39 unit/property tests, 14 PostgreSQL integration tests, 10 HTTPS
  browser tests, lint/typecheck/format, and production /mynab build passed.
- Real Portainer stack and nginx location left for the owner as requested. No real owner,
  production financial data, public image registry, or nginx modification was created.

- Cleaned up the isolated server test stack/volume and synthetic secrets/backup; retained
  release images and build cache. Stopped local PostgreSQL and the dedicated builder.

## 2026-09-22 — Phase 2 manual budgeting

- Continued an interrupted Phase 2. The accounting engine, schema, and command layer were
  already present and passing; the work resumed at the unfinished presentation layer.
- Inherited and verified: PHASE2_ACCOUNTING.md contract, pure `projectBudget` replay engine,
  finance/trigger-dispatch migrations, thirteen authorized commands with SERIALIZABLE
  transactions, bounded retries, budget-scoped idempotency keys, audit rows, and
  reconciliation invalidation. Readiness now expects all three migrations.
- Completed the missing account register at `/accounts/[id]`. Every account card previously
  linked to a route that did not exist, and `TransactionForm` was unreachable, so no
  transaction could be entered through the interface at all. The page adds running balances,
  cleared/uncleared totals, split and transfer detail, clearing, voiding, correction,
  reconciliation, and rename/close, and directs transfer corrections to their primary leg.
- Added the entire finance stylesheet. Sixteen class names used by the new pages had no
  definitions, so budget and accounts rendered unstyled. Styles reuse the existing tokens
  and stay legible in light and dark at desktop and phone widths.
- Fixed accessibility defects found while writing browser tests: selects and the signed
  amount input took their accessible names from wrapping labels, which absorbed every
  option's text and the amount helper text. They now carry explicit names, and the amount
  helper is referenced with `aria-describedby` under an id unique to each rendered form.
- Fixed a self-inflicted defect: per-row budget form messages were hidden by CSS, which also
  suppressed rejection alerts, so a refused assignment gave the user no feedback.
- Repaired two pre-existing browser-test failures. `/accounts` and `/budget` are now real
  pages, so the shell suite could no longer assert placeholder copy for them.
- Added tests/e2e/finance.spec.ts: a manual budgeting cycle through the browser, a refused
  over-assignment, a card payment proven to be a transfer rather than new spending, and a
  void that leaves lineage while restoring a positive card balance.
- Ran prettier over the whole Phase 2 change set; it had never been formatted.
- Verified locally: 54 unit/property tests, 21 PostgreSQL integration tests, 18 HTTPS
  desktop/mobile browser tests, lint, typecheck, format, and a production /mynab build.
  Inspected budget and register screenshots in light theme at desktop and phone widths.
- Version 0.2.0. No production database was migrated and no stack was deployed by the agent.

## 2026-09-22 — 0.2.0 images and release automation

- Built mynab:0.2.0 (sha256:da5afd48a194…) and mynab-tools:0.2.0 (sha256:dab59f5b2396…)
  for linux/amd64 with APP_BASE_PATH=/mynab on the host. Owner deployed the stack;
  migrate exited 0, app is healthy, and readiness returns 200 on all three migrations.
- An uncapped build locked the host and the owner force rebooted it. The dedicated builder
  had only a 1.5 GiB memory limit; NanoCpus was 0, so the earlier log's claim of a two-CPU
  limit was never true of the container. The docker-container driver also exports each
  image to a tarball and re-imports it, which for the 1.45 GB tools image is several GB of
  extra I/O on a disk that was 87% full.
- Reclaimed 65.3 GB of Docker build cache with the owner's approval; the host went from
  87% to 77% used. No images, containers, or volumes were removed.
- Corrected scripts/container-smoke.mjs, which still asserted placeholder copy for the now
  implemented budget and accounts pages. The container smoke test itself was not run; the
  images were verified only by metadata inspection and the owner's successful deployment.
- Added scripts/release.sh and `npm run release`: refuses a dirty tree or an existing tag,
  uploads the committed revision, applies real CPU/memory/block-IO limits to the builder,
  builds both targets, stops the builder, and never touches the running stack.
- Documented upgrading an existing Portainer stack, including that these images are local
  only and re-pull must stay disabled.

## 2026-09-22 — Closing the 0.2.0 verification gaps

- The backup roundtrip only compared eight hardcoded foundation tables, so the twelve
  finance tables, including every journal, posting, transaction and assignment, were
  silently unverified. It now discovers tables from information_schema, requires at least
  twenty, and refuses to pass over an empty ledger, so a future migration cannot be
  skipped. It also reports the underlying error instead of swallowing it.
- Backup/restore roundtrip passed against real ledger data: all 20 tables match.
- Dependency audit at 0.2.0: zero vulnerabilities.
- Production database held zero accounts and zero transactions after deployment, so the
  accounting model has not yet met real spending. Recorded in NEXT_STEPS as the gate
  before Phase 3 rather than a code deficiency.

## 2026-09-23 — Phase 5 bank sync

- Owner chose Plaid over file import, and had no practical way to enter real data by hand,
  so ingestion was brought forward ahead of Phase 3 goals/debt.
- Settled docs/PHASE5_INGESTION.md before any schema, as Phase 2 was: adapter/ledger
  boundary, three-stage sync with an atomic cursor commit, identity and idempotency,
  pending-to-posted matching across pages, proposals that never merge silently,
  uncategorized imports posting immediately, explicit linking with no backfilled history.
- Pure planner in src/domain/ingestion.ts with a property proving re-planning settles to
  unchanged and that provider page order cannot affect the outcome.
- Provider schema with ten more composite foreign keys. `prisma migrate dev` generated a
  DropForeignKey for all 32 existing composite keys, which are the only thing preventing
  cross-budget references; the migration was rewritten by hand and 26 composite keys
  verified to survive. Documented in NEXT_STEPS as a recurring trap.
- Readiness now compares a declared migration list, with a unit test that fails if it
  drifts from the directories on disk.
- Plaid adapter on raw fetch, leaving the audited dependency surface unchanged. Live
  sandbox testing found two things unit tests could not: the provider's sign convention is
  inverted relative to this ledger, and a freshly linked item returns an empty cursor while
  history is assembled, which if stored would permanently skip that history. Also refused
  sub-cent amounts rather than letting toFixed round them away silently.
- Sync holds a timestamp claim rather than a row lock, because a row lock cannot span an
  HTTP call and the provider is never called inside a financial transaction. A stale claim
  expires instead of locking a connection out permanently.
- Content policy widens by exactly two directives and only when a provider is configured.
  Without one it is now tighter than before, with an explicit frame-src 'none'.
- Verified: 81 unit, 32 PostgreSQL integration, 20 HTTPS browser tests, backup roundtrip
  across all 24 tables, audit clean, production /mynab build. Reviewed the connections
  page screenshot. No images were built and nothing was deployed.

## 2026-09-23 — 0.3.0 released and bank sync in real use

- Built mynab:0.3.0 (sha256:b86ff6974a03…) and mynab-tools:0.3.0 (sha256:e41474ef20ac…)
  on the host with the capped builder. Peak load 3.74 and the disk steady at 78%; the
  running stack stayed healthy throughout. Owner deployed; all six migrations applied and
  readiness returns 200.
- Corrected an earlier wrong diagnosis: the builder always had a CPU limit. NanoCpus was 0
  but CpuQuota was 200000, which is two CPUs, and Docker expresses the same cap either way.
  That mistake also aborted the first release, because `docker update --cpus` is refused on
  a container that already carries a quota. The dimension genuinely unlimited was block IO,
  which fits a lockup on a disk that was 87% full with 65 GB of build cache.
- Found before any production credential was used: PHASE5_INGESTION specified that a linked
  account starts from the owner's opening balance, and the implementation did not do it.
  parseStartDate existed but was never called. A first real sync would have added up to two
  years of transactions on top of a balance that already contained them. Linking now
  records a start date and sync drops anything at or before it.
- Deployment traps found in real use, both now documented. Upgrading the Portainer stack by
  editing only the image tags silently omits new environment variables, because Compose
  passes through only what the YAML declares; bank sync reported itself unconfigured with
  no error anywhere. And the connections page dead-ended on "Create an account first" with
  no link, at exactly the moment someone has finished connecting their bank.
- "Syncing" was a standing status on every linked account rather than an operation, so a
  finished sync read as a stuck one. It now says "Linked" and states what will import.
- Live with Plaid Production against PNC. One account linked going forward from 2026-09-23,
  two discovered accounts left unlinked, no history backfilled by the owner's choice. The
  budget has no categories yet, so nothing can be approved into a real category.
- Still unverified: the sign of a real production transaction. Sandbox proved it; real PNC
  data has not arrived yet. This is the first thing to check.

## 2026-09-23 — Review of Claude continuation and 0.3.1 ingestion repairs

- Resumed at clean `f245877`, read the refreshed handoff/spec/contracts, and reviewed the
  actual implementation rather than assuming the earlier Phase 2 worktree remained.
- Found two critical data-loss paths: treating an incremental Plaid delta as a full snapshot
  reversed absent older entries, while proposed transfer pairs were skipped with the cursor
  still advancing. Tests used full repeated batches and did not reveal these defects.
- Also found pending observations affecting the ledger, unsafe read/set sync claims without
  fencing, automatic reconciled corrections, missing manual matching, link/cursor edge cases,
  unbounded endpoint body reads, and stale imported identity after manual corrections.
- Implemented the fixes and explicit match/change review UI; recorded severity, rationale,
  evidence and remaining gaps in docs/REVIEW_2026-09-23.md. Preserved the accounting contract.
- New additive migration retains legacy history and flags pending ledger records for review.
  Posted corrections/removals now need owner decisions and reconciliation acknowledgment.
  Shared imported identity supports both sides of a confirmed transfer without duplicating it.
- Read-only production check found 0 imported observations, 0 pending rows and 0 old-sync
  reversals; running 0.3.0 healthy. No production bank calls, data writes or deployment.
- Verified at this milestone: 86 unit/property, 47 PostgreSQL integration, 22 HTTPS desktop/
  mobile browser tests; production /mynab build; 24-table backup/restore; zero dependency
  vulnerabilities. Fresh database applied seven migrations and retained 26 composite FKs.
- Updated PROJECT_SPEC/README to remove stale status claims and distinguish partial ingestion
  from planned worker/reconnect work. Completely rewrote NEXT_STEPS.md. Goals/debt remains
  next after the repair release; no goals/scenario functionality is claimed implemented.
- Source and Portainer tags bumped to 0.3.1. Docker build/isolated verification follows;
  a subsequent log entry will record the actual result and source commit.

## 2026-09-23 — 0.3.1 images and isolated Linux verification

- Implementation/image source committed as `e673dec`. Built linux/amd64 images on the
  existing host: `mynab:0.3.1` (`de613b3b780b`, ~285 MB) and `mynab-tools:0.3.1`
  (`0c25976b7162`, ~1.45 GB), both user `node`, compiled APP_BASE_PATH=/mynab.
- Verified builder limits before build: CPU quota 200000/100000, 2 GiB memory with no
  extra swap allowance, relative blkio weight 100. Builder stopped afterward. Disk had
  about 99 GB free after builds; no shared cache, production images or volumes pruned.
- Final local lint/typecheck/format passed, 86 unit/property and 48 PostgreSQL integration
  tests passed. Production /mynab build and 22 HTTPS desktop/mobile browser tests passed;
  browser run repeated after skip-link clipping/footer fixes. Dependency audit was clean.
- Disposable Compose project `mynab031verify` used synthetic credentials, its own volume/
  networks, a `_test` database and loopback port 33117. All seven migrations applied.
- Initial container test invocation failed because Vite tried writing a bundled config into
  /app as non-root. Re-ran with --configLoader native --no-cache; 86 unit and 48 integration
  tests passed without changing image permissions or using a privileged test user.
- Container smoke passed for auth, password recovery, secure cookies, prefix/asset routing,
  manual ledger and bank-review page. Whole-database row digests matched after actual
  app/DB recreation and after backup/restore into a new database. Migration service exited 0;
  readiness returned 200. Deliberate DB-outage and Docker health-check timer checks were not
  repeated; do not conflate readiness polling with waiting for Docker's healthy state.
- Cleaned only the disposable test containers/networks/volume, synthetic secrets and dumps.
  Production remained 0.3.0 and healthy. No production migration/deployment was performed.
- Refreshed all continuity documents with actual outcomes, image source/IDs and owner upgrade
  instructions. Corrected release.sh's final message to request the entire Portainer YAML,
  consistent with the documented environment-variable upgrade trap.
- Logs retained in ignored `.local/release-0.3.1.log` and `.local/verify-0.3.1.log`; no real
  provider calls were made. Local PostgreSQL was already running and is left running.

## 2026-09-23 — 0.3.2 budgeting usability and a YNAB-matching decision

- Owner asked how envelope budgeting is meant to be used, which surfaced that starting from
  an empty category list is the hardest part. Added a starter structure of 26 categories in
  five groups, offered only to a budget with none, creating categories and nothing else.
- Added Phase 3 target arithmetic as a pure domain module: six target types, inclusive
  remaining months, contributions rounded up, passed deadlines asking for the remainder
  rather than dividing by zero, and periodic bills rolling to their next occurrence.
  Persisted targets in migration 007 with the vocabulary closed at the database and
  composite ownership; 27 composite foreign keys verified. Progress is derived on every
  read rather than stored, so it cannot drift from the projection.
- Added one-click funding of every target. Payee memory suggests the category the owner
  filed the same payee under before, matched on the normalised payee with a prefix
  fallback; a voided transaction teaches nothing, since that decision was taken back.
- Owner set a standing principle: match YNAB where there is no strong reason to differ.
  First application reversed the refusal to over-assign. Ready to Assign may now go
  negative, shown in red with a standing notice, as YNAB does. The future month rule was
  kept, because a negative net assignment there is invention rather than over-allocation.
- Removing that guard exposed a defect it had been masking. The budget row is locked with a
  raw statement, so a serialization conflict there carries PostgreSQL's 40001 rather than
  Prisma's P2034 and escaped the bounded retry, failing a legitimate concurrent command
  outright. Both forms are now retried. The concurrency test had asserted that one of two
  assignments fails, which agreed with the code rather than with correctness; it now
  asserts both succeed.
- Also fixed FinanceForm discarding a command's own result message, so funding could not
  report what it assigned.
- Verified: 115 unit, 54 PostgreSQL integration, 26 HTTPS browser tests, backup/restore
  across all 25 tables, lint, typecheck, format, production /mynab build, audit clean.

## 2026-09-23 — 0.3.3 target parity and debt planning

- Closed two target gaps against YNAB found while explaining how targets work. Refill tops
  a category back up to its amount counting what survived the month; set aside asks for the
  amount again regardless. Weekly targets scale by how often the chosen weekday actually
  falls in the month, four or five, rather than assuming four. Migration 008 ties a weekday
  to weekly targets and refilling to recurring ones so a contradiction cannot be stored.
- Implemented PROJECT_SPEC section 8 as a pure module: avalanche, snowball and custom
  ordering with stable tie breakers, interest rounded half up to cents, minimums before
  extra, a cleared debt releasing its minimum to the next, extra monthly and dated lump
  sums, and comparison deltas. A property over 200 generated debt sets asserts everything
  paid is exactly principal plus interest and that input order cannot change a schedule.
- Replaced the Debt placeholder with a real page. Migration 009 records APR, minimum
  payment, due day and credit limit, which are contract facts the ledger cannot know.
  Scenarios live in the query string and are never stored, so running one has no write path
  at all. No plan is shown until every debt has terms, because treating a missing rate as
  zero would model an interest-free loan and flatter the whole page. Negative amortisation
  is named rather than given a payoff date that will never arrive.
- Generalised how the form drops blank optional fields. The hardcoded list had broken three
  times, once per new optional field, each time with an unhelpful type error. Nothing empty
  is sent at all now, and commands accepting an empty string declare a default.
- Hit the wrapping-label accessibility problem again on three debt fields, where helper text
  is absorbed into the accessible name. Fixed with explicit labels; this has now recurred
  several times and is worth checking whenever a field gains a `<small>` hint.
- Verified: 127 unit, 55 PostgreSQL integration, 30 HTTPS browser tests, backup/restore
  across all 26 tables, 28 composite ownership foreign keys, lint, typecheck, format, and a
  production /mynab build. Reviewed the debt page screenshot.

## 2026-09-23 — The Goals page, and what Phase 3 still owes the spec

Unreleased; the source is still 0.3.3 until a release is cut.

- Targets shipped in 0.3.2 as part of the budgeting work, so the Goals pillar never got a
  page and still rendered the "coming in a future release" placeholder while the feature
  behind it had been working for two releases. `/goals` is now a real route: every target
  with its kind, amount, what is funded, what is still needed, what it asks for this month,
  the occurrence being funded, a projected completion and its state, plus creating,
  removing and one-click funding.
- Progress on Goals is the same reading the Budget page uses. `goalsPage()` decorates what
  `getFinance` already derived from the projection rather than recomputing it, so the two
  pages cannot disagree about what a target needs.
- Added `projectCompletion` and `summarizeTargets` to the domain. PROJECT_SPEC section 7
  asks for a projected completion and there was none. The projection divides what is left
  by a pace the caller supplies, and the page supplies what the owner actually assigned
  this month. A category assigned nothing has no pace, and the page says so instead of
  borrowing the required contribution, which would have made every target answer "on time".
  Only targets that can complete are projected: a spending limit measures what left, a
  maintained balance is standing, and a monthly target renews rather than finishing.
- Moved target creation and removal off the Budget page. Two copies of the same form would
  have drifted; the budget keeps its Target column and its fund button and links to Goals.
  Shared wording lives in `src/components/targets.ts` so a state cannot be called one thing
  on one page and something else on the other.
- Deleted the `[pillar]` placeholder route: every pillar is a real page now. Removed the
  286 lines of stylesheet that only that page used, after checking each selector was dead.
- The e2e assertion that the overshoot message is visible was passing on a race. The
  funding panel unmounts once nothing is owed, taking its own message with it; the test won
  because the message rendered before the refresh landed. It now asserts the standing
  notice, which states the exact negative Ready to Assign. The same notice was added to
  Goals, because funding from there can push Ready to Assign negative and the owner should
  not have to go looking for that.
- `<small>` inside a table cell was rendering inline, so the Goals table read
  "Every monthSet aside" and "$1,200.00by December 2026". Only `th small` had been styled.
- Added a per-test login throttle reset to the finance e2e chain. Adding a tenth test tipped
  it over the limit; foundation.spec already did this, and the throttle keeps its coverage
  there.
- Still not implemented from sections 7 and 8, and recorded in NEXT_STEPS.md: effective-dated
  targets and terms, stored completion history, promotional rate periods, and debt payoff as
  a target type.
- Verified: 134 unit, 55 PostgreSQL integration, 32 HTTPS browser tests across desktop and
  mobile, lint, typecheck, format and a production /mynab build. Reviewed the Goals page
  screenshots on both viewports and the budget page after the stylesheet removal.

## 2026-09-23 — Phase 3 finished rather than "implemented with gaps"

Unreleased, on top of 0.3.3. Migration `202609230010_effective_dating` is new and additive.

- **Effective dating.** `CategoryTarget` and `DebtTerms` carry the month a version takes
  effect, and their keys are composite. A month reads the latest version effective on or
  before it, so editing a target today cannot rewrite what an earlier month was asked to
  do. Existing rows take `1900-01`, meaning they have always applied, so nothing a
  deployment inherits changes meaning. A month before a target's first version reports no
  target rather than inventing one the owner never set.
- **Promotional rates needed no schema of their own.** A 0% intro card is the intro rate
  effective now and the go-to rate effective from the month it ends. `simulatePayoff` takes
  a rate schedule and charges whichever rate is in force in each month it walks through.
- That exposed a real defect in the existing simulator: negative amortisation was checked
  once, at the start month, so a debt whose minimum covered a promotional 0% but not the
  27% that replaced it was reported as on track to be paid off. It is now checked every
  month against the payment actually made.
- **Debt payoff targets.** `DEBT_PAYOFF` and `DEBT_PAYOFF_BY_DATE` live on a card's payment
  category, which is exactly the category every other target type is refused. Neither
  stores a balance: what is owed is read from the ledger at evaluation time, because a
  stored balance could disagree with the ledger and nothing would say which was right. A
  payoff-by-date target therefore stores no amount at all, and the database enforces that.
- **Completion history is derived, not stored.** Each past month is projected and the
  target version in force then is evaluated against it. A stored "completed" flag would
  survive a correction that invalidated it. Bounded to a year, one projection per month.
- **Found while testing: a dated target over-funded on repeat.** Its monthly share was
  computed from `available`, which already includes this month's assignment, so after
  assigning the share it saw a smaller remainder and asked for a share of that as well.
  Clicking "assign what targets need" twice put in more than the plan called for. The share
  is now computed from what was there before the month and netted against what has been
  assigned, so a funded month asks for nothing further. This is what YNAB does.
- Two e2e assertions had to change for reasons worth recording: `getByRole("row")` filtered
  by "Card" began matching two tables once term versions were listed, and three tests that
  set a target and then read a 2026-01 ledger needed an explicit effective month, because a
  target set today does not apply to January.
- Verified: 145 unit, 60 PostgreSQL integration, 36 HTTPS browser tests across desktop and
  mobile, backup/restore across all 26 tables, all eleven migrations applied to a fresh
  database with 28 composite ownership foreign keys surviving, lint, typecheck, format and a
  production /mynab build. Reviewed the Goals and Debt screenshots.

## 2026-09-24 — Seeded a realistic budget, which immediately found three bugs

Unreleased. `npm run seed:demo -- --yes` builds about fourteen months of a fictional
household through the ordinary command layer: six accounts, the starter categories, targets
of every kind, versioned debt terms with a promotional rate that ends, income, bills, card
spending and payments, transfers to savings and a tracking car loan, a refund, a correction
and reconciliations. Deterministic for a given seed. It refuses any database that is not
local and named `*_dev`, `*_demo`, `*_seed` or `*_test`, requires `--yes`, and will not
overwrite an existing budget without `--reset`.

Seeding through commands rather than inserts was the point: 376 transactions exercised the
triggers, the double-entry postings and every budget invariant, and the resulting pages
showed three defects that no test had.

- **Adding a credit card locked away the starter categories.** The starter set is offered
  only to a budget with no categories, but a card's payment category is created by the
  application and is not flagged `system`, so anyone who added an account before their
  categories was refused the starter set permanently.
- **Spending un-funded a refill target.** A refill measured `available`, which falls when
  the money is spent, so a month with the rent assigned and the rent paid asked for the
  rent a second time. It now measures what the envelope was given — what survived the
  previous month plus what has been assigned — and ignores what has since left it. This is
  the same mistake as the dated-target one fixed earlier, in a different place.
- **The payoff plan contradicted itself.** After per-month negative-amortisation detection
  was added, a card whose interest outran its payment early on was listed under "these
  never get paid off this way" beside its own payoff date, because a cleared debt later
  released its minimum and rescued it. Only a debt that never clears is reported now.
- Verified: 147 unit, 61 PostgreSQL integration, 36 browser tests, lint, typecheck, format,
  a production build, and the Budget, Goals, Debt and Accounts pages reviewed against the
  seeded ledger with no page errors.

## 2026-09-24 — Review of 0.3.5 and start of Phase 4

Reviewed clean baseline `75e50de` after checkpoint recovery. Reconciled contradictory
handoff claims with actual source. Goals/Debt, effective dating and demo seeding exist;
the full debt specification still has gaps (future minimum changes, percentage minimums,
affordability cap and statement-balance capture). Production was not accessed or changed.

Fixed three financial calculation defects with dedicated regressions: avalanche now uses
current effective APR each month, unused final minimum payments reach another debt in the
same month, and monthly debt targets no longer subtract this month's assignments twice
near payoff. Corrected the Debt page's fixed-rate wording to disclose effective APRs and
fixed starting minimum payments.

Started Phase 4 with a pure recurrence module: inclusive date windows, daily/weekly/monthly/
yearly/one-off cadence, intervals, timezone validation, end dates, anchored month-end and
leap-year behavior, stable ID/date occurrence keys, bounded expansion. This does not persist
schedules or post transactions. Unique persisted occurrence approvals, authorization/audit,
upcoming UI, rules and recurring suggestions remain next work.

Verified commands: `npm run check` (lint/typecheck, 156 unit/property tests),
`npm run test:integration` (61 PostgreSQL tests),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`, and
`APP_BASE_PATH=/mynab npm run test:e2e` (36 desktop/mobile Chromium tests).
No migration, image build, backup/restore, live provider call or production deployment was
performed this session. Source remains an unreleased continuation of 0.3.5; use a new tag
for the next built release. Refreshed NEXT_STEPS, project status, README and agent handoff.

## 2026-09-24 — Phase 4 schedule workflow

The owner expanded the active objective to finish every remaining phase through Phase 8.
This is an increment toward that objective, not a claim that Phase 4 or the site is complete.

Added twelve-migration schema with Schedule, ScheduleSplit and ScheduleOccurrence. Six new
composite foreign keys preserve budget ownership. Schedule creation stores plans only;
explicit approval uses the existing ledger command in the same serializable budget lock,
with occurrence uniqueness, request idempotency and atomic audit. Skipping adds no journal.
Added Accounts → Schedules with creation, up to four UI splits (50 via API), date-range
upcoming view, approval, skipping and archive/restore. Default range is 90 days; older dates
can be selected for overdue review. Schedule dates are calendar dates and approval currently
uses budget-timezone eligibility. No worker or automatic posting is implied.

Schedule editing and explicit existing-transaction matching remain next, followed by rules
and recurring suggestions. Current approval copy tells the owner to check imported records;
that warning is not counted as implemented matching. Full remaining scope is in NEXT_STEPS.

Verified: npm run check (lint/typecheck, 156 unit/property tests), npm run test:integration
(64 PostgreSQL tests), APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build,
APP_BASE_PATH=/mynab npm run test:e2e (38 desktop/mobile tests), and
PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup (29 tables identical).
Fresh mynab_schedule_empty_test applied 12 migrations and retained 34 composite ownership
FKs. The schema-only DB remains local. Initial browser tests exposed ambiguous select labels;
explicit accessible labels fixed them and the full browser suite passed afterward.
No Docker build, production change, bank HTTP call or deployment was performed.

## 2026-09-24 — Schedule versions, transaction matching and recurring review

Continued the active full Phase 4–8 objective from 7849892. Future edits now create a linked
successor, preserve earlier occurrences and split definitions, reject stale revisions, and
refuse to move already-handled occurrences. Existing transaction matching requires the same
account/destination/type/amount within seven days. It creates only a unique occurrence link;
no journal, category or payee is rewritten. Archived handled history remains visible, and
voided/corrected linked transactions are flagged without making the occurrence postable again.
Migration 202609240002_schedule_revisions adds revision/successor metadata and unique ledger
links. Upcoming queries now have explicit window/result bounds with candidate truncation copy.

Added conservative recurring detection and a review UI with supporting dates/amounts,
editable defaults and explicit schedule creation. Three matching records are required; two
days and 20% median-amount tolerance are disclosed. Transfers/voids/irregular groups are
excluded. This is a suggestion, never a transaction. Added pure deterministic rule preview
semantics with protected fields and explanations; persisted rules and their UI remain next.

Verified: npm run check (lint/typecheck, 164 unit/property tests), npm run test:integration
(68), APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build,
APP_BASE_PATH=/mynab npm run test:e2e (42 desktop/mobile), and
PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup (29 tables identical).
Fresh mynab_schedule_revisions_empty_test applied 13 migrations and has 35 composite ownership
FKs; the schema-only local database remains. No production/provider calls, image builds or
deployment. The full remaining roadmap stays active; Phase 4 is not yet complete.

## 2026-09-24 — Continue after redesign: saved rules and restrained controls

Recovered clean e98f3fa after the owner's full Warm Editorial Finance redesign. Owner asked
to resume the full Phase 4–8 objective and specifically reduce excess color, button clashes
and oversized category/group editors. Preserved the new tokens, dark palette, cascade layers,
contrast repairs and browser marker classes. Repeated inline actions are outlined; management
uses responsive grids with direct group renaming; empty message space removed; mobile targets
are 44px minimum; nested Accounts pages retain navigation selection.

Added AutomationRule persistence and authorized/audited/idempotent optimistic edits with
ownership-constrained references and exact amount ranges. New Rules page saves, disables,
orders and previews proposals without changing source transactions. Multi-split categories
remain protected. Applying rules and persisting transaction tags/manual locks remains next;
no automatic categorization is claimed. Migration 202609240003_automation_rules is additive.

Verified npm run check (164 unit/property, lint/typecheck), npm run test:integration (71),
APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build,
APP_BASE_PATH=/mynab npm run test:e2e (44 desktop/mobile), and
PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup (all 30 tables, including rules).
Fresh mynab_rules_empty_test has all 14 migrations and 38 composite ownership FKs. Visual
screenshots prompted fixes to the rule checkbox/type roles and compact inline group editor.
Contrast harness now asserts zero reported failures rather than only logging them; gradients
and unparseable colors remain outside its coverage. No production/provider access, image
build or deployment. Full remaining goal is active; continuity files refreshed.

## 2026-09-24 — Explicit reviewed rule application

Codex implemented this batch and was cut off before verifying it; Claude resumed from the intact
working tree. Added TransactionPreference (migration 202609240004, composite ownership FK),
fingerprinted shared previews, `transaction.protect` and `rule.apply` commands and Rules page
controls. Application reuses the immutable reversal/replacement path, preserves cleared state,
requires reconciliation acknowledgment and refuses stale previews, pending bank reviews,
transfer suggestions and no-op changes. Tags/protection carry through later replacements.

Verified npm run check (164), npm run test:integration (74), APP_BASE_PATH=/mynab
APP_ORIGIN=https://127.0.0.1:3443 npm run build, APP_BASE_PATH=/mynab npm run test:e2e (46),
PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup (31 tables) and the
screenshot/contrast harness (0 failures). No production access, image build or deployment.

## 2026-09-24 — Rule proposals in import review

Connections now pre-fills an unapproved outflow's category from enabled rules ahead of payee
memory, ignoring protected fields and archived/payment/system categories, and links other
proposed changes to the Rules preview. No new ledger writes; approval unchanged. Shared
`ruleDefinitions` mapper in application/rules.ts. Verified npm run check (164),
test:integration (75), /mynab build, test:e2e (46), test:backup (31 tables), contrast (0).

## 2026-09-24 — Schedule zones, overdue summary, recurring dismissal

Approval now requires the occurrence date to have arrived in the schedule's timezone as well
as the budget's; getSchedules exposes `due`, an `overdue` summary independent of the window
and dismissed recurring keys. Migration 202609250001_recurring_dismissals with audited,
idempotent recurring.dismiss/restore commands; the Schedules page hides and restores them.
Verified npm run check (164), test:integration (78), /mynab build, test:e2e (48),
test:backup (32 tables), contrast (0); fresh DB 16 migrations / 39 composite FKs.

## 2026-09-24 — Opt-in suggested rules

Pure suggestRules() (unanimous, >= 3 non-voided filings, uncovered by any rule) with unit and
property tests; filingHistory() shared by import review and Rules. The Rules page offers
"Create this rule" per suggestion; nothing is created otherwise. Verified npm run check (167),
test:integration (79), /mynab build, test:e2e (50), test:backup (32 tables), contrast (0).

## 2026-09-24 — Phase 3 gaps closed

Owner noticed Phase 3 was marked finished while the spec listed gaps. Implemented
effective-dated and percentage minimum rules, monthly budget cap with shortfall reporting,
a true minimums-only baseline and statement balance capture (migration 202609250002).
Fixed minimums produce identical plans (all prior unit tests unchanged). Verified check
(172), test:integration (80), /mynab build, test:e2e (52), test:backup (32), contrast (0).

## 2026-09-24 — Durable worker (Phase 4 complete)

Migration 202609250003_jobs (Job with partial live-dedupe index, WorkerHeartbeat); pure job
policy in domain/jobs.ts; application/jobs.ts enqueue/claim/complete/fail/scheduleDue/runJob;
scripts/worker.ts with SIGTERM drain and heartbeat file; worker service in docker-compose.yml
and deploy/portainer/stack.yml with healthcheck; README upgrade step now requires pasting
the whole YAML. Readiness caught the missing expected-migration entry during e2e, as
designed. Verified check (175), integration (86), build, e2e (52), backup (34), contrast (0).

## 2026-09-24 — Phase 5 complete

Plaid update mode (link.reauth.start/complete; REAUTH connections pause automatic sync and
show Sign in again), OAuth return page with sessionStorage-resumed Link, PLAID_REDIRECT_URI
pinned to the app's own path. Fixed a latent startup failure: Compose passes unset optional
variables as "", which config rejected; empty now means unset. plaid:check extended and run
against Sandbox. Verified check (177), integration (88), build, e2e (54), backup (34), contrast (0).

## 2026-09-24 — Release 0.3.9 built; Phase 6 reports

Built mynab:0.3.9 / mynab-tools:0.3.9 on the host (not deployed; owner deploys). Added
/reports with pure report semantics, comparisons and drilldown, a Reports nav item, and
validated chart colour tokens for both themes. Verified check (183), integration (89),
build, e2e (56), backup (34), contrast (0).

## 2026-09-24 — Phase 7A: CSV and OFX/QFX import

Refactored the sync commit into commitEntries (shared with files); FILE provider source
(migration 202609250004 adds ImportBatch, IngestedEntry.batchId and FILE to provider_known);
pure parsers in domain/files.ts; /api/import (inspect, preview, commit, undo) and
/accounts/import. Found and fixed during testing: batchId was not stamped on rows, and the
provider CHECK constraint rejected FILE. Verified check (193), integration (94), build,
e2e (58), backup (35), contrast (0).

## 2026-09-24 — Phase 7B: exports

Versioned JSON export and formula-safe CSV tables (domain/export.ts, application/exports.ts,
GET /api/export, /accounts/export). Checking the page copy found that production backups are
neither automated nor encrypted; wording corrected and raised with the owner. Verified check
(195), integration (95), build, e2e (60), backup (35), contrast (0).

## 2026-09-24 — Phase 8A: needs-attention summary

In-app notification channel on the Budget page: bank sign-in, unreachable connections,
stopped worker, bank changes to review, unapproved imports, overdue schedule items and
affected reconciliations (latest statement per account only). Overspending is left to the
page's existing notice. Verified check (197), integration (96), build, e2e (60), backup (35),
contrast (0).

## 2026-09-24 — Phase 8B: forecasts

/reports/forecast: 1/3/6/12-month cash forecast (pure domain/forecast.ts) from unhandled
schedule occurrences, scheduled-or-averaged income, average spending in unscheduled
categories (no double counting), and minimums on unscheduled tracking loans. Scenario
controls live in the query string; nothing is stored or assigned. Verified check (202),
integration (97), build, e2e (62), backup (35), contrast (0).
