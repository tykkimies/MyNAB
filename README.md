# MyNAB

An original, self-hosted personal finance application built around envelope budgeting.
Only budget money that exists. Give it a job that matters to you.

**Current release: Phase 1 foundation.** Owner login, session security, a responsive
four-section shell, PostgreSQL migrations, deployment files, and backup commands exist.
Accounts, transactions, budgeting calculations, goals, debt planning, and bank sync are
**not implemented yet**. No sample balances are presented as real finances.

## Run with Docker Compose

Requires a Linux Docker host, Docker Compose 2.24.4+, and your existing HTTPS nginx
reverse proxy. The production application requires HTTPS even when hosted on a LAN.

1. Copy `.env.example` to `.env` and restrict it: `chmod 600 .env`.
2. Generate two independent values with `openssl rand -hex 32`: one PostgreSQL password
   and one `SECRET_ENCRYPTION_KEY`. Set both password occurrences consistently.
3. Set `APP_ORIGIN` to your exact HTTPS origin, without a trailing slash.
4. Start the application:

   ```sh
   docker compose up -d --build
   docker compose ps -a
   docker compose run --rm migrate npm run owner:create
   ```

The owner command prompts interactively for a username and hidden passphrase of
15–128 characters. Never pass a password as a command argument. The migration service
finishes successfully before the app starts; its exit status 0 is expected. Visit your
configured HTTPS origin after setting up nginx.

PostgreSQL has no published port. The application defaults to `127.0.0.1:3000` for host
nginx; use [the nginx example](docs/nginx.conf.example). If nginx runs in Docker, set
`NGINX_NETWORK` to its existing network and use:

```sh
docker compose -f docker-compose.yml -f docs/compose.proxy.yml up -d --build
```

Configure nginx to forward to `app:3000` on that network. This override removes the
host port. Keep `.env` outside web-accessible directories. Forwarded headers never
determine the trusted application origin; `APP_ORIGIN` does.

## Owner recovery and maintenance

```sh
docker compose run --rm migrate npm run owner:reset
docker compose run --rm migrate npm run sessions:prune
```

Password reset revokes every session and clears login throttles. There is no public
registration, email recovery, or required MFA. Sessions expire after seven days or
24 hours idle. Login is limited to ten attempts per username and thirty total per
15 minutes; successful logins also consume an attempt. Existing sessions continue
to work during a login lockout. Run pruning periodically (for example daily).

Health endpoints: `/api/health/live` and `/api/health/ready`. Readiness verifies DB access
and the expected migration version. Neither endpoint exposes account data. Inspect
status with `docker compose ps` and sanitized logs with `docker compose logs app`.

Before upgrading: take a backup, read migration notes, then run
`docker compose up -d --build`. Never run `prisma migrate reset` on real data.
The database persists in the `postgres-data` volume. `docker compose down` preserves it;
adding `-v` deletes it and must not be used for normal upgrades.

## Backup and restore

```sh
./scripts/backup.sh
./scripts/restore.sh backups/your-backup.dump mynab_restore_20260922
```

Backup creates a custom-format PostgreSQL snapshot with restrictive permissions and
checks its archive index. Restore creates a **new** database; it fails if that name
already exists. It never overwrites the current database. Do not put backups in `public/`.

Encrypt backups before copying off-host (for example with your own age recipient),
and keep the encryption identity separate. Save `.env` and the provider encryption key
in a password manager separately from the database backup. A DB dump alone cannot
recover encrypted provider tokens without their key.

Suggested schedule: nightly, retain seven daily and four weekly encrypted copies.
Test restoration quarterly. Start an isolated app against the restored database with
the matching code version and original encryption key; verify migration status,
readiness, login, row counts, and eventually reconciled balances. Before switching a
restored database into service, stop the app, update `DATABASE_URL`, run migrations,
then restart. Retain the old database until verification is complete. Restoration does
not itself invalidate backed-up sessions; reset the owner password before reopening a
restored production instance to revoke them.

## Local development

Use Node **24.21.0** (see `.node-version`), npm supplied with it, and PostgreSQL 17.
Create separate `mynab_dev` and `mynab_test` databases. Copy `.env.example` to `.env`,
set your local DB URL, generate a secret key, and use `APP_ORIGIN=http://127.0.0.1:3000`.
HTTP is allowed only for loopback development; production always requires HTTPS.

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run owner:create
npm run dev
```

The initial development session installed Node under
`~/.local/share/mynab-toolchain/node-v24.21.0-darwin-arm64/bin`; on that machine prepend
that directory to PATH. PostgreSQL 17 was installed with Homebrew. Its project-local,
loopback-only development cluster is under ignored `.local/postgres`, port 55432.
It contains synthetic test data only; do not reuse its trust authentication for deployment.
No login service was registered. To start/stop the project-local cluster:

```sh
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D .local/postgres -l .local/postgres.log -o '-h 127.0.0.1 -p 55432' start
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D .local/postgres stop
```

For the backup roundtrip on that machine, use
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` after browser tests.

## Verification

Unit tests need no database. Integration and browser tests **truncate application tables**;
use a dedicated database whose name ends in `_test`. Copy `.env.test.example` to
`.env.test` and configure that database. An already-exported `DATABASE_URL` takes
precedence; the suffix guard refuses other database names.

```sh
npm run check
node --env-file=.env.test node_modules/prisma/build/index.js migrate deploy
npm run test:integration
APP_ORIGIN=https://127.0.0.1:3443 npm run build
npx playwright install chromium
npm run test:e2e
# With PostgreSQL 17 client binaries on PATH:
npm run test:backup
npm audit --audit-level=moderate
```

Browser tests run the production build behind a temporary local HTTPS proxy on port
3443 (backend 3100), using a synthetic owner. OpenSSL must be available. Tests cover
Secure cookies, CSRF, desktop/mobile navigation, keyboard access, themes, and sign out.
Screenshots and traces go to ignored `test-results/`. No real owner is automatically
created in the development database.

CI repeats these checks on PostgreSQL and builds the Docker image. Deployment/volume
and operator-script verification on an actual Docker host remains a separate release
gate; follow [the release checklist](docs/RELEASE_CHECKLIST.md) and see NEXT_STEPS.md
for the observed verification state.

## Development continuity

Read [PROJECT_SPEC.md](PROJECT_SPEC.md), [NEXT_STEPS.md](NEXT_STEPS.md), then
[DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) before changing the application. Preserve the
framework-independent domain layer. Before Phase 2 code, turn the documented financial
invariants and examples into executable tests. Update documentation at every milestone.
