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
