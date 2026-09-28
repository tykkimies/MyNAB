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

## 2026-09-24 — Phase 8C: register paging and search

Account registers render 50 rows per page with payee/memo search; running balances stay
computed over full history; per-row state/split lookups are now maps instead of scans; the
voided list shows the 50 newest. Verified check (202), integration, build, e2e (64).

## 2026-09-24 — Phase 8D: trends

Opening a category in Reports shows its month-by-month spending; account pages show
month-end balances for the last twelve months. Net worth, balance and trend lines share
components/trend-line.tsx. Verified check (202), integration (97), build, e2e (64),
backup (35), contrast (0).

## 2026-09-24 — Phase 8E: accessibility audit (Phase 8 complete)

Added @axe-core/playwright 4.13.0 (dev, pinned) and a populated-ledger axe audit of every page
in both themes and viewports. It found wide tables that keyboard users could not scroll on
mobile; every table scroller is now a labelled, focusable region with the app focus ring.
Verified check (202), integration (97), build, e2e (66, axe 0 violations), backup (35),
contrast (0).

## 2026-09-25 — YNAB alignment A3: automatic scheduled entry (local, unreleased)

Reviewed the interrupted A3 diff and moved its constraint changes out of the already
committed alignment migration into `202609250006_scheduled_entry`. The worker now queues
hourly, budget-scoped scheduled-entry jobs and posts due occurrences through the normal
serialized finance command. Occurrences enter as real, uncleared transactions awaiting
approval; confirming does not repost, rejecting writes an audited reversal, and an exact
bank match confirms them. Older unapproved entries stay visible in the schedules view.

Local verification: `node --env-file=.env.test node_modules/prisma/build/index.js migrate deploy`
passed on the synthetic test DB; `npm run check` passed (202 unit/property);
`npm run test:integration` passed (104); `/mynab` production build passed;
`APP_BASE_PATH=/mynab npm run test:e2e` passed (70 desktop/mobile, axe 0);
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` passed (35 tables).
An accidental overlap of integration and browser suites shared a synthetic database and
caused an owner bootstrap failure; both suites passed when rerun sequentially.
No new Docker image was built and production was not changed.
All 21 migrations also passed on a fresh temporary database. The additional
integration case ran the worker's actual enqueue/claim path; the temporary
database was removed afterward.

## 2026-09-25 — YNAB alignment A4: register editing (in progress, unreleased)

The account register now presents Edit, Delete and Undo for ordinary transactions while
keeping reversal/replacement journals and audit records internally. `transaction.undo`
restores the prior value, splits, payee, memo, date and cleared state through the existing
validated command path; it refuses stale versions and requires acknowledgment for
reconciled history. Edits preserve imported and scheduled transaction links. Opening
balances use a special `OPENING` kind, so their generic controls were withheld pending a
dedicated safe edit/undo path. A4 is not yet complete. Local check/integration/build and
desktop browser checks passed as recorded in NEXT_STEPS; mobile and final targeted checks
were in progress at this checkpoint. No release or production change.

A4 follow-up: added a guarded opening-balance correction path. `OPENING` is accepted
only when replacing the same account's opening lineage (including undo), preventing a
second starting balance. Focused finance integration passed 43; full integration 106,
check 202 and production build passed. Browser suites passed 36 each on desktop and
mobile (including opening-balance edit/undo; axe 0). Backup/restore passed 35 tables.
The earlier PARTIAL note above is superseded. No release or production change.

A3 and A4 were committed as `e3fac62` and `25ec289`. B1 Auto-Assign variants
were inspected next; no B1 application code was changed at this handoff.

## 2026-09-25 — 0.3.11 image build preparation

The owner requested new Linux-hosted images. Bumped the package/lockfile and all four
Portainer service image references to 0.3.11; updated deployment and root README copy.
This release contains committed YNAB alignment A1–A4 and B2/B4, while B1 Auto-Assign,
B3 Age of Money and the guide remain pending. Production still runs 0.3.10. Image build
and host verification are recorded separately after the release command completes.

0.3.11 image build completed: `npm run release` exited 0 from committed source
`e86648b414f2303f0a588565763eca08fd6f8aa2`. The Linux host now has
`mynab:0.3.11` (f9d87b5e64ca, 287 MB) and `mynab-tools:0.3.11`
(557f89139c67, 1.46 GB). Read-only image inspection verified both are amd64,
run as `node`, and have `APP_BASE_PATH=/mynab`. The host had 72 GB free after the
build. Read-only `docker ps` showed the existing app/worker healthy on 0.3.10;
no stack update or production migration was performed.

## 2026-09-25 — YNAB alignment B1: Auto-Assign variants (verified locally, unreleased)

Added a pure Auto-Assign planner for last-month assigned/spent, twelve-month
averages, reducing target overfunding, and resetting assigned/available amounts.
The Budget page previews exact category changes and Ready to Assign before the
owner applies them, for one category or all eligible categories. Application
recomputes under budget authorization and serialization, rejects stale
previews, uses idempotent request keys and records assignment/audit events.
Card payment reserve caps are reflected in the actual projected outcome.

With pinned Node 24, `npm run check` passed (216 unit/property),
`npm run test:integration` passed (108),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`
passed, `APP_BASE_PATH=/mynab npm run test:e2e` passed (74 desktop/mobile,
axe 0), and `PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup`
passed (35 tables). Production and Docker images were not changed. The owner
expanded the objective from selected YNAB alignment items to full user-visible
YNAB feature parity; B3 Age of Money and a broader parity inventory follow.

## 2026-09-25 — Age of Money and payoff-date simulation (verified locally, unreleased)

Added a pure FIFO Age of Money calculation over budget cash inflows and actual
cash outflows. Cash-to-card payments count when paid; card purchases and cash
transfers within the budget do not count as outflow samples. Budget and Reports
show the same value, or a history count until ten outflows exist. Starting
balances seed the pool, not samples. Documented that YNAB's public guide does
not specify exact rounding when an outflow spans lots.

The Debt page already simulated payment amounts, strategies, changing rates
and one-off payments. Added the YNAB-style inverse input: choose a payoff month
and the pure simulator binary-searches the minimum whole-cent monthly budget
that clears the debts by then. This remains a read-only scenario and uses the
same future APR/minimum versions and lump sums. Added a source-backed,
status-labeled inventory in `docs/YNAB_PARITY.md` so the expanded full-parity
goal is not confused with the completed original eight phases.

Pinned Node 24 gates: `npm run check` passed (224 unit/property),
`npm run test:integration` passed (109),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build` passed,
`APP_BASE_PATH=/mynab npm run test:e2e` passed (78 desktop/mobile, axe 0),
and `PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` passed
(35 tables). A focused browser run initially used the wrong existing account
type label and timed out; the corrected test and full suite passed. No new
Docker image was built and production remains untouched.

## 2026-09-25 — One-month target snooze (verified locally, unreleased)

Added migration `202609250007_target_snooze` and a budget/category/month record
with composite ownership FK. The owner can snooze or resume an eligible target
in the current month from Goals. Its progress remains visible, while its
contribution is removed from the current Underfunded amount and bulk funding;
the next month resumes normally. Card payment targets are excluded. Budget
also shows the snoozed state. This operation is authorized, idempotent and
audited through the existing finance command path.

Pinned Node 24 checks passed: `npm run check` (224 unit/property),
`npm run test:integration` (110),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`,
`APP_BASE_PATH=/mynab npm run test:e2e` (78 desktop/mobile, axe 0), and
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` (36 tables).
Migration deploy succeeded on the upgraded test database and all 22 migrations
also succeeded on a fresh temporary PostgreSQL database; the new ownership FK
was verified. No Docker image build or production mutation.

## 2026-09-25 — Category organization (verified locally, unreleased)

Added migration `202609250008_category_organization` for category notes,
group/category hidden state and stable manual order. Authorized hide/reorder
commands preserve ledger and assignments. Budget shows the available amount
inside hidden categories, while hidden targets stop prompting for funding.
The management area uses compact disclosure controls; an all-hidden plan
gets a clear empty state rather than the first-use message. Integration tests
cover ordering, note persistence, ownership and conservation. Browser tests
hide and restore a funded category on desktop and mobile.

Pinned Node 24 verification passed: `npm run check` (224 unit/property),
`npm run test:integration` (111),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`,
`APP_BASE_PATH=/mynab npm run test:e2e` (80 desktop/mobile, axe 0), and
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` (36 tables).
The upgraded local test database accepted migration 23. Fresh-database
migration and container checks are still pending. No image build, deployment
or production data change occurred.

## 2026-09-25 — 0.3.12 release (YNAB parity)

Bumped package, lockfile and the four Portainer image references to 0.3.12 for the parity
work committed after 0.3.11 (see docs/YNAB_PARITY.md and ai/HANDOFF.md). Local gates on the
release tree: check, integration, /mynab build, desktop/mobile e2e with axe, backup/restore
across 39 tables; a fresh database accepted all 32 migrations with 44 composite ownership
keys. Build and host verification results are recorded below as they happen.

0.3.12 build completed: `npm run release` exited 0 from commit
57fd4d4dee4e9ce518e0d1e5d8a4091f2f8008be. On 192.168.1.7: `mynab:0.3.12`
(aa6f0f8ed561) and `mynab-tools:0.3.12` (1c29bacfc73f), linux/amd64, user `node`.
Pre-upgrade live backup `backups/mynab-pre-0.3.12-20260925T213745Z.dump` (35 tables,
pg_restore --list verified). Rehearsal: that dump restored into a disposable
postgres:17.11 container on a private network; `mynab-tools:0.3.12 npm run db:migrate`
applied all 32 migrations; 44 composite ownership FKs; 382 transactions preserved; no
invalid member roles; disposable container/network removed. The running 0.3.11 stack was
not touched. Deployment is the owner's Portainer paste (no Portainer API access).

## 2026-09-25 — 0.3.13

0.3.12 plus two owner-requested UI fixes: the hidden getting-started checklist can be shown
again (Budget page and /guide), and the Accounts tools are one uniform, wrapping toolbar.
No schema change. Local gates: check 238, e2e 112 (axe 0), screenshots/contrast, backup.
- 0.3.13 built: mynab 645fd2757be4, mynab-tools e005098d71b6 (commit 83a6206). Live 0.3.12 deployed by owner; DB has all 32 migrations.

## 2026-09-25 — 0.3.14

YNAB-style close (confirmed closing adjustment, no reconcile requirement) and delete
(starting balance only); one-step "Add to MyNAB" for linked bank accounts; starting balance
from the bank on link and on sync. Migration 202609250018_account_delete. Local gates:
check 239, integration 127, e2e 114 (axe 0), backup 39 tables.
0.3.14 built from 5f91604: mynab 22cb5f1956fc, mynab-tools c55785f690ce (user node). Live
backup mynab-pre-0.3.14-20260925T222926Z.dump (39 tables). Rehearsal on a restored copy:
migration 18 applied, 33 migrations total, 609 transactions and 8 accounts intact;
disposable container removed. Running stack (0.3.13) untouched.

## 2026-09-25 — 0.3.15

In-place updates instead of full page reloads (next/form GET forms, Link, ActionForm for
Plans/Household). No schema change. check 239, integration 127, e2e 116 (axe 0), backup.
- 0.3.15 built: mynab 6675dcf16844, mynab-tools abbfcc3b1ab8; server was on 0.3.13.

## 2026-09-25 — 0.3.16

Deleting an account detaches file-import links; Unlink from bank in Account settings. No
schema change. check 239, integration 128, e2e 116 (axe 0), backup.
- 0.3.16 built: mynab 2c7f8d7bc106, mynab-tools 7efb4b649b72; server on 0.3.15.

## 2026-09-25 — Budget editing redesign (0.3.17 candidate)

Moved Target creation, editing, snooze and removal into the Budget category inspector.
The inspector also handles category settings and links to a recurring Schedule form with
that category preselected. Added inline group/category creation and group-name settings;
collapsed idle Move money and Money moves tools. Renamed Goals navigation to Targets;
`/targets` is an overview with bulk funding and category links, and `/goals` redirects.
This is a presentation/workflow change with no migration or change to existing money.

Local gates before documentation/version edits passed: `npm run check` (239),
`npm run test:integration` (128), `/mynab` production build,
`APP_BASE_PATH=/mynab npm run test:e2e` (118, desktop/mobile axe 0), and
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` (39 tables).

## 2026-09-26 — Release 0.3.20 built for Portainer

Built from commit `942e92d94636cf2bf4b2e28f3a50ffb97b23332f` using
`npm run release`. Linux amd64 images are local on `plex@192.168.1.7`:
`mynab:0.3.20` (image ID `e2961383b0ef`) and `mynab-tools:0.3.20`
(image ID `6d4f05cec991`). Build verified `APP_BASE_PATH=/mynab`, runtime
user `node`; dependency install reported zero vulnerabilities. Server root had
64 GB free (86% used). No Portainer stack update or production data mutation;
owner will paste the full current stack with re-pull disabled.

Release-source verification: `npm run check` passed (239 unit tests), full
integration suite passed (130), focused new stock-group integration passed
(1), production build passed, and focused desktop/mobile catalog browser tests
passed (2).
After final UI edits, repeated check/build and targeted desktop/mobile bill and
a11y flows passed; screenshot/contrast suite passed (zero reported failures).
Image build and Portainer deployment are pending at this entry.

## 2026-09-25 — Return money to Ready to Assign (0.3.18 candidate)

YNAB's official guidance confirms that moving a carried category balance back to Ready to
Assign makes current-month Assigned negative, while current-month Available falls to zero.
MyNAB already supported this with a negative assignment and an Undo in move history,
but the control was obscure. Added a one-click Return available action in the category
inspector and an explicit explanation for partial returns. A new integration example
checks that returning $400 of rollover leaves January unchanged, February Available at
zero, February Assigned at -$400, and Ready to Assign $400 higher. The Plans page now
explains that Create plan is empty and offers the starter groups, whereas Fresh Start
copies existing groups/categories. `npm run test:integration` passed (129). Version
0.3.18 image build and Portainer deployment are pending at this entry.
0.3.18 local verification: `npm run check` passed (239), `npm run test:integration`
passed (129), `/mynab` production build passed, and targeted Playwright passed
(4 desktop/mobile tests: manual cycle and category inspector). A prior isolated
inspector test timed out because it depended on the Food category made by the
manual cycle; rerunning both in order passed. The full browser gate remains
last recorded for 0.3.17.
0.3.18 Linux image build VERIFIED: `npm run release` exited 0 from
`9d44b4f913b5419ce11e8b3848b0c3429cc19ee5`. The host has
`mynab:0.3.18` (3a98c0212b5b) and `mynab-tools:0.3.18`
(a5591231ce51), both amd64 and user node. Read-only host inspection still
showed app/worker/admin on 0.3.16. No Portainer update or data mutation.

## 2026-09-25 — Suggested categories on every plan (0.3.19 candidate)

The starter set was offered only on an empty plan; the old action created all 26
visible rows at once. Added a compact Suggested categories picker inside the
Budget Envelopes header. A selection creates or reuses its group/category in
one authorized and audited command, opens that category's inspector, and
leaves other suggestions virtual. The picker remains available after creating
custom categories. No assignment, Target, ledger posting or migration is made
by selecting a suggestion. The old bulk command remains for compatibility;
existing categories are not altered.

Verification before final release edits: `npm run check` passed (239),
`npm run test:integration` passed (130, including reuse/no-ledger coverage),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`
passed, and targeted Playwright passed on desktop/mobile (2). No 0.3.19 image
build or Portainer update at this entry.
Full 0.3.19 local gate passed: `npm run check` (239),
`npm run test:integration` (130), `/mynab` production build,
`APP_BASE_PATH=/mynab npm run test:e2e` (120 desktop/mobile, axe 0),
screenshot/contrast suite (2, zero reported failures), and
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` (39 tables).

## 2026-09-26 — Release 0.3.21 built for Portainer

Card payment setup from debt terms (percentage-only minimums, managed payment
target + transfer schedule, migration `202609260001_card_payment_schedule`),
category inspector hub, and unified "+ Add group" with stock suggestions.
Built from commit `820b283` (tree clean at `96ee7f2`) by the owner running
`npm run release`: `mynab:0.3.21` and `mynab-tools:0.3.21` are local on
`plex@192.168.1.7`, `APP_BASE_PATH=/mynab`, runtime user `node`, 64 GB free
(86% used). The 0.3.21 image IDs were not in the output pasted back. No
Portainer stack update or production data mutation yet.

Release-source verification: `npm run check` (240 unit), `npm run
test:integration` (132), `/mynab` production build, `APP_BASE_PATH=/mynab npm
run test:e2e` (122, axe 0), `npm run test:backup` (39 tables), screenshot and
contrast run (0 failures).

## 2026-09-26 — Release 0.3.22 built for Portainer

Deletes for categories (unused ones removed, used ones archived), groups and
schedules (unapproved entries removed with it); Set up payment for existing
card terms; terms form prefills when editing, overwrites the version in force,
previews the calculated minimum, and records an intro APR with its end month;
payoff plan defaults to scheduled card payments. No migration.

Built from commit `bcfe5b587cc57e0217d99df8ffbeb2c3d7485432` using
`npm run release`: `mynab:0.3.22` (image ID `46c4d5c3609d`) and
`mynab-tools:0.3.22` (image ID `6b77d1d63175`) are local on
`plex@192.168.1.7`, `APP_BASE_PATH=/mynab`, runtime user `node`, 64 GB free
(86% used). No Portainer stack update or production data mutation by the agent.

Release-source verification: `npm run check` (240 unit), `npm run
test:integration` (136), `/mynab` production build, `APP_BASE_PATH=/mynab npm
run test:e2e` (132), `npm run test:backup` (39 tables), screenshot and
contrast run (0 failures).

## 2026-09-26 — Release 0.3.23 built for Portainer

Payoff plan: a card whose due day has not passed this month pays today's
balance before new interest (the minimum still counts a month's interest);
comparison line reads "saves $X in interest". No migration.

Built from commit `e2c902e432991b415da63d78bebd89826c4aa77a` using
`npm run release`: `mynab:0.3.23` (image ID `3bdec202f826`) and
`mynab-tools:0.3.23` (image ID `af4b84935df7`) are local on
`plex@192.168.1.7`, `APP_BASE_PATH=/mynab`, runtime user `node`, 66 GB free
(86% used). No Portainer stack update or production data mutation by the agent.

Release-source verification: `npm run check` (243 unit), `npm run
test:integration` (136), `/mynab` production build, `APP_BASE_PATH=/mynab npm
run test:e2e` (132).

## 2026-09-26 — Release 0.3.24 built for Portainer

Deferred-interest promotions on card terms (held-back interest charged in
full if a balance remains at the deadline; default plan clears deferred cards
just in time) and a Custom payoff order. Migration
`202609260002_deferred_interest` adds `DebtTerms.deferredInterest` and
`deferredAccrued`; composite FK count unchanged (45).

Built from commit `16aafd22eda3eb03527c4515d7dc6499ec712d6d` using
`npm run release`: `mynab:0.3.24` (image ID `f6bd34a40e5a`) and
`mynab-tools:0.3.24` (image ID `8e662f917729`) are local on
`plex@192.168.1.7`, `APP_BASE_PATH=/mynab`, runtime user `node`, 64 GB free
(86% used). No Portainer stack update or production data mutation by the agent.

Release-source verification: `npm run check` (246 unit), `npm run
test:integration` (137), `/mynab` production build, `APP_BASE_PATH=/mynab npm
run test:e2e` (134), `npm run test:backup` (39 tables), contrast run (0).

## 2026-09-26 — Release 0.3.25 built for Portainer

Adopted payoff plan: settings stored in `DebtPlan` (migration
`202609260003_debt_plan`), applied monthly from ledger balances to card
payment targets and managed schedules; Budget page prompt; hand-edited
targets left alone unless reclaimed. Debt building shared in
`src/application/debt-plan.ts`.

Built from commit `353e1d39e899a18c3aa67cb283e32f05a78cb009` using
`npm run release`: `mynab:0.3.25` (image ID `dd1baaf957d7`) and
`mynab-tools:0.3.25` (image ID `eba1e10c65c3`) are local on
`plex@192.168.1.7`, `APP_BASE_PATH=/mynab`, runtime user `node`, 66 GB free
(86% used). No Portainer stack update or production data mutation by the agent.

Release-source verification: `npm run check` (246 unit), `npm run
test:integration` (138), `/mynab` production build, `APP_BASE_PATH=/mynab npm
run test:e2e` (136), `npm run test:backup` (40 tables), contrast run (0).

## 2026-09-26 — Release 0.3.26 built for Portainer

Built from `10d3a59`: Move money offers Ready to Assign on either side; a card
due-day change moves the next managed payment instead of leaving the old day's
payment too; card payment targets can be snoozed. No migration.

`npm run release`: `mynab:0.3.26` (image ID `10082173cd29`) and
`mynab-tools:0.3.26` (image ID `a5565e9f0c12`) are local on
`plex@192.168.1.7`, `APP_BASE_PATH=/mynab`, runtime user `node`, 64 GB free
(86% used). No Portainer stack update or production data mutation by the agent.

Release-source verification: `npm run check` (246 unit), `npm run
test:integration` (139), `/mynab` production build, `APP_BASE_PATH=/mynab npm
run test:e2e` (138, a11y 0).

## 2026-09-26 — Release 0.3.27 built for Portainer

Built from `410fc96`: an adopted payoff plan is applied each month by the
worker (job `debt.plan.track`, daily by the budget's calendar) and a paid-off
card leaves the plan (no target, managed schedule archived, stays out after new
spending unless added back); an expense schedule without a category says so,
and one category with a blank amount takes the whole amount. Migration
`202609260004_debt_plan_tracking`.

`npm run release`: `mynab:0.3.27` (image ID `b3ced1181390`) and
`mynab-tools:0.3.27` (image ID `1c271879fb53`) are local on
`plex@192.168.1.7`, `APP_BASE_PATH=/mynab`, runtime user `node`, 64 GB free
(86% used). No Portainer stack update or production data mutation by the agent.

Release-source verification: `npm run check` (246 unit), `npm run
test:integration` (142), `/mynab` production build, `APP_BASE_PATH=/mynab npm
run test:e2e` (138, a11y 0), `npm run test:backup` (40 tables).

## 2026-09-26 — Release 0.3.30 images built for Portainer

Loan terms now support scheduled monthly transfers from a chosen budget account
to a tracking loan, with a selected budget category; leaving Pay from empty ends
an existing managed loan schedule. No migration. Feature source commit:
`ba026e61f908ccd1697bf9c10c049bbfb6335bf4`; release metadata commit:
`2d591786f5f8c79d7acfa28a2d9c709b1266387c`.

`npm run release`: `mynab:0.3.30` (image ID `1c0c0d92a1d1`) and
`mynab-tools:0.3.30` (image ID `760909c25653`) are local on
`plex@192.168.1.7`, linux/amd64, `APP_BASE_PATH=/mynab`, runtime user `node`.
Builder limit was 2 CPUs/2 GiB; 63 GiB free after build (87% used). No
Portainer stack update or production data mutation by the agent. The attempted
0.3.29 images remain local but are superseded due to mismatched lockfile version.

Release-source verification: `npm run check` (246 unit),
`npm run test:integration` (143), `/mynab` production build, focused loan browser
flow (2 desktop/mobile). Container smoke and backup/restore release checks were
not run for this image. Production upgrade remains pending owner database backup
and manual Portainer update with re-pull disabled.

## 2026-09-26 — Release 0.3.31 images built for Portainer

Stage 0 and 1 of the owner-approved "Ink ledger" redesign: design tokens and
type roles in `globals.css` (legacy names aliased), `src/components/ui/`
primitives, the new shell (sidebar with account balances, phone tab bar, one
top bar), the revised drawer and the Budget page. Non-UI: `financePage` is
memoised per request and shared by the shell and the Debt page; `FinanceForm`
refreshes after every outcome. No migration. Feature commit `82f0bf4`;
release metadata commit `60f3a41`.

Verified locally: `npm run check` (246 unit), `npm run test:integration`
(143), `/mynab` production build, `npm run test:e2e` desktop 70/70 and mobile
70/70 (axe 0 on 17 routes, both themes), screenshot harness + contrast audit
(0 distinct failures). Two pre-existing suite defects were repaired in the
tests (the 0.3.29 loan test left a debt with only future-dated terms; the
export download test is intermittently flaky and unrelated).

`npm run release`: `mynab:0.3.31` (image ID `b32b60ff698f`) and
`mynab-tools:0.3.31` (image ID `7198dd06b726`) are local on
`plex@192.168.1.7`, linux/amd64, `APP_BASE_PATH=/mynab`, runtime user `node`.
Builder limit was 2 CPUs/2 GiB; 65 GiB free after build (86% used). No
Portainer stack update or production data mutation by the agent.

## 2026-09-26 — Release 0.3.32: the Ink ledger redesign completed

Stages 2–7 of the owner-approved redesign, on top of 0.3.31's foundations
and Budget page: every remaining route rebuilt on PageHeader → SummaryStrip
→ ledger/surface, the drawer and popovers; legacy token aliases, type roles
and `.primary-button/.secondary-button` removed from `globals.css`; harness
extended with twelve phone-width shots that fail on sideways scroll. Budget
ledger follow-ups from the owner's review (one header row above all groups,
Uncategorized as its own conditional bar, collapsible groups via
`GroupToggle`, assign status overlay, Assigned heading over the figure).
App fixes found on the way: terms-form `clearPayment` read stale props
before the refresh; `scroll-padding-bottom` for the phone tab bar; nested
`h3` in the Reports drill drawer; phone summary strip with an odd stat
count. No migration. Feature commit `92c5445`; release metadata commit
`aac3291`.

Verified locally on the release tree: `npm run lint` (eslint now ignores
`ai/.state/**`), `npm run typecheck`, `npm test` (246), `npm run
test:integration` (143), `/mynab` production build, `npm run test:e2e`
140/140 desktop+mobile (axe 0), screenshot harness + contrast audit (0).
Intentional test edits: functional page headings; the stock-offer count no
longer matches the group collapse toggle.

`npm run release` was run by the owner: `mynab:0.3.32` (image ID
`e9c01921cf6d`) and `mynab-tools:0.3.32` (`379767930ed9`) built on
`plex@192.168.1.7` from `aac3291`, linux/amd64, `APP_BASE_PATH=/mynab`. The
owner then updated the Portainer stack; app, worker and admin are running
0.3.32 and report healthy. The agent made no production change.

## 2026-09-26 — Release 0.3.33: plan-ahead card targets, target colours, pending bank rows

Owner reported three things. (1) A followed payoff plan only ever wrote one
open-ended target per card, so the next month repeated this month's amounts,
including a card the plan clears; `getFinance` now overlays months after the
current one from the plan's simulation (`planProjection`, shared with
`applyDebtPlan`), so a cleared card has no target and the others show their
re-planned amounts marked "planned". (2) Underfunded targets were red;
following YNAB, "Needs funding"/"Overdue" and the Available pill are yellow
while a live target still needs money, red only for overspending and "Over
limit"; by owner decision "Build up to an amount" no longer asks for money
(state `BUILDING`, "Saving up"), a documented deviation. (3) Pending bank
transactions never reached the register; following YNAB's pending section,
both registers list them greyed and collapsible above the ledger, outside
every figure, with "Enter now" (`entry.enter`), manual entries match at the
pending stage, and the posted version merges into the entered row (same
amount clears in place; a changed amount takes the bank's amount and keeps
the category). No migration. Feature commit `314f517`; metadata `c0afd33`.

Verified locally on the release tree: lint, typecheck, `npm test` (248),
`npm run test:integration` (147), `/mynab` production build, e2e mobile
70/70 in the full run (the desktop chain stopped at the documented export
filename flake) and desktop 70/70 on rerun (axe 0), screenshot harness +
contrast audit (0 distinct failures).

`npm run release`: `mynab:0.3.33` (`2e27972dd4e3`) and `mynab-tools:0.3.33`
(`ed411b7e3d63`) built on `plex@192.168.1.7` from `c0afd33`, linux/amd64,
`APP_BASE_PATH=/mynab`. The running stack was not touched; the Portainer
update is the owner's.

## 2026-09-27 — Release 0.3.35: billed Plaid refresh is opt-in

The "Refresh from bank" call to Plaid's separately billed
`/transactions/refresh` endpoint is now disabled by default. Owners can opt in
with `PLAID_REFRESH=on`; the connections page hides the action otherwise, and
the API enforces the setting. Compose and deployment examples default to off.
No migration. Feature commit `0b5ae90`; release metadata commit `f107a12`.

Verified: `npm run check` (lint, typecheck, 250 unit tests),
`npm run test:integration` (149), `APP_BASE_PATH=/mynab
APP_ORIGIN=https://127.0.0.1:3443 npm run build`, and
`APP_BASE_PATH=/mynab npm run test:e2e` (140/140, axe 0).

`npm run release` built `mynab:0.3.35` (`a2ec387582c8`) and
`mynab-tools:0.3.35` (`3f513f7f2534`) on `plex@192.168.1.7` from `f107a12`,
linux/amd64, `/mynab`, runtime user `node`; builder capped at 2 CPUs/2 GiB
with 65 GiB free afterward. The running Portainer stack was not touched.

## 2026-09-26 — Release 0.3.34: refresh from bank, link-day pending rows

Owner: pending charges at the bank did not appear after "Sync now" on
0.3.33. A read-only Plaid pull from scratch inside the worker container
returned zero pending rows for every connection (latest posted 9/24–9/26),
so nothing in MyNAB dropped them: Plaid pulls from each institution only
one to four times a day and a plain sync reads its cache. Added
`Provider.refresh` (`/transactions/refresh`, a Plaid per-call add-on) and
`refreshConnection`: refresh, sync what is available, queue one follow-up
`provider.sync` three minutes later; a separate "Refresh from bank" button
with a confirm on Bank sync, and `ProviderAction` shows a result message.
Also fixed: `commitEntries` dropped rows dated on or before the link day,
which excluded pending charges dated on the day of linking (every card was
linked 9/25–9/26); pending rows now pass whatever their date, and a posted
row settling a known pending row is accepted as its update. Commits
`ca2c702` (feature), `9cdd97f` (version). Verified: lint, typecheck, unit
249, integration 149, `/mynab` build, e2e 140/140 (axe 0), harness +
contrast 0. Built `mynab:0.3.34` (`e22a15c0ac8f`) and `mynab-tools:0.3.34`
(`52ea9ac4e222`) on the host; the Portainer update is the owner's.

## 2026-09-27 — Release 0.3.36: budget drag-and-drop, click-to-fund, card targets only

- Budget page: drag groups and categories into order with @dnd-kit (grip in the
  gutter; mouse, touch, keyboard); categories can move into another group; card
  payment categories stay in theirs. Commands `group.move`, `category.move`.
- A target's "Needs $X" assigns exactly that amount (`target.fund` +
  `categoryId`), recomputed server-side, one undoable Money Move.
- Owner decision: card terms and the adopted payoff plan set payment targets
  only and never schedule a card payment (YNAB never creates schedules).
- Verified: check (250 unit), integration (152), `/mynab` build, e2e 142/142.
  Built `mynab:0.3.36` (`f28c385de3bd`), `mynab-tools:0.3.36` (`54acee1e9707`).

## 2026-09-27 — Release 0.3.37: debt reminders for the bank, ntfy push

- `DebtReminder` (migration `202609270001_debt_reminders`): what must be done
  at the bank to keep a payoff plan true — payment changes when a card's
  target moves, rate checks after each statement, deferred-interest risk and
  countdown, short payments after the due date, interest that disagrees with
  the APR. "Done at the bank" records what the bank pays.
- `debt.terms.set` re-applies an adopted plan immediately.
- Optional ntfy push (`NTFY_*`), job `notify.push` in waking hours.
- Also ships the phone drawer / row click / target line fixes (`0ec5073`).
- Verified: check (260 unit), integration (155), `/mynab` build, e2e 143 + 1
  skipped (axe 0). Built `mynab:0.3.37` (`8ece07941812`), `mynab-tools:0.3.37`
  (`c9983ea94cc2`) from `0cd4e6b`.

## 2026-09-27 — Release 0.3.38: payoff schedule by due date

- Debt page "Month by month": the first column is each card's due date
  (budget date format), a month later once this month's due day has passed,
  sorted by due date; month name when no due day. Explains the monthly split.
- Verified: check (260 unit), `/mynab` build, e2e 143 + 1 skipped (axe 0).
  Built `mynab:0.3.38` (`7253ea1691aa`), `mynab-tools:0.3.38`
  (`079162b5db17`) from `3974d76`.

## 2026-09-28 — Release 0.3.39: fixed payments in a followed plan

- A card's payment can be fixed for a plan month (a bank payment already
  set); the plan pays exactly that and re-balances the rest of the same
  monthly total. `DebtPlan.pins`, migration `202609270002_debt_plan_pins`,
  command `debt.plan.pin`. The Debt page shows an adopted plan with exactly
  its own settings.
- Verified: check (261 unit), integration (156), `/mynab` build, e2e 143 + 1
  skipped (axe 0). Built `mynab:0.3.39` (`307757913d7a`), `mynab-tools:0.3.39`
  (`5147916427f1`) from `8bb5a54`.

## 2026-09-28 — Release 0.3.40: SimpleFIN Bridge replaces Plaid

- SimpleFIN Bridge is the only bank provider (setup token pasted on Bank sync;
  one windowed request per sync; pending rows reconciled without a cursor;
  per-bank warnings; new token on revoked access). "Move here" moves an
  account from another connection keeping history, matching the overlap.
- Plaid removed (adapter, Link UI, OAuth page, config, CSP widening). Existing
  Plaid connections are retired: history kept, never synced.
- Also: Plaid Link exit reporting fix (5963a48, superseded by the removal).
- Migration `202609280001_simplefin_provider`.
- Verified: check (256 unit), integration (156), `/mynab` build, e2e 138
  (two known flaky tests excluded), axe 0. Built `mynab:0.3.40`
  (`61d3c98244f8`), `mynab-tools:0.3.40` (`bfe2ae595acf`) from `0d5a738`.

## 2026-09-28 — Release 0.3.41: new SimpleFIN banks appear; moved Plaid hides

- Each SimpleFIN sync records every reported account (new ones unlinked);
  Sync now reports how many are new.
- Moving the last account off a retired Plaid connection closes it; Bank sync
  hides Plaid connections with no linked account. No migration.
- Verified: check (256 unit), integration (156), `/mynab` build, e2e 138
  (two known flaky tests excluded), axe 0. Built `mynab:0.3.41`
  (`fe923c4030d0`), `mynab-tools:0.3.41` (`3e628971f2c8`) from `4562edd`.

## 2026-09-28 — Release 0.3.42: SimpleFIN pending rows; popover placement

- SimpleFIN pending: flag or posted: 0; undated pending dated by the account's
  balance date (or today) instead of dropped. Sync now reports how many
  pending rows SimpleFIN sent.
- Payoff plan "Set amount" and Plans "Rename" popovers right-aligned properly.
- Verified: check (257), integration (156), `/mynab` build, e2e 138 (two
  known flaky tests excluded), axe 0. Built `mynab:0.3.42` (`873d43884227`),
  `mynab-tools:0.3.42` (`f622355169a8`) from `eecaa38`.

## 2026-09-28 — Release 0.3.43: deferred deadline by exact date and due dates

- Deferred promotions store their exact last day (`promoEndsOn`, migration
  `202609280002_promo_ends_on`); the plan, reminders and Debt page count only
  payments due before it. Fixes a last payment due on the deadline itself.
- Verified: check (258), integration (157), `/mynab` build, e2e 138 (two known
  flaky tests excluded), axe 0. Built `mynab:0.3.43` (`cc35cf6bb81b`),
  `mynab-tools:0.3.43` (`c7310c85c7c0`) from `e8828b8`.

## 2026-09-28 — Release 0.3.44: approve imports in the register (YNAB)

- Unapproved imports marked in each register ("New", accent edge), approved
  from the row, "N to approve" with Approve all; sidebar count per account.
  No migration.
- Verified: check (258), integration (157), `/mynab` build, e2e 140 (two known
  flaky tests excluded), axe 0. Built `mynab:0.3.44` (`34f0957d540c`),
  `mynab-tools:0.3.44` (`28986c4401cf`) from `a75c7c3`.
