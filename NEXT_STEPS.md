# MyNAB handoff — 2026-09-26

## Current release: 0.3.30

Loan terms now support scheduled payments from a chosen budget cash account,
categorized to a budget category, or no managed payment. Source commit
`ba026e61f908` contains the feature; release metadata commit `2d591786f5f8`
synchronizes `package.json`, `package-lock.json`, and the Portainer stack.

`npm run release` built `mynab:0.3.30` (`1c0c0d92a1d1`) and
`mynab-tools:0.3.30` (`760909c25653`) on `plex@192.168.1.7`, linux/amd64,
`APP_BASE_PATH=/mynab`, runtime user `node`. Builder limit was 2 CPUs/2 GiB;
63 GiB remained free (87% used). The attempted 0.3.29 images
(`db916deda376`, `949d604693c7`) are superseded and must not be deployed.

## Next deployment action

Production is still running its previous Portainer stack. Back up the live
database and preserve the encryption key separately, then paste the entire
`deploy/portainer/stack.yml` into Stacks -> mynab and update with re-pull
disabled. Confirm migrate exits 0, app and worker health, and
`/mynab/api/health/ready` returns 200. The release image build does not perform
these actions. This image has local check (246 unit), PostgreSQL integration
(143), production build, and focused desktop/mobile browser (2) evidence; the
container smoke and backup/restore release checks were not run for 0.3.30.

Read `AGENTS.md`, `ai/PROJECT.md`, and `ai/HANDOFF.md`; run `sh ai/checkpoint.sh recover`. Preserve the working tree and production data. Never print `.env` or `.local/portainer-mynab.env`.

## Archived project background

Phases 1–8 passed the recorded gate in `docs/FINAL_GATE.md`. Later YNAB alignment is tracked in `docs/YNAB_ALIGNMENT.md` and `docs/YNAB_PARITY.md`; this is not a claim of exact parity with every YNAB platform feature. Images through 0.3.18 were built on the Linux host, 0.3.18 from commit `9d44b4f`; the running stack remains 0.3.16 at the latest check. Check the live Portainer tag before asserting what is deployed. Version 0.3.19 source adds a suggested-category catalog to every Budget page. No Portainer update or production data mutation has been performed for 0.3.17–0.3.19.

A Target is a funding rule attached to a category, including monthly bills. A Schedule creates a real transaction when due. The Budget category inspector now owns Target editing and category settings. `/targets` is an overview and bulk-funding page; `/goals` redirects. Groups and categories are added in the Budget list, group names open their settings, and idle Move money/Money moves tools are compact disclosures. The category inspector links to a Schedule form with its category preselected.

The five starter groups and their 26 categories are now a virtual picker under Envelopes, even in a plan with existing categories. Choosing one creates or reuses that group/category, opens its inspector, and does not add any other unused suggestion to the ledger. The legacy `starter.apply` command remains for existing clients, but the bulk UI was replaced by the picker. There is no migration or data conversion. Categories created earlier by bulk apply remain as they were; they are not automatically hidden or deleted.

## Previous local verification (historical)

On the redesign before version/documentation-only edits: `npm run check` (239 unit tests, lint, typecheck); `npm run test:integration` (128); `APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`; `APP_BASE_PATH=/mynab npm run test:e2e` (118 desktop/mobile, axe 0); `PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` (39 tables). After the group-name and schedule-shortcut edits, `npm run check`, production build, targeted desktop/mobile bill workflow, targeted accessibility and screenshot/contrast tests passed. See `ai/HANDOFF.md` for exact sequence. The browser tests use synthetic data; live bank sign-in, Safari/Firefox and manual screen-reader testing are not verified here. The 0.3.17 images were built (web 6a3733a2333f, tools 11525fafac3e). 0.3.18 images were built (web 3a98c0212b5b, tools a5591231ce51), linux/amd64, user node, from `9d44b4f`. The running stack was untouched. For 0.3.18, `npm run check` passed (239), `npm run test:integration` passed (129), `/mynab` production build passed, and targeted browser checks passed on desktop/mobile (manual budgeting cycle and category inspector; four tests). An isolated inspector test failed because it depends on the preceding cycle creating Food; the dependent run passed. The full browser suite was last run on 0.3.17 before this small UI change.

## Superseded next tasks (historical)

1. Commit and build 0.3.19 images on Linux. Verified: `npm run check` (239), `npm run test:integration` (130), `/mynab` build, `APP_BASE_PATH=/mynab npm run test:e2e` (120 desktop/mobile, axe 0), screenshot/contrast suite (2, zero reported failures), and `PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` (39 tables). No schema migration.
2. To preview live, the owner pastes the **whole** `deploy/portainer/stack.yml` into Portainer, keeps existing environment variables, and leaves re-pull disabled. Then verify `migrate` Exited (0), app/worker healthy, readiness 200, the suggested-category picker, bill workflow and Return available.
3. Observe the new Budget workflow during real use. Review any friction with inline group controls, the mobile inspector, Target due dates and Schedule creation. Compare actual YNAB behaviors using `docs/YNAB_PARITY.md`; prioritize concrete differences over broad parity claims.

## Commands and limits

Use `~/.local/share/mynab-toolchain/node-v24.21.0-darwin-arm64/bin` on PATH. Local PostgreSQL is on 127.0.0.1:55432. Run integration and browser suites sequentially because they share a synthetic test database. Standard gates: `npm run check`, `npm run test:integration`, `APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`, `APP_BASE_PATH=/mynab npm run test:e2e`, then `PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup`. The owner declined automated off-host backups; documented manual backup/restore is available. Build images only on the Linux Docker host and never reset production.
