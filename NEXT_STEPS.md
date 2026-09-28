# MyNAB handoff — 2026-09-27

## Current release: 0.3.54 (built; Portainer update pending owner)

Phone sheets: a category's Target and Move money, and a transaction's Edit,
open as pages of the sheet; editing a target is one tap. No migration.
Commits `358d8c1`, `e3af65e`. Built `mynab:0.3.54` (`d459b2a7df6b`),
`mynab-tools:0.3.54` (`aa5e181df7a3`); 94 GiB free. Owner: paste
stack.yml 0.3.54 in Portainer.

## Previous release: 0.3.53

Phone: plan switcher in the top bar, menus no longer clipped, settings
toggles show on/off, Bank sync with Sync now on Accounts. Last synced shows
date and time. No migration. Commits `9f2ebcc`, `f4f322c`. Built
`mynab:0.3.53` (`8f92e760941a`), `mynab-tools:0.3.53` (`ae8c56f44a17`);
97 GiB free. Owner: paste stack.yml 0.3.53 in Portainer.

## Older release: 0.3.52 (deployed 2026-09-28)

Phone app layout: a phone gets its own frame (tab bar with a centre Add)
and pages for Budget, Accounts/registers, Add, Reports and Debt; other
pages point to the desktop site, with a Desktop site / Phone site switch.
No migration. Commits `b405924`, `3430df1`. Built `mynab:0.3.52`
(`6deb05c420cc`), `mynab-tools:0.3.52` (`70dddef038f7`); 45 GiB free.
Owner: paste stack.yml 0.3.52 in Portainer, then add to the iPhone home
screen and check the notch and bottom spacing.

## Older release: 0.3.51

Reports as YNAB-style tabs (Spending Breakdown, Spending Trends, Net
Worth, Income v Expense, Age of Money, Cash Flow, Budget vs Actual), period
presets, new charts. No migration. Commits `7f2eeb3`, `2f5374e`. Built
`mynab:0.3.51` (`427a910c20fc`), `mynab-tools:0.3.51` (`0d051ad8a52f`);
47 GiB free. Owner: paste stack.yml 0.3.51 in Portainer.

## Older release: 0.3.50

Debt what-if form ("Try a payoff plan") in a drawer from the header; right
column only for an adopted plan. No migration. Commits `8c416d4`,
`04530c8`. Built `mynab:0.3.50` (`a5c2f292d10d`), `mynab-tools:0.3.50`
(`ead27002e2d2`); 48 GiB free. Owner: paste stack.yml 0.3.50 in Portainer.

## Older release: 0.3.49

Debt page redesign: each debt's terms, plan outcome and recorded versions in
a drawer; month-by-month schedule in a wide drawer from the header. No
migration. Commits `b2354f7`, `d26d74e`. Built `mynab:0.3.49`
(`93f50cbfcc36`), `mynab-tools:0.3.49` (`f04110bdfe67`); 50 GiB free.
Owner: paste stack.yml 0.3.49 in Portainer.

## Older release: 0.3.48

Payoff schedule shows Owed before and Owed after. No migration. Commits
`0b83d37`, `973d771`. Built `mynab:0.3.48` (`a3499da117af`),
`mynab-tools:0.3.48` (`adece9b8c100`).

## Older release: 0.3.47

Debt headline matches the schedule; what-if banner with "Back to my plan".
No migration. Commits `3ebd3eb`, `eb85345`. Built `mynab:0.3.47`
(`ddbf83daa536`), `mynab-tools:0.3.47` (`4b08a8e33e6e`); 52 GiB free.
Owner: paste stack.yml 0.3.47 in Portainer.

## Previous release: 0.3.46

Each budget month funds the card payment due in that month. No migration.
Commits `1b34e6b`, `cb4eaa9`. Built `mynab:0.3.46` (`5995ff33e93c`),
`mynab-tools:0.3.46` (`d673101b4c4f`); 54 GiB free. Owner: paste stack.yml
0.3.46 in Portainer; review October card assignments.

## Previous release: 0.3.45

Funding a later month's card target assigns the plan's amount. No
migration. Commits `9800884`, `61f3210`. Built `mynab:0.3.45`
(`bfc52eca7f86`), `mynab-tools:0.3.45` (`f6096e0b472b`); 55 GiB free.
Owner: paste stack.yml 0.3.45 in Portainer.

## Previous release: 0.3.44

Approve imported transactions in the register like YNAB (marking, row
Approve, Approve all, sidebar counts). No migration of its own (0.3.43's
applies if not yet deployed). Commits `eaedd4a`, `a75c7c3`. Built
`mynab:0.3.44` (`34f0957d540c`), `mynab-tools:0.3.44` (`28986c4401cf`); 57
GiB free. Owner: paste stack.yml 0.3.44 in Portainer.

## Previous release: 0.3.43

Deferred promotions end on an exact day; only payments due before it count.
**Migration** `202609280002_promo_ends_on`. Commits `0b4f3d9`, `e8828b8`.
Built `mynab:0.3.43` (`cc35cf6bb81b`), `mynab-tools:0.3.43`
(`c7310c85c7c0`); 58 GiB free. Owner: paste stack.yml 0.3.43, then re-save
the deferred card's terms with its exact end date.

## Previous release: 0.3.42

Undated SimpleFIN pending rows kept; Sync now reports "SimpleFIN sent N
pending"; popover placement fix. No migration. Commits `2eac23f`, `eecaa38`.
Built `mynab:0.3.42` (`873d43884227`), `mynab-tools:0.3.42`
(`f622355169a8`); 54 GiB free. Owner: paste stack.yml 0.3.42 in Portainer.

## Previous release: 0.3.41

New SimpleFIN banks appear on the next sync; retired Plaid connections close
and hide once their accounts are moved. No migration (0.3.40's applies if
0.3.40 was never deployed). Commits `c63c149`, `4562edd`. Verified: check
(256), integration (156), build, e2e 138 excluding the two known flakes.
Built `mynab:0.3.41` (`fe923c4030d0`), `mynab-tools:0.3.41`
(`3e628971f2c8`); 60 GiB free. Owner: paste the whole stack.yml (0.3.41),
re-pull disabled, confirm migrate Exited (0) and health ready.

## Previous release: 0.3.40

SimpleFIN Bridge replaces Plaid for bank sync; Plaid removed and existing
Plaid connections retired (history kept). **Migration**
`202609280001_simplefin_provider`. Feature commit `5bc66e9`; release metadata
`0d5a738`. Verified: check (256 unit), integration (156), `/mynab` build, e2e
138 with the two known flaky tests excluded (axe 0). `npm run release` built
`mynab:0.3.40` (`61d3c98244f8`) and `mynab-tools:0.3.40` (`bfe2ae595acf`) on
`plex@192.168.1.7`, `/mynab`, user `node`; 61 GiB free. Running stack
untouched. Owner: back up DB + key, paste the whole stack.yml (0.3.40; the
PLAID_* lines are gone and may be deleted from the stack's env), re-pull
disabled, confirm migrate Exited (0) and /mynab/api/health/ready 200. Then
Bank sync → Add banks with SimpleFIN Bridge → paste the setup token.
Known: two flaky e2e tests (mobile drawer scroll; export download).

## Previous release: 0.3.39

Fix one card's payment in a followed payoff plan (Debt page: Set amount /
Use the plan, Fix a later payment); the plan re-balances around it. The Debt
page now shows an adopted plan with exactly its own settings. **Migration**
`202609270002_debt_plan_pins`. Feature commit `463dc88`; release metadata
`8bb5a54`. Verified: check (261 unit), integration (156), `/mynab` build, e2e
143 + 1 skipped (axe 0). `npm run release` built `mynab:0.3.39`
(`307757913d7a`) and `mynab-tools:0.3.39` (`5147916427f1`) on
`plex@192.168.1.7`, `/mynab`, user `node`; 64 GiB free. Running stack
untouched. Owner: back up DB + key, paste the whole stack.yml (0.3.39),
re-pull disabled, confirm migrate Exited (0) and /mynab/api/health/ready 200.

## Previous release: 0.3.38

The payoff schedule on Debt shows each payment's due date (a month later once
this month's due day has passed), sorted by due date. No migration of its
own, but it includes 0.3.37's migration if 0.3.37 was never deployed.
Feature commit `4cbfa7d`; release metadata `3974d76`. Verified: check (260
unit), `/mynab` build, e2e 143 + 1 skipped (axe 0). `npm run release` built
`mynab:0.3.38` (`7253ea1691aa`) and `mynab-tools:0.3.38` (`079162b5db17`) on
`plex@192.168.1.7`, `/mynab`, user `node`; 63 GiB free. Running stack
untouched. Owner: back up DB + key, paste the whole stack.yml (0.3.38),
re-pull disabled, confirm migrate Exited (0) and /mynab/api/health/ready 200.

## Previous release: 0.3.37

Debt reminders ("To do at the bank" on Debt, notices on Budget): payment
changes when a card's target moves, rate checks after each statement,
deferred-interest risk and countdown, short payments, interest that disagrees
with the APR. New terms re-plan an adopted plan immediately. Optional ntfy
push. Also the phone drawer / row click / target line fixes. **Migration**
`202609270001_debt_reminders`. Feature commit `0c57de5`; release metadata
`0cd4e6b`. Verified: check (260 unit), integration (155), `/mynab` build, e2e
143 + 1 skipped (axe 0). `npm run release` built `mynab:0.3.37`
(`8ece07941812`) and `mynab-tools:0.3.37` (`c9983ea94cc2`) on
`plex@192.168.1.7`, `APP_BASE_PATH=/mynab`, user `node`; 62 GiB free. Running
stack untouched. Owner: back up DB + key, paste the whole stack.yml (it adds
the `NTFY_*` lines), re-pull disabled, confirm migrate Exited (0) and
/mynab/api/health/ready 200; add `NTFY_TOPIC` to enable push.

## Previous release: 0.3.36

Budget drag-and-drop (groups, and categories within and across groups; new
`group.move` / `category.move`), a "Needs $X" button that assigns exactly a
target's need (`target.fund` with `categoryId`), and card payments as
targets only: card terms and the adopted payoff plan never create or update a
schedule (as in YNAB). Existing managed card schedules stay until the owner
deletes them on Schedules. No migration; new dependency `@dnd-kit/core`.
Feature commit `d4ae062`; release metadata commit `a225b99`. Verified:
`npm run check` (lint, typecheck, 250 unit), integration (152), `/mynab`
build, e2e 142/142 (axe 0). `npm run release` built `mynab:0.3.36`
(`f28c385de3bd`) and `mynab-tools:0.3.36` (`54acee1e9707`) on
`plex@192.168.1.7` from `a225b99`, `APP_BASE_PATH=/mynab`, runtime user
`node`; 65 GiB free. Running stack untouched.

## Previous release: 0.3.35 (built; Portainer update pending owner)

The billed Plaid `/transactions/refresh` action is now opt-in: hidden by
default and available only when `PLAID_REFRESH=on`; the API also rejects the
command unless enabled. The free-tier deployment remains unbilled. No
migration. Feature commit `0b5ae90`; release metadata commit `f107a12`.
Verified: `npm run check` (lint, typecheck, 250 unit tests), PostgreSQL
integration (149), `/mynab` production build, and e2e 140/140 (axe 0).
`npm run release` built `mynab:0.3.35` (`a2ec387582c8`) and
`mynab-tools:0.3.35` (`3f513f7f2534`) on `plex@192.168.1.7` from `f107a12`,
linux/amd64, `APP_BASE_PATH=/mynab`, runtime user `node`; 65 GiB free after
build. Running stack untouched.

## Previous release: 0.3.34 (built; Portainer update pending owner)

Owner reported pending charges not arriving after "Sync now" on 0.3.33.
Diagnosis on the live stack (read-only Plaid pull, no cursor): Plaid held
zero pending rows for all five connections, latest posted rows 9/24–9/26.
Plaid pulls from each bank only one to four times a day, so "Sync now"
can only read its cache. 0.3.34 adds "Refresh from bank" on Bank sync
(`/transactions/refresh`, billed per call by Plaid, behind a confirm):
asks Plaid to pull now, syncs, and queues one follow-up sync three
minutes later. Sync also keeps pending rows dated on or before the link
day (they are unsettled, so never in the opening balance) and accepts a
posted row that settles a known pending one whatever its date. No
migration. Feature commit `ca2c702`; metadata `9cdd97f`. `npm run
release` built `mynab:0.3.34` (`e22a15c0ac8f`) and `mynab-tools:0.3.34`
(`52ea9ac4e222`) on `plex@192.168.1.7` from `9cdd97f`; the running stack
(0.3.33) was not touched. Evidence: lint, typecheck, unit (249),
integration (149), `/mynab` build, e2e 140/140 (axe 0), harness +
contrast 0.

## Previous release: 0.3.33 (deployed by the owner)

Three owner items (2026-09-26): an adopted payoff plan now shows later
months from its own projection (a card the plan clears has no target next
month; the others show the re-planned "planned" amounts; this month stays
the stored version the worker writes); underfunded targets are yellow on
Budget and Targets, the Available pill goes yellow while a live target
still needs money, red only for overspending and a passed limit, and
"Build up to an amount" is a no-ask "Saving up" tracker (owner decision,
deliberate YNAB deviation); pending bank transactions appear in a greyed,
collapsible "Pending at the bank" section above each register, outside
every figure, with YNAB's "Enter now", pending-stage matching of manual
entries, and a merge when the posted version arrives. No migration.
Feature commit `314f517`; release metadata commit `c0afd33`.

`npm run release` built `mynab:0.3.33` (`2e27972dd4e3`) and
`mynab-tools:0.3.33` (`ed411b7e3d63`) on `plex@192.168.1.7` from
`c0afd33`, linux/amd64, `APP_BASE_PATH=/mynab`, runtime user `node`;
65 GiB free after the build. The running stack (0.3.32) was not touched.

## Next deployment action

Owner: back up the live database and encryption key, paste the whole
`deploy/portainer/stack.yml` (0.3.35) in Portainer with re-pull disabled,
confirm migrate Exited (0) (nothing to apply) and `/mynab/api/health/ready`
200. Container smoke and backup/restore release checks were not run for
0.3.33–0.3.35.

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
