# MyNAB handoff — 2026-09-25

Read `AGENTS.md`, `ai/PROJECT.md`, and `ai/HANDOFF.md`; run `sh ai/checkpoint.sh recover`. Preserve the working tree and production data. Never print `.env` or `.local/portainer-mynab.env`.

## Current state

Phases 1–8 passed the recorded gate in `docs/FINAL_GATE.md`. Later YNAB alignment is tracked in `docs/YNAB_ALIGNMENT.md` and `docs/YNAB_PARITY.md`; this is not a claim of exact parity with every YNAB platform feature. Images through 0.3.18 were built on the Linux host, 0.3.18 from commit `9d44b4f`; the running stack remains 0.3.16 at the latest check. Check the live Portainer tag before asserting what is deployed. The 0.3.18 worktree adds an explicit Return available to Ready to Assign action using the existing signed assignment operation. No Portainer update or production data mutation has been performed for 0.3.17 or 0.3.18.

A Target is a funding rule attached to a category, including monthly bills. A Schedule creates a real transaction when due. The Budget category inspector now owns Target editing and category settings. `/targets` is an overview and bulk-funding page; `/goals` redirects. Groups and categories are added in the Budget list, group names open their settings, and idle Move money/Money moves tools are compact disclosures. The category inspector links to a Schedule form with its category preselected.

## Verified locally

On the redesign before version/documentation-only edits: `npm run check` (239 unit tests, lint, typecheck); `npm run test:integration` (128); `APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`; `APP_BASE_PATH=/mynab npm run test:e2e` (118 desktop/mobile, axe 0); `PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` (39 tables). After the group-name and schedule-shortcut edits, `npm run check`, production build, targeted desktop/mobile bill workflow, targeted accessibility and screenshot/contrast tests passed. See `ai/HANDOFF.md` for exact sequence. The browser tests use synthetic data; live bank sign-in, Safari/Firefox and manual screen-reader testing are not verified here. The 0.3.17 images were built (web 6a3733a2333f, tools 11525fafac3e). 0.3.18 images were built (web 3a98c0212b5b, tools a5591231ce51), linux/amd64, user node, from `9d44b4f`. The running stack was untouched. For 0.3.18, `npm run check` passed (239), `npm run test:integration` passed (129), `/mynab` production build passed, and targeted browser checks passed on desktop/mobile (manual budgeting cycle and category inspector; four tests). An isolated inspector test failed because it depends on the preceding cycle creating Food; the dependent run passed. The full browser suite was last run on 0.3.17 before this small UI change.

## Next executable tasks

1. To preview live, the owner pastes the **whole** `deploy/portainer/stack.yml` into Portainer, keeps existing environment variables, and leaves re-pull disabled. Then verify `migrate` Exited (0), app/worker healthy, readiness 200, the bill workflow and Return available. No new migration is expected for 0.3.18.
2. Observe the new Budget workflow during real use. Review any friction with inline group controls, the mobile inspector, Target due dates and Schedule creation. Compare actual YNAB behaviors using `docs/YNAB_PARITY.md`; prioritize concrete differences over broad parity claims.

## Commands and limits

Use `~/.local/share/mynab-toolchain/node-v24.21.0-darwin-arm64/bin` on PATH. Local PostgreSQL is on 127.0.0.1:55432. Run integration and browser suites sequentially because they share a synthetic test database. Standard gates: `npm run check`, `npm run test:integration`, `APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`, `APP_BASE_PATH=/mynab npm run test:e2e`, then `PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup`. The owner declined automated off-host backups; documented manual backup/restore is available. Build images only on the Linux Docker host and never reset production.
