# Phase 1 Docker release gate

The initial workspace had no Docker. On 2026-09-22, version 0.1.1 was subsequently
built and tested on 192.168.1.7 in an isolated Compose project: startup, migrations,
non-root runtime, authentication, persistence, backup/restore, and DB-outage recovery passed.
The owner's actual Portainer deployment and nginx /mynab location still need final browser
verification after deployment. Use this checklist again for future releases.

1. Configure a fresh `.env` with newly generated secrets and an actual HTTPS origin.
   Run `docker compose config --quiet`, then `docker compose up -d --build`.
   Confirm PostgreSQL is healthy, migration exits 0, and app becomes healthy.
2. Verify the app process runs as non-root and PostgreSQL has no published host port.
   Confirm `GET /api/health/live` and `/api/health/ready` return 200 with only a status.
3. Create a synthetic owner with `docker compose run --rm migrate npm run owner:create`.
   Sign in through nginx; verify Secure/HttpOnly/SameSite cookies and a nonce CSP.
   Visit all four pillars on a phone and desktop; check theme, keyboard access, and logout.
4. Restart the app and DB using `docker compose restart`. The owner, budget, and audit
   history must remain. Anonymous protected-page requests still redirect to login.
5. Run `scripts/backup.sh`, then restore the archive to a new `mynab_restore_...` database
   using `scripts/restore.sh`. Never reuse an existing DB name. Point an isolated app
   at the restored DB with the matching encryption key. Verify migration status, login,
   and all seven application-table counts plus `_prisma_migrations`.
6. Reset the synthetic owner's passphrase. Existing browser sessions must be rejected;
   only the replacement passphrase should work. Confirm passwords are never echoed.
7. In the disposable environment only, stop PostgreSQL. Readiness must return 503,
   liveness must remain 200, and logs must show no credentials/connection strings.
   Restart PostgreSQL and confirm readiness recovers.
8. Check both supported nginx topologies: host loopback, or the external Docker network
   override. The override must remove host app-port publication.
9. Record OS/architecture, Docker/Compose versions, image identifiers, test date, and
   outcomes in DEVELOPMENT_LOG.md and NEXT_STEPS.md. Only then mark this gate verified.

Back up before updates. Never use `docker compose down -v` on a real installation.
