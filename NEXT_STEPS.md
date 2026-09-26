# MyNAB handoff — 2026-09-25

Read `AGENTS.md`, `ai/PROJECT.md`, and `ai/HANDOFF.md`; run `sh ai/checkpoint.sh recover`. Preserve the working tree and production data. Never print `.env` or `.local/portainer-mynab.env`.

## Current state

Phases 1–8 passed the recorded gate in `docs/FINAL_GATE.md`. Later YNAB alignment is tracked in `docs/YNAB_ALIGNMENT.md` and `docs/YNAB_PARITY.md`; this is not a claim of exact parity with every YNAB platform feature. Images through 0.3.16 were built on the Linux host. Check the live Portainer tag before asserting what is deployed. The 0.3.17 worktree changes the Budget editing experience; it has no migration or accounting model change. No Portainer update or production data mutation has been performed for 0.3.17.

A Target is a funding rule attached to a category, including monthly bills. A Schedule creates a real transaction when due. The Budget category inspector now owns Target editing and category settings. `/targets` is an overview and bulk-funding page; `/goals` redirects. Groups and categories are added in the Budget list, group names open their settings, and idle Move money/Money moves tools are compact disclosures. The category inspector links to a Schedule form with its category preselected.

## Verified locally

On the redesign before version/documentation-only edits: `npm run check` (239 unit tests, lint, typecheck); `npm run test:integration` (128); `APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`; `APP_BASE_PATH=/mynab npm run test:e2e` (118 desktop/mobile, axe 0); `PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` (39 tables). After the group-name and schedule-shortcut edits, `npm run check`, production build, targeted desktop/mobile bill workflow, targeted accessibility and screenshot/contrast tests passed. See `ai/HANDOFF.md` for exact sequence. The browser tests use synthetic data; live bank sign-in, Safari/Firefox and manual screen-reader testing are not verified here. Image build and Portainer startup for 0.3.17 remain pending until recorded below.

## Next executable tasks

1. Finish the 0.3.17 documentation and release commit; rerun `npm run check`, `/mynab` production build and `git diff --check` after the final edits.
2. Run `npm run release` on a clean committed tree to build both Linux amd64 images. Verify their tags and source commit. Do not overwrite prior images or mutate the running stack.
3. To preview live, the owner pastes the **whole** `deploy/portainer/stack.yml` into Portainer, keeps existing environment variables, and leaves re-pull disabled. Then verify `migrate` Exited (0), app/worker healthy, readiness 200 and the bill workflow. No new migration is expected for 0.3.17.
4. Observe the new Budget workflow during real use. Review any friction with inline group controls, the mobile inspector, Target due dates and Schedule creation. Compare actual YNAB behaviors using `docs/YNAB_PARITY.md`; prioritize concrete differences over broad parity claims.

## Commands and limits

Use `~/.local/share/mynab-toolchain/node-v24.21.0-darwin-arm64/bin` on PATH. Local PostgreSQL is on 127.0.0.1:55432. Run integration and browser suites sequentially because they share a synthetic test database. Standard gates: `npm run check`, `npm run test:integration`, `APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`, `APP_BASE_PATH=/mynab npm run test:e2e`, then `PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup`. The owner declined automated off-host backups; documented manual backup/restore is available. Build images only on the Linux Docker host and never reset production.
