# MyNAB handoff — 2026-09-25

Read `AGENTS.md`, `ai/PROJECT.md`, and `ai/HANDOFF.md`, then run `sh ai/checkpoint.sh recover`. Preserve the working tree and production data. Do not print `.env` or `.local/portainer-mynab.env`.

## Current state

Phases 1–8 passed the final gate recorded in `docs/FINAL_GATE.md`. The last released host-local images are `mynab:0.3.10` and `mynab-tools:0.3.10`; Portainer's `deploy/portainer/stack.yml` still uses those tags. This continuation did not deploy or mutate production. The owner declined automated backups; manual backup and restore commands remain in the README.

The owner requested YNAB-like behavior. `docs/YNAB_ALIGNMENT.md` is the implementation contract: A1/B4 (categorized imports and bulk approval) and A2/B2 (matching, including differing amounts) are committed. A3 (worker-entered scheduled transactions) is committed as `e3fac62`, but unreleased. A4 (edit/delete/undo) is implemented and verified locally; commit pending. B1 (Auto-Assign variants), B3 (Age of Money), and the in-app guide remain. The guide is last, per owner request. Preserve the Warm Editorial Finance design, restrained color and compact category management.

## A3 local changes

A worker job enters due schedules once through `executeFinance`; occurrence status `ENTERED` means real, uncleared, unapproved ledger transaction. Owner can confirm without another posting or reject with an audited reversal. An imported bank match approves the occurrence. The schedules page keeps older unapproved entries visible. New migration `202609250006_scheduled_entry` changes occurrence/job checks; the already committed `202609250005_ynab_alignment` remains unchanged.

Verification recorded this batch: `node --env-file=.env.test node_modules/prisma/build/index.js migrate deploy` passed on local test DB and on a fresh temporary database (21 migrations); `npm run check` passed (202 unit/property); `npm run test:integration` passed (104, including job enqueue/claim); `APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build` passed; `APP_BASE_PATH=/mynab npm run test:e2e` passed (70, including desktop/mobile schedule approval and axe); `PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` passed (35 tables). An earlier browser/integration overlap failed because both reset the synthetic owner; sequential reruns passed. Container/Portainer verification has not been run for these changes. Do not claim deployment.

## Next executable tasks

1. Commit A4 after final diff review. Edit/Delete/Undo now covers ordinary and opening-balance rows, preserves immutable journals, checks reconciliation acknowledgment, and guards against new opening money. `npm run check` passed (202), `npm run test:integration` passed (106), `/mynab` build passed, desktop/mobile browser suites passed (36 each, axe 0), backup/restore passed (35 tables). No migration. Docker/production checks remain pending until a new release.
2. Implement B1 Auto-Assign variants and B3 Age of Money, following the alignment document.
3. Re-run release gates, build new tagged images on Linux, update the full Portainer stack YAML, and document deployment. The owner performs Portainer deployment; do not overwrite 0.3.10 images or reset production.
4. Build the in-app guide last, covering actual finished workflows and the setup checklist from `docs/FINAL_GATE.md` section 5. Avoid copying YNAB wording or visual design.

## Commands and limits

Use `PATH="$HOME/.local/share/mynab-toolchain/node-v24.21.0-darwin-arm64/bin:$PATH"`. Local PostgreSQL test DB is on loopback port 55432; integration tests require its migrations. `npm run check`, `npm run test:integration`, `APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`, `APP_BASE_PATH=/mynab npm run test:e2e`, then `PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` are the normal gates. Live OAuth, real-bank sign verification, manual screen-reader and Safari/Firefox review remain unverified. No automated off-host backup is configured by owner choice.
