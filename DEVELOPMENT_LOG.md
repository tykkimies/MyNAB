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
