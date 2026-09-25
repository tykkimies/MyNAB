# MyNAB handoff — 2026-09-25

Read `AGENTS.md`, `ai/PROJECT.md`, and `ai/HANDOFF.md`, then run `sh ai/checkpoint.sh recover`. Preserve the working tree and production data. Do not print `.env` or `.local/portainer-mynab.env`.

## Current state

Phases 1–8 passed the final gate in `docs/FINAL_GATE.md`. The last released host-local images are `mynab:0.3.10` and `mynab-tools:0.3.10`; Portainer still uses those tags. This continuation did not deploy or mutate production. The owner declined automated backups; manual backup/restore remains available.

The YNAB alignment contract is `docs/YNAB_ALIGNMENT.md`. A1/B4 (categorized imports and bulk approval) and A2/B2 (matching, including differing amounts) were committed by the previous agent. A3 (worker-entered scheduled transactions) is committed as `e3fac62`, and A4 (register edit/delete/undo) as `25ec289`. Both passed local gates and are unreleased. B1 Auto-Assign variants are next, followed by B3 Age of Money, a new release, then the in-app guide last. Preserve the Warm Editorial Finance design, restrained color and compact controls.

## Verified changes

A3 enters a due schedule once via a budget-scoped worker job. It is a real, uncleared transaction awaiting approval. Owner confirmation does not repost; rejection reverses it; an imported match approves it. Older unapproved entries stay visible. Migration `202609250006_scheduled_entry` adds occurrence and job checks without altering the previously committed alignment migration. All 21 migrations passed on both an upgraded synthetic database and a fresh temporary database. `npm run check` passed (202 unit/property), `npm run test:integration` passed (104 at A3), `/mynab` production build passed, browser passed (70, including desktop/mobile schedule review and axe 0), backup/restore passed (35 tables).

A4 gives the register Edit, Delete and Undo, while storage keeps immutable reversal/replacement journals and audit history. Undo reconstructs the prior date, amount, payee, memo, splits and cleared state; reconciled history requires acknowledgment. Opening balances retain the `OPENING` kind, which cannot be used to forge a second starting balance. It has no migration. `npm run check` passed (202), `npm run test:integration` passed (106), `/mynab` production build passed, browser passed (36 desktop + 36 mobile, axe 0), backup/restore passed (35 tables).

An early simultaneous integration/browser run shared the synthetic database and failed owner bootstrap. Sequential reruns passed. Container/Portainer checks have not been run for these new changes. Do not claim deployment.

## Next executable tasks

1. Implement B1 Auto-Assign variants from `docs/YNAB_ALIGNMENT.md`. Start with pure domain calculations over `BudgetInput`: prior-month/average assigned, prior-month/average spent, reduce overfunding, reset assigned and reset available. Support all eligible categories or one row through an authorized, idempotent command. Test exact cents, month boundaries, targets, overspending, and conservation. The existing `target.fund` command and Budget page are the integration points. No B1 application code has been written.
2. Implement B3 Age of Money from the alignment contract.
3. Re-run release gates, build new tagged images on Linux, update the full Portainer stack YAML, and document deployment. The owner performs Portainer deployment; do not overwrite 0.3.10 images or reset production.
4. Build the in-app guide last, using the setup checklist and task-page outline in `docs/FINAL_GATE.md` section 5. Avoid copying YNAB wording or visual design.

## Commands and limits

Prepend `~/.local/share/mynab-toolchain/node-v24.21.0-darwin-arm64/bin` to PATH. Local PostgreSQL test DB is on loopback port 55432. Standard gates: `npm run check`, `npm run test:integration`, `APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`, `APP_BASE_PATH=/mynab npm run test:e2e`, then `PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup`. Run integration and browser suites sequentially; they share test data. Live OAuth, real-bank sign verification, manual screen-reader and Safari/Firefox review remain unverified. No automated off-host backup is configured by owner choice.
