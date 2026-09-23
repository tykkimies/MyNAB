# Docker release gate

Use this checklist for each image revision. Historical verification of older images does
not verify a new release. Current evidence belongs in NEXT_STEPS.md and DEVELOPMENT_LOG.md.
Run destructive checks only in an explicitly named disposable `_test` database/project.

1. Verify lint, types, unit/property and PostgreSQL integration tests, a production build,
   HTTPS desktop/mobile tests and a backup/restore comparison covering **all tables**.
   Test migrations both from an empty database and from the prior schema.
2. Commit the application and version/stack tags. Build both `runner` and `tools` images
   using `scripts/release.sh` on the Linux host. Keep `/mynab` as the build-time base path.
   Apply resource limits; do not prune shared images, caches or volumes without authorization.
3. Start a separate Compose project with synthetic secrets, a `_test` database, private DB
   network and a distinct loopback app port. Migration must exit 0 and readiness return 200.
   Verify the app is non-root, DB has no host port, and no secret files exist in the image.
4. Run the application tests inside the tools image against that disposable database using
   `npm test -- --configLoader native --no-cache` and
   `npm run test:integration -- --configLoader native --no-cache`. The default loader attempts
   to write beside root-owned files; do not loosen image permissions to make tests run. Run
   `node --import tsx scripts/container-smoke.mjs` after integration tests; it creates the
   synthetic owner/ledger and verifies auth, cookies, assets, routes and financial balances.
5. Recreate app/DB containers, preserving the disposable volume. Compare all table digests.
   Run backup.sh and restore.sh into a new `mynab_restore_...` database, then compare digests
   again. Include observations, journals, identities, audits, assignments and migrations.
6. In that disposable project, check readiness failure/recovery on database outage, while
   liveness remains healthy. Logs must not reveal credentials or provider response bodies.
   Remove only the project/volumes created for these tests; preserve release images.
7. Record source commit, image IDs, platform, resource limits, test results and limitations.
   Production deployment remains separate from a successful build/test.

## Owner's Portainer upgrade

- Back up the live database first; preserve SECRET_ENCRYPTION_KEY separately. Do not change
  the existing encryption key or database password during an ordinary image upgrade.
- Paste the **whole current `deploy/portainer/stack.yml`** into Stacks → mynab → Editor.
  Image tags alone can omit new environment variables. Retain existing stack environment
  values and update with re-pull **disabled** because the images are local to this host.
- Confirm migrate exits 0 and `/mynab/api/health/ready` returns 200, then sign in through nginx.
- For 0.3.1: inspect the bank-review screen, verify a real posted transaction's sign/date/amount,
  then run a second unchanged sync and confirm earlier history remains. Pending observations
  must not affect the ledger. Do not use old application images against the migrated schema.
- Roll back schema-changing releases by restoring the pre-upgrade backup into a clean
  environment with the matching old image and encryption key, not by blindly changing tags.

Never run `docker compose down -v` on the real installation.
