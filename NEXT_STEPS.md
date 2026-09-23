# Development handoff

## Current phase

Phase 1 foundation implemented. Local and isolated Linux Docker checks pass.
Version 0.1.1 images are ready on 192.168.1.7; owner Portainer/nginx deployment is next.
Read PROJECT_SPEC.md before extending the application. Do not jump to Plaid integration.

## What works

- Local-password owner bootstrap and recovery, Argon2id, hashed opaque sessions, seven-day
  absolute/24-hour idle expiry, logout/reset revocation, DB throttles, and audit events.
- Protected Budget / Accounts / Goals / Debt shell with honest empty states, responsive
  navigation, keyboard access, light/dark theme persistence, and HTTPS security headers.
- PostgreSQL foundation schema and SQL constraints; budget membership authorization.
- Exact BIGINT cents/date primitives, AES-GCM provider-secret utility, bounded form input,
  configured-origin CSRF protection, secret-safe error logging, liveness/readiness.
- Docker/Compose/nginx configuration and backup/restore scripts exist; runtime checks below.

## Verified on 2026-09-22

| Check                            | Result                                                          |
| -------------------------------- | --------------------------------------------------------------- |
| Clean `npm ci`                   | Passed; legacy ESLint plugin peer warnings only                 |
| Lint and TypeScript              | Passed                                                          |
| Unit/property tests              | 39 passed; includes 1,000 random signed-64-bit money roundtrips |
| PostgreSQL integration           | 14 passed, including bootstrap/login/reset concurrency          |
| Production standalone build      | Passed                                                          |
| HTTPS browser tests              | 10 passed: desktop and mobile Chromium                          |
| Visual review                    | Login and budget shell; desktop light and mobile dark checked   |
| Native PostgreSQL backup/restore | All 8 tables matched in fresh database                          |
| Interactive owner create/reset   | Passed in temporary DB; no passphrase echo                      |
| Dependency audit                 | Zero vulnerabilities                                            |
| Backup/restore shell syntax      | Passed                                                          |

Browser tests use the actual standalone production artifact behind a local TLS proxy.
Generated screenshots/traces remain in ignored `test-results/`.

## Incomplete / unverified

- The production Portainer stack and existing nginx location have not been deployed/changed
  by the agent. The owner requested ready-to-use stack information and will create the location.
  Use deploy/portainer/README.md, stack.yml, and the private .local/portainer-mynab.env file.
- Images mynab:0.1.1 and mynab-tools:0.1.1 are built for linux/amd64 with /mynab compiled in.
  They exist locally on the Docker host, not in a public registry; disable forced pulls.
- GitHub Actions exists but has not run remotely. No Git remote/push/deployment was done.
- Real accounts, transactions, ledger, budgets, goals, debt, rules, reports, imports,
  and provider synchronization are not implemented. No production provider tokens exist.
- Only Chromium is covered; Safari/Firefox and assistive-technology review remain later work.
- ESLint legacy plugin peer ranges do not advertise version 10; compatibility wrappers work.
  Prisma transitive security overrides are documented in PROJECT_SPEC.md; reassess on upgrades.
- No known failing local tests. Phase 1 is a foundation, not yet usable for actual budgeting.

## Immediate next tasks

1. Deploy the provided Portainer stack named mynab, import the private environment file,
   create the owner using the admin container console, and add the nginx /mynab location.
   Verify access at https://plexmanager.duckdns.org/mynab.
2. Turn PROJECT_SPEC sections 4–6 and 15 into executable accounting examples/properties.
   Start with conservation, cash vs card deficits, future reservations, opening debt,
   mixed spending, refunds after payoff, positive card balances, and deterministic replay.
3. Design the Phase 2 migration: account/internal-ledger distinction, balanced immutable
   journals, reversals, transaction splits, assignments, cross-budget constraints, idempotency.
   Use deferred SQL constraints for journal balancing or document a tested equivalent.
4. Implement authorized application commands with serializable retries and audits before UI.
5. Add manual account/transaction/budget/reconciliation workflows incrementally. Keep bank
   integration deferred until the manual system and accounting invariants are trustworthy.

## Relevant modules and setup

- `src/domain`: pure money/date primitives; future accounting engine goes here.
- `src/application`: auth/session/budget authorization services.
- `src/infrastructure`: DB, environment validation, cryptography, logs, HTTP security.
- `src/app`, `src/components`, `src/proxy.ts`: routes, shell, and nonce/security headers.
- `prisma`: schema + `202609220001_foundation` migration, already applied to local dev/test DBs.
- `scripts`: owner commands, cleanup, standalone preparation, backup/restore, HTTPS test server.
- `tests`: unit/property, PostgreSQL integration, HTTPS browser suites; see README for commands.

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

On future migrations, update readiness's expected migration set, schema documentation,
backup/restore verification, and this handoff. Never reset the production database.

## Commit milestones

- `842fa21`: specification and continuity documents, before application code.
- `6f3dd14`: tested Phase 1 foundation and operational documentation.

## 0.1.1 Linux Docker validation

On 192.168.1.7, Docker 29.4.1 / Compose 5.1.3 / linux-amd64:

- Built runner and tools images with APP_BASE_PATH=/mynab; runner is approximately 285 MB.
- Tested the actual Portainer YAML in a separately named mynab-image-test project,
  with only its database name and loopback test port changed.
- Migration exit 0, app healthy, UID 1000, no published PostgreSQL port.
- Login/logout/recovery, CSRF, secure cookies, all four pages and prefixed assets/redirects pass.
- Owner survives app/DB restarts; actual backup/restore scripts match all eight tables.
- DB outage: readiness 503 while liveness remains 200; health recovers after DB restart.
- Interactive admin-container password recovery works without echoing passphrases.
- 10 local HTTPS browser tests also pass with the /mynab build; CI now covers root and subpath.

Production stack: deploy/portainer/stack.yml. Image source/build logs on the server:
/home/plex/mynab/releases/0.1.1. The stopped mynab-builder is dedicated to this project;
its cache is retained for later builds. No public registry publishing occurred.

The isolated mynab-image-test containers, networks, test volume, synthetic backup, and
test environment file were removed after verification. Release images remain available.
The local PostgreSQL test cluster and dedicated remote builder were left stopped.
