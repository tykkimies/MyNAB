## Release 0.3.64 — IN PROGRESS (owner, 2026-10-04)
Owner requested commit and an image build so they can test. This ships the
uncommitted register work since 0.3.63: dismiss deleted notices (migration
`202610040001_delete_notice_dismiss`), Outflow and Inflow columns, and split
assist. Package, lockfile, stack, and Portainer README bumped to 0.3.64.
Recorded before this commit: dismiss integration test passed, split-assist
unit and integration tests passed, `npm run check` passed (285 unit), and
`APP_BASE_PATH=/mynab npm run build` passed. Next: commit, then `npm run
release`. Do not update the running stack. The owner pastes the full
`deploy/portainer/stack.yml` with re-pull disabled so migrate can apply the
new column. No Git remote. Unrelated `docs/todo.txt` and `.kilo/` stay
uncommitted.

## Split assist — PLANNED (owner, 2026-10-04)
Request: a single categorized split with a blank amount takes the whole
transaction amount, as schedules already do. While splitting a transaction or
a schedule, show what is left, such as "$3.00 left to split". Over shows too
much. One blank row says it uses the whole amount. Do not auto-fill the last
of several splits. No schema, no deploy. Leave the uncommitted dismiss and
outflow work in place.
Plan: `.kilo/plans/1791074411838-deferred-interest-installment-display.md`.
First step: pure remainder helper and unit tests. Then server fill on
`transaction.create`, then the live assist on both forms.

**IMPLEMENTED (2026-10-04):** `splitAssist` in `src/domain/split-assist.ts`.
`transaction.create` fills one blank categorized split with the budget-leg
amount and still rejects a blank among several, or a sum that does not match.
`SplitAssist` on the transaction form and the schedule form shows left, too
much, the whole amount, or a sign mismatch as the inputs change.

**VERIFIED (2026-10-04):**
- `npx vitest run --project unit tests/unit/split-assist.test.ts` passed (4).
- `npx vitest run --project integration tests/integration/finance.test.ts -t "fills one blank split"` passed (1).
- `npm run check` passed (lint, typecheck, 285 unit).
- `APP_BASE_PATH=/mynab npm run build` passed.
No schema. Not deployed.

## Split assist — VERIFIED (owner, 2026-10-04)

## Outflow and Inflow columns — PLANNED (owner, 2026-10-04)
Request: replace the single signed Amount column with Outflow and Inflow on
the desktop registers and the phone. Negative leg is Outflow, positive is
Inflow, the other cell blank. Absolute amount, no minus sign, figures inside
`Amount`. Running balance stays signed. Editors and bulk math unchanged.
No schema, no deploy.
Plan: `.kilo/plans/1791074411838-deferred-interest-installment-display.md`.
First step: `registerFlows` and a unit test. Then the desktop grid, pending
rows, All accounts table, and the phone row.

**IMPLEMENTED (2026-10-04):** `registerFlows` in `src/domain/money.ts`. Desktop
account register, pending rows, and All accounts table show Outflow and Inflow.
Phone register has one header and two cells. Editors and bulk math unchanged.

**VERIFIED (2026-10-04):**
- `npm run check` passed (lint, typecheck, 281 unit, including `registerFlows`).
- `APP_BASE_PATH=/mynab npm run build` passed.
No schema. Not deployed.

## Outflow and Inflow columns — VERIFIED (owner, 2026-10-04)

## Dismiss deleted-transaction notices — PLANNED (owner, 2026-10-04)
Request: a deleted row can leave the account screen for good. The void stays
in the journal. After dismiss, Undo is not offered. It stays gone on every
device. Desktop account notices only. Each notice keeps Undo and gains
Dismiss; two or more also get Dismiss all. No cookie, no deploy.
Acceptance: `noticeDismissedAt` on `FinancialTransaction`; command
`transaction.dismissDelete` with ids (1–50); idempotent; refuses a live row,
another void reason, another budget, or a replaced row. No posting change.
Plan: `.kilo/plans/1791074411838-deferred-interest-installment-display.md`.
First step: column and migration `202610040001_delete_notice_dismiss`. Then
the command, the account-page filter and buttons, and a focused finance
integration test.

**IMPLEMENTED (2026-10-04):** `noticeDismissedAt` plus a one-way trigger
exception (the ledger otherwise rejects any update after the void). Command
`transaction.dismissDelete`. Account notices exclude dismissed rows and offer
Dismiss, plus Dismiss all when two or more are showing. Undo stays until
dismiss. Readiness list includes the migration. Applied to the local test
database only.

**VERIFIED (2026-10-04):**
- `npx vitest run --project integration tests/integration/finance.test.ts -t "dismisses a deleted notice"` passed (1).
- `npm run check` passed (lint, typecheck, 278 unit).
- `APP_BASE_PATH=/mynab npm run build` passed.
No production database access. Not deployed.

## Dismiss deleted-transaction notices — VERIFIED (owner, 2026-10-04)

## Release 0.3.63 — BUILT; Portainer update pending owner (2026-10-04)
Owner requested commit and an image build so they can update Portainer.
Committed as `a909db5`. Account register View Options remembers the date range
and checkboxes; reconciled rows are hidden by default and show a lock when
shown. `npm run check` passed (278 unit tests), `APP_BASE_PATH=/mynab npm run
build` passed, and the desktop register-view browser test passed (1). `npm run
release` built `mynab:0.3.63` (`ef9a3e8871dd`) and `mynab-tools:0.3.63`
(`9a26a0f602a8`) on `plex@192.168.1.7`, with `/mynab` base path and runtime user
`node`. Build-time `npm ci` reported 5 high-severity audit findings. 65G free.
The running stack was not touched; it stays at 0.3.60 until the owner pastes
the full `deploy/portainer/stack.yml` with re-pull disabled. No Git remote.
Unrelated `docs/todo.txt` and `.kilo/` were not committed.

## Account register View Options — PLANNED (owner, 2026-10-04)
Request: match YNAB View Options on the account register. Remember the choices.
Default hides reconciled rows. After Reconcile, newly stamped rows disappear
without a full reload. Desktop and phone share the list. No images, no schema,
All accounts unchanged.
Acceptance: date presets and From/To, Show Reconciled / Running Balance / Flags,
Apply and Cancel, cookie read on the server, lock on stamped rows, list-only
filter (balances stay full-history). Plan:
`.kilo/plans/1791074411838-deferred-interest-installment-display.md`.
First step: pure preset/filter helper and unit tests in `src/domain/register-view.ts`
and `tests/unit/register-view.test.ts`. Then cookie, account page filter, panel.

**Step 2 — IMPLEMENTED (2026-10-04):** `src/domain/register-view.ts` and
`tests/unit/register-view.test.ts`. `npx vitest run --project unit
tests/unit/register-view.test.ts` passed (5).

**Step 3–4 — IMPLEMENTED (2026-10-04):** cookie `mynab-register-view`, account
page filters desktop and phone lists, View Options panel, lock, flag dot, and
collapsible balance column. Apply and Show reconciled refresh in place.

**Step 5 — VERIFIED (2026-10-04):**
- `npx vitest run --project unit tests/unit/register-view.test.ts` passed (5).
- `npm run check` passed (lint, typecheck, 278 unit).
- `APP_BASE_PATH=/mynab npm run build` passed.
- `APP_BASE_PATH=/mynab npx playwright test --project=desktop tests/e2e/register-view.spec.ts` passed (1): reconciled opening row hidden, Apply shows the lock, reload keeps it.
No schema or production change. All accounts unchanged.

## Account register View Options — VERIFIED (owner, 2026-10-04)

## Release 0.3.62 — BUILT; Portainer update pending owner (2026-10-04)
Owner requested commit and an image build so they can update Portainer.
Committed as `ebd2455`. Deferred-interest display and reminders use the shared
installment formula (minimum plus an even share of the rest), about $189.11
rather than $149.11. `npm run check` passed (273 unit tests) and
`APP_BASE_PATH=/mynab npm run build` passed before the commit. `npm run release`
built `mynab:0.3.62` (`f71075ac5ecc`) and `mynab-tools:0.3.62`
(`3b23d8778c23`) on `plex@192.168.1.7`, with `/mynab` base path and runtime user
`node`. Build-time `npm ci` reported 5 high-severity audit findings. 67G free.
The running stack was not touched; it stays at 0.3.60 until the owner pastes
the full `deploy/portainer/stack.yml` with re-pull disabled. No Git remote.
Unrelated `docs/todo.txt` and `.kilo/` were not committed.

## Release 0.3.61 — BUILT; deployment pending owner (2026-10-03)
Owner requested commit and build only for the adopted payoff-plan terms fix and
existing card-payment conversion fix; production was not changed. Committed as
`fc16cf0`. `npm run check` passed (271 unit tests), the finance integration
suite passed (83), `APP_BASE_PATH=/mynab npm run build` passed, and the seeded
desktop card-payment browser flows passed (2). `npm run release` built
`mynab:0.3.61` (`6c5658cfd951`) and `mynab-tools:0.3.61`
(`5286720737b6`) on `plex@192.168.1.7`, with `/mynab` base path and runtime user
`node`. Build-time `npm ci` reported 5 high-severity audit findings. The stack
remains at 0.3.60 until the owner updates Portainer; image re-pull must stay
disabled. No Git remote is configured.

## Deferred-interest installment display — PLANNED (owner, 2026-10-03; plan file .kilo/plans/1791074411838-deferred-interest-installment-display.md)
Request: Implement the plan to make Debt page green estimate (/mo to clear for deferred) and reminders consistent with ~$189.11 using shared formula.
Acceptance criteria: Debt page and reminders use `deferredMonthlyPayment` (min + even share); tests updated incl. zero-min case; naive calcs and duplicate month math removed; match 189.11 not 149.11; no schema, phone display unchanged. Follows domain purity, YNAB parity, AGENTS (handoff before code, checkpoints).
Plan: See .kilo/plans/1791074411838-deferred-interest-installment-display.md (scope B: full share + export monthsBetween + dedup; min from currentMinimum / .minimum; same charge month calc).
Files: `src/domain/debt.ts` (export monthsBetween), `src/domain/debt-reminders.ts`, `src/app/(protected)/debt/page.tsx`, `tests/unit/debt.test.ts`, `ai/HANDOFF.md`.
First step (PLANNED): Update this handoff (before app code). Then: export, integrate in reminders + page, update test, checkpoint, verify with recorded commands, mark IMPLEMENTED/VERIFIED.

**Step 2 — IMPLEMENTED (2026-10-04):** Exported internal `monthsBetween` from `src/domain/debt.ts` (pure date math). No other changes. (Followed plan; this was after initial handoff PLANNED record. Prior uncommitted helper in debt.ts treated unverified.)

**Step 3 — IMPLEMENTED (2026-10-04):** Reminders integration in `src/domain/debt-reminders.ts`:
- Updated import to include `deferredMonthlyPayment, monthsBetween`.
- Replaced `perMonth` calc in `promoDeadline` to use `deferredMonthlyPayment(card.owed, card.minimum, BigInt(monthsLeft)) ?? ...`.
- Removed duplicate local `monthsBetween` and `ceilDiv`.
(Used exact shared logic.)

**Step 4 — IMPLEMENTED (2026-10-04):** Debt page integration in `src/app/(protected)/debt/page.tsx`:
- Updated import to pull `deferredMonthlyPayment, monthsBetween as monthsBetweenPlan`.
- Replaced `deferredPerMonth` to use `deferredMonthlyPayment(debt.balance, debt.currentMinimum ?? 0n, left)`.
- Replaced/removed local `monthsBetweenPlan`.
- Call site unchanged (now gets min-inclusive value).
(Used exact shared logic.)

**Step 5 — IMPLEMENTED (2026-10-04):** Tests in `tests/unit/debt.test.ts`:
- Changed assert from 14911n to 18911n in the "counts the minimum..." test (now exercises helper via sim).
- Added new it() "computes deferred monthly with zero minimum (and other edge cases)" covering direct calls to `deferredMonthlyPayment` (0 min, count=1, min>bal, null cases).
- Added `deferredMonthlyPayment` to test imports.

**Step 6 — IMPLEMENTED (2026-10-04):** `sh ai/checkpoint.sh checkpoint "deferred-interest display shared helper"`

**Step 7 — VERIFIED (2026-10-04):**
- `export PATH=.../node...; npx vitest run --project unit tests/unit/debt.test.ts -t "deferred|...|counts the minimum..." ` → 6 passed (incl. 18911n and zero-min)
- `npm run check` → lint + typecheck + 273 unit passed (after fixing related debt-reminders.test expects for correct min-inclusive perMonth: 43334n etc.; drift and countdown tests updated)
- `APP_BASE_PATH=/mynab npm run build` → succeeded (compiled, static pages)
All per plan. Uncommitted prior work now verified. No schema/prod change. Matches ~189.11 with shared formula.

## Deferred-interest installment display — VERIFIED (owner, 2026-10-03)
Owner confirms the adopted plan's conservative ~$189 payment is intended; make
the Debt page green estimate and deferred-deadline reminders consistent with it.
Balance example: $1,341.94, $45 minimum, due day 14, deadline 2027-07-14.
Payment due on the deadline is excluded, leaving nine installments (Oct 14–Jun
14). Display and reminders should show minimum plus the extra required, about
$189.11/month; do not reduce the plan to $149.11. Share the formula across
`src/domain/debt.ts`, `src/domain/debt-reminders.ts`, and the Debt page, with
unit tests including a zero-minimum case. Existing pending test expects $149.11
and must be updated to $189.11. First step: add a shared helper and update the
focused deferred-interest tests.

**Note (current impl start):** Helper added in uncommitted prior work (unverified per recovery). Continuing per plan: record PLANNED above, then implement steps.

## Adopted payoff plan term refresh — VERIFIED (owner, 2026-10-03)
Root cause: terms form prechecks `setPaymentTarget` when a card already has a
target. `debt.terms.set` was writing the standalone minimum target before the
adopted plan recalculated; the plan then mistook that write for a manual
override. Updated terms handling so a followed plan owns the card target and
recalculates it from new APR/minimum terms. Regression in
`tests/integration/finance.test.ts` exercises `setPaymentTarget: true`; the full
finance integration suite passed (83). `npm run check` passed (271 unit tests),
`APP_BASE_PATH=/mynab npm run build` passed, and the seeded desktop account/card
payment browser flows passed (2). Manually changed targets remain protected and
can be returned to plan control with "Use the plan for those cards too".

## Card payment conversion — VERIFIED (owner, 2026-10-01)
Owner reports a bank-side $161 credit-card payoff remains an expense, leaves
the card balance unpaid in MyNAB, and does not consume the card payment reserve.
The register's edit form now omits stale expense splits when the transaction is
changed to `TRANSFER`. Finance replacement keeps the linked bank entry lineage;
the regression browser flow confirms the bank balance is not double-counted and
the card payment reserve/debt are adjusted. SimpleFIN account balances still
seed opening balances only; ongoing balances remain ledger-derived and change
through imported transactions/reconciliation, not a later bank-balance overwrite.

## Release 0.3.60 — BUILT; Portainer deployment pending (owner, 2026-10-01)
Household privacy/lifecycle release committed as `74ed672`. `npm run check`
passed (271 unit tests), the `/mynab` build passed, integration passed (166),
focused browser tests passed (2), and all-route/theme WCAG reported 0 violations.
`npm run release` built `mynab:0.3.60` (`39b7a339b609`) and
`mynab-tools:0.3.60` (`675084e3be9e`) on `plex@192.168.1.7`. Verified fresh
production backup `/home/plex/mynab/backups/mynab-pre-0.3.60-20261001T032606Z.dump`
(683439 bytes, mode 600, SHA256
`892c2d836c87d9c745a0c262b18fd89c7f416ab32e48c834be289c0a830996e9`). The
running app/worker remain 0.3.59; production was not changed. Owner will update
the full Portainer stack with re-pull disabled. No Git remote is configured.

## Household privacy and lifecycle — IN PROGRESS (owner, 2026-09-30)
Acceptance: budgets private by default; installer cannot read unshared budgets
through their own session; existing owner password reset remains, with its
impersonation risk documented. Add account removal with explicit owned-budget
transfer and session revocation. Add owner-only budget archive/restore with a
30-day recovery period; permanently purge only budgets with no ledger/history.
Keep append-only journal triggers intact. Batch 1 VERIFIED: added archive
timestamps and a database pairing constraint; `listBudgets`, plan membership,
and finance authorization reject archived budgets. Migration
`202609300001_budget_archive` applied to `mynab_test`; focused household
integration tests passed (8). Batch 2 VERIFIED: implemented transactional
account removal, ownership transfer, session revocation, and audit preservation
in `src/application/household.ts`. Focused integration suite passed (6).
Batch 3 VERIFIED: added owner-only archive/restore and 30-day recovery, with
permanent purge limited to empty plans; data-bearing plans remain archived.
Added installer-managed account removal with explicit owned-plan recipient,
membership cleanup, session revocation, audit preservation, and installation
owner succession. Archived plans are rejected at shared finance/plan/register
boundaries and no longer schedule or run jobs. Plans and Household pages expose
the controls and disclose transfer and passphrase-reset implications. Readiness
includes the new migration. `npm run check` passed (271 unit tests),
`npm run test:integration` passed (166), and `APP_BASE_PATH=/mynab npm run build`
passed. Focused desktop household/archive tests passed (2); desktop WCAG 2.1 AA
across all routes and themes reported 0 violations. Test DB inspection confirmed
47 composite foreign keys and the immutable journal/posting/split/assignment/
transaction triggers remain intact. Production was not changed. Before release,
take and verify a fresh production backup, then deploy the full stack with
re-pull disabled and verify migration/service/readiness status.

## Pending bank charges — IN PROGRESS (Codex, 2026-09-30)
Owner wants the charges that were pending on September 25–27 and have since
cleared to appear in current `My Budget` for categorization. Read-only live
checks: SimpleFIN connection synced successfully but has zero ingested rows;
the Bridge currently exposes no PNC Spend entries after September 25, though
its balance changed from the September 27 opening balance. The only available
bank export (`docs/accountActivityExport (1).csv`, captured September 27)
contains 12 pending outflows totaling $380.82, but does not prove which have
since settled. Current budget's PNC Spend has no outflows after its opening.
Verified live backup before any prospective write:
`/home/plex/mynab/backups/mynab-before-pending-review-20260930T115621Z.dump`
(SHA256 `a9abfe38cf44a6babab6e251427cee33f694ee11d8cbec70f72e585ef669fb1d`).
Browser access to the bank is unavailable (Computer Use permissions not granted).
Owner clarified that all 12 charges, $380.82 total, are the expected set and
match YNAB. The stale export has the exact payees/amounts/dates, while the
current SimpleFIN feed still has no posted identities for them. Plan: stage
these as explicitly recovered pending observations linked to the existing
SimpleFIN account, enter them through `enterPending` so they affect the budget
and can be categorized, and preserve them through empty sync windows until
SimpleFIN supplies its posted IDs. Then promote/match instead of duplicating.
Batch 1 IMPLEMENTED: modified `src/infrastructure/providers/window-delta.ts`
to retain unmatched `recovered-pending:` observations and prefer them when
matching posted rows; extend `src/infrastructure/providers/simplefin.ts` so
the short-term read window still includes these pre-link dates; add focused
tests in `tests/unit/simplefin.test.ts`. Focused command
`npx vitest run --project unit tests/unit/simplefin.test.ts` passed (15).
Batch 1 follow-up VERIFIED: added a bank-ingestion integration check in
`tests/integration/ingestion.test.ts` for an entered recovered observation
dated before the link that later promotes without a duplicate;
`npx vitest run --project integration tests/integration/ingestion.test.ts
-t 'recovered pre-link pending expense'` passed (1).
Batch 2 VERIFIED: added `scripts/recover-pending-20260927.ts`, a guarded,
idempotent operator command for exactly the 12 known CSV rows and $380.82.
It will check the current budget/account/link, stage recovered observations,
enter them through the existing finance command, mark them cleared on the
owner's explicit bank confirmation, and verify ledger totals. Files in this
batch: the recovery script and this handoff.
Then re-run checks, build/release/deploy code, take a fresh live backup,
dry-run and apply the recovery. `npm run check` passed (271 unit),
`APP_BASE_PATH=/mynab npm run build` passed, and
`npx vitest run --project integration tests/integration/ingestion.test.ts`
passed (58). No production data changed yet.
Batch 3 VERIFIED: bumped package and Portainer image tags to
0.3.57 and update `NEXT_STEPS.md`, `deploy/portainer/README.md`, and
`DEVELOPMENT_LOG.md`; committed as `99dc3c1`, built `mynab:0.3.57` and
`mynab-tools:0.3.57` from that commit on the Linux host. Verified live backup
`/home/plex/mynab/backups/mynab-pre-0.3.57-20260930T130319Z.dump` (SHA256
`e5fd2b0f202dc53fe5b9a90feee489f40e40c7e07d67d01239baf7e732b79ca9`,
mode 600, 664290 bytes) via container `pg_restore -l`. Existing Portainer
stack exactly matched expected 0.3.56 before update; 0.3.57 Compose config
passed. Deployed full stack 91 with local images and no build/pull, preserving
runtime secrets in memory. Portainer stack SHA256
`cdeb7dc5a50e0c63d9f0e6e37b196cdfe1eb71770a827d82da3e93782bd9794b`;
previous stack saved at `/home/plex/mynab/releases/0.3.57/portainer-stack-before.yml`.
App/worker/db healthy, migration exited 0, public readiness HTTP 200.
Recovery dry-run (`docker exec mynab-admin-1 node --import tsx
scripts/recover-pending-20260927.ts`) found correct budget/account and 0
staged. Immediately before write, verified backup
`/home/plex/mynab/backups/mynab-before-charge-recovery-20260930T130701Z.dump`
(SHA256 `6be6d0c58050f4944c65a6f7a1c76b05fcdeb6b8f7e8e790134791912d5f8ff1`,
mode 600, 664307 bytes) via container `pg_restore -l`. Applied with
`docker exec mynab-admin-1 node --import tsx
scripts/recover-pending-20260927.ts --apply`: 12 linked transactions,
12 cleared, $380.82 outflow. Independent SQL joined ingestion, transaction,
and state: count 12, sum -38082 cents, 12 distinct transaction IDs,
12 cleared, 0 voided, dates 2026-09-25–27. A second `--apply` run produced
the same 12 without duplication. Category SQL: 12 Uncategorized, -38082.
No database migration or sync-frequency change.

## Release 0.3.56 — VERIFIED and deployed (Codex, 2026-09-30)
Owner explicitly requested commit and deployment of the six verified themes.
Recovery matches the 20260929T224313Z checkpoint with no intervening edits;
production read-only inspection shows healthy 0.3.55 app/worker, migrate exit 0,
and 91 GiB free. Acceptance: commit 0.3.56 source and complete stack, build
both Linux images from that commit, back up the live DB before update, update
Portainer stack 91 with local images and no pull, verify migrate exit 0,
app/worker/db health, and public readiness 200. No schema migration; preserve
live ledger and secrets.
Batch 1 VERIFIED: bumped package/package-lock and all image references in
`deploy/portainer/stack.yml` to 0.3.56; update `NEXT_STEPS.md`,
`deploy/portainer/README.md`, `DEVELOPMENT_LOG.md`, and this handoff. Re-run
`npm run check` passed (lint/typecheck and 268 unit tests) and
`APP_BASE_PATH=/mynab npm run build` passed. Commit next.
Batch 2 VERIFIED: committed source as `76c55f8`; live DB backup
`/home/plex/mynab/backups/mynab-pre-0.3.56-20260930T104228Z.dump`
(663272 bytes, mode 600, SHA256 `62436b9d0eca0907191907b275c87d79d192f5f02dd0a4319a151a210000c3b3`)
passed `pg_restore -l`. `npm run release` built `mynab:0.3.56`
(`8888b701ba64`) and `mynab-tools:0.3.56` (`98ba9c1f1e57`) on the host
from that commit, with `/mynab` base path and `node` runtime user. Copied
existing Portainer YAML into the release dir; it matches the new YAML exactly
after replacing 0.3.55 with 0.3.56. 87 GiB free after build.
Batch 3 VERIFIED: `docker compose -p mynab -f
/home/plex/mynab/releases/0.3.56/deploy/portainer/stack.yml config --quiet`
passed with current runtime values. Copied the full 0.3.56 YAML into
Portainer stack 91 and ran `docker compose ... up -d --no-build` with the
same in-memory values. The Portainer YAML and release stack SHA256 match
(`c7b779dd4a46`). `docker inspect` reports app `mynab:0.3.56` healthy,
worker `mynab-tools:0.3.56` healthy, db healthy, and migrate
`mynab-tools:0.3.56` exited 0. `curl -fsS` to
`https://plexmanager.duckdns.org/mynab/api/health/ready` returned 200.
No secrets were written to release files or printed. Saved previous stack:
`/home/plex/mynab/releases/0.3.56/portainer-stack-before.yml`.

## Theme options — VERIFIED locally (Codex, 2026-09-29)
Owner requests multiple selectable site themes beyond light and dark. Acceptance:
six named themes (Light, Dark, Parchment, Forest, Ocean, Plum) selectable in
desktop toolbar and phone account menu; immediate whole-site update, cookie
persistence across navigation/reload, correct initial SSR and browser chrome
color, legible controls/charts in each palette. No schema or deployment change.
Batch 1 IMPLEMENTED: replaced binary theme toggle with an accessible theme
selector in `src/components/theme-toggle.tsx`, `src/app/layout.tsx`,
`src/app/(protected)/layout.tsx`, `src/components/phone/shell.tsx`, and added
palette tokens/styles in `src/app/globals.css` plus shared IDs/chrome colors
in `src/infrastructure/theme.ts`.
Batch 2 VERIFIED: browser tests updated. `npm run check` passed
(268 unit plus lint/typecheck); `APP_BASE_PATH=/mynab npm run build` passed;
`APP_BASE_PATH=/mynab npx playwright test --project=desktop --project=mobile
--grep 'persists theme'` passed (2); focused phone settings/sheets passed (2);
`APP_BASE_PATH=/mynab npx playwright test -c tests/screenshots/shots.config.ts
--grep 'colour-contrast'` passed across all six palettes/routes with 0
distinct failures. `APP_BASE_PATH=/mynab npx playwright test --project=desktop
--grep 'every page passes automated'` passed (0 axe violations);
`APP_BASE_PATH=/mynab npx playwright test --project=phone --grep 'phone pages
pass automated'` passed (0 axe violations). All six palettes were covered.
Batch 3 VERIFIED: PWA manifest fallback splash/chrome color now matches Light
in `src/app/manifest.ts`; runtime status-bar color remains per theme.
After that change, `npm run check` passed (268 unit),
`APP_BASE_PATH=/mynab npm run build` passed, and focused phone sheet tests
(`--grep 'small sheets'` and `--grep 'phone sheets isolate'`) passed.
Desktop Budget screenshots in Parchment, Forest, Ocean and Plum and the
Forest phone settings sheet were visually reviewed. No schema change. These
changes were subsequently committed and deployed in release 0.3.56 above.

## Release 0.3.55 — VERIFIED and deployed (Codex, 2026-09-29)
Owner explicitly requested commit and deployment of the transaction-review/mobile-sheet
changes. Recovery: unchanged relative to the 20260929T191401Z checkpoint (the verified
uncommitted feature tree intact); production read-only check shows healthy 0.3.54 app
and worker. Acceptance: committed 0.3.55 source/stack, both amd64 images built from
that commit, a live backup before update, full Portainer stack updated with local
images and re-pull disabled, migrate Exited (0), app/worker healthy, readiness 200.
No schema migration in this release. Preserve production ledger and secrets.
Batch 1 VERIFIED: package.json, package-lock.json, deploy/portainer/stack.yml,
NEXT_STEPS.md, deploy/portainer/README.md, DEVELOPMENT_LOG.md, and this handoff.
Bumped to 0.3.55. `npm run check` passed (268 unit, lint/typecheck);
`APP_BASE_PATH=/mynab npm run build` passed. Commit next.
Batch 2 VERIFIED: committed as `49a4fd9` and ran `npm run release` successfully.
Built `mynab:0.3.55` (`0046c5bbe02f`) and `mynab-tools:0.3.55`
(`17cf4eb0f991`) on the Linux host. Live DB backup at
`/home/plex/mynab/backups/mynab-pre-0.3.55-20260929T214457Z.dump` (642K,
SHA256 `a9b62238b0b9223433d7d700276a8e394ca1d149c2a3754e4100a13b9bcc4270`);
`pg_restore -l` read it successfully. Existing Portainer stack YAML is byte-for-byte
identical to the 0.3.55 stack after replacing the two old image tags.
Batch 3 VERIFIED: `docker compose -p mynab -f
/home/plex/mynab/releases/0.3.55/deploy/portainer/stack.yml config --quiet`
passed with current runtime values. Copied the complete 0.3.55 YAML into
Portainer stack 91 and ran `docker compose ... up -d --no-build` with the
same in-memory values. The Portainer YAML and committed stack hash match
(`399148eef744`). `docker inspect` reports app `mynab:0.3.55` healthy,
worker `mynab-tools:0.3.55` healthy, db healthy, and migrate
`mynab-tools:0.3.55` exited 0. `curl -fsS` to both
`http://192.168.1.7:3107/mynab/api/health/ready` and
`https://plexmanager.duckdns.org/mynab/api/health/ready` returned 200.
No secrets were written to release files or printed. Existing stack backup:
`/home/plex/mynab/releases/0.3.55/portainer-stack-before.yml`.

Phone-shell count refresh follow-up VERIFIED: ReviewRefresh now lives alongside
MobileSheets in PhoneShell, so it persists across desktop-only phone routes.
`npm run check` passed (268 unit); `APP_BASE_PATH=/mynab npm run build`
passed; `APP_BASE_PATH=/mynab npx playwright test --project=phone --grep
'desktop-only pages point|Budget review card'` passed (2). The earlier full
phone suite (17), targeted desktop/mobile suite (8) and screenshot/contrast
suite (3, zero failures) remain the applicable broader checks. No deployment.

# MyNAB handoff — 2026-09-29

## Transaction review and mobile sheets (Codex) — VERIFIED locally; not deployed
Owner requested a top-of-Budget notice for posted imports awaiting approval,
visible desktop review access, and taller animated phone sheets that dismiss by
swiping without touching the page underneath.

Implemented: `ReviewNotice` on phone/desktop Budget and a counted desktop review
link; `/accounts/register?review=unapproved` filters the shared live-import
eligibility before paging and totals. Search, detail links, category editing and
bulk approval preserve review mode and scope. Empty queue says “You’re all caught
up”. Counts refresh after actions, navigation and foregrounding. Phone transaction
sheets show Category needed/Change category and pin Approve in the footer.
`MobileSheets` gives phone drawers and menus a true backdrop, focus and scroll
isolation, visual-viewport sizing, 250ms motion with reduced-motion support,
44px handle, touch drag arbitration, cancel/flick thresholds and animated close.
Desktop drawer behavior and financial commands/schema are unchanged.

Verification commands (all on final relevant code):
- `npm run check` — passed, lint/typecheck and 268 unit tests.
- `APP_BASE_PATH=/mynab npm run build` — passed.
- `APP_BASE_PATH=/mynab npx playwright test --project=phone` — 17 passed
  before the final category-link spacing tweak; afterward the affected
  `--grep 'small sheets'` test passed.
- `APP_BASE_PATH=/mynab npx playwright test --project=desktop --project=mobile --grep 'runs a manual budgeting cycle|marks unapproved imports|updates sections in place|inspects one category'` — 8 passed.
- `APP_BASE_PATH=/mynab npx playwright test -c tests/screenshots/shots.config.ts`
  — 3 passed, 0 contrast failures. Small/large phone light/dark QA images are
  under `.local/review-qa/` (git-ignored); visually reviewed.
- Broad e2e run with the two known flaky tests excluded: 158 passed, one new
  test initially failed because its imported row was beyond page one. That
  test now searches first; the following full phone run and final focused
  rerun passed. Desktop/mobile WCAG checks reported 0 violations.

No production data, Portainer stack, image tags or deployment changed. Working
changes remain uncommitted for review. Checkpoint after final verification.

## Release 0.3.59 — BUILT; deployment pending (2026-09-30)
Owner asked to push compact theme/category menus from source commit `3667777`.
Release metadata and full stack tags were aligned at 0.3.59 in commit
`79c2018`. `npm run check` passed (lint, typecheck, 271 unit tests);
`APP_BASE_PATH=/mynab npm run build` passed. Desktop theme persistence/menu
test passed with `APP_BASE_PATH=/mynab npx playwright test --project=desktop
tests/e2e/foundation.spec.ts --grep 'persists theme'`. Focused phone settings,
category picker/Axe, and sheet tests passed (3) with
`APP_BASE_PATH=/mynab npx playwright test --project=phone tests/e2e/phone.spec.ts
--grep 'settings live in the account menu|selects several uncategorized expenses
and shows available money|phone sheets isolate touches'`.
`npm run release` passed from commit `79c2018`, building
`mynab:0.3.59` (`0c11ae4d9289`) and `mynab-tools:0.3.59`
(`e48e17404b37`) on `plex@192.168.1.7`; `APP_BASE_PATH=/mynab`, runtime user
`node`, 77 GB host disk free. No Git remote is configured. The release command
did not touch the live stack, and no production DB backup was taken for a
deployment. Next: back up the database, paste the full current
`deploy/portainer/stack.yml` into Portainer with re-pull disabled, then verify
migration exit 0, healthy services, and public readiness HTTP 200.

# MyNAB handoff — 2026-09-27

## Phone sheets redesign (owner 2026-09-28, Claude) — VERIFIED; released 0.3.54 (`358d8c1`, `e3af65e`; images d459b2a7df6b / aa5e181df7a3), Portainer update pending owner
Owner on 0.3.53: editing a target on the phone takes "Edit target" twice
(sheet disclosure + TargetEditor's own collapsed state); sheets could be
designed better. Plan: category sheet = Available + status line, Assign $X
needed, Assign field, then a grouped action list (Target summary, Move
money, Transactions) whose rows open sub-panels in the same sheet via
`&panel=target|move` with "‹ Back"; TargetEditor gains `panel` mode (form
open at once, Snooze/Remove below, no Cancel). Transaction sheet: Edit as
a row → `&panel=edit`. RTA sheet: full-width primary. Files:
budget/page.tsx (panel param), budget/phone.tsx, target-editor.tsx,
phone/register.tsx, accounts/[id]/page+phone, register/page+phone,
globals.css, tests/e2e/phone.spec.ts. Desktop unchanged.
Done as planned; Delete in the txn sheet is an inline (secondary) red
button (was red text on the primary). Phone sheet forms end in a
full-width button (rule in the utilities layer: controls outrank
components). Verified: check (268); `/mynab` build; full e2e 155 (two
known flakes excluded); shots + contrast 0; target/move/category sheets
reviewed light+dark.

## Phone: plan switcher, Bank sync, menu fixes, sync timestamps (owner 2026-09-28, Claude) — VERIFIED; released 0.3.53 (`9f2ebcc`, `f4f322c`; images 8f92e760941a / ae8c56f44a17), Portainer update pending owner
Owner on 0.3.52: cannot tap the plan name on the phone to switch plans
(/plans is desktop-only there). Plan: protected layout passes
listBudgets + open plan id to PhoneShell; the plan name becomes a Popover
("Switch plan" sheet) listing plans, open one checked, others an
ActionForm intent=select to /api/plans (same as Plans page). Files:
(protected)/layout.tsx, components/phone/shell.tsx, globals.css,
tests/e2e/phone.spec.ts. IMPLEMENTED, `--project=phone` 12 passed. Found on
the way: .phone-topbar backdrop-filter made the bar the containing block of
its popovers' fixed sheets (plan + account menus clipped on real phones);
bar is now solid; account-menu test asserts toBeInViewport. Switcher keyed
by planId so it closes after a switch. Right-aligned popover sheets now
full width below 40rem.
Also (owner): phone Accounts gets "Bank sync": each SimpleFIN connection,
last synced, Sync now (ProviderAction type sync), auto-sync interval and
worker state. Loader `bankSyncStatus()` in finance-page.ts. Owner asked
whether auto sync works: live DB shows 37 provider.sync jobs DONE since
09-26, SimpleFIN last synced 19:41Z.
Owner: last sync showed a date only. New domain formatDateTime(value,
dateFormat, timezone) ("09/28/2026, 3:41 PM", plan timezone; unit test in
dates.test.ts); Bank sync page and the phone section use it (phone adds
"(12 min ago)"). Settings toggles in the phone menu fill with the accent
when on. Verified: `npm run check` (268 unit); `/mynab` build; full e2e
155 passed (two known flakes excluded; phone 13); shots harness 3 passed
(contrast 0). Release steps as 0.3.52 (R1 feature, R2 bump 0.3.53, R3
`npm run release`, R4 docs).

## Phone experience (owner 2026-09-28, Claude) — all five stages VERIFIED; released 0.3.52 (`b405924`, `3430df1`; images 6deb05c420cc / 70dddef038f7), deployed by owner 2026-09-28 (app+worker healthy, ready 200). Owner asked to remove old builds: every mynab/mynab-tools image but 0.3.52 (82 tags) and releases/ source dirs but 0.3.52 deleted on plex; disk 45G -> 101G free
Approved plan: `~/.claude/plans/this-is-all-looking-warm-coral.md` (copy
below if missing). Owner: a separate YNAB-app-like phone UI, not the shrunk
desktop. Phone areas: Budget (targets inside), Accounts/register + Add,
Reports, Debt. Every other page hidden on phone ("on the desktop site" note
+ switch). Detection server-side: cookie `mynab-view` (phone|desktop) wins,
else `Sec-CH-UA-Mobile: ?1`, else UA (iPhone/iPod/Android…Mobile); iPad =
desktop. proxy sets request headers `x-mynab-view`, `x-mynab-path`;
`src/infrastructure/view.ts` isPhone()/isPhoneDevice(). Desktop pages,
commands, domain, schema unchanged; phone = `phone.tsx` beside each page
with an early `if (await isPhone()) return`. Shared bits in
`src/components/phone/`. Stages (owner reviews each): 1 detection + shell
(top bar + account sheet, tab bar Budget·Accounts·＋·Debt·Reports) +
desktop-only fallback + viewport/appleWebApp + view switch + tests plumbing
(existing `mobile` project gets cookie mynab-view=desktop; new `phone`
project runs only tests/e2e/phone.spec.ts); 2 Budget; 3 Accounts/register/
Add; 4 Reports; 5 Debt. No release until asked.
Stage 1 IMPLEMENTED: src/infrastructure/device.ts (pure resolveView,
phoneDevice, phonePage allow-list) + view.ts (isPhone, isPhoneDevice);
proxy sets x-mynab-view / x-mynab-device (no path header: the layout does
not re-render on client navigation, so the allow-list is checked client
side in src/components/phone/gate.tsx); root layout generateViewport
(viewport-fit cover, themeColor) + appleWebApp + html data-view="phone";
(protected)/layout.tsx returns PhoneShell on phone, desktop top bar shows
"Phone site" (icon-only below md) on a phone device; phone/shell.tsx
(top bar, account Popover with theme/hide/desktop/sign out,
PhoneDesktopOnly), phone/tab-bar.tsx, view-switch.tsx; globals.css
:root[data-view=phone] bar heights + .phone-* rules. Tests:
tests/unit/device.test.ts (6), playwright `mobile` project gets cookie
mynab-view=desktop and ignores phone.spec; new `phone` project runs only
tests/e2e/phone.spec.ts (frame, account menu, desktop-only pages, switch
round trip, axe both themes).
Passed: `npm run check` (267 unit); `/mynab` build; `APP_BASE_PATH=/mynab
npx playwright test --project=phone` 5 passed; phone shots reviewed (light
budget, dark desktop-only). Full e2e `APP_BASE_PATH=/mynab npx playwright
test --grep-invert "scrolls the last category above the open drawer
sheet|downloads a complete export"` 147 passed (desktop+mobile+phone).
Peek helper for quick phone screenshots: `.local/peek/` (git-ignored).
Owner set goal: proceed through all stages without stopping.
Stage 2 (Budget) IN PROGRESS: `budget/phone.tsx` (PhoneBudget) + early
return in budget/page.tsx; RTA banner + sheet (?sheet=rta), filter chips
(?view=), groups with Available, rows name+TargetBar+pill, category sheet
via existing ?inspect= Drawer (assign, fund need, move, target editor,
activity link). Files: budget/page.tsx (early return after shownGroups;
searchParams `sheet`), budget/phone.tsx, new src/components/budget-target.tsx
(FundNeed/TargetBar/TargetDetail/dueWhen/RowTarget moved out of page.tsx:
Next forbids extra page exports), globals.css (.phone-page/-month/-rta/
-chips/-group/-category/-disclosure; phone drawers get a scrim + 85dvh in
the utilities layer). phone.spec: "budgets a category from its sheet"
(fresh category via /api/finance each run), "filters the budget and opens
Ready to Assign". Passed: `npm run check`; `/mynab` build; `--project=phone`
7 passed; shots reviewed (list, category sheet, RTA sheet, dark+light).
Full desktop/mobile e2e deferred to the end of Stage 5 (desktop Budget only
lost its helper definitions; tsc clean).
Stage 3 (Accounts, registers, Add) VERIFIED: accounts/phone.tsx
(net worth, All accounts, grouped balances + unapproved badges),
accounts/[id]/phone.tsx + register/phone.tsx over shared
src/components/phone/register.tsx (PhoneRegister by day, PhoneSearch,
PhoneApproveBar + BulkApprove, PhoneTxnSheet via `?txn=`: details, Approve,
Edit = TransactionForm, Delete in a disclosure); "Show older" grows `page`
instead of paging; all-accounts keeps category/account/date filters as a
clearable chip. add/page.tsx phone branch; QuickAdd gains initialAccountId,
returnTo (router.push after save), phone (big amount, Out/In segmented,
same labels). Tests: "lists accounts and approves imports in the register",
"adds a transaction from the plus button and from a register" (seeded with
executeFinance + commitImport like finance.spec). Passed: tsc, eslint,
`/mynab` build, `--project=phone` 9 passed; shots reviewed. Peek seeding:
`.local/peek/seed.spec.ts` (Joint Checking/Visa/Brokerage ledger).
Stage 4 (Reports) VERIFIED: reports/phone.tsx (PhoneReports from the
same TabContext; chips Spending/Trends/Net worth/Income v Expense, other
tabs "on the desktop site"; period segment This month/3/6/12 months;
headline + one chart + short list; `?group=` sheet of categories linking to
the register; `?all=1` shows every group); PartBar gains `legend` (phone
passes false). Test "shows each report with its headline and chart"; axe
list gains the three phone tabs. Passed: tsc, eslint, build, `--project=
phone` 10 passed; shots reviewed.
Stage 5 (Debt) IMPLEMENTED: debt/phone.tsx (PhoneDebt: total owed +
debt-free month + interest, "To do at the bank" with the desktop DONE_LABEL
buttons, Your debts rows (payoff month / this month's payment, or "No
terms recorded"), `?account=` sheet with APR, payoff, interest, total paid,
next six payments). Test "reads the payoff plan and ticks off a bank
reminder" (reminder row inserted directly; level must be act|review).
`--project=phone` 11 passed before the last copy fix.
Final gate VERIFIED 2026-09-28: `npm run check` (lint clean, 267 unit);
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`;
`APP_BASE_PATH=/mynab npx playwright test --grep-invert "scrolls the last
category above the open drawer sheet|downloads a complete export"` 153
passed (desktop, mobile-as-desktop, phone 11; first run found phone.spec
using budget.findFirst while other suites add plans: now `openPlan()` via
activeBudget); `APP_BASE_PATH=/mynab npx playwright test --config
tests/screenshots/shots.config.ts` 3 passed (new "photographs the phone
app": 13 phone pages x 2 themes, no sideways scroll; contrast 0). Phone
shots reviewed. Integration not run: no server code changed. PROJECT.md
has the "Phone app" decision. Next: owner review on a real iPhone (home
screen, safe areas).
Release 0.3.52 steps: R1 feature commit; R2 bump 0.3.52 (package.json,
package-lock.json root entries, deploy/portainer/stack.yml); R3 `npm run
release`; R4 docs (NEXT_STEPS.md, DEVELOPMENT_LOG.md, this file). No
migration.

## Reports redesign: YNAB-style tabs (owner 2026-09-28, Claude) — VERIFIED; released 0.3.51 (`7f2eeb3`, `2f5374e`; images 427a910c20fc / 0d051ad8a52f), Portainer update pending owner
Owner: Reports has odd spacing/gaps; make each report a tab like YNAB
(Spending Breakdown, Spending Trends, Net Worth, Income v Expense, Age of
Money) with full page width; add any missing YNAB reports and other
sensible budgeting reports.
Plan (`?tab=` breakdown|trends|worth|income|age|cashflow|budget; period,
compare and filters carry across tabs; drill drawer on every tab):
1. Domain (src/domain/reports.ts + tests): `budgetVsActual` (assigned per
   category over the period vs spent); AoM month-end series via
   `ageOfMoney` per month end (application). Spending trends reuse
   `incomeExpense().expenses` (group × month).
2. Application `getReports`: `tab`; load assignments; per-tab extras.
3. Charts (dataviz skill; palette = reference slots 1–6, validated vs
   #ffffff light / #17191d dark, light needs table/labels → every chart has
   a table): tokens `--series-1..6` in globals.css; server SVG components
   in src/components/report-charts.tsx; client `ChartHover` tooltip.
   Breakdown = part-to-whole bar (top 5 groups + Other) + ranked groups
   (expandable to categories) + top payees (no donut: close values).
4. Page: tabs nav, per-tab summary strip, date presets popover.
5. Tests: update report e2e (drill, AoM, in-place, cash flow), new tab test;
   a11y/contrast pages add tabs.
Step 1 VERIFIED (`npx vitest run --project unit tests/unit/reports.test.ts`
8 passed). Step 2 VERIFIED: getReports `tab`, `ageSeries` (age tab only),
`ageSamples`, `budgetVsActual` (budget tab only); ReportCategory gains
paymentAccountId/system/sortOrder (`npx vitest run --project integration
tests/integration/finance.test.ts -t "reports on PostgreSQL"` 3 passed).
Step 3 IMPLEMENTED (tsc + eslint clean; not yet rendered): globals.css
`--series-1..6/-other` (light+dark), src/components/report-charts.tsx
(ColumnChart, PartBar, Legend), src/components/chart-hover.tsx.
Step 4 IMPLEMENTED: reports/page.tsx (header, tabs nav, period presets
popover `details.period-presets`, filters with hidden tab, drill drawer) +
reports/tabs.tsx (Breakdown, Trends, Worth, IncomeExpense, Age, CashFlow,
BudgetActual). Step 5: e2e drill test walks tabs; new "opens every report
as its own tab"; a11y + contrast lists include every tab; shots harness
seeds six months (Joint Checking) and shoots every tab desktop + 390px.
VERIFIED 2026-09-28: `npm run check` (261 unit); `npm run
test:integration` (158); `/mynab` build; e2e (two known flakes excluded)
142 passed, axe 0; shots + contrast 0 distinct failures, no 390px overflow;
every tab reviewed desktop, Trends/Breakdown at 390px. Next: owner review;
commit + release 0.3.51 only when asked.

## Debt page: what-if form into a drawer (owner 2026-09-28, Claude) — VERIFIED; released 0.3.50 (`8c416d4`, `04530c8`; images a5c2f292d10d / ead27002e2d2), Portainer update pending owner
Verified 2026-09-28: `npm run check` (259 unit); `/mynab` build; e2e (two
known flakes excluded) 140 passed, axe 0; shots + contrast 0; debt page,
what-if drawer and phone shots reviewed. Right column now only with an
adopted plan (`empty:hidden`). Next: owner review; commit + release 0.3.50
only when asked.
Owner on 0.3.49: "Try a payoff plan" card runs far down the right while the
left is empty. Plan (debt/page.tsx + tests): the scenario form becomes a
drawer `?view=plan` (header button "Try a payoff plan", link in Your payoff
plan); its GET form carries hidden view=plan so it stays open after "Show
the plan"; it shows the what-if result (debt free, interest, monthly) above
"Adopt this plan". Right column only when a plan is adopted. Tests: open
the drawer via `view=plan` / the header link. Not released; deploy only
when asked.

## Debt page redesign: drawers (owner 2026-09-28, Claude) — VERIFIED; released 0.3.49 (`b2354f7`, `d26d74e`; images 93f50cbfcc36 / f04110bdfe67), Portainer update pending owner
Next page redesign: owner picks (one page at a time).
Verified 2026-09-28: `npm run check` (259 unit); `/mynab` build;
`APP_BASE_PATH=/mynab npx playwright test --grep-invert "scrolls the last
category above the open drawer sheet|downloads a complete export"` 140
passed, axe 0 (first run: solver test clicked "Show the plan" under the open
terms drawer; test now closes the drawer first); shots harness + contrast 0;
debt page, terms drawer, schedule drawer (probe at window size) and phone
shots reviewed. Integration not run: no server code changed.
Release steps: R1 feature commit; R2 bump 0.3.49 (package.json,
package-lock.json, deploy/portainer/stack.yml); R3 `npm run release`;
R4 docs (NEXT_STEPS.md, DEVELOPMENT_LOG.md, this file).
Owner: pages get redesigned one at a time; Debt first. Complaints: must
scroll far down the right column to reach "Record the terms"; "Month by
month" expander barely visible; "What you owe" / "Each debt on this plan" /
"Recorded terms" repeat the same per-account list.
Plan (debt/page.tsx only, plus tests):
1. One "Your debts" table = What you owe + this plan's Paid off / Interest
   per debt (deferred outcome as sub-line). Drop the standing "Record the
   terms" section and the page-level "Recorded terms" section.
2. `?account=` drawer per debt: plan outcome (paid off, interest, total
   paid), terms form, that account's recorded versions with a per-version
   Remove (debt.terms.clear accountId+effectiveFrom).
3. `?view=schedule` wide drawer "Month by month" (schedule table); opened
   from a PageHeader action and a link in "Your payoff plan". Scenario query
   kept on every drawer link.
Acceptance: no in-page terms form or history; Edit/Add terms opens the
drawer; schedule reachable from the top; e2e + axe pass (tests updated for
moved regions).
Steps 1–3 IMPLEMENTED, NOT verified (Bash blocked all session by permission
classifier errors: no tsc/lint/tests/checkpoint run). Files:
`src/app/(protected)/debt/page.tsx` (merged table, drawers, DeferredOutcome
helper, `view` stripped before debtPage — debtPage treats any other key as a
what-if), `src/components/terms-form.tsx` (one account → hidden accountId,
no picker), `tests/e2e/finance.spec.ts` (openTerms/versions helpers; every
"Record the terms"/"Recorded terms"/"Remove a version"/outcome-region use
moved to the drawer; schedule via header link), `tests/screenshots/
shots.spec.ts` (terms via drawer, + Car Loan terms, drawer shots).
Next: `npm run check`, `/mynab` build, `APP_BASE_PATH=/mynab npm run
test:e2e` (+ shots harness), review debt shots, then owner review.

## Payoff schedule columns (owner 2026-09-28, Claude) — VERIFIED; released 0.3.48 (`0b83d37`, `973d771`; images a3499da117af / adece9b8c100), Portainer update pending owner
Owner read "Balance" as owed before the payment (e.g. pay $669.95 with
$558.47 shown). Math verified correct: Balance was owed AFTER the payment.
Fix: columns "Owed before" (balance + payment) and "Owed after"; help text
explains the row arithmetic. New unit invariant over a whole multi-card plan
(idle card, deferred, pin): prior + interest − payment = after on every row;
months after the first spend the monthly total (the first holds only
payments still to make). e2e checks owed before − payment = owed after.
Verified: check (259 unit), build, e2e 140 excl. the two flakes, axe 0.

## Debt page: headline vs rows; what-if confusion (owner 2026-09-28, Claude) — VERIFIED; released 0.3.47 (`3ebd3eb`, `eb85345`; images ddbf83daa536 / 4b08a8e33e6e; first release attempt hit transient esbuild ETXTBSY, retry OK), Portainer update pending owner
Owner saw "Toward debt each month" below the rows: they were viewing a
pay-off-by what-if; the stat showed today's card-target total while the
schedule used the solved budget. Fix: stat shows requiredMonthlyBudget ??
monthlyBudget ?? plannedBudget ("What clears everything by <month>"). Plus a
what-if banner (.what-if) with "Back to my plan"/"Clear what-if" whenever
the page shows a scenario, and a Back/Clear button next to Show the plan.
Verified: check (258), integration (158), build, e2e 140 excl. two flakes.

## Plan months must be due-date months (owner 2026-09-28, Claude) — VERIFIED; released 0.3.46 (`1b34e6b`, `cb4eaa9`; images 5995ff33e93c / d673101b4c4f), Portainer update pending owner
Verified: check (258), integration (158; plan tests now use dueDay 31 so
they do not depend on today's day; new "funds each month's budget with the
payment due that month"), build, e2e 140 excl. the two known flakes, axe 0.
Note: a dormant card's CURRENT-month target is left as previously applied.
Owner: October budget asks $466 for Barclays but the Debt schedule's row due
in October says $298. Cause: for a card whose due day has passed
(firstPaymentBeforeInterest=false) the simulation still gives it a payment in
the current plan month (really due next month), so budget month M funded the
payment due in M+1. Fix (domain/debt.ts): such a card is dormant in the
current month (no payment, no interest: this month's payment is already made)
and its first payment, next month, comes before new interest; plan month ==
due month for every card. paymentDueDate loses its shift; deferred counting
starts at the first payable month; Debt page Due column drops the shift.
Current-month target of a dormant card is left as is by applyDebtPlan.
Watch: integration tests with dueDay 28 depend on today's day of month.

## Needs $X on a future month funds the stored target, not the plan (owner 2026-09-28, Claude) — VERIFIED; released 0.3.45 (`9800884`, `61f3210`; images bfc52eca7f86 / f6096e0b472b), Portainer update pending owner
Verified: check (258), integration (157, incl. future-month target.fund in
"shows later months of an adopted plan"), build, e2e 140 excl. the two
known flakes, axe 0.
Owner, October budget: card rows show the plan's projected target ("Needs
$381.63") but the button assigned the stored (this month's) amount and then
said "already funded". getFinance overrides card targets for future months
from planProjection; target.fund and autoAssignPlan used targetInForce on
stored versions. Fix: shared plannedCardTargets + targetFor in finance.ts,
used by getFinance, target.fund (needs + focused views), autoAssignPlan.

## Approve imports in the register, like YNAB (owner 2026-09-28, Claude) — VERIFIED; released 0.3.44 (`eaedd4a`, `a75c7c3`; images 34f0957d540c / 28986c4401cf), Portainer update pending owner
Done: ingestion.unapprovedImports + finance-page cached helper; account
register rows data-unapproved + "New" pill + Approve in the row drawer + "N
to approve" bar with Approve all; All accounts rows (RegisterBulk
unapprovedEntryId) + bar; sidebar count badge (.unapproved-count); editing
an import already approved it (finance.ts replacesId). Verified: check
(258), integration (157), build, e2e 140 (new test "marks unapproved
imports...") with the two known flakes excluded, axe 0.
Owner found transactions hard to follow: imports land in the register with
no unapproved marking, and approval lives on Bank sync. Build (YNAB): mark
unapproved imports in each register (one account, All accounts) with an
Approve button; an "N to approve" bar with Approve all; editing an
unapproved import approves it; count badge per account in the sidebar;
Bank sync keeps connecting and bank-change review. Files: accounts/[id],
accounts/register, register loader, navigation, ingestion approve helpers.

## Deferred deadline off by one payment (owner 2026-09-28, Claude) — VERIFIED; released 0.3.43 (`0b4f3d9`, `e8828b8`; images cc35cf6bb81b / c7310c85c7c0), Portainer update pending owner
Verified: check (258 unit), integration (157), `/mynab` build, e2e 138 with
the two known flakes excluded (axe 0). Reminders (promoDeadline) and the
Debt page "$X/mo to clear" use the same rule. Owner must re-save the
deferred card's terms with the exact end date (form prefills the old
month-only equivalent, the last day of the month before).
Open: owner reports still no PNC pending after 0.3.42; pendingEntries query
is fine; most likely SimpleFIN sends none for PNC — asked owner for the
"SimpleFIN sent N pending" number from Sync now.
Owner: deferred promo ends 2027-07-14; plan says "Paid off before the
deferred-interest deadline (July 2027)" but the card's last payment is due
July 14. Cause: the promo end is stored as a month and the simulation clears
by the month before it in PLAN months; a card whose due day has passed pays
each plan month's amount the following month, so June's payment is due
July 14. Fix: DebtTerms.promoEndsOn (exact last day, migration
202609280002_promo_ends_on); terms form date input (introEndsOn); simulation
counts only payments DUE STRICTLY BEFORE the end date (paymentDue(month,
dueDay, firstPaymentBeforeInterest)), charges held interest at the first plan
month whose payment is due on/after it; month-only data uses the last day of
the month before endsMonth. Same helper in reminders and the Debt page.
Files: prisma, domain/debt.ts, application/debt-plan.ts, finance.ts
(terms.set), terms-form.tsx, debt page, debt-reminders (domain+app), tests.

## SimpleFIN pending rows missing for PNC (owner 2026-09-28, Claude) — VERIFIED (check 257, integration 156, build, e2e 138 excl. flakes); + popover fix; released 0.3.42 (`2eac23f`, `eecaa38`; images 873d43884227 / f622355169a8), Portainer update pending owner
Also: "Set amount" popover in Your payoff plan opened off screen —
data-align="right" was on .popover-panel instead of the <details
class="popover"> the CSS keys on (same on Plans → Rename); fixed both.
Owner asked: APR from SimpleFIN? No (protocol has no terms); interest-charge
RATE_MISMATCH reminder is the existing substitute. Set amount is one plan
month only (the card's next payment), confirmed.
Owner linked all accounts on 0.3.41; no PNC pending rows. Found: simplefin.ts
skipped any row with no posted/transacted_at instant (a pending row is
`posted: 0`, often without transacted_at), and treated posted:0 without a
pending flag as posted. Fix: pending = flag || !posted; undated pending uses
the account's balance-date, else today. Sync now reports "SimpleFIN sent N
pending" so we learn whether PNC supplies them at all.

## SimpleFIN follow-ups (owner 2026-09-28, Claude) — VERIFIED; released 0.3.41, Portainer update pending owner
Commits `c63c149` (fix), `4562edd` (0.3.41). Built `mynab:0.3.41`
(`fe923c4030d0`), `mynab-tools:0.3.41` (`3e628971f2c8`).
Verified: check (256 unit), integration (156), `/mynab` build, e2e 138 with
the two known flakes excluded (axe 0).
Owner on 0.3.40: (1) added Wells Fargo on SimpleFIN after connecting PNC;
Sync now did not show it — sync never created ProviderAccount rows for
accounts new since the link. Fix: ProviderBatch.accounts (discovered from the
same response) and syncOnce adds missing rows unlinked. (2) retired Plaid
connections cannot be removed after moving. Fix: relinkAccount disconnects
(locally) a PLAID connection left with no linked accounts, and Bank sync hides
PLAID connections with no linked accounts. Files: providers/simplefin.ts,
types.ts, ingestion.ts, connections/page.tsx, tests.

## Remove Plaid; SimpleFIN only; release (owner 2026-09-28, Claude) — VERIFIED; released 0.3.40, Portainer update pending owner
Commits `5bc66e9` (feature), `0d5a738` (0.3.40 metadata). `npm run release`
VERIFIED: `mynab:0.3.40` (`61d3c98244f8`), `mynab-tools:0.3.40`
(`bfe2ae595acf`), plex@192.168.1.7, `/mynab`, user `node`, 61 GiB free;
running stack untouched. Next: owner pastes stack.yml 0.3.40 in Portainer,
then links SimpleFIN (paste setup token) and checks the first card balance
sign.
Plaid adapter, Link UI, OAuth page, PLAID_* config, plaid:check and the CSP
widening are gone (CSP: frame-src 'none', connect-src 'self'). Existing
PLAID connections are retired rows (LISTED_PROVIDERS): shown with history
and a "Plaid is no longer used" note, never synced ("Plaid is retired"),
disconnect is local only, no Add/Link/Move controls on them; their accounts
move with "Move here" on a SimpleFIN account. "Add to MyNAB" uses the
SimpleFIN account name (already includes the bank). Old PLAID_* env vars in
a stack are ignored (zod strips unknown keys).
Verified 2026-09-28: `npm run check` (256 unit); `npm run
test:integration` (156); `/mynab` build; `APP_BASE_PATH=/mynab npx
playwright test --grep-invert "scrolls the last category above the open
drawer sheet|downloads a complete export"` 138 passed, axe 0 (the two
excluded are the known pre-existing flakes).

## SimpleFIN bank-sync provider (owner 2026-09-28, Claude) — VERIFIED; superseded by "Remove Plaid" below (now the only provider)
Teller shut its API down (July 2026); owner: "remove teller, build SimpleFIN"
($15/yr, 25 institutions) if it gives balances, transactions, pending vs
cleared — it does (pending=1, per-row pending flag, balance +
available-balance; amounts positive = deposit, i.e. MyNAB's sign). Verified
with the public demo token: v1 shape (errors[] strings, org per account),
amounts like "-05.50", 45-day recommended range (90 hard), ~24 req/day.
Demo has no credit card or pending rows: card balance sign is assumed as-is
(negative owed) and must be sanity-checked on the first real card.
The Teller work (uncommitted) is being converted, not committed: the
multi-provider plumbing, sync context/delta, relinkAccount and matcher stay.
Steps:
1. Remove Teller — IMPLEMENTED (adapter/tests/script deleted; http-security.ts
   and proxy.ts back to HEAD; config/deploy/docs/e2e retargeted)
2. Migration 202609280001_simplefin_provider (provider SIMPLEFIN, warning,
   replacesAccountId) — IMPLEMENTED; local dev/test had the Teller migration
   backed out by hand (row + columns) and the new one deployed; 47 FKs
3. providers/simplefin.ts + providers/window-delta.ts + tests/unit/simplefin
   (11) — IMPLEMENTED
4. ingestion (providerFor SIMPLEFIN, setup-token completeLink,
   replaceSimpleFinToken, warning, SyncContext.timezone), route
   (link.complete.simplefin, link.retoken.simplefin), connections page
   (SimpleFIN section + form, warnings, re-token) — IMPLEMENTED
5. VERIFIED 2026-09-28: `npm run check` (275 unit); `npm run
   test:integration` (158); `/mynab` build; `APP_BASE_PATH=/mynab npx
   playwright test --grep-invert "scrolls the last category above the open
   drawer sheet|downloads a complete export"` 140 passed, axe 0. Those two
   tests are pre-existing flakes (mobile drawer scroll fails most runs now;
   export fails ~half); both unrelated, not fixed. Full `npm run test:e2e`
   stops at whichever flakes first.
Open: card balance sign assumed negative-owed (demo has no card); the
owner should compare the first real card balance after linking.

## Best Buy (Citi) OAuth window not loading (owner 2026-09-28, Claude) — VERIFIED (check 263 unit, build; e2e: only the known export/drawer flakes failed), committed; not released
Could not reproduce (needs production Plaid keys + browser). Findings: Plaid
status page clean; PLAID_REDIRECT_URI is absent from .local/portainer-mynab.env
(Portainer may differ; unverified): Plaid says desktop OAuth works via popup
without it, but phones/in-app browsers need it. Bugs fixed in
src/components/provider-link.tsx: (1) Link's exit error was discarded ("Bank
connection was not completed."); now `linkFailure` shows Plaid's
display/error message, code, bank, last onEvent (e.g. OPEN_OAUTH, FAIL_OAUTH)
and link_session_id; (2) closing Link without an error resolved as success
("Connected…"); now any onExit is "not completed". Unit test
tests/unit/provider-link.test.ts. Next: owner retries after deploy and reads
the message; set PLAID_REDIRECT_URI (+ register in Plaid dashboard) for
phones; check Plaid dashboard OAuth registration for Citi.

## Release 0.3.39 (owner request 2026-09-28: build on the Linux host) — VERIFIED; Portainer update pending owner
Fixed plan payments (`463dc88`); release metadata `8bb5a54`; `npm run
release` VERIFIED: `mynab:0.3.39` (`307757913d7a`), `mynab-tools:0.3.39`
(`5147916427f1`) on plex@192.168.1.7, `/mynab`, user `node`, 64 GiB free;
running stack (0.3.37) untouched. Docs DONE with this commit. Owner: back up
DB + key, paste the whole stack.yml (0.3.39), re-pull disabled, confirm
migrate Exited (0) (migration 202609270002_debt_plan_pins) and
/mynab/api/health/ready 200. Then Debt → Wells Fargo → Set amount 300.

## Fixed payments in a followed plan (owner 2026-09-27, Claude) — VERIFIED; released in 0.3.39 (no git remote exists)
Owner: Wells Fargo is due the 28th and the bank will take $300; avalanche
wants its minimum. Set a card's payment for a month; the plan re-balances.
Done: DebtPlan.pins {accountId: {month: cents}} (migration
202609270002_debt_plan_pins, in health/ready list; applied to dev+test);
simulatePayoff `fixedPayments` (replaces that card's minimum that month, no
deferred reserve/extra for it, so it comes out of the same monthly total;
rows `fixed`); `fixedPayments()` + PlanSettings.pins in debt-plan.ts;
command `debt.plan.pin` {accountId, month, amount?} re-applies, reclaiming
that card; pins kept on re-adopt; Budget future months honour pins.
Debt page: "Set amount" per card this month, "Fixed" pill + "Use the plan",
"Fix a later payment" form, list of later pins, schedule "Fixed by you".
Behaviour change: when showing the ADOPTED plan the Debt page now simulates
exactly its settings (+pins) and no longer derives a total from card targets
(`plannedBudget` only for unadopted default view) — so page == applied plan.
Verified 2026-09-28: `npm run check` (261 unit); `npm run test:integration`
(156); `/mynab` build; `APP_BASE_PATH=/mynab npm run test:e2e` 143 passed,
1 skipped, axe 0 (adopt-plan e2e fixes then un-fixes a payment).
Known flaky, pre-existing: "downloads a complete export" (desktop) failed in
3 of ~7 full runs with the download named "export" (no Content-Disposition);
the route's catch did NOT fire, so it is not an export exception — likely a
401/400 (session/budget) or browser/download race. Not resolved.
Still pending: production read-only audit (blocked by permission classifier;
owner can allow it or run the SQL given in chat and paste the output).

## Release 0.3.38 (owner request 2026-09-27: "commit and deploy") — VERIFIED; Portainer update pending owner
Payoff schedule due dates (section below). R1 feature commit VERIFIED
`4cbfa7d`; R2 metadata VERIFIED `3974d76`; R3 `npm run release` VERIFIED:
`mynab:0.3.38` (`7253ea1691aa`), `mynab-tools:0.3.38` (`079162b5db17`) on
plex@192.168.1.7, `/mynab`, user `node`, 63 GiB free; running stack
untouched. R4 docs DONE with this commit. Owner: back up DB + key, paste the
whole stack.yml (0.3.38; includes NTFY_* and 0.3.37's migration if not yet
deployed), re-pull disabled, confirm migrate Exited (0) and
/mynab/api/health/ready 200.

## Payoff schedule due dates (owner 2026-09-27, Claude) — VERIFIED; released in 0.3.38
Owner asked for the full due date in the Debt page's "Month by month"
schedule, and thought Barclays absorbed the paid-off Chase 6521 payment in the
same month. It did not (Sep $311.85 is Barclays' own target; Oct +$163.51):
the confusion was the month label, because a card whose due day has passed
this month has its first row actually due NEXT month. Change (debt/page.tsx
only): column "Due" = card due date in the budget's date format, shifted a
month when `firstPaymentBeforeInterest` is false; month name when no due day;
sorted by due date; one sentence on how money is split. e2e assertion in
"plans debt payoff from the card payment targets".
Verified 2026-09-27: `npm run check` (260 unit); `/mynab` build;
`APP_BASE_PATH=/mynab npm run test:e2e` 143 passed, 1 skipped, axe 0.
Flakes seen in two earlier runs, then passed with no change: "downloads a
complete export" (desktop, download named "export") and "scrolls the last
category above the open drawer sheet" (mobile). Not investigated further.

## Release 0.3.37 (owner request 2026-09-27: "commit and deploy") — VERIFIED; Portainer update pending owner
Debt reminders + ntfy push (section below), plus 0ec5073 row fixes.
R1 feature commit VERIFIED `0c57de5`; R2 release metadata VERIFIED `0cd4e6b`;
R3 `npm run release` VERIFIED: `mynab:0.3.37` (`8ece07941812`),
`mynab-tools:0.3.37` (`c9983ea94cc2`) on plex@192.168.1.7, `/mynab`, user
`node`, 62 GiB free; running stack untouched. R4 docs: DONE with this commit.
Owner: back up DB + key, paste the whole stack.yml (0.3.37, adds NTFY_*),
re-pull disabled, confirm migrate Exited (0) (migration
202609270001_debt_reminders) and /mynab/api/health/ready 200. Add NTFY_TOPIC
in the stack env to enable push; test from the Debt page.

## Debt reminders + push (owner 2026-09-27, Claude) — VERIFIED; released in 0.3.37
Request: variable APRs and deferred-interest promos can derail the payoff plan.
The app must prompt APR checks, re-plan immediately when terms change, and keep
a checklist of changes to make at the bank (e.g. rollover when a card is paid
off), with phone push. Owner: promos are whole-card (no new promo model); push
via ntfy. Approved plan: `~/.claude/plans/one-importtant-thing-i-adaptive-wind.md`.
Acceptance: see the plan's Verification section.
Steps (all PLANNED unless marked):
1. Migration: DebtReminder table (no DebtPlan.confirmed: the last done PAYMENT_CHANGE is what the bank pays) — VERIFIED, applied to dev+test
   (schema.prisma, prisma/migrations/202609270001_debt_reminders).
2. Domain `src/domain/debt-reminders.ts` + attention counts — VERIFIED.
3. Application reconcile (src/application/debt-reminders.ts), terms.set re-plan, debt.reminder.done (single command; no dismiss), worker schedules budgets with terms — VERIFIED.
4. Push (ntfy): infrastructure/push.ts, NTFY_* config, notify.push job (8–21 local, act re-push 3 days), push.test on /api/provider + PushTest button on Debt page — VERIFIED.
5. UI: Debt "To do at the bank" section, deferred /mo hint, attention counts on Budget, plan notice wording — VERIFIED.
6. Verify: `npm run check` PASSED 2026-09-27 (259 unit; health/ready lists the
   migration); `npm run test:integration` PASSED (155, incl. 3 new "debt
   reminders"); `APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm
   run build` OK; `APP_BASE_PATH=/mynab npm run test:e2e` 143 passed, 1 skipped,
   axe 0 (adopt-plan test now ticks "Done at the bank"). Docs DONE: YNAB_ALIGNMENT,
   PROJECT.md, NEXT_STEPS, stack.yml + docker-compose.yml + .env.example
   (NTFY_*), deploy/portainer/README.md; `npm run check` re-run after docs: 260.
   Not covered by a test: scheduleDue queuing notify.push (hour-gated).
   Next: owner review; commit/release only when asked.

## Budget row fixes (owner 2026-09-27, Claude) — VERIFIED; not committed, no release
1. Phone: with a category open, the last categories could not scroll above the
   bottom-sheet drawer. `drawer-keys.tsx` measures the sheet into `--sheet-h`
   (ResizeObserver, cleared on close); shell padding in `(protected)/layout.tsx`
   is max(tabbar, sheet) below md. E2E "scrolls the last category above the
   open drawer sheet" (mobile only).
2. Click anywhere on a category row opens its inspector: `DndRow` forwards a
   plain click to the name link, ignoring controls, modifiers and selections;
   `tr[data-openable]` cursor.
3. YNAB-style target line: `TargetBar` (3px bar under the name, yellow/green/
   red) and `TargetDetail` ("Needs $X by the 15th / by Dec 2026" button,
   "$X to go by ...", "$X left of $Y" for limits) in budget/page.tsx; Target
   column 21% (Category 30%). No server change.
Verified 2026-09-27: `npm run check` (lint, tsc, 250 unit); `APP_BASE_PATH=/mynab
APP_ORIGIN=https://127.0.0.1:3443 npm run build`; `APP_BASE_PATH=/mynab npx
playwright test` 143 passed, 1 skipped (desktop copy of the phone test).
Screenshots reviewed desktop + phone. Integration not re-run (no server code).

## Release 0.3.36 (owner request 2026-09-27: "build and commit") — VERIFIED; Portainer update pending
R1 feature commit VERIFIED `d4ae062`; R2 release metadata VERIFIED `a225b99`;
R3 `npm run release` VERIFIED: `mynab:0.3.36` (`f28c385de3bd`),
`mynab-tools:0.3.36` (`54acee1e9707`) on plex@192.168.1.7, `/mynab`, user
`node`, 65 GiB free; running stack untouched. R4 docs: DONE with this commit.
Owner: back up DB + key, paste the whole stack.yml (0.3.36) with re-pull
disabled, confirm migrate Exited (0) and /mynab/api/health/ready 200. No
migration. Then delete the old managed card payment schedule on Schedules.

## Budget drag-and-drop, click-to-fund, no auto card schedules (owner 2026-09-27, Claude) — VERIFIED
Approved plan: `~/.claude/plans/i-need-some-help-whimsical-hejlsberg.md`.
(C) Card payments are targets only: saving terms with "Set the payment
target" (`setPaymentTarget`), `debt.payment.setup` (no payer) and an adopted
plan set the DEBT_PAYOFF target and never create/update a schedule; plan still
re-targets monthly (hand-override, paid-off rules kept). Loans unchanged.
Existing managed card schedules are left for the owner to delete on
Schedules (closing/deleting a card still archives them).
`schedules.ts cardPaymentTargets` replaces managedCardPayments (debt planner
baseline reads targets). (B) `target.fund` + `categoryId`; Budget "Needs $X"
button (row, mobile sub-label, inspector "Assign $X"); FinanceForm `label`
may be a node, new `buttonLabel`. (A) @dnd-kit/core 6.3.1 + utilities;
`group.move` / `category.move` (beforeId); new `src/components/budget-dnd.tsx`
(BudgetDnd, DndGroup, DndRow, DragHandle); budget/page.tsx wraps groups/rows;
globals.css drag + fund-need styles. Docs: YNAB_ALIGNMENT.
Verified 2026-09-27: `npm run check` (lint, tsc, 250 unit);
`npm run test:integration` (152); `APP_BASE_PATH=/mynab
APP_ORIGIN=https://127.0.0.1:3443 npm run build`; `APP_BASE_PATH=/mynab npm
run test:e2e` 142/142 (desktop+mobile, axe 0). Screenshots reviewed (desktop
and mobile Budget, drag in progress). No migration. Not committed; no
release. (D) budget setup from the owner's bank export: waiting for the file.

## Release 0.3.35 (owner request 2026-09-27) — VERIFIED; Portainer update pending

Owner asked to commit and build the current changes. Plaid's separately billed
`/transactions/refresh` action defaults off, can be enabled with
`PLAID_REFRESH=on`, and is guarded by the API. Deployment and local Compose
examples plus ingestion docs are updated. Exclude `.vscode/settings.json`, a
local editor preference. Verified: focused config test (12 passed), `npm run
check` (lint, typecheck, 250 unit tests), `npm run test:integration` (149),
`/mynab` production build, and e2e (140/140, axe 0). Feature commit VERIFIED:
`0b5ae90`; release metadata commit VERIFIED: `f107a12`. `npm run release` built
`mynab:0.3.35` (`a2ec387582c8`) and `mynab-tools:0.3.35` (`3f513f7f2534`) on
`plex@192.168.1.7`, linux/amd64, `APP_BASE_PATH=/mynab`, runtime user `node`,
builder 2 CPUs/2 GiB; 65 GiB free afterward. Running Portainer stack untouched.
R4 docs VERIFIED with this commit: `NEXT_STEPS.md`, `DEVELOPMENT_LOG.md`, and
this file. Do not update Portainer or production.

# Current handoff


## Pending charges not arriving (owner 2026-09-26, Claude) — IN PROGRESS
Diagnosis on the live stack (0.3.33 running): read-only Plaid pull with no
cursor returned 0 pending rows for all five connections; latest posted rows
9/24–9/26. Cause: Plaid pulls from each bank only 1–4×/day; "Sync now" only
reads Plaid's cache. Second, smaller defect: commitEntries dropped rows dated
on/before linkedFrom, which excluded pending charges dated on the link day
(all cards linked 9/25–9/26). Fix IMPLEMENTED: Provider.refresh
(/transactions/refresh, billed per call by Plaid) + `refreshConnection`
(refresh, sync now, queue one provider.sync +3 min) + route `refresh` +
"Refresh from bank" button with a confirm on Bank sync; pending rows pass
the link-day filter whatever their date, and a posted row settling a known
pending row passes too; ProviderAction shows `result.message`. Tests: unit
plaid refresh, integration link-day pending + refresh (queues one job).
Passed: tsc, lint, `npm test` (249), ingestion integration (57). VERIFIED (2026-09-26): `npm run test:integration` (149), `/mynab` build,
`APP_BASE_PATH=/mynab npm run test:e2e` 140/140 desktop+mobile (axe 0),
harness + contrast 0. Release 0.3.34: R1 VERIFIED `ca2c702`, R2 VERIFIED `9cdd97f`, R3
VERIFIED (`mynab:0.3.34` `e22a15c0ac8f`, `mynab-tools:0.3.34`
`52ea9ac4e222` on plex@192.168.1.7; stack untouched), R4 docs: DONE with
this commit. Owner: paste the whole stack.yml (0.3.34), re-pull disabled,
confirm migrate Exited (0) and health/ready 200. No migration.

## Three owner items (2026-09-26, Claude) — IN PROGRESS
Approved plan: `~/.claude/plans/three-things-i-want-starry-ocean.md` (Parts A, B, C).
Owner requests: (1) an adopted debt plan must show later months' re-planned card
targets, and no target for a card the plan clears this month; (2) underfunded
targets show yellow, not red (red only for overspent/over limit), the Available
pill goes yellow while a live target still needs money, and "Build up to an
amount" (BALANCE) becomes a no-ask savings tracker (state BUILDING, "Saving
up", contribution 0 — a deliberate YNAB deviation the owner chose); (3) pending
bank transactions shown YNAB-style: greyed collapsible "Pending at the bank"
section at the top of the registers, no balance/budget effect, "Enter now"
puts one in the ledger uncleared (`entry.enter`), manual entries match at the
pending stage, and the posted version merges into the entered row.
No migration. Release afterwards = 0.3.33 when the owner asks.

Part A (colours + BALANCE) IMPLEMENTED (goals.ts BUILDING state, targets.ts
"Saving up", pill.tsx `underfunded`, budget/targets colour maps, editor+guide
copy, YNAB_ALIGNMENT "Target colours", YNAB_PARITY). Passed: `npx vitest run
--project unit tests/unit/goals.test.ts` (38), tsc. Files: src/domain/goals.ts,
src/components/targets.ts, src/components/ui/pill.tsx, budget/page.tsx
(TargetState, AmountPill call), targets/page.tsx (StateChip),
target-editor.tsx/guide copy, docs/YNAB_ALIGNMENT.md, docs/YNAB_PARITY.md,
tests/unit/goals.test.ts.
Part B (plan projection overlay) IMPLEMENTED (debt-plan.ts planProjection;
finance.ts cardsOwing + applyDebtPlan uses it + getFinance overlays months
after the current one for plan cards, `planned` flag; budget detail "$X
planned", inspector note, targets "from your payoff plan"; e2e adopted test
checks next month on /targets). Passed: `npx vitest run --project unit
tests/unit/debt-plan.test.ts` (2), `npx vitest run --project integration
tests/integration/finance.test.ts -t "adopted plan|adopts a payoff
plan|adopted payoff plan"` (4), tsc. Full suites NOT yet run. Files: src/application/debt-plan.ts
(planProjection), finance.ts (applyDebtPlan uses it; getFinance overlays
future months for plan cards), budget/targets pages ("planned" detail), new
tests/unit/debt-plan.test.ts, tests/integration/finance.test.ts, e2e.
Part C (pending) IMPLEMENTED: ingestion.ts (writeEntry allowPending,
manualMatcher matches pending, commitEntries merge path via mergePending,
`pending` count, withBankAmount cleared param, pendingEntries, enterPending),
route entry.enter, components/pending-entries.tsx (PendingEntries + EnterNow),
finance-page pendingBankEntries, both registers + connections page, docs.
Passed: tsc, lint, `npm test` (248), `npx vitest run --project integration
tests/integration/ingestion.test.ts` (55, 3 new) and
tests/integration/finance.test.ts (73). All three parts VERIFIED (2026-09-26): `npm run lint`,
`npx tsc --noEmit`, `npm test` (248), `npm run test:integration` (147),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`,
`APP_BASE_PATH=/mynab npm run test:e2e` mobile 70/70 (first run; desktop
chain stopped at the documented export-filename flake) then
`--project=desktop` 70/70, axe 0; harness + contrast 0 distinct failures,
Budget/Targets shots reviewed (yellow underfunded, yellow Available pill).
Release 0.3.33: R1 VERIFIED `314f517`, R2 VERIFIED `c0afd33`, R3
VERIFIED `npm run release` exit 0: `mynab:0.3.33` `2e27972dd4e3`,
`mynab-tools:0.3.33` `ed411b7e3d63` on plex@192.168.1.7 from `c0afd33`;
running stack untouched. R4 docs commit: DONE with this commit. Owner's
step: back up DB + key, paste the whole stack.yml (0.3.33) with re-pull
disabled, confirm migrate Exited (0) and /mynab/api/health/ready 200.
No migration. Files: src/application/ingestion.ts (pendingEntries,
enterPending, manualMatcher for pending, commitEntries merge path, count fix),
src/app/api/provider/route.ts (entry.enter), accounts/[id]/page.tsx,
accounts/register/page.tsx, connections/page.tsx, docs (PHASE5_INGESTION,
YNAB_ALIGNMENT, FINAL_GATE), tests unit/integration/e2e.

## Redesign Stage 2 — Accounts hub, account register, all-accounts register, payees — IN PROGRESS (owner 2026-09-26, Claude)

Owner reviewed 0.3.31 live: Budget approved as the structure; proceed with
every other page (plan section K, stages 2–6). Owner bug: each page opens
slightly scrolled with its top cut off — on desktop `#workspace` is the
scroll container and Next scrolls the new `<main>` to its top edge, under
the sticky 44px top bar. Fix: `scroll-margin-top`/`scroll-padding-top` of
`--topbar-h` (globals.css), no page change.
Stage 2 acceptance: `/accounts`, `/accounts/[id]`, `/accounts/register`,
`/accounts/payees` on PageHeader → SummaryStrip → `.ledger`/rows; every
[T] heading/label/marker from the plan kept ("Add an account", "Manage bank
connections", "Record a transaction", "Transactions", "Balance over time",
"Loan planner", "Reconcile", "Account settings", `details.register-row`,
"All accounts", `tr.register-row`, "Bulk actions", "Name your flags",
`.payee-row`, "N payees"); foundation heading "See the whole picture." →
"Accounts". Files: those four pages, `finance-fields.tsx`,
`register-bulk.tsx`, new `ui/register-row.tsx`, `globals.css`,
`tests/e2e/foundation.spec.ts`. Stage 2 IMPLEMENTED and VERIFIED: `npm run
lint`, `npx tsc --noEmit`, `/mynab` build, `APP_BASE_PATH=/mynab npm run
test:e2e` 140/140 (desktop + mobile, axe 0). No application code changed in
Stage 2 (pages/components only), so integration was not re-run. Screenshot
harness + contrast on this build: running. Not committed.
Stage 3 (Targets + Debt; `targets/page.tsx`, `debt/page.tsx`,
`target-editor.tsx`, `terms-form.tsx`) IN PROGRESS: keep "Fund every
target", "Record the terms" (in page without `?account`, drawer with it),
"Try a payoff plan", region "Estimated outcome per debt", `section.adopted-plan`,
`.planned-note`, `.plan-tracking`, `.paid-off`, `.deferred-outcome`,
`.terms-mode`, `.minimum-preview`, every terms label; foundation headings
"Make space for what’s ahead." → "Targets" and "Find your way forward." →
"Debt" (also finance.spec line ~1002). Stage 3 IMPLEMENTED and VERIFIED:
lint, tsc, `/mynab` build, full e2e 140/140 (axe 0). `Notice` gained `as`
("aside" for standing warnings the suite locates by element); "Categories
without a target" stays its own section. Screenshot harness on this build:
running. Not committed.
Stage 4 (Bank sync, Schedules, Rules, Import, Export; `connections/page.tsx`,
`schedules/page.tsx`, `schedule-fields.tsx`, `rules/page.tsx`,
`rule-fields.tsx`, `import/page.tsx`, `file-import.tsx`, `export/page.tsx`)
IN PROGRESS: keep "Needs review (n)", occurrence `<article>`s, every
summary/heading/button text, `details.register-row name=review-entry`,
`details name=saved-rule`, "Create a schedule"/"Manage schedules"/"Possible
recurring transactions" headings; finance.spec heading "Bring your accounts
in." → "Bank sync". Stage 4 IMPLEMENTED and VERIFIED: lint, tsc, `/mynab`
build, full e2e 140/140 (axe 0). Fixes on the way: match actions kept left
of the review drawer; dismissed patterns as `div` rows; past imports as `li`
rows; breadcrumb links named "Up to …" so the nav's "Accounts" stays unique.
Screenshot harness on this build: VERIFIED (contrast 0 distinct failures).
Not committed.
Stage 5 (Reports + Forecast; `reports/page.tsx`, `reports/forecast/page.tsx`,
`trend-line.tsx`) IMPLEMENTED; first full e2e run: 74 passed, 2 failed
(desktop loan-terms test got "Saved." instead of the schedule-removed message
— a race in `terms-form.tsx`, whose `clearPayment` read `account.payment`
from props that only update after `router.refresh()`; now tracked client-side
after each save — and mobile reports drill had an `h3` nested inside
DrawerSection's own `h3`, fixed by passing the title string). Re-run pending
with Stage 6 in the same build: keep "Behind this figure" drawer, "<name> by
month" h3, `table.income-expense`, "Age of Money" as a heading inside a
section, "What this assumes", "Look ahead with a forecast" link; finance.spec
headings "See where it went." → "Reports", "Look ahead." → "Forecast";
foundation "Reports".
Stage 6 (`add/page.tsx`, `plans/page.tsx`, `household/page.tsx`,
`guide/page.tsx`, `login/page.tsx`, `error.tsx`, `not-found.tsx`,
`quick-add.tsx`, `dismiss-setup.tsx`, `details-close.tsx`, `outbox-sync.tsx`,
`provider-link.tsx`, `connections/oauth/page.tsx`, then the legacy alias block
and `.primary-button/.secondary-button` rules in `globals.css`) IN PROGRESS
(started while the Stage 5 e2e run was still going; the running build is
unaffected by source edits). Keep: region "New transaction" + button
"Save transaction" + "Remembered from this payee"; `.plan-row` with "Open now",
"Create plan", panel "Fresh Start" + "Start fresh", heading "Fresh Start
complete", "New plan name"; `.household-person`, "Add person", "Share with X",
"Stop sharing with X"; guide h2 "Ready to Assign" level 2 + anchors + "Show
getting-started checklist"; login labels Username/Passphrase, button "Sign in",
first Tab lands on Username, no focusable before the form.
Stage 6 IMPLEMENTED (lint + tsc clean): all seven pages plus `oauth/page.tsx`
rewritten on PageHeader/surface/Notice/Pill; `quick-add.tsx` amount-first;
`dismiss-setup`, `details-close`, `outbox-sync`, `finance-form`,
`provider-link`, `terms-form` on `.btn`/ink classes; `globals.css` legacy
colour aliases, legacy font/text roles and `.primary-button/.secondary-button`
selectors removed (grep for legacy names in src+tests: none); inert
`finance-panel` class dropped. Stage 5 and Stage 6 VERIFIED together
(2026-09-26): `npm run lint`, `npx tsc --noEmit`, `/mynab` build,
`APP_BASE_PATH=/mynab npm run test:e2e` **140/140** desktop+mobile (axe 0).
The run before it had two failures, both fixed in app code, not tests: the
mobile Plans test tapped "Create plan" after scroll-into-view parked it under
the fixed bottom tab bar (`scroll-padding-bottom: var(--tabbar-h)` on
`html`/`#workspace` in globals.css), and the documented pre-existing export
download flake ("export" filename; passed on rerun, still untouched).
`ai/PROJECT.md` contract updated (aliases gone); harness gained `/add`,
`/plans`, `/household`, `/guide`, all-accounts and payees shots. Screenshot
harness + contrast on this build: VERIFIED (0 distinct failures); desktop
shots of Reports, Forecast, Add, Plans, Household, Guide and dark login
reviewed. Stage 7 (visual QA) IN PROGRESS: Reports summary notes shortened
so five stats fit one row; harness now also photographs twelve routes at
390px and asserts no sideways scroll (`tests/screenshots/shots.spec.ts`).
Stage 7 VERIFIED (2026-09-26): harness + contrast on the final tree, 0
distinct failures, no route wider than 390px; all fourteen phone shots and
the desktop set reviewed. One fix from the review: the phone summary strip
(2-col grid) showed a stray filled cell for an odd stat count — now ruled by
cell borders instead of a gap-bleed background (`.summary-strip` in
globals.css; re-verified by the harness). After that only a CSS comment was
merged (no rebuild needed). Whole redesign (stages 0–7) is IMPLEMENTED and
VERIFIED but NOT committed: e2e 140/140 desktop+mobile on the tree before
the strip/comment edits, harness after them. Next: owner review; on
"release", bump to 0.3.32 (package.json, package-lock.json,
deploy/portainer/stack.yml), record in NEXT_STEPS.md/DEVELOPMENT_LOG.md,
commit, `npm run release`. No migration.

### Budget ledger follow-ups from owner review (2026-09-26, Claude) — IN PROGRESS
Owner feedback on the dark Budget ledger: column header row appeared only
under the first (system) group; Credit Card Payments had no Add category
(correct: system group) but looked inconsistent; Uncategorized sat inside
the card group; groups should collapse; "Saved." under the Assigned cell
changed the row height; the Assigned heading sat over the controls, not the
figure. Plan: (1) one visible header table above all groups
(`.ledger-head`, aria-hidden; each group table keeps an sr-only header),
(2) Uncategorized rendered under its own bar "Needs a category" and only
while it holds any figure (pseudo-group `UNCATEGORIZED_GROUP`), (3)
`GroupToggle` client component (`src/components/group-toggle.tsx`) folds a
group via `data-collapsed` on `#group-<id>`, persisted in localStorage
`mynab-collapsed-groups`, (4) status message floats over the empty delta
field (`.assigned-cell .form-message` absolute, hidden on focus-within;
Assign button fixed 4rem), (5) `.ledger-head th.assigned-head` padding
aligns the heading over the figure. Files: `budget/page.tsx`,
`globals.css`, `group-toggle.tsx`. IMPLEMENTED; lint, tsc, build pass.
Budget-subset e2e found one intentional selector collision: the stock test's
`getByRole("button", { name: /Bills/ })` now also matched the ledger's
"Collapse Bills" toggle — narrowed to `/^(Add (missing )?|Restore )?Bills/`
(test edit; the offer labels are "Add X group", "Add missing X categories",
"Restore X group"). Then the group-settings popover lost its own chevron
(`chevron={false}`) so only the collapse chevron shows. VERIFIED
(2026-09-26): lint, tsc, `/mynab` build, `APP_BASE_PATH=/mynab npm run
test:e2e` **140/140** desktop+mobile on the final build, harness + contrast
0 failures, ledger crop reviewed (header once above all groups, Assigned
heading over the figure, one chevron per group). A `--grep` subset run
showed the Auto-Assign test failing in isolation: it depends on earlier
serial tests' state and passes in the full chain; not a defect. Not
committed; awaiting owner review / release (0.3.32).

### Release 0.3.32 (owner said "release", 2026-09-26) — IN PROGRESS
Pre-release evidence on the final tree: `npm run lint` (after adding
`ai/.state/**` to eslint's ignores — the checkpoint helper's snapshot of an
old `group-toggle.tsx` was being linted), `npm run typecheck`, `npm test`
246, `npm run test:integration` 143, `/mynab` build, e2e 140/140, harness 0.
Steps: R1 feature commit (everything but the version files); R2 chore
commit bumping package.json, package-lock.json (lines 3 and 9 only) and
deploy/portainer/stack.yml to 0.3.32; R3 `npm run release` (host-local
images only, no Portainer update); R4 docs commit (NEXT_STEPS.md,
DEVELOPMENT_LOG.md, this file) with the image IDs. No migration.
R1 VERIFIED `92c5445`, R2 VERIFIED `aac3291`. R3: the owner ran `npm run
release` themselves (images `mynab:0.3.32` `e9c01921cf6d`,
`mynab-tools:0.3.32` `379767930ed9`, SOURCE_COMMIT `aac3291`) and updated
Portainer; the stack is running 0.3.32, healthy, `/mynab/api/health/ready`
200 on the host. The agent's own release attempt correctly refused
("already exists on the host"). R4 docs commit: DONE with this commit.

## UI/UX redesign "Ink ledger" — Stage 0+1 VERIFIED, released as 0.3.31 (owner 2026-09-26, Claude)

VERIFIED (all 2026-09-26): `npm run lint`; `npx tsc --noEmit`; `npm test`
(246); `npm run test:integration` (143, after the final `debtPage` change);
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`;
`APP_BASE_PATH=/mynab npm run test:e2e` desktop 70/70 (axe 0) and
`--project=mobile` 70/70 (axe 0) — see the run notes below for why two runs;
`APP_BASE_PATH=/mynab npx playwright test --config
tests/screenshots/shots.config.ts` (harness + contrast: 0 distinct failures).
Release authorized by owner ("build and deploy", 2026-09-26): bump to
0.3.31 (package.json, package-lock.json, deploy/portainer/stack.yml), commit
the verified redesign set, run `npm run release` (host-local images only; no
Portainer update, no production mutation, no migration in this release).
Step R1 VERIFIED: committed `82f0bf4` (feat: redesign the shell and Budget
on the Ink ledger system) and `60f3a41` (chore: prepare 0.3.31 release;
package.json, package-lock.json root entries and stack.yml all at 0.3.31;
clean tree). Step R2 VERIFIED: `npm run release` exit 0 from `60f3a41`; `mynab:0.3.31`
(`b32b60ff698f`) and `mynab-tools:0.3.31` (`7198dd06b726`) local on
`plex@192.168.1.7`, linux/amd64, `/mynab`, runtime user `node`; builder 2
CPUs/2 GiB; 65 GiB free after build. The live stack was untouched; no
migration. Step R3 (docs): NEXT_STEPS.md and DEVELOPMENT_LOG.md record the
build. Production upgrade is the owner's: back up the live database and the
encryption key, paste the whole `deploy/portainer/stack.yml` (0.3.31) with
re-pull disabled, confirm migrate Exited (0) and `/mynab/api/health/ready`
200. Then Stage 2 of the redesign continues per plan section K after the
owner's review of the live pages.

Owner approved a complete presentation redesign. Full approved plan (source of
truth, sections A–L): `~/.claude/plans/pasted-content-id-71ab-i-want-crispy-parnas.md`
(copy the relevant section here if that file is unavailable). Decisions: new
palette (ink neutrals + one navy accent), IBM Plex Sans only (no serif, no
gradient hero cards, no stat-card grids), functional page titles, sidebar lists
accounts with balances, single global top bar. Only non-UI change: `financePage`
wrapped in React `cache()` so the layout can read balances without a second
ledger computation. No commands, APIs, schema or domain changes. Every
test-visible heading/label/marker class listed in the plan's [T] lists stays;
intentional test edits: foundation pillar headings, four page headings in
finance.spec, Auto-Assign step opens its popover first, shots.spec ledger crop.

Acceptance for this batch (Stage 0 + Stage 1, then STOP for owner review):
foundations (tokens/type/controls/ui primitives, old class names aliased so
untouched routes still render), shell (sidebar + top bar + bottom tab bar),
Budget page redesigned per plan F1, drawer revised. Gate: `npm run check`,
`npm run test:integration`, `/mynab` build, `APP_BASE_PATH=/mynab npm run
test:e2e` (desktop+mobile, a11y 0), screenshots + contrast (0).

Step 0 (foundations) IMPLEMENTED: `src/app/globals.css` (new tokens, legacy
names aliased, type roles, controls/components layers), `src/app/layout.tsx`
(IBM Plex Sans), `src/components/ui/{page-header,summary-strip,notice,pill,
popover,popover-keys,month-switcher,empty-state,help,skeleton}.tsx`,
(`loading.tsx` skeletons were tried and REMOVED: with them, `page.goto`
returns while the route is still streaming behind the skeleton, so the
screenshot, axe and contrast suites would audit skeletons; `ui/skeleton.tsx`
is kept for a later client-side use); `finance-form.tsx` renders button + status on one row (payload logic
untouched, new `buttonClassName` prop).
Step 1 (shell + Budget) IMPLEMENTED: `(protected)/layout.tsx` (sidebar with
account balances, single top bar, bottom tab bar), `navigation.tsx`,
`brand.tsx` (login passes `href={null}` so the first Tab still lands on
Username), `drawer.tsx` (+`DrawerSection`), `drawer-keys.tsx`,
`focused-view-tabs.tsx`, `budget/page.tsx` (all data prep verbatim; new
rendering), `finance-page.ts` (`financePage` wrapped in React `cache()`;
budget/goals call it without an argument for the current month so the key
matches the shell's call). Tests edited as planned: foundation Budget heading
→ "Budget"; finance.spec Auto-Assign opens its popover first; shots.spec crops
the "Category ledger" region. Passed so far: `npm run lint`, `npm run
typecheck`, `npm test` (246), `npm run test:integration` (143), `/mynab`
build, screenshot harness (desktop/dark/phone reviewed). First full e2e run:
19 passed, 4 failed, rest skipped (serial). Causes and fixes applied: (a) axe
contrast on the dimmed row Assign button — now `--ink-3` text instead of
opacity; (b) phone: the 90vh bottom sheet plus two sticky bars left no
uncovered strip to click a ledger row — sheet is 75vh and the page header is
sticky only ≥1024px; (c) `PopoverKeys` closes a popover on an outside click,
so the stock-category test reopens Add group after using the drawer (test
edit). Later runs found and fixed: (d) `.page-header`/top-bar `backdrop-filter`
made them the containing block for the popovers' `position: fixed` phone
panels (Money moves landed under the top bar) — both are opaque now; (e) a
"Save terms" race on /debt: the layout's memoised `financePage()` plus
`debtPage`'s direct `getFinance` doubled the ledger work per request, so
`debtPage` now reads `financePage()` too; (f) on /accounts/register at phone
width an `sr-only` span ("None" in the Flag column) was absolutely positioned
against the viewport and widened the document to 408px, so mobile Chrome
scaled the page and Playwright's hit-testing missed — `[role="region"][tabindex]`
is now `position: relative` (the tabbable table regions). Auto-Assign's
heading is its popover summary so `panel("Auto-Assign")` resolves; `addCategory`
in finance.spec closes the inspector it opens. Known pre-existing flake:
"downloads a complete export" (fails ~1 in 2 runs; API verified healthy by
a probe). Explained: "solves a monthly debt payment from a chosen payoff month" failed
because the 0.3.29 test "sets up and removes a loan payment from its terms"
leaves "Personal loan" with only a version effective 2027-01 (no terms in
force), so `ready` is false on /debt for every later serial test; that test
was only ever verified alone with `--grep`. It now also records the loan's
current terms at its end (test edit, not app code). Mobile Auto-Assign and money-moves tests
dismiss their popover before touching the ledger (phone panels sit over it;
Escape via `PopoverKeys`). Also fixed: the Assigned cell's status sentence
inherited the numeric column's `nowrap` and, with `justify-end`, pushed the
field and button off the left of a phone screen — it now wraps beneath them;
`FinanceForm` calls `router.refresh()` after every outcome, including the
replace navigations, so the sidebar's account list cannot go stale (deleted
account still listed); the loan test closes its two loans at its end so the
later payoff-solver test sees the debts it was written against; the Food
row's phone sub-line carries the activity link the hidden column used to.
E2E: desktop project 70/70 passed with axe 0 (`APP_BASE_PATH=/mynab npm run
test:e2e`, run of 2026-09-26 evening, the only failure then was the mobile
money-moves test); mobile project 70/70 passed with axe 0 in the following
`--project=mobile` run after the Escape edit. Screenshots + contrast audit
and a repeat of `test:integration` (needed: `debtPage` changed) are running.

## Loan terms and payment setup — VERIFIED locally; release authorized (owner 2026-09-26)

Request: make loan terms usable beyond card APR entry; allow a loan's scheduled
payment to come from a chosen bank account, or leave/return it unscheduled.
Root cause: `TermsForm` shares card-oriented fields, and `debt.terms.set`
unconditionally routes a chosen payer through `setupCardPayment`, which requires
a card payment category. Loans are tracking accounts, so a bank-to-loan payment
also needs a spendable budget category for its cash outflow. Emptying Pay from
currently does not retire an existing managed schedule.

Acceptance: loan terms present loan-relevant fields; a loan can save APR/minimum
and optional due day, payer, payment category, and amount; a scheduled loan payment
is a bank-to-loan transfer with its category split; choosing no payment leaves it
unscheduled and can cancel an existing managed loan payment. Credit card behavior
and targets remain unchanged. Add a focused integration regression test.

VERIFIED: `npm run check` (lint, typecheck, 246 unit);
`npm run test:integration` (143); `APP_BASE_PATH=/mynab npm run build`; and
`APP_BASE_PATH=/mynab npm run test:e2e -- --grep "sets up and removes a loan
payment"` (2 desktop/mobile). The browser test also saves future-dated APR
terms for a loan that has no managed payment.

Loans now have a loan-oriented terms form; a selected checking account and
regular budget category create a categorized monthly transfer to the tracking
loan. "Don't schedule a payment" ends an existing managed loan schedule.
Card payment envelopes remain card-only. No transaction posts when terms are
saved, and no migration was needed. Files: `src/components/terms-form.tsx`,
`src/components/finance-form.tsx`, `src/app/(protected)/debt/page.tsx`,
`src/application/finance.ts`, `src/application/finance-page.ts`,
`src/application/schedules.ts`, `tests/integration/finance.test.ts`,
`tests/e2e/finance.spec.ts`, `docs/YNAB_ALIGNMENT.md`.

Release authorized by owner: bump to `0.3.29`, commit the verified loan fix and
version/stack tags, then run `npm run release` to build host-local images. This
script does not update Portainer or restart production. Step R1 VERIFIED:
updated `package.json` and `deploy/portainer/stack.yml` to `0.3.29` and committed
the verified set (`feat: support loan payment terms`). Step R2 VERIFIED: built
`mynab:0.3.29` (`db916deda376`) and `mynab-tools:0.3.29`
(`949d604693c7`) on `plex@192.168.1.7`, source `ba026e61f908`, linux/amd64,
`APP_BASE_PATH=/mynab`, runtime `node`; builder capped at 2 CPUs/2 GiB and
63 GiB free after build. The live stack was untouched. A post-build review found
`package-lock.json` still at `0.3.28`; do not deploy 0.3.29. Step R3 VERIFIED:
synchronized package, lockfile, and stack at `0.3.30`, committed as `2d59178`
(`chore: prepare 0.3.30 release`), and built from that commit. `mynab:0.3.30`
is `1c0c0d92a1d1`; `mynab-tools:0.3.30` is `760909c25653`, local on
`plex@192.168.1.7`, linux/amd64, `/mynab`, runtime user `node`. BuildKit limit:
2 CPUs/2 GiB; host had 63 GiB free after build. `.29` images remain local and
are superseded. No Portainer update or production data mutation occurred.
Step R4 VERIFIED: `NEXT_STEPS.md` and `DEVELOPMENT_LOG.md` record the source,
image IDs, build limits, local tests, superseded `.29` tags, and unrun
container/restore checks. Production upgrade remains pending the owner's live
database backup and full-stack Portainer update with re-pull disabled; this
release build did not touch the running stack.

## Release 0.3.28 — committing, then `npm run release` (owner 2026-09-26, Claude)

Contains: Stitch Unified Ledger & Drawer redesign of all pages; recurring
suggestion uses the latest amount (eb9bdff). No migration.

## Stitch "Unified Ledger & Drawer" redesign, all pages — VERIFIED locally, uncommitted (owner 2026-09-26, Claude)

Owner asked for an overview before code. Findings: colour/type/spacing/radius
tokens in src/app/globals.css already mirror "Warm Editorial Finance" (same
names), so the work is layout. Plan: shell (260px h-screen rail, main
flex-1 overflow-y-auto), shared Drawer (fixed inset-y-0 right-0 w-[380px] z-30,
no scrim, URL-driven like budget ?inspect=, own scroll, pinned header/footer),
CommandBar/MetricBadge/FilterPills, ledger table styles; then pages one at a
time: Budget -> Accounts + Register -> Targets -> Schedules -> Debt. Only
existing commands/data; Stitch-only ideas omitted (see chat).
Step 1 (shell + Drawer + Budget) IN PROGRESS: files src/app/(protected)/layout.tsx,
src/components/drawer.tsx (+ drawer-keys.tsx), src/app/(protected)/budget/page.tsx,
globals.css, tests if selectors move. Stop for owner review after step 1.
Step 1 VERIFIED: npm run check (246 unit); /mynab build; test:e2e (138, a11y 0);
screenshots + contrast (0). Done: rail 260px h-screen, #workspace scrolls
(header sticky), Drawer + DrawerKeys (Escape, focus), Budget inspector is a
Drawer, ledger full width, Move money/Money moves in a 2-col row below, row
Assign moved into the Assigned column (clear of the drawer), compact totals.
Two e2e tests now close the drawer before clicking right-edge controls it
covers (hide category; Add missing Bills categories).
Owner /goal: redesign ALL pages. IN PROGRESS. VERIFIED so far (e2e 138):
all page titles compact; Targets drawer (?inspect=, TargetEditor); Debt terms
in drawer via ?account= (TermsPanel) + Edit terms links; Schedules manage
table + drawer (?schedule=, 4 tests updated). Then also VERIFIED: accounts
list one grouped table (2 tests read the row, not the link); account register
row detail, saved rules and import review entries show as the drawer on
desktop via <details name> + DETAILS_DRAWER (src/components/drawer.tsx) +
DetailsClose; reports "Behind this figure" is a Drawer; schedules page puts
tables first, create form last, occurrences as rows; screenshots spec unrolls
the shell (data-shell) for full-page photos. Final: npm run check (246),
test:integration (142), /mynab build, test:e2e (138, a11y 0), screenshots +
contrast (0). Other pages (forecast, payees, import, export, plans,
household, add, guide) only needed the compact title. Next: commit/release
when the owner asks.

## Recurring suggestion uses the latest amount — VERIFIED, committed, not released (owner 2026-09-26, Claude)

VERIFIED: npm run check (246 unit); test:integration (142); /mynab build;
test:e2e (138, a11y 0). Next: bump to 0.3.28 and `npm run release` when asked.

Owner saw a car payment suggested at $562.00 when the latest was $561.22: the
suggestion used the median of the history. Now: the latest amount (median is
still the similarity check). Files: src/domain/recurring.ts,
tests/unit/automation.test.ts, schedules page copy.

## Release 0.3.27 — BUILT, Portainer update pending owner (owner 2026-09-26, Claude)

Built from 410fc96 (exit 0): mynab:0.3.27 (b3ced1181390), mynab-tools:0.3.27
(1c271879fb53) on plex@192.168.1.7. Owner pastes full stack.yml, re-pull off;
migrate applies 202609260004_debt_plan_tracking.

Contains: payoff plan tracks itself (worker job debt.plan.track, paid-off
cards retired); schedule category message and single-category blank split.
Migration 202609260004_debt_plan_tracking.

## Schedule without a category — VERIFIED locally, uncommitted (owner 2026-09-26, Claude)

Owner's rent schedule failed with "Schedule splits must equal its amount": an
expense schedule needs a category and none was chosen. Fix: clear message
("Choose a category for this expense."), and one category with a blank split
amount takes the whole amount. Files: finance.ts (schedule schema/handler),
schedule-fields.tsx copy, integration test.

## Payoff plan tracks itself — VERIFIED locally, uncommitted (owner 2026-09-26, Claude)

VERIFIED (both items): npm run check (246 unit); test:integration (142);
/mynab build; test:e2e (138, a11y 0); test:backup (40 tables). Migration
202609260004_debt_plan_tracking applied to .env and .env.test. Next: release
0.3.27 when the owner asks.

Owner: a followed plan should fully track: card targets update each month
without re-applying; a paid-off card goes back to no target and leaves the plan,
so new spending on it does not bring it back.
Plan: migration 202609260004_debt_plan_tracking (DebtPlan."paidOff" jsonb
default '[]'; Job kind adds 'debt.plan.track'). finance.ts: applyDebtPlan first
retires plan cards (keys of `applied`) that owe nothing: delete the payment
envelope's targets + snoozes, end the managed schedule yesterday (archive if
before its start), add to paidOff; debts exclude paidOff; overridden cards keep
their `applied` entry. New commands debt.plan.track (retire always; apply with
reclaim=false when appliedMonth != current month; all paid off -> just mark the
month) and debt.plan.include {accountId} (remove from paidOff). jobs.ts: daily
per budget-local day `debt.plan.track:<budget>:<day>` for budgets with a plan,
running executeFinance under the owner with a deterministic key. debtPage
excludes paidOff when showing the adopted plan; Debt page adopted panel lists
paid-off cards with "Add back to the plan"; copy says it updates itself.
Files: prisma/schema.prisma + migration, health ready route, finance.ts,
jobs.ts, finance-page.ts, debt/page.tsx, guide, tests.

## Release 0.3.26 — BUILT, Portainer update pending owner (owner 2026-09-26, Claude)

Built from 10d3a59 (exit 0): mynab:0.3.26 (10082173cd29), mynab-tools:0.3.26
(a5565e9f0c12) on plex@192.168.1.7. Owner pastes full stack.yml, re-pull off.

Contains: Move money to/from Ready to Assign; card due-day change moves the
next payment; card payment targets can be snoozed. No migration.

## Card due-day change + snooze card targets — VERIFIED locally, uncommitted (owner 2026-09-26, Claude)

VERIFIED: npm run check (246 unit); test:integration (139; new due-day
assertion fails without the fix); /mynab build; test:e2e (138, a11y 0).
Next: commit/release (0.3.26, with the Ready to Assign move) when asked.

Owner: can't find snooze (it is refused/hidden for card payment targets); and
changing a card's due day leaves the old day's upcoming payment in place.
Cause: setupCardPayment ends the old managed schedule the day before the new
start, so an unhandled occurrence on the old day (e.g. 9/28 when moving to the
15th -> new start 10/15) stays. Fix: end the old schedule yesterday (or at its
last handled date if later); archive it if that is before its start; the new
schedule starts at the next due day after today / last handled. Allow
target.snooze on card payment categories (YNAB allows snoozing any target);
show the button. Files: src/application/finance.ts, src/components/
target-editor.tsx, tests/integration/finance.test.ts.

## Move money to/from Ready to Assign — VERIFIED locally, uncommitted (owner 2026-09-26, Claude)

VERIFIED: npm run check (246 unit); test:integration (139); /mynab build;
test:e2e (138, a11y 0). Next: commit/release only if the owner asks.

Owner could not find how to return category money to Ready to Assign (it only
lived in the inspector). Plan: `move` command accepts "READY_TO_ASSIGN" as from
or to (single entry, same moveId/undo); Move money selects list Ready to
Assign first; guide sentence. Files: src/application/finance.ts,
src/app/(protected)/budget/page.tsx, guide/page.tsx, tests (integration, e2e
appended). No migration.

## Release 0.3.25 — BUILT, Portainer update pending owner (owner 2026-09-26, Claude)

Built from 353e1d3 (exit 0): mynab:0.3.25 (dd1baaf957d7), mynab-tools:0.3.25
(eba1e10c65c3) on plex@192.168.1.7. Owner pastes full stack.yml, re-pull off;
migrate applies 202609260003_debt_plan.

Adopted debt plan (section below). Migration 202609260003_debt_plan. Next:
`npm run release`; owner pastes stack.yml.

## Adopted debt plan — VERIFIED locally, uncommitted (owner 2026-09-26, Claude)

VERIFIED: npm run check (246 unit); test:integration (138); /mynab build;
test:e2e (136); test:backup (40 tables); screenshots contrast 0. PROJECT.md key
decision and YNAB_ALIGNMENT updated. Export JSON includes debtPlan. Next
release 0.3.25 (migration 202609260003_debt_plan). Not done: loans/tracking
accounts in the plan; "on track" comparison of actual vs planned payments.

Owner: "just build it" — approve a payoff plan so it drives card targets and
payment schedules. Decisions (Claude's recommendations, owner accepted by
building): cards only; store the plan's SETTINGS (strategy, extra/budget,
ranks, deferred option), never its projection; each month the owner is
prompted (Budget + Debt pages) to apply that month's re-planned amounts from
real balances; a card whose plan-set target was changed by hand is skipped and
flagged (reclaim with an explicit apply). Changes the PROJECT.md decision
"scenarios are never stored" for the one adopted plan.
Plan: migration 202609260003_debt_plan (DebtPlan, one per budget); extract
debt building from finance-page into src/application/debt-plan.ts; commands
debt.plan.adopt / debt.plan.apply / debt.plan.stop in finance.ts (apply sets
DEBT_PAYOFF target for the month and replaces the managed schedule amount via
setupCardPayment); Debt page "Adopt this plan" + adopted-plan panel; Budget
page banner when appliedMonth != current month. Tests: unit/integration/e2e.
Progress: migration 202609260003_debt_plan (applied locally, registered),
src/application/debt-plan.ts (plannedDebts shared with debtPage), commands
IMPLEMENTED; integration "adopts a payoff plan" passes. Next: UI + e2e.

## Release 0.3.24 — BUILT, Portainer update pending owner (owner 2026-09-26, Claude)

Built from 16aafd2 (exit 0): mynab:0.3.24 (f6bd34a40e5a), mynab-tools:0.3.24
(8e662f917729) on plex@192.168.1.7. Owner pastes full stack.yml, re-pull off;
migrate applies 202609260002_deferred_interest.

Deferred interest + custom payoff order (section below). Has migration
202609260002_deferred_interest. Next: `npm run release`; owner pastes stack.yml.

## Deferred interest + custom payoff order — VERIFIED locally, uncommitted (owner 2026-09-26, Claude)

VERIFIED after final change: npm run check (246 unit); test:integration (137);
/mynab build; test:e2e (134); test:backup (39 tables); screenshots contrast 0;
composite FK count unchanged at 45. Migration 202609260002_deferred_interest
applied to local mynab_test and mynab_dev, registered in health/ready.
Known gap: Fresh Start copies term versions one at a time and drops the
deferred flag. Next release 0.3.24 (has a migration).

Owner has a deferred-interest promo card and wants to plan for it and fully
customise the payoff order. Plan:
- Migration 202609260002_deferred_interest: DebtTerms.deferredInterest bool
  (on the intro version) + deferredAccrued bigint? (from statement).
- debt.terms.set: introDeferred (needs introApr/introEnds), deferredAccrued.
- domain/debt.ts: Debt.deferred {endsMonth, aprBasisPoints, accrued}; shadow
  interest accrues during the promo, charged in endsMonth if balance remains;
  request.clearDeferredFirst reserves ceil(balance / months left) for deferred
  cards before the strategy pool; outcomes report deferredCharged/cleared.
- Custom strategy exposed: per-debt order inputs (query rank_<id>), scenario
  only (never stored).
- UI: terms form checkbox + accrued field; debt tables show deadline outcome.
Tests: unit (debt.test.ts), integration (terms), e2e (form + plan).
Progress: domain IMPLEMENTED + unit VERIFIED (`npx vitest run --project unit
tests/unit/debt.test.ts`, 28). Next: migration/schema/command/loader/UI.

## Release 0.3.23 — BUILT, Portainer update pending owner (owner 2026-09-26, Claude)

Built from e2c902e (exit 0): mynab:0.3.23 (3bdec202f826), mynab-tools:0.3.23
(af4b84935df7) on plex@192.168.1.7. Owner pastes full stack.yml, re-pull off.

Owner asked to commit and deploy the first-payment fix and comparison wording
(section below). No migration. Custom payoff order NOT built (not requested).
Next: `npm run release`; then the owner pastes stack.yml in Portainer.

## Payoff: first payment before new interest — VERIFIED locally, uncommitted (owner 2026-09-26, Claude)

VERIFIED: npm run check (243 unit, 3 new in debt.test.ts); test:integration
(136); /mynab build; test:e2e (132). Comparison sentence now "saves/costs $X
in interest". Owner asked about highest-balance-first for a 0% promo card;
simulation on owner's numbers (WF regular APR ~27.24% assumed from April
2027) showed promo-first costs MORE interest than avalanche ($806 vs $742 at
$429/mo) because avalanche already switches when the promo rate ends. Not
built; offered a Custom order only for deferred-interest cards. Next release
would be 0.3.23 (no migration).

Owner: 6521 ($163.51, 26.99%, due day 28) shows first payment $167.19 —
simulatePayoff charges interest before every payment, but today's balance
already includes the last statement's interest. Fix: Debt.firstPaymentBeforeInterest
(domain/debt.ts): in the first month no interest is added before paying (the
minimum still estimates 1% + a month's interest). debtPage sets it when the
card's due day has not passed this month (or is unknown). Also reword "changes
interest by -$X" to "saves $X in interest". Files: domain/debt.ts,
finance-page.ts, debt/page.tsx, tests/unit/debt.test.ts.

## Release 0.3.22 — BUILT, Portainer update pending owner (owner 2026-09-26, Claude)

Built from bcfe5b5 by `npm run release` (exit 0): mynab:0.3.22 (46c4d5c3609d),
mynab-tools:0.3.22 (6b77d1d63175) on plex@192.168.1.7. Owner: paste the full
stack.yml (0.3.22) with re-pull disabled; confirm migrate Exited (0) and
/mynab/api/health/ready 200.

Owner asked to build and deploy 0.3.22 (sections below). No migration in
this release. Next: `npm run release` (owner runs it if the agent's permission
check blocks it again), then the owner pastes the full stack.yml in Portainer
with re-pull disabled. The agent has no Portainer access.

## Payoff default + intro APR fields — VERIFIED locally, uncommitted (owner 2026-09-26, Claude)

VERIFIED: npm run check (240); test:integration (136); /mynab build;
test:e2e (132); test:backup (39 tables); screenshots contrast 0.
All uncommitted work (delete cat/group/schedule, Set up payment, terms edit
prefill + preview, payoff default, intro APR) is ready as 0.3.22.

Done+VERIFIED (e2e 130): debt plan defaults to scheduled card payments
(plannedBudget in finance-page.ts debtPage; note .planned-note). Now: owner
finds 0% promo entry via "takes effect from" confusing. Adding introApr +
introEnds (month) + replaceFuture to debt.terms.set: one save writes the intro
version (in force) and the regular-rate version from introEnds; editing
replaces future versions. TermsForm gets "Intro APR"/"Intro rate ends"
fields, prefilled from the next future version. Files: finance.ts,
terms-form.tsx, debt/page.tsx, tests.

## Debt terms: edit with prefill + live minimum — VERIFIED locally, uncommitted (owner 2026-09-26, Claude)

Implemented src/components/terms-form.tsx (client) used by debt/page.tsx;
managedCardPayments() in application/schedules.ts prefills Pay from/Monthly
payment. Saving without a "takes effect from" month sends the in-force
version's effectiveFrom, so it overwrites. Preview line shows percent,
interest, floor and resulting minimum, and warns if it doesn't cover interest.
VERIFIED after final change: npm run check (240); test:integration (135);
/mynab build; test:e2e (128, incl. new "edits a card's recorded terms");
screenshots contrast 0. Uncommitted together with the delete work below;
next release would be 0.3.22.

Owner: choosing a card with terms must prefill every field, and saving
overwrites that card's terms (the version in force) rather than adding one.
Show the calculated minimum (1% + interest vs floor) as they type. Owner's
interest rose 980 -> 1100 because the rule (1% + interest, $25 floor)
computes $25 where the old fixed minimum was $40; the card's real floor is
probably $40. Plan: client component TermsForm (src/components/terms-form.tsx)
using domain minimumDue/monthlyInterest; debt page passes in-force terms,
balances, managed payment schedule. "Takes effect from" prefilled with the
in-force version's month (so save overwrites it). Files: debt/page.tsx,
finance-page.ts, new component, e2e tests.

## Delete category / group / schedule + retroactive card payment — VERIFIED locally, uncommitted (owner 2026-09-26, Claude)

Also added: `schedule.delete` (removes schedule + all versions, occurrences,
splits; voids its ENTERED transactions, approved ones only with
removeApproved), UI "Delete schedule…" on Schedules page; `debt.payment.setup`
(same helper `setupCardPayment` as debt.terms.set, reads terms in force) with
a "Set up payment" form in the card inspector when terms have a due day and no
managed schedule. Category Archive checkbox replaced by "Delete category…".
VERIFIED: npm run check (240); test:integration (135); /mynab build;
test:e2e (126); test:backup (39 tables); screenshots contrast 0.
Not committed/released (would be 0.3.22). Original plan below.

Owner: no way to remove a group or category once added (only an Archive
checkbox under "Rename, move or hide", and group Hide). Plan: commands
`category.delete` and `group.delete` in finance.ts. A category with no history
(no splits, assignments, schedule splits) is truly deleted (its targets,
snoozes and focused-view rows go with it); one with history is archived, as
today. Refused while it holds money this month (move it first), has future
assignments, or a live schedule or rule uses it (named in the message).
group.delete applies that to every category in the group, then deletes the
group, or hides it if archived categories must keep it. UI: a "Delete
category" button in the inspector and a "Delete group" button in the group
popover. Tests: integration + e2e. Files: finance.ts, budget/page.tsx, tests.

## Card setup + envelope structure — 0.3.21 BUILT, Portainer update pending owner (owner 2026-09-26, Claude)

Owner asked to build it: bump to 0.3.21 (package.json, package-lock,
stack.yml), commit, `npm run release` on the Linux host.
Committed as 820b283 (version 0.3.21). `npm run release` NOT run: the agent's
permission check blocked it as a production deploy. The owner runs
`npm run release` (or allows it), then pastes the full stack.yml in Portainer.
Update: the owner ran `npm run release` from a clean tree (96ee7f2) and it
built mynab:0.3.21 and mynab-tools:0.3.21 on plex@192.168.1.7 (image IDs not
captured). Next, the owner: back up the DB and key, paste the full stack.yml
(0.3.21) with re-pull disabled, confirm migrate Exited (0) and
/mynab/api/health/ready 200. Production composite-FK count should rise by 1. No Portainer update
or production mutation by the agent.

Owner request: (1) debt terms must save with a percentage-only minimum (fixed
minimum becomes an optional floor); (2) saving terms with a due day and a
"Pay from" account auto-creates a DEBT_PAYOFF target (fixed monthly amount,
prefilled with today's calculated minimum, editable) on the card's payment
category and a managed monthly TRANSFER schedule pay-from -> card, replaced
(not duplicated) on resave, archived on card close/delete; (3) the category
inspector becomes the hub: card terms summary, upcoming schedules, a short
target-vs-schedule explainer (paying a card = transfer from checking, no
category); (4) Envelopes header merges "+ Browse stock groups" into one
"+ Add group" popover; each group's "+ Add category" shows stock suggestion
chips. Full plan: ~/.claude/plans/i-ve-been-trying-to-idempotent-lantern.md
(copied in summary here). Acceptance: tests for each item; no release.

Batches: 1 percent minimums — IMPLEMENTED (minimumPayment optional, one of
fixed/percent required; Debt table shows current calculated minimum; e2e label
now "Fixed minimum (USD)"). Passed: tsc; `npx vitest run --project integration
tests/integration/finance.test.ts -t "percentage minimum"` (1). Full suites
not yet run. NOTE: do not run prettier on finance.ts/tests — they are not
prettier-clean and it rewrites hundreds of unrelated lines.
2 auto target+schedule — IMPLEMENTED: migration
202609260001_card_payment_schedule (Schedule.paymentForAccountId + composite FK
Schedule_paymentFor_budget_fk, index; widens target_due_day_sane to allow
DEBT_PAYOFF), registered in health/ready expectedMigrations; applied to local
mynab_test and mynab_dev (constraint amended in place + checksum updated
after first apply). FK count now 45. debt.terms.set takes payFromAccountId +
monthlyPayment; nextDueDate() in domain/schedules.ts; managed schedule
archived on card close/delete. Debt form has Pay from / Monthly payment,
#terms anchor, ?account= preselect. Passed: tsc; unit schedules+migrations
(9); integration -t "payment target and schedule|percentage minimum" (2).
Plaid-match test NOT added (existing schedule.match flow applies). 3 inspector hub — IMPLEMENTED (categorySchedules() in
application/schedules.ts; inspector shows Card terms + Edit terms link,
target/schedule explainer, Upcoming list with #schedule-<id> links; schedules
page anchors + managed note; guide copy). Not yet tested; 4 unified group/category add — IMPLEMENTED (one "+ Add group" popover:
custom name + stock groups not fully installed, marker .suggested-categories
now a div inside details.add-group; per-group add-category has
.stock-chips via starter.add and a datalist of stock names). e2e/screenshot
locators updated; new e2e "sets up a card payment from its terms" at END of
finance.spec.ts. Popover name inputs widened to 11rem (globals.css).

VERIFIED (all 2026-09-26): `npm run check` (lint, typecheck, 240 unit);
`npm run test:integration` (132); `APP_BASE_PATH=/mynab
APP_ORIGIN=https://127.0.0.1:3443 npm run build`; `APP_BASE_PATH=/mynab npm
run test:e2e` (122 passed, 0 a11y violations); `PG_BIN=... npm run
test:backup` (39 tables); screenshot config incl. contrast (0 failures) after
the final CSS width tweak (e2e ran before that CSS-only tweak). Docs:
YNAB_ALIGNMENT "Card payment setup". Not committed, not released; version
still 0.3.20. Next: commit when owner asks; release needs version bump and the
new migration (production FK count will be +1).

## Stock category catalog — VERIFIED locally (owner 2026-09-25, follow-up 2026-09-26)

Owner reports the 0.3.19 stock-suggestion UI still does not make the standard
groups/categories browsable/manageable or make target assignment discoverable.
Recovery: clean HEAD 6acf627, working tree clean. The current catalog is a
collapsed popover; it hides categories once installed, has no group-level add,
and omits `StarterGroup.note`. Existing categories already have a working
inspector/TargetEditor, and adding one directs to it. Fix the discoverability
gap without changing target semantics (targets belong to categories, not
groups): render the full stock catalog and notes, show installed items with a
direct inspector link, and add an explicit command to create/reuse a whole
stock group with its missing categories. Keep single-category add and its
inspector flow. Add integration and browser coverage, update docs/version only
as needed for release; do not deploy or mutate production.

Implemented: the Budget page now has a complete browsable catalog with template
notes, one-click add/restore per category, install/restore whole-group action,
and a unique Manage link on installed categories. Adding a stock group reuses
the matching owner group/categories and unhides/unarchives only the matching
stock entries; unused groups still remain out of the plan. Guide/new-plan copy
updated. The old `Add Electric` Playwright locator is now row-scoped and matches
the specific accessible action.

Verified commands: `npm run check` (lint, typecheck, 239 unit tests);
`npm run test:integration` (130 existing integration tests) plus focused
`npx vitest run --project integration tests/integration/finance.test.ts -t
"adds a complete stock group once and allows a category target"` (1 passed);
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`;
`APP_BASE_PATH=/mynab npx playwright test tests/e2e/finance.spec.ts -g "adds
one stock category"` (desktop + mobile, 2 passed). The old browser locator was
updated; the full group and target flow passes on desktop and mobile.

Release request (owner 2026-09-26): BUILT, Portainer update pending owner.
Commit `942e92d94636cf2bf4b2e28f3a50ffb97b23332f`, version 0.3.20. `npm run
release` exited 0: amd64 local images `mynab:0.3.20` (`e2961383b0ef`) and
`mynab-tools:0.3.20` (`6d4f05cec991`) built on `plex@192.168.1.7`,
`APP_BASE_PATH=/mynab`, runtime user `node`. Build host `/` had 64 GB free,
86% used. No Portainer stack update or production mutation. Owner's next step:
paste the full current `deploy/portainer/stack.yml` and update with re-pull
disabled; verify migration and readiness.

## Plaid credit-card terms — DEFERRED (owner 2026-09-26)

Owner asks to sync card terms automatically while retaining manual entry when
Plaid cannot supply them. Official Plaid docs confirm `/liabilities/get` returns
credit-card APRs (when reported), minimum payment, statement balance/date, and
next due date; product data refreshes about daily. Existing Link requests only
`transactions`. Existing Items must consent through Link update mode using
`additional_consented_products: ["liabilities"]`. Liabilities is a paid
subscription product, so do not enable it silently: give the owner an explicit
per-connection opt-in in Plaid Link. Once enabled, regular/worker sync retrieves
liabilities. Preserve manual term versions; Plaid may populate only accounts
without any manual terms. If purchase APR or minimum payment is absent, skip the
automatic version and leave manual entry available. This auto-captures one
representative purchase APR because the current debt model has one APR; other
APR categories cannot be faithfully represented and must not be mislabelled.

Owner declined this for now because Liabilities is a paid subscription product.
No Plaid implementation or existing Link behavior is changed. Revisit only if
the owner opts into the additional Plaid product cost. If resumed, use an
explicit Plaid consent flow and keep manual terms authoritative.

## Owner follow-up 2026-09-25 — IN PROGRESS

Owner asks for an explicit way to return category money, including rollover,
to Ready to Assign and asks why starter categories disappeared after a new
plan/Fresh Start. Confirmed from current code: negative `assign` already does
the accounting, and move history can undo assignments; the UI conceals that
path. Fresh Start copies existing groups/categories; Create plan is empty and
offers `starter.apply` on an empty Budget page. Next batch: add a clear
Return to Ready to Assign action in the category inspector, cover rollover in
integration/browser tests, clarify New plan versus Fresh Start wording, and
document results. Expected files: Budget page, Plans page, tests, continuity
docs, version/deployment files. Do not mutate live plans.

## READ FIRST — YNAB parity status (Claude, 2026-09-25, HEAD after 60f4770)

Owner /goal (shared with Codex): full YNAB feature parity. Since a46e5a0 Claude added, each
VERIFIED locally and committed, none released or deployed (production still 0.3.10; 0.3.11
images predate all of it): focused views, money moves (+undo, cover, activity links), Hide
Amounts, Reflect filters/group breakdown/Income v Expense, multiple plans, Fresh Start,
flags + all-accounts register + bulk flag/categorize, household sharing, getting-started
checklist + /guide, quick add (+offline outbox), installable manifest/icons, payee
rename/combine, per-account Loan Planner, category inspector, twice-a-month schedules,
target due day, plan date format. Migrations now 30 (through 202609250017_date_format);
backup test covers 39 tables. Detailed per-batch notes are at the END of this file.
Remaining gaps (docs/YNAB_PARITY.md): real-bank/OAuth verification (owner), native app /
widgets / fully offline app open (not feasible as a web app beyond what exists), per-plan
currency formatting (deliberately USD-only). Next useful step: build a new release image
only when the owner asks, then paste the whole stack.yml per ai/PROJECT.md.
Test-suite notes: new e2e tests that change Checking balances live at the END of
tests/e2e/finance.spec.ts (serial ledger chain); "downloads a complete export" failed once
on mobile and passed on rerun — possibly flaky.

## Active goal (older)

Finish the application through Phase 8, using the owner's completed Warm Editorial Finance
redesign. Presentation-only scope has ended. Owner prefers restrained color, legible button
pairs, compact management, fewer oversized rows. Do not revert the redesign or prior contrast
repairs. Full roadmap remains in NEXT_STEPS.md; no blocker.

## Latest work: VERIFIED, unreleased

Baseline e98f3fa, clean recovery. Added saved-rule persistence/CRUD and hypothetical preview UI
under Accounts, with exact amounts, optimistic revision, authorization/audit/idempotency and
ownership FKs. Rule application/transaction tags/manual-field locks are NOT implemented yet.
Migration 202609240003_automation_rules brings count to 14.

Design refinements: neutral outlined inline Assign/Rename buttons; compact Groups/Categories
grids and direct inline group names; no empty message space; 44px phone control targets;
Accounts selected on subpages. Rule UI shares typography/checkbox/control tokens.

Verified commands: npm run check (164 unit/property, lint/typecheck), npm run test:integration
(71), APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build,
APP_BASE_PATH=/mynab npm run test:e2e (44),
PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup (30 tables),
APP_BASE_PATH=/mynab npx playwright test --config tests/screenshots/shots.config.ts
(visual review and zero reported contrast failures; excludes gradients/unparseable colors).
Fresh mynab_rules_empty_test: 14 migrations, 38 composite ownership FKs. The final heading
font-role correction passed a repeated build and visual/contrast run.

## Next executable batch

Explicit rule application with persisted owner-field protection/tags and immutable financial
corrections, revalidated against current rules/transactions and reconciliation state. Then
finish Phase 4 worker/timezone/suggestions gaps and every remaining phase. See NEXT_STEPS.

## Operations

Prior notes report deployed 0.3.7, built 0.3.8 not yet deployed. Not verified remotely this
turn; no production access or deployment occurred. New code needs a new tag and migration;
do not overwrite built tags. Never print secrets or reset/reseed production. Preserve keys,
back up before release, use the capped Linux builder and full Portainer YAML, re-pull off.

## Rule application: VERIFIED, committed, unreleased

Resumed 2026-09-24 after a cutoff; the prior agent's edits were intact. Adds migration
202609240004_transaction_preferences (TransactionPreference: tags, locked fields, revision;
composite FK to FinancialTransaction), shared fingerprinted previews in application/rules.ts
(loadRulePreview), commands transaction.protect and rule.apply in finance.ts (rule.apply is
rewritten into a transaction.create reversal/replacement keeping date, amount, cleared state;
stale fingerprint, bank-change review, transfer suggestions and no-op changes are refused;
reconciled history needs acknowledgment). Manual entries default to all fields locked;
unapproved imported entries default to unlocked. Preferences carry across replacements, both
manual and ingestion. Controls live on Accounts > Rules.

Verified commands (all passed): npm run check (164 unit); npm run test:integration (74);
APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build;
APP_BASE_PATH=/mynab npm run test:e2e (46); PG_BIN=/opt/homebrew/opt/postgresql@17/bin
npm run test:backup (31 tables); screenshots/contrast config (0 failures). mynab_test has
39 composite FKs after the new migration.

Next: Phase 4 worker/timezone/suggestion
gaps and remaining phases per NEXT_STEPS. Release needs a new tag (0.3.9+) and migration.

## Batch: rule proposals in import review — VERIFIED, committed

Request: continue the roadmap (NEXT_STEPS item 2, first part). Acceptance: on Accounts >
Connections, an unapproved posted outflow whose enabled rules set a spendable category is
pre-filled with that category and names the rule; rules beat payee memory; protected
(locked) fields and archived/payment/system categories are ignored; when rules also propose
payee/memo/tags, a link opens the Rules preview for that transaction. Approval stays explicit
and unchanged (no new ledger writes). Plan: export the row->definition mapper from
application/rules.ts; use it in getConnections (application/ingestion.ts); hint + link in
connections/page.tsx; integration test in tests/integration/ingestion.test.ts.
Files: src/application/rules.ts, src/application/ingestion.ts,
src/app/(protected)/accounts/connections/page.tsx, tests/integration/ingestion.test.ts.
Verified (all passed): npm run check (164); npm run test:integration (75); /mynab build;
npm run test:e2e (46); npm run test:backup (31 tables); screenshots/contrast (0 failures).

Next executable batch (PLANNED): remaining Phase 4 items from NEXT_STEPS item 2: opt-in
suggested rules, schedule timezone eligibility, overdue summary, recurring dismissal,
durable worker lifecycle (no request-bound background jobs).

## Batch: schedule eligibility, overdue summary, recurring dismissal — VERIFIED, committed

Owner said "carry on" with Phase 4. Acceptance:
1. schedule.approve is due only when the date is <= today in the SCHEDULE's timezone and
   <= today in the budget timezone (ledger never gets a future date); getSchedules exposes
   `due` per occurrence and the page uses it.
2. getSchedules returns `overdue` (unhandled due occurrences of active schedules in the 365
   days before today, independent of the window: count + oldest date); page shows a notice
   with a link that widens the window to the oldest date.
3. Migration 202609250001_recurring_dismissals: RecurringDismissal(budgetId, key, createdAt),
   PK (budgetId,key), FK Budget. Commands recurring.dismiss / recurring.restore (audited,
   idempotent via executeFinance). Schedules page hides dismissed suggestions and lists them
   with Restore. No ledger effect.
Files: prisma/schema.prisma, new migration, src/app/api/health/ready/route.ts,
src/application/finance.ts, src/application/schedules.ts,
src/app/(protected)/accounts/schedules/page.tsx, tests/integration/finance.test.ts,
tests/e2e/finance.spec.ts (dismiss flow).
Verified (all passed): npm run check (164); npm run test:integration (78); /mynab build;
npm run test:e2e (48); npm run test:backup (32 tables); screenshots/contrast (0 failures).
Fresh database mynab_fresh_check_test: 16 migrations, 39 composite FKs (then dropped).
mynab_test was migrated with `node --env-file=.env.test node_modules/prisma/build/index.js
migrate deploy` (integration tests do not migrate by themselves).

Next executable batch (PLANNED): opt-in suggested rules from repeated owner choices, shown
on the Rules page with a prefilled rule.save; then the durable worker (see NEXT_STEPS).

## Batch: opt-in suggested rules — VERIFIED, committed

Acceptance: Rules page lists suggestions only where the owner filed the same normalised payee
to one spendable category >= 3 times with no exceptions (non-voided history), and no rule
(enabled or not) already has a payee condition matching it. Each has "Create this rule",
which sends rule.save (EXACT payee, category). Nothing is created or applied otherwise.
Plan: pure suggestRules() in src/domain/rules.ts + unit tests (tests/unit/automation.test.ts);
move the filing-history loader from getConnections into application/rules.ts
(filingHistory) and reuse it; getRules returns suggestions; UI in accounts/rules/page.tsx;
e2e creates a rule from a suggestion. No migration. Dismissal of rule suggestions deferred.
Verified (all passed): npm run check (167); npm run test:integration (79); /mynab build;
npm run test:e2e (50); npm run test:backup (32 tables); screenshots/contrast (0 failures).

Next executable batch (PLANNED): the durable worker (last Phase 4 item, prerequisite for
Phase 5 scheduled syncs). Needs a design pass first: PostgreSQL job table with leases,
separate `worker` entrypoint/service in Docker + deploy/portainer/stack.yml, graceful
shutdown, health. Changes deployment, so confirm scope with the owner before building.

## Owner instruction 2026-09-24: close Phase 3 gaps, finish Phase 4 (worker), then Phase 5

Owner approved all three, including worker deployment changes (files only; no production
deploy without asking). Order: (A) Phase 3 gaps, (B) durable worker, (C) remaining Phase 5.

## Batch A: Phase 3 debt gaps — VERIFIED, committed

Acceptance: (1) simulator uses effective-dated minimum versions per month; (2) minimum rule:
fixed, or greater of floor and percent-of-balance (+ interest optionally), capped at owed;
(3) optional total monthly payment budget: infeasible when it cannot cover minimums, extra =
budget - minimums; (4) DebtTerms stores optional statement balance + date. Domain first
(src/domain/debt.ts + tests/unit), then migration, finance.ts debt.terms command,
finance-page.ts, debt/page.tsx, integration/e2e tests.
Done: MinimumRule (floor, percent bp, +interest) with effective-dated `minimums`; constant
first-month commitment (or `monthlyBudget`) rolls freed money; `minimumsOnly` baseline;
`shortfallMonths`; migration 202609250002_debt_minimum_rules (percent, includesInterest,
statementBalance/Date). Debt page: new term fields, statement under account name, budget
scenario, shortfall notice. Verified: check (172), integration (80), build, e2e (52),
backup (32 tables), contrast (0).

## Batch B: durable worker — VERIFIED, committed

Design: migration 202609250003_jobs: Job(id, budgetId?, kind provider.sync|maintenance,
subjectId?, dedupeKey, status QUEUED|RUNNING|DONE|FAILED, runAt, attempts, maxAttempts,
leaseToken, leasedUntil, lastError, createdAt, finishedAt) with a PARTIAL unique index on
dedupeKey for QUEUED/RUNNING (raw SQL; prisma migrate dev would drop it) + WorkerHeartbeat.
Pure backoff in src/domain/jobs.ts. src/application/jobs.ts: enqueue (ON CONFLICT DO
NOTHING), claim (FOR UPDATE SKIP LOCKED, lease token), complete/fail guarded by lease token,
scheduleDue (connections ACTIVE, or ERROR but not REAUTH_REQUIRED, stale by
SYNC_INTERVAL_HOURS default 6; daily maintenance), runJob (provider.sync as budget owner via
syncConnection; REAUTH -> FAILED no retry; maintenance = pruneExpired + old jobs).
scripts/worker.ts loop with SIGTERM drain, heartbeat row + /tmp file for healthcheck.
npm script `worker`. Worker service in docker-compose.yml and deploy/portainer/stack.yml
(tools image, networks database+frontend for Plaid egress). Connections page shows automatic
sync status. Tests: unit backoff; integration claim/lease/stale-token/retry/dedupe/schedule.
Verified: check (175), integration (86), /mynab build, e2e (52), backup (34 tables),
contrast (0); fresh DB 18 migrations, 39 composite FKs, partial index present. Local smoke:
worker against mynab_test with no Plaid ran maintenance and exited 0 within 1s of SIGTERM.
stack.yml still references 0.3.8 tags; the next release must bump them (release.sh does).

## Batch C: remaining Phase 5 — VERIFIED, committed

Acceptance: (1) config treats empty optional env values as unset (bug: stack's
`${PLAID_CLIENT_ID:-}` made startup fail without Plaid); optional PLAID_REDIRECT_URI, https,
under APP_ORIGIN+APP_BASE_PATH. (2) Provider.createLinkToken(ref, {accessToken?,
redirectUri?}); update mode omits products. (3) link.reauth.start/complete in
application/ingestion.ts + /api/provider; complete sets ACTIVE, clears errorCode, audits,
enqueues provider.sync. (4) ConnectBank handles reauth and stores {token, mode,
connectionId} in sessionStorage; new page accounts/connections/oauth resumes Link with
receivedRedirectUri. (5) Sign-in-again button on REAUTH connections. (6) Sandbox check only
if credentials exist. Webhooks and durable ImportBatch staging deliberately out of scope
(spec satisfied by in-memory staging + periodic worker sync).
Previous heading: Batch C PLANNED (next)
Plaid update mode for REAUTH_REQUIRED connections, OAuth redirect support, Sandbox
verification via scripts/plaid-check.ts (only if sandbox credentials exist; never print
them), provider health on Connections. Durable fetch staging: decide after reading
docs/PHASE5_INGESTION.md.
Verified: check (177), integration (88), /mynab build, e2e (54), backup (34 tables),
contrast (0), and `npm run plaid:check` against Plaid Sandbox (49 entries, signs correct,
reset_login -> REAUTH_REQUIRED, update-mode link token accepted, item removed).
Not verified: a real OAuth institution round trip (needs PLAID_REDIRECT_URI registered with
Plaid on the public host) and the worker inside Docker on the Linux host.

Owner's requested scope (Phase 3 gaps, Phase 4, Phase 5) is complete and committed.
Next per NEXT_STEPS: Phase 6 reports, Phase 7 import/export, Phase 8 polish, final gate,
then a 0.3.9+ release (needs owner go-ahead; stack adds the worker service).

## Release 0.3.9 — BUILT on host (2026-09-24), not deployed

Owner asked to build 0.3.9 so they can deploy it in Portainer themselves. Commit 1cbe151
bumps package.json/package-lock.json/stack.yml. `npm run release` exited 0: mynab:0.3.9 and mynab-tools:0.3.9
exist on 192.168.1.7 (APP_BASE_PATH=/mynab, user=node). Host disk 84% used. Owner deploys: back up DB, paste whole stack.yml (adds worker +
PLAID_REDIRECT_URI/SYNC_INTERVAL_HOURS), re-pull disabled; 5 new migrations run.
After that: Phase 6 (reports). Owner also asked about how to use the app; guide offered.
Owner decision: build a comprehensive in-app guide as the very LAST step, after Phases
6-8 and the final gate (NEXT_STEPS item 9). Do not write it earlier.

## Phase 6 (reports) — VERIFIED, committed

Design: pure src/domain/reports.ts over active (unvoided) transactions+splits:
consumption = EXPENSE+REFUND (budget accounts by category split; tracking accounts as
off-budget rows); income = INCOME; credits = CREDIT (card statement credits, shown apart);
internal = TRANSFER between two budget accounts (excluded, incl. card payments); financing =
TRANSFER crossing budget/tracking; adjustments = ADJUSTMENT; OPENING only in balances.
Cash-flow components reconcile exactly to on-budget balance change. Savings rate =
(income - consumption)/income, null when income <= 0. Monthly series, net worth and
liability balances at month ends, drilldown rows for category/payee/flow. Comparison =
previous equal-length period or same period last year, computed by the same function.
src/application/reports.ts (authorized read), /reports page + nav, unit/property tests,
integration test, e2e. No migration.
Verified: check (183), integration (89), /mynab build, e2e (56 incl. reports drilldown,
desktop+mobile screenshots inspected), backup (34 tables), contrast (0, /reports included).
Chart colours: blue #2a78d6/#3987e5 income, orange #eb6834/#d95926 spending, validated with
the dataviz validator against both card surfaces.

Next: Phase 7 (CSV mapping/preview/dry-run/idempotency/undo, safe QFX/OFX, versioned
JSON/CSV exports, restore/backup UX). Then Phase 8, final gate, then the in-app guide LAST.

## Phase 7 (import/export) — IN PROGRESS

Owner: "lets do phase 7" (2026-09-24). Spec section 10: files feed the SAME ingestion.
Batch 7A file import (VERIFIED, committed; check 193, integration 94, e2e 58, backup 35,
contrast 0): (1) refactor syncConnection's commit loop into
commitEntries(tx, userId, budgetId, connectionId, {entries, removed}) shared by sync and
files; (2) per-budget FILE connection (provider "FILE"; scheduleDue, syncConnection and the
Connections panels exclude it; its entries still appear in import review); ProviderAccount
per imported account, externalAccountId `account:<id>`, linkedFrom = opening date; refuse
accounts linked to a bank; (3) pure parsers in src/domain/files.ts: RFC 4180 CSV, mapping
(date format, signed/inverted/debit-credit amounts, payee, memo), exact cents, OFX/QFX
STMTTRN extractor (no DTD/entity processing, size/record limits, USD only); CSV identity
sha256(account,date,amount,payee,occurrence), OFX identity FITID; (4) migration: ImportBatch
+ IngestedEntry.batchId; undo only while no batch entry approved/reviewed, voids via
voidTransaction and deletes the batch's identity rows so re-import works; (5) /api/import
(inspect/preview/commit/undo, 2 MB, 5000 rows) + /accounts/import page; tests.
Batch 7B (VERIFIED, committed; check 195, integration 95, e2e 60, backup 35, contrast 0): domain/export.ts (CSV writer, formula escaping for text cells only;
money emitted as typed decimal numbers), application/exports.ts (versioned JSON
format mynab.export v1: every budget table incl. voided history, splits, states,
reconciliations, assignments, targets, debt terms, schedules, rules, preferences, import
batches, connection metadata WITHOUT tokens/cursors; no users/sessions/audit), GET
/api/export (json | csv&table=), /accounts/export page with backup guidance.

OPEN DECISION (asked owner 2026-09-24): production has NO automated backups. scripts/backup.sh
is manual, unencrypted, prints "encrypt before transferring". Spec section 13 wants nightly
pg_dump, 7 daily + 4 weekly retention, encryption (e.g. age) before off-host transfer.
Proposal: a `backup` service in stack.yml (postgres image, nightly loop, host-mounted dir,
retention, optional age encryption with an operator public key). Needs owner choices:
host path, off-host destination, key. Remaining Phase 7 item depends on it.
Next otherwise: Phase 8.

Owner deferred the backup decision ("move to phase 8", 2026-09-24): revisit BEFORE the final
release gate.

## Phase 8 — IN PROGRESS

Plan (owner: "move to phase 8"): 8A in-app "Needs attention" summary on Budget (pure
domain/attention.ts ordering + application/attention.ts counts: unapproved imports, bank
change reviews, reauth/error connections, worker down, overdue schedule occurrences,
overspent categories, negative Ready to Assign, affected reconciliations); 8B forecasts
1/3/6/12 months (schedules, average discretionary spending, loan minimums, goal earmarks;
query-string assumptions, never stored, never assigns); 8C paginated/searchable account
register; 8D category trend + account balance history; 8E axe accessibility audit
(@axe-core/playwright dev dependency) and fixes. Notification channel = in-app (spec left
it open; no email/push infrastructure).
8A: VERIFIED, committed (check 197, integration 96, e2e 60, backup 35, contrast 0).
8B forecasts: VERIFIED, committed (check 202, integration 97, e2e 62, backup 35, contrast 0).
8C register: VERIFIED, committed (50/page, payee/memo search, Map lookups; e2e 64).
8D: VERIFIED, committed (category trend in report drilldown; 12-month balance line on
account pages; shared components/trend-line.tsx).
8E: VERIFIED, committed. tests/e2e/zz-a11y.spec.ts runs axe (WCAG 2.1 A/AA) on every page,
both themes, desktop + mobile, after the other suites fill the ledger: 0 violations. Fixed:
scrollable tables were not keyboard-focusable (now labelled focusable regions).
Phase 8 COMPLETE. Remaining before the guide: (1) owner decision on automated encrypted
backups; (2) final gate per NEXT_STEPS item 8 (spec audit, clean install, dependency audit,
fresh migrations, Linux Docker health incl. worker, new tag); (3) release; then (4) guide.

OWNER DECISION 2026-09-24: "i don't care about backups". Automated backups are declined; do
not raise them again unless the owner does. (scripts/backup.sh remains available.)

## Release 0.3.10 — BUILT on host (2026-09-24), not deployed by agent
Owner asked to build the newest version to deploy themselves. Contains everything since
0.3.9 (Phases 6, 7, 8). Migration added since 0.3.9: 202609250004_import_batches.
npm run release exited 0: mynab:0.3.10 and mynab-tools:0.3.10 on 192.168.1.7
(APP_BASE_PATH=/mynab, user=node, host disk 85%). Owner deploys by pasting the whole
stack.yml with re-pull disabled. Next: final gate, then the in-app guide.

## Final gate + YNAB parity + onboarding research — DONE, see docs/FINAL_GATE.md (2026-09-25)

Owner: "do the final release checks from our initial idea. Do a feature parity check with
youneedabudget. See if features that are the same across the two sites work the same. Look
at how ynab does its tutorial ... and lets look into doing the same for ourselves."
Plan: (1) gate mechanics: clean clone + npm ci, full checks, npm audit, fresh migrations,
live host health (read-only; production 0.3.10 running healthy); (2) requirement-by-
requirement PROJECT_SPEC audit; (3) YNAB behaviour research from its public help centre and
comparison of shared features; (4) YNAB onboarding research -> guide proposal. Findings go
in docs/FINAL_GATE.md; fixes for real mismatches are separate commits.
Gate passed (clean install, audit 0, all suites, production healthy with 19 migrations).
Parity gaps found (owner to choose): auto-assign variants; match with differing amount
(tips); Age of Money; bulk approve; category notes/hide/reorder/flags. Deliberate
differences documented. Guide proposal in docs/FINAL_GATE.md section 5 (build LAST).

## YNAB alignment — IN PROGRESS (owner /goal, 2026-09-25)

Owner: make the four "different on purpose" behaviours work like YNAB, and implement the
top four gaps. Plan and status: docs/YNAB_ALIGNMENT.md (A1-A4, B1-B4). Order: A1+B4, A2+B2,
A3, A4, B1, B3. Each item: tests, docs status update, its own commit.
A1 + B4: VERIFIED, committed (check 202, integration 98, e2e 68, backup 35, contrast 0).
A2 + B2: VERIFIED, committed (check 202, integration 101, e2e 68). Migration 20.
Current: A3 (worker enters scheduled transactions on their date, unapproved) — IN PROGRESS.

## Codex continuation — A3 review (2026-09-24 local clock)

Request: review Claude's Phase 8 and YNAB alignment work, then continue the next item. Recovery found HEAD 293333e with four uncommitted A3 files; treat them as unverified and preserve them. Acceptance for this batch: scheduled entries post once on their due date via worker, remain unapproved until confirmed or matched, can be rejected with audited reversal, UI exposes status/actions, tests and docs record actual results. First step IN PROGRESS: inspect and repair interrupted A3 in `src/application/{finance,jobs,schedules}.ts`, `prisma/migrations`, schedule UI, and focused integration coverage. Avoid editing the already committed alignment migration; use a new migration for new constraints. No production deployment or mutation.

A3 update: IMPLEMENTED and locally VERIFIED. Moved new checks into migration
202609250006_scheduled_entry, added schedule UI confirmation/removal and bank-match
approval, kept older unapproved entries visible. Commands passed: test DB `prisma
migrate deploy`; `npm run check` (202); `npm run test:integration` (104);
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`;
`APP_BASE_PATH=/mynab npm run test:e2e` (70); `PG_BIN=/opt/homebrew/opt/postgresql@17/bin
npm run test:backup` (35 tables). Earlier simultaneous integration/e2e caused a synthetic
owner collision; sequential reruns passed. No production mutation or image build.
Fresh empty DB migration and worker enqueue/claim test passed. Next: commit A3,
then A4 editing/delete/undo. Keep the old committed alignment migration byte-for-byte.

## A4 register editing — IN PROGRESS (after e3fac62)

Request continues YNAB alignment. Acceptance: owner-facing Edit/Delete/Undo on the account register, one visible current version, immutable audited postings retained, explicit confirmation for reconciled history, idempotent authorized commands and integration/browser coverage. First step: inspect current correction and void paths in `src/application/finance.ts`, `src/components/finance-fields.tsx`, and `src/app/(protected)/accounts/[id]/page.tsx`; then design the smallest safe command/UI change. No release or production mutation.

A4 batch 1 IN PROGRESS: implement `transaction.undo` in `src/application/finance.ts` by restoring the prior version through the existing transaction.create validation/journal path, with a narrowly scoped exception for an already-voided deletion; change register labels and hide correction history in `src/app/(protected)/accounts/[id]/page.tsx` and `src/components/finance-fields.tsx`; add integration coverage. Keep prior versions in storage/export. Check linked imports and reconciliations before finalizing.

A4 batch 1 IMPLEMENTED, unverified beyond one focused integration run: `transaction.undo` reconstructs the prior row using the same finance command and journal path; the register shows Edit/Delete/Undo and hides lineage. Focused finance integration passed 42 tests before the reconciliation acknowledgment check and browser test update. New risk to resolve before marking VERIFIED: opening-balance transactions use kind OPENING, which the generic editor/undo cannot reconstruct. Validate and narrow UI or implement a safe opening-balance path. Run full gates sequentially; production untouched.

A4 batch 1 update: ordinary transaction edit/delete/undo implemented; integration 105,
check 202, build and desktop browser 35 passed. `OPENING` is excluded until dedicated
editing is designed. Final reconciliation assertion was added to finance integration and
focused rerun is pending after mobile browser completes. A4 remains PARTIAL. Update
NEXT_STEPS/DEVELOPMENT_LOG with exact final results, then checkpoint and commit a bounded
partial A4 milestone or continue the opening-balance path. No production mutation.

A4 batch 2 IN PROGRESS: implement guarded editing/undo for opening balances in `src/application/finance.ts`, `src/components/finance-fields.tsx`, account register UI, and integration tests. Permit OPENING only when replacing the same account's existing opening transaction (or undoing a prior edit/delete), so no new budgetable opening can be forged. Then rerun gates and update A4 status. Production untouched.

A4 batch 2 VERIFIED: opening-balance Edit/Delete/Undo with a guard against creating
extra OPENING entries. Focused finance integration 43, full integration 106, check 202,
production build, browser 36 desktop + 36 mobile (axe 0), backup/restore 35 tables passed.
No schema change or production mutation. A4 ready to commit after final diff review; B1
Auto-Assign variants is next, then B3 Age of Money and the guide last.

## B1 Auto-Assign variants — IN PROGRESS (after 25ec289)

Request continues YNAB alignment. Acceptance: implement documented variants across every category or one category row, derived from actual historical assignments/spending and current target needs, with exact cents, idempotency and ledger conservation; add tests and UI. First step: inspect `target.fund` and Budget assignment controls, record a pure calculation contract before editing code. Preserve A4 and current visual design. No release or production mutation.

B1 research step VERIFIED (read-only): existing `target.fund` in finance.ts plans
underfunded targets from `projectBudget`, while the Budget page offers only that bulk
action and per-row manual assignment. Next executable B1 step is a pure domain helper for
history and reset variants; no B1 app code edited. A3/A4 are committed, HEAD 25ec289 before
this handoff-doc commit, but not deployed. Do not infer Portainer version from HEAD.

## Release image build request — IN PROGRESS (2026-09-25)

Owner explicitly requested new Docker images for the Linux/Portainer host. Acceptance: assign a new immutable version after 0.3.10, update package/lockfile and the full Portainer stack image references, keep docs honest about which features are included, run local release gates appropriate to these release-only edits, commit the reviewable release tree, then run `npm run release` to build `mynab` and `mynab-tools` on 192.168.1.7. Do not deploy, update Portainer, or mutate production data. First batch IN PROGRESS: inspect version references and host capacity, then edit package version, stack tags, release notes and deployment docs. Preserve all credentials.

Release 0.3.11 batch 1 IMPLEMENTED: package/lockfile version, four stack image references,
root README, Portainer guide, PROJECT_SPEC, NEXT_STEPS and DEVELOPMENT_LOG updated.
Host read-only check: 76 GB free; running app/worker/db healthy on 0.3.10. Next: run
release-only local validation, commit reviewable tree, `npm run release` on Linux host,
inspect both resulting tags. No Portainer update or production mutation.

Release 0.3.11 batch 1 VERIFIED locally: `npm run check` passed (202 unit/property),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build` passed,
`git diff --check` passed. Only version, stack and documentation changed since the
A3/A4 full gates recorded above; no new application behavior. Next: commit release tree,
then build both tags remotely with capped builder. Production still 0.3.10.

Release 0.3.11 image build VERIFIED: `npm run release` exited 0 from commit
e86648b414f2303f0a588565763eca08fd6f8aa2. On 192.168.1.7 it built
mynab:0.3.11 (f9d87b5e64ca, 287 MB) and mynab-tools:0.3.11 (557f89139c67,
1.46 GB). Runner has APP_BASE_PATH=/mynab and user=node. Host has 72 GB free after
build; old 0.3.10 images remain. Running stack was not touched. Next batch IN PROGRESS:
read-only verify both image configurations and live container tags, then update
NEXT_STEPS/DEVELOPMENT_LOG/PROJECT_SPEC with actual build evidence and commit docs.

Release 0.3.11 final host verification VERIFIED: read-only SSH confirmed SOURCE_COMMIT
matches e86648b414f2303f0a588565763eca08fd6f8aa2, both image tags are amd64,
user=node, APP_BASE_PATH=/mynab; running app/worker remain healthy on 0.3.10. Docs
updated with actual results. Next: commit documentation, then user may paste the full
0.3.11 stack into Portainer with re-pull disabled. No production migration/deployment yet.

## YNAB feature parity continuation — IN PROGRESS (2026-09-25)

Owner requests sustained work toward full YNAB experience and asks whether debt payoff
simulation exists. Read-only review confirms MyNAB has `simulatePayoff` and a Debt page with
strategy comparison, effective-dated rates/minimums and payoff/interest outputs. YNAB also
has a loan payoff simulator; do not claim simulation as absent or uniquely MyNAB.
Acceptance for the current batch: implement B1 Auto-Assign history/reset variants with exact
cents, explicit preview, authorized idempotent application, domain/integration/UI coverage;
then B3 Age of Money and the remaining parity audit. First step IN PROGRESS: add a pure
Auto-Assign planner in `src/domain/auto-assign.ts` and focused unit tests. Next wire
`src/application/finance.ts` and Budget UI. Keep production untouched; preserve 0.3.11 tags
until a new release is built and verified. Current worktree recovered clean at ec79b81.

B1 domain batch VERIFIED: `src/domain/auto-assign.ts` provides a pure, non-mutating
preview for seven history/reset modes, with projection-derived before/after Ready to Assign
and exact-cent deltas; `tests/unit/auto-assign.test.ts` covers 13 cases. Command
`PATH="$HOME/.local/share/mynab-toolchain/node-v24.21.0-darwin-arm64/bin:$PATH" npm test -- tests/unit/auto-assign.test.ts`
passed (13 tests). Next batch IN PROGRESS: wire `src/application/finance.ts` and
`src/app/(protected)/budget/page.tsx` (and a small client preview control if needed),
add integration/browser coverage. This domain batch has not yet run full check.

B1 application/UI batch IMPLEMENTED: authorized `getAutoAssignPreview`, stale-preview
fingerprint, idempotent `auto.assign` command, and a Budget-page GET preview with per-row
entry points. Focused integration command
`PATH="$HOME/.local/share/mynab-toolchain/node-v24.21.0-darwin-arm64/bin:$PATH" npm run test:integration -- tests/integration/finance.test.ts`
passed (45); `npm run check` passed (215 unit) before the last base-path/invalid-category
UI fix. Next: run full check/build/browser gates, examine semantics and update docs.

B1 VERIFIED locally, unreleased: `npm run check` passed (216 unit/property),
`npm run test:integration` passed (108),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build` passed,
`APP_BASE_PATH=/mynab npm run test:e2e` passed (74 desktop/mobile, axe 0), and
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` passed (35 tables).
All commands used pinned Node 24 PATH. No production mutation or new image build.
Next step PLANNED: B3 Age of Money, then a broader parity inventory because owner
expanded scope to full user-visible YNAB parity (including prior deliberate limits).

B1 committed as `15857e8` after local verification. B3 batch IN PROGRESS: implement
FIFO cash-lot age in `src/domain/age-of-money.ts` with pure tests, then expose through
`src/application/finance.ts`, Budget and Reports UI with integration/browser coverage.
YNAB's current support guide defines the last ten cash outflow transactions, including
card payments; starting balances/transfers are not outflow samples. Resolve inflow
lot and rounding details transparently in the spec. No production mutation.

B3 domain/application/UI batch IMPLEMENTED: `src/domain/age-of-money.ts` computes
FIFO cash-lot age across budget cash accounts, counts cash expenses and card payments,
excludes internal cash transfers and card purchases until payment. `getFinance` and
`getReports` expose the same reading on Budget and Reports. `npm run check` passed
(221 unit/property); focused finance integration passed (46), including a ten-outflow
card payment scenario. Next: browser coverage, full gates and docs; algorithm parity
details remain to be documented. No image build or production mutation.

B3 VERIFIED locally, unreleased: `npm run check` passed (221 unit/property),
`npm run test:integration` passed (109),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build` passed,
`APP_BASE_PATH=/mynab npm run test:e2e` passed (76 desktop/mobile, axe 0),
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` passed (35 tables).
All used pinned Node 24. No image build or production mutation. Next: broader
YNAB parity inventory and debt payoff-date solver gap; document the exact
source/behavior comparison before code.

Debt simulator parity batch IN PROGRESS: YNAB's official loan planner also lets
the owner choose a payoff date and computes the monthly payment (source in
`docs/YNAB_PARITY.md` forthcoming). MyNAB currently shows payoff date for a
monthly amount and tests lump sums, but has no inverse payoff-date solver.
Add a pure solver to `src/domain/debt.ts`, expose a payoff-month control on
`src/app/(protected)/debt/page.tsx` via `src/application/finance-page.ts`, and
cover exact-cent/interest/promotional-rate behavior in tests. No ledger write.

Debt payoff-date solver IMPLEMENTED: `monthlyBudgetForPayoffDate` binary-searches
the least whole-cent monthly budget that pays every debt by the requested month,
using existing dated APR/minimum/lump-sum simulation. Debt page has an optional
payoff-month field and a read-only estimate. Focused domain unit (22) and
desktop browser scenario passed. An initial browser test used the wrong existing
account-type label (`Loan` vs `Installment loan`); corrected test passed. Full
gates and final docs remain. No image build or production mutation.

Combined B3 + debt solver VERIFIED locally: `npm run check` passed (224
unit/property), `npm run test:integration` passed (109),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build` passed,
`APP_BASE_PATH=/mynab npm run test:e2e` passed (78 desktop/mobile, axe 0),
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` passed (35
tables). `docs/YNAB_PARITY.md` now records the broader feature inventory and
source links. Next executable work: commit this milestone, then implement
current-month target snooze. No Docker build or production mutation.

B3 and payoff-date simulator committed as `d7f04aa`. Target snooze batch
IN PROGRESS: add a budget/category/month scoped record via a new migration and
Prisma model, authorized `target.snooze` command, derived underfunded exclusion
while preserving target progress, and Goal/Budget page controls. Only the
current budget month may be snoozed, and card payment targets remain ineligible.
First step: inspect current target storage/summary flows before editing schema.

Target snooze IMPLEMENTED: migration `202609250007_target_snooze` and Prisma model
with composite budget/category FK; readiness list updated. Authorized
`target.snooze` toggles only current-month non-card targets, `getFinance`
retains underlying progress but excludes snoozed contribution, and
`target.fund` skips it. Goals/ Budget pages show snoozed state and Goals offers
Snooze/Resume. Test DB `node --env-file=.env.test node_modules/prisma/build/index.js migrate deploy`
passed (22 migrations). `npm run check` passed (224), focused finance integration
passed (47), `/mynab` build passed, targeted desktop browser workflow passed
(4 tests). Full integration/browser/backup gates and docs still pending.

Target snooze VERIFIED locally, unreleased: `npm run check` passed (224),
`npm run test:integration` passed (110),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build` passed,
`APP_BASE_PATH=/mynab npm run test:e2e` passed (78 desktop/mobile, axe 0),
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` passed (36
tables). Upgraded test DB and fresh temporary DB both accepted all 22 migrations;
fresh DB has the target ownership FK. Docs updated; next: commit the milestone,
then category organization per `docs/YNAB_PARITY.md`. No image build or
production migration.

Target snooze committed as `320c80a`. Category organization batch IN PROGRESS:
add category notes, a separate hidden state that retains funds and
history, and stable manual ordering. Expected files: `prisma/schema.prisma`,
new migration, `src/application/finance.ts`, Budget page, integration/browser
tests, readiness list, docs. First step: inspect current category/group create,
update and load order; then migrate non-destructively. Do not conflate hidden
with archived. Expose any funds in hidden categories as an aggregate so owners
do not lose sight of them. No production mutation.

Category organization VERIFIED locally, unreleased: migration 23 adds category
notes and group/category hidden and sort fields. Reordering and hiding are
authorized and audited; hidden money stays in the budget and is summarized.
`npm run check` passed (224), `npm run test:integration` passed (111),
`APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build` passed,
`APP_BASE_PATH=/mynab npm run test:e2e` passed (80 desktop/mobile, axe 0),
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` passed (36
tables), all with pinned Node 24. The upgraded test DB accepted migration 23;
fresh DB and Docker checks remain pending. An initial mobile browser test had a
Playwright nested-disclosure click hit-testing failure; direct mobile touch
passed. Next: commit this batch, then implement saved focused views and
continue parity audit. Production remains on 0.3.10; 0.3.11 images are built
but contain none of the post-release parity additions.

Focused Views batch IN PROGRESS (2026-09-25): implement YNAB-like preset
Underfunded, Overfunded, Snoozed, Overspent, Money Available views plus up to
12 budget-scoped custom category sets, edit/delete/reorder, and budget-only
filtering without changing balances or reports. Hidden categories stay out of
all views. The selected view should persist per browser; bulk Underfunded must
honor the selected view. First step: add persistence and pure filtering helper,
then command/query/UI and integration/browser coverage. Expected files:
`prisma/schema.prisma`, migration 24, `src/domain/focused-views.ts`,
`src/application/finance.ts`, Budget page, a small client selector,
`src/components/finance-form.tsx`, tests, readiness and continuity docs.
Current HEAD d1e983c is clean; no production mutation or image build.

Focused Views: Claude resumed (2026-09-25) after Codex cutoff. Recovery shows schema,
migration 202609250009_focused_views, `src/domain/focused-views.ts` + unit test,
`view.save/delete/reorder` and view-scoped `target.fund` in `src/application/finance.ts`,
Budget page tabs/manage panel and `src/components/focused-view-tabs.tsx` all written but
UNVERIFIED (no test run recorded). Step IN PROGRESS: review for correctness, wire the bulk
Underfunded button to the selected view, add integration/browser coverage, run gates.

Focused Views VERIFIED locally, unreleased (Claude, 2026-09-25). Review fixes: reverted an
unrequested global `target.fund` change (it funded overspending on every call, disagreeing
with the "Targets need" amount); the bulk button now passes the selected view and shows the
view's own need; e2e reset list now truncates FocusedView/FocusedViewCategory. Added
integration test (save/rename/duplicate refusal/reorder/view-scoped fund/hidden/delete) and
desktop+mobile browser test. Commands (pinned Node 24): `npm run check` passed (226),
`npm run test:integration` passed (112), `APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build`
passed, `APP_BASE_PATH=/mynab npm run test:e2e` passed (82, axe 0),
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` passed (38 tables).
Fresh temp DB accepted 24 migrations; 44 two-column FKs incl. both FocusedViewCategory FKs.
No image build or production mutation.
Next PLANNED: Money Moves / recent-moves explainability UI per `docs/YNAB_PARITY.md`.

## Money Moves — IN PROGRESS (Claude, 2026-09-25, after a46e5a0)

Owner /goal: continue until full YNAB parity; Codex alternates on the same goal. Acceptance:
month-scoped list of plan money moves (assign from/to Ready to Assign, category-to-category
moves, Auto-Assign and target-fund batches grouped as one move) with when/who/source/
destination, filter to one category, no ledger change. Plan: migration 25 adds nullable
`origin` and `actorId` to BudgetAssignment (history inferred: moveId → MOVE, else ASSIGN);
batch commands share a moveId; pure `src/domain/money-moves.ts` grouping + unit tests;
`getFinance` exposes moves; Budget page panel with `?moves=<categoryId>` filter; integration +
browser coverage. Step IN PROGRESS: schema/migration + domain helper.

Money Moves VERIFIED locally, unreleased: migration `202609250010_money_moves` (origin +
actorId on BudgetAssignment, SET NULL actor FK, origin CHECK), `src/domain/money-moves.ts`
+ unit test, assign/move/auto.assign/target.fund tag origin/actor and share a batch moveId,
`getFinance().moves`, Budget "Money moves" panel with `?moves=<categoryId>`. Commands (pinned
Node 24): `npm run check` passed (228), `npm run test:integration` passed (113), `/mynab`
build passed, `APP_BASE_PATH=/mynab npm run test:e2e` passed (84, axe 0),
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` passed (38 tables).
Next PLANNED: Hide Amounts / privacy, then reports parity, Fresh Start, multiple plans.

## Hide Amounts — IN PROGRESS (Claude, 2026-09-25, after 76d37fb)
Acceptance: a per-device toggle in the app shell masks every money figure (blur, with
screen-reader text preserved), persists across reloads, no server state. Step IN PROGRESS:
find theme toggle + amount markup; expected files: layout/shell component, globals.css,
a small client toggle, e2e test.
Hide Amounts VERIFIED locally, unreleased: `src/components/amount.tsx` (Amount/MaybeAmount),
money JSX across pages wrapped, `src/components/hide-amounts-toggle.tsx` in the app header,
`mynab-hide-amounts` cookie → `<html data-hide-amounts>`, blur rule in globals.css utilities
layer. `npm run check` passed (228), `/mynab` build passed, `APP_BASE_PATH=/mynab npm run
test:e2e` passed (86, axe 0), backup passed (38 tables). New money JSX must use <Amount>.
Next PLANNED: reports parity (Spending Breakdown filters), then Fresh Start, multiple plans.

## Reports parity — IN PROGRESS (Claude, 2026-09-25, after 8cbcd64)
Acceptance (YNAB Reflect): (1) account and category multi-select filters applied to every
flow report (category filter narrows spending lines only; net worth/balances narrow by
account); (2) spending by category group with drill to categories; (3) Income v Expense
table: income by payee, expenses by group/category, one column per month plus total and
monthly average. Pure functions in `src/domain/reports.ts` with unit tests first, then
`src/application/reports.ts`, `src/app/(protected)/reports/page.tsx`, integration/e2e.
Step IN PROGRESS: domain filter + byGroup + incomeExpense.
Reports parity VERIFIED locally, unreleased: `ReportFilter`/`filtered`, `byGroup`,
`incomeExpense` in `src/domain/reports.ts` (+ `tests/unit/reports-reflect.test.ts`);
`getReports` accepts `accounts[]`/`categories[]`; Reports page filter disclosures, Spending
by group (links narrow to the group's categories), Income v Expense table (focusable scroll
region for axe). `npm run check` passed (232), `npm run test:integration` passed (114),
`/mynab` build passed, `APP_BASE_PATH=/mynab npm run test:e2e` passed (86, axe 0), backup
passed (38 tables). Next PLANNED: Fresh Start (reversible plan reset), then multiple plans.

## Multiple plans — IN PROGRESS (Claude, 2026-09-25, after c02957d)
Acceptance: create, rename and switch between plans (YNAB "plans"); active plan kept in a
`mynab-plan` cookie validated against membership (falls back to the oldest plan); every page
and API route that used `listBudgets(...)[0]` uses the active plan; Plans page + sidebar
indicator; audit via FINANCE_COMMAND details. No schema change needed. Files:
`src/application/plans.ts`, `src/app/api/plans/route.ts`, `src/app/(protected)/plans/page.tsx`,
layout, finance-page.ts, forecast page, export/import/provider routes, tests.
Then Fresh Start builds on this. Step IN PROGRESS: plans.ts + route + replacements.
Multiple plans VERIFIED locally, unreleased: `src/application/plans.ts` (activeBudget,
createPlan, renamePlan, selectPlan), `src/app/api/plans/route.ts` (origin-checked form POST,
sets httpOnly `mynab-plan`), `/plans` page, sidebar + mobile "Switch plan" link,
`openBudget()` in finance-page.ts replaces every `listBudgets()[0]`. Tests/scripts that used
unordered `budget.findFirstOrThrow()` now order by createdAt (a second plan broke one e2e).
`npm run check` passed (232), `npm run test:integration` passed (115), `/mynab` build
passed, `APP_BASE_PATH=/mynab npm run test:e2e` passed (88, axe 0 incl. /plans), backup passed.
Next PLANNED: Fresh Start (new plan copying groups/categories/targets and accounts at current
balances; old plan kept and renamed "(Archived …)"; provider links stay with old plan).

## Fresh Start — IN PROGRESS (Claude, 2026-09-25, after 3105811)
Acceptance (YNAB Fresh Start): new plan with the same open accounts (current balance as an
opening balance dated today), groups/categories (notes, hidden, order), targets and debt
terms (in-force + future versions from this month), active schedules (+ consumed
occurrences from today skipped, so nothing posts twice), focused views; old plan untouched
until the end, then renamed "<name> (Archived YYYY-MM-DD)"; new plan takes the name and
opens. Built by replaying finance commands (journal-correct); items that cannot carry over
are recorded as warnings in the audit event and shown on /plans. Linked-bank connections stay
with the old plan. Files: `src/application/fresh-start.ts`, plans route/page, tests.
Fresh Start VERIFIED locally, unreleased: `src/application/fresh-start.ts`; `/api/plans`
intent `fresh-start` (requires confirm checkbox) opens the new plan and shows warnings from
the `plan.fresh-start` audit event on `/plans?fresh=done`. Automation rules are NOT copied.
`npm run check` passed (232), `npm run test:integration` passed (116), `/mynab` build passed,
`APP_BASE_PATH=/mynab npm run test:e2e` passed (90, axe 0), backup passed (38 tables).
Next PLANNED: remaining parity items in docs/YNAB_PARITY.md (targets colors/cadence review,
household sharing, mobile quick entry, onboarding guide).

## Register parity — IN PROGRESS (Claude, 2026-09-25, after 7115887)
Acceptance: YNAB-style colour flags (red/orange/yellow/green/blue/purple) on transactions,
carried across edits, with renameable flag names per plan; an all-accounts register
(`/accounts/register`) with account/category/flag/cleared/date/text filters and paging; bulk
flag and bulk categorize (single-category expense/refund only; reconciled rows skipped and
reported). Migration 26 adds `TransactionPreference.flag` + `FlagName`. Step IN PROGRESS:
migration + `transaction.flag`/`flag.rename` commands.
Register parity VERIFIED locally, unreleased: migration `202609250011_transaction_flags`
(TransactionPreference.flag + FlagName), `src/domain/flags.ts`, `transaction.flag` and
`flag.rename` commands, flags carried in edits and ingestion replacements, `load()` exposes
`flags`/`flagNames`; `src/application/register.ts` bulk categorize (derived per-row keys; the
finance API route dispatches `transaction.categorize`); `/accounts/register` page +
`src/components/register-bulk.tsx`; per-row flag in account register. `npm run check`
passed (232), `npm run test:integration` passed (117), `/mynab` build passed,
`APP_BASE_PATH=/mynab npm run test:e2e` passed (92, axe 0), backup passed.
Next PLANNED: household sharing (members/roles) or onboarding guide; see docs/YNAB_PARITY.md.

## Household sharing — IN PROGRESS (Claude, 2026-09-25, after 48dd4a3)
Acceptance (YNAB Together): installation owner adds people (own username/passphrase, own
personal plan; max 6 people) and can reset their passphrase; a plan owner shares/unshares a
plan with a person (role "member": full budgeting; rename/share/Fresh Start stay owner-only);
anyone changes their own passphrase (signs out their sessions). Migration 27 adds AuditAction
values USER_CREATED, MEMBERSHIP_CHANGED, PASSWORD_CHANGED. Files: `src/application/household.ts`,
`src/app/api/household/route.ts`, `src/app/(protected)/household/page.tsx`, tests.
Household sharing VERIFIED locally, unreleased: migrations `202609250012_household` (audit
enum values) and `202609250013_member_role` (foundation CHECK allowed only 'owner'; now
owner|member); `src/application/household.ts`, `/api/household`, `/household` page, Plans
page link. e2e owner lookups now filter username "owner". `npm run check` passed (232),
`npm run test:integration` passed (120), `/mynab` build passed,
`APP_BASE_PATH=/mynab npm run test:e2e` passed (94, axe 0), backup passed.
Next PLANNED: onboarding guide (Setup and learning), then pinned categories/home priorities.

## Setup and learning — IN PROGRESS (Claude, 2026-09-25, after a3d803f)
Per docs/FINAL_GATE.md §5: (1) Budget-page getting-started checklist derived from the ledger
(categories, accounts, first transaction, target, Ready to Assign at zero), dismissible by
cookie; (2) `/guide` page in MyNAB's own words (principles, routine, task topics); (3)
"What is this?" links from key concepts. Files: `src/domain/setup.ts` (+unit test),
`src/app/(protected)/guide/page.tsx`, budget page, layout link, e2e/a11y.
Setup and learning VERIFIED locally, unreleased: `src/domain/setup.ts` (+unit test),
`src/components/dismiss-setup.tsx` (cookie `mynab-setup-hidden=<budgetId>`), Budget-page
checklist and RTA help link, `/guide` page, sidebar Household/Guide links. `npm run check`
passed (235), `/mynab` build passed, `APP_BASE_PATH=/mynab npm run test:e2e` passed (96,
axe 0), backup passed. Integration unaffected (no server changes beyond pages).
Next PLANNED: re-audit docs/YNAB_PARITY.md partial rows (targets, debt loan pairing, mobile
quick entry, currency) and pick the next concrete gap.

## Quick add (mobile entry) — IN PROGRESS (Claude, 2026-09-25, after 6a57ef9)
Acceptance: `/add` page for fast entry (account, outflow/inflow, amount, payee with
suggestions, category pre-filled from payee memory via `suggestCategory`, date defaults to
today, memo, cleared) posting ordinary `transaction.create`; form clears after save; linked
from Budget/Accounts and the mobile header. Files: `src/components/quick-add.tsx`,
`src/app/(protected)/add/page.tsx`, `finance-form.tsx` (onSaved), e2e.
Quick add VERIFIED locally, unreleased: `src/components/quick-add.tsx`, `/add` page (payee
memory via `suggestCategory`), header + link, `FinanceForm` `onSaved`. The e2e test sits at
the END of finance.spec.ts because it changes Checking's balance (serial ledger chain).
`npm run check` passed (235), `/mynab` build passed, `APP_BASE_PATH=/mynab npm run test:e2e`
passed (98, axe 0), backup passed.
Next PLANNED: installable web-app manifest; then loan accounts parity review.
Installable web app VERIFIED locally, unreleased: `src/app/manifest.ts`, `src/app/icon.tsx`
(192/512 via next/og), `src/app/apple-icon.tsx`; foundation e2e checks manifest + icons.
`npm run check` passed (235), `/mynab` build passed, e2e passed (100, axe 0), backup passed.
Next PLANNED: loan accounts parity review (YNAB loans are budget accounts with payment
categories; MyNAB forces tracking) — assess before changing accounting.

## Budget conveniences — IN PROGRESS (Claude, 2026-09-25, after 7d80514)
Acceptance: (1) `move.undo {moveId}` appends reversing assignment rows (origin UNDO,
`undoOf` = original group key), validated like assign (future-rollover rule), refused twice;
Money moves shows Undo buttons and marks undone moves; (2) Budget activity figure links to
`/accounts/register?category=…&from=…&through=…`; (3) overspent rows get a Cover control
(move from a chosen category). Migration 28 extends BudgetAssignment origin CHECK and adds
`undoOf`. Files: migration, schema, finance.ts, money-moves.ts (+test), budget page, tests.
Budget conveniences VERIFIED locally, unreleased: migration `202609250014_undo_moves`
(`undoOf`, origin UNDO, paired CHECK), `move.undo` shares the assign/move branch (same
future-rollover validation), money-moves domain `undone`/`undoOf`, Budget activity links,
Cover control, Undo buttons. `npm run check` passed (236), `npm run test:integration`
passed (121), `/mynab` build passed, e2e passed (102, axe 0), backup passed.
Next PLANNED: payee management (rename/combine payees) page.

## Payee management — IN PROGRESS (Claude, 2026-09-25, after ac646fb)
Acceptance: `/accounts/payees` lists payees (case-insensitive) with count, last used and
remembered category; rename/combine selected payees into one name via journaled per-row
edits (reconciled rows skipped and counted; idempotent retry), optionally saving EXACT
rename rules for future imports. Files: `src/application/register.ts` (renamePayees),
finance API dispatch, page, tests.
Payee management VERIFIED locally, unreleased: `renamePayees` in `src/application/register.ts`
(finance API dispatches `payee.rename`), `/accounts/payees` page, Accounts link, FinanceForm
collects `from[]`/`rule`. `npm run check` passed (236), `npm run test:integration` passed
(122), `/mynab` build passed, e2e passed (104, axe 0), backup passed.
Next PLANNED: re-audit remaining YNAB gaps (plan currency/date format settings; target
cadence review; loan planner per-account extra payment view).

## Loan Planner per account — IN PROGRESS (Claude, 2026-09-25, after 78ddd61)
Acceptance (YNAB Loan Planner): on a debt account's page with terms, a GET form (extra
monthly, one-time amount + month) shows payoff month at minimums vs with the scenario,
months saved and interest saved, from `simulatePayoff` on that single debt using the same
versioned terms as the Debt page. No ledger write. Files: `src/application/finance-page.ts`
(`loanPlan`), `src/app/(protected)/accounts/[id]/page.tsx`, e2e.
Loan Planner VERIFIED locally, unreleased: `loanPlan()` in finance-page.ts (reuses
`debtPage` debts), section on `/accounts/[id]` for debts with terms. `npm run check` passed
(236), `/mynab` build passed, e2e passed (106, axe 0), backup passed.
Next PLANNED: plan settings (date/number format) assessment; targets due-day review.

## Category inspector — IN PROGRESS (Claude, 2026-09-25, after e3fb917)
Acceptance (YNAB inspector): clicking a category name opens `?inspect=<id>` panel at the top
of the Budget right column: available, left over from last month, assigned, cash spending,
credit spending, target summary, note, recent transactions this month, and links (moves,
register, Auto-Assign, Goals). Read-only; no schema change. Files: budget page, e2e.
Category inspector VERIFIED locally, unreleased (Budget `?inspect=<id>`; category names link
to it). Also fixed: Payees page unmounted its form when a search emptied the list, hiding
the rename result (flaky e2e) — form now stays mounted. `npm run check` passed (236),
`/mynab` build passed, e2e passed (108, axe 0), backup passed.
Next PLANNED: final parity sweep of docs/YNAB_PARITY.md; decide currency/date settings.

## Twice-a-month schedules — IN PROGRESS (Claude, 2026-09-25, after 8542ba8)
YNAB semantics (support.ynab.com scheduled-transactions guide): chosen day D and D+15 each
month (capped at month end). Add cadence TWICE_MONTHLY to domain occurrences, zod enums,
any DB CHECK, schedule UI options, unit tests.
Twice-a-month schedules VERIFIED locally, unreleased: migration
`202609250015_twice_monthly` (cadence VARCHAR(16), CHECK adds TWICE_MONTHLY), domain
occurrences (D and D+15, capped at month end, interval = months between pairs), zod enum,
schedule form option and labels. `npm run check` passed (237), `npm run test:integration`
passed (123), `/mynab` build passed, e2e: one run had a single mobile failure in "downloads
a complete export" (390ms, no artifacts); immediate full rerun passed (108, axe 0) — treat
that export test as possibly flaky. Backup passed after the green run.

## Target due day — IN PROGRESS (Claude, 2026-09-25, after b842986)
Optional `dueDay` (1–31, capped at month end; MONTHLY/PERIODIC only) on CategoryTarget via
migration 30; target.set accepts it; Goals form input and display; inspector shows "due on
the Nth"; Fresh Start copies it. No change to funding math.
Target due day VERIFIED locally, unreleased: migration `202609250016_target_due_day`,
`target.set.targetDueDay`, Goals form/display, inspector, Fresh Start copy. `npm run check`
passed (237), `npm run test:integration` passed (124), `/mynab` build passed, e2e passed
(108, axe 0), backup passed.
Remaining gaps (see docs/YNAB_PARITY.md): plan currency/date formatting (USD-only by design
so far), native app/widgets/offline entry, real-bank verification by the owner.

## Plan date format — IN PROGRESS (Claude, 2026-09-25, after 33bea2b)
YNAB plan settings: per-plan date format. Migration 31 adds Budget.dateFormat ('ISO' default
| 'US' | 'EU'); `formatDate` in src/domain/dates.ts (+unit test); plan settings form on
/plans (owner, `/api/plans` intent `settings`); display sites in registers, schedules, rules,
connections, import, debt, inspector use it. Currency stays USD (founding constraint).
Plan date format VERIFIED locally, unreleased: migration `202609250017_date_format`,
`formatDate`/`DATE_FORMATS` in src/domain/dates.ts (+unit test), `updatePlanSettings`,
`/api/plans` intent `settings`, Plan settings on /plans, display sites updated; listBudgets
selects dateFormat. `npm run check` passed (238), `npm run test:integration` passed (124),
`/mynab` build passed, e2e passed (110, axe 0), backup passed.

## Offline quick-add outbox — IN PROGRESS (Claude, 2026-09-25, after 82a15af)
FinanceForm `queueOffline` prop: on a network failure (fetch TypeError) store
{budgetId,key,command} in localStorage `mynab-outbox` and say so; `OutboxSync` in the
protected layout drains it on load and on `online` (same idempotency key, so no duplicates),
drops permanent 4xx failures with a visible notice. QuickAdd opts in. e2e simulates offline.
Offline outbox VERIFIED locally, unreleased: `src/components/outbox.ts`,
`src/components/outbox-sync.tsx` (above page content in protected layout), FinanceForm
`queueOffline` (QuickAdd opts in). e2e uses context.setOffline. `npm run check` passed (238),
`/mynab` build passed, e2e passed (112, axe 0), backup passed.
Sidebar role label fixed (members showed "Owner"). `npm run check` passed (238), `/mynab`
build passed, e2e passed (112, axe 0).

## Release 0.3.12 — IN PROGRESS (Claude, 2026-09-25, owner asked "build and deploy")
Plan: bump package/lockfile + all four stack image tags to 0.3.12, update release docs,
commit, `npm run release` on 192.168.1.7, verify tags read-only, take a pg_dump backup of
the live DB on the host (read-only), then owner pastes the whole deploy/portainer/stack.yml
into Portainer (re-pull disabled) — there is no Portainer API access from here. 13 new
migrations (202609250005..17 range beyond 0.3.11) apply via the stack's migrate service.
Release 0.3.12 BUILT and REHEARSED (not deployed): images aa6f0f8ed561 / 1c29bacfc73f from
57fd4d4; live backup `/home/plex/mynab/backups/mynab-pre-0.3.12-20260925T213745Z.dump`;
migration rehearsal on a restored copy passed (32 migrations, 44 FKs, 382 transactions).
Production still 0.3.11. NEXT: owner pastes the whole deploy/portainer/stack.yml into
Portainer (re-pull OFF); then verify migrate Exited(0), app/worker healthy, ready 200.

## Owner fixes — IN PROGRESS (Claude, 2026-09-25, after 218fb6b)
(1) Hidden getting-started checklist cannot be restored: add "Show getting-started
checklist" (clears `mynab-setup-hidden`) on the Budget page when hidden and incomplete, and
on /guide. (2) Accounts page header buttons (Schedules/All accounts/Payees/Rules/Import/
Your data) are cramped and misaligned: replace with one consistent, wrapping toolbar below
the heading. Files: dismiss-setup.tsx, budget page, guide page, accounts page.
Owner fixes VERIFIED locally: `ShowSetup` (clears `mynab-setup-hidden`) on Budget (when
hidden and incomplete) and /guide; Accounts tools are one wrapping nav row of uniform
icon links (`.account-tools`). `npm run check` passed (238), `/mynab` build passed, e2e
passed (112, axe 0), screenshot/contrast run passed, backup passed.
Release 0.3.13 BUILT (not deployed): mynab:0.3.13 645fd2757be4, mynab-tools:0.3.13
e005098d71b6 from 83a6206; no new migrations. Read-only check: owner has DEPLOYED 0.3.12
(app/worker healthy, migrate Exited 0); live DB has all 32 migrations finished, none pending
or failed (latest 202609250017_date_format). Next: owner pastes stack.yml for 0.3.13.

## Bank relink investigation — IN PROGRESS (Claude, 2026-09-25)
Owner: PNC sign-in in Plaid Link fails after 0.3.12/13 deploy. Console errors are from
login.pnc.com (their assets returning text/html, their CSP). Checking MyNAB side read-only:
app logs, provider route, OAuth redirect config. No production mutation.
Findings (read-only): app runs 0.3.13; PLAID_ENV=production, client/secret set, but
PLAID_REDIRECT_URI is EMPTY, so OAuth banks (PNC) use Plaid's pop-up fallback. No
ProviderConnection rows exist in any plan (plans: "Dev Demo Data", "My Official Plan"
created 21:44Z), so this is a fresh link, not a re-sign-in. Console errors are PNC's own
login page assets returning text/html (PNC side). Recommended to owner: register
https://plexmanager.duckdns.org/mynab/accounts/connections/oauth in Plaid dashboard
Allowed redirect URIs, set PLAID_REDIRECT_URI to it in the Portainer stack environment,
update stack (re-pull off), retry. No code change made.
Follow-up: owner reports PNC login + 2FA succeed, then white screen at
login.pnc.com/obp/login/status (pop-up). Read-only checks: MyNAB security headers unchanged
since ca335bb (no COOP; CSP scoped for Plaid), no app errors, no provider exchange reached
MyNAB. PNC's status page requests hashed bundles that return text/html (missing files),
consistent with a stale cached PNC page or PNC-side issue. Advised: clear pnc.com site
data / private window, and set PLAID_REDIRECT_URI so OAuth runs same-tab. No code change.

## Close/delete accounts like YNAB — IN PROGRESS (Claude, 2026-09-25)
Owner: undone PNC import left "PNC Import" (My Official Plan) at $0 with 227 voided rows,
0 reconciliations; close refused ("Reconcile the zero balance"). YNAB (support article
"How to Close or Delete Bank Accounts"): Close whenever there is history — a nonzero balance
is zeroed by an adjustment after a warning; Delete when there is no history beyond the
starting balance. Plan: drop cleared/reconciled requirements from close; `zeroBalance`
confirmation creates a closing ADJUSTMENT; new `account.delete` (migration adds
FinancialAccount.deletedAt; voids opening; archives payment category; blocked by live
non-opening transactions, transfers, schedules, rules or bank links); deleted accounts
leave load(). Keep pending-bank-entry and future-payment-assignment checks.
Close/delete VERIFIED locally, unreleased: migration `202609250018_account_delete`
(deletedAt + CHECK deleted→closed); account.update drops cleared/reconciled requirements,
`zeroBalance` confirms a dated-today "Closing adjustment"; `account.delete` (only OPENING
history; blocked by bank links, schedules, rules, future payment assignments) voids the
opening and hides the account (load() and loadReportInput filter deletedAt). UI: close
confirmation + Delete when eligible. check 238, integration 125, build, e2e 114 (axe 0),
backup passed. Owner then reported PNC link works after clearing cache; sync imported nothing
— investigating next.

## Linked starting balance — IN PROGRESS (Claude, 2026-09-25)
Owner linked PNC (works after clearing cache); sync imported nothing; "PNC Checking" has no
transactions ($0). Read-only: link from 2026-09-25 (today), cursor stored, 0 entries.
YNAB (How Direct Import Works / Starting Balances): linking sets the starting balance to
the bank's current balance that day and imports from then on — MyNAB matches the date rule
but never fetches a balance. Plan: capture Plaid balances (accounts/get already called) on
ProviderAccount (migration: currentBalance, balanceAt); linkAccount creates an OPENING from
it dated the link date when the MyNAB account has no transactions; an explicit
"Use bank balance as starting balance" action for already-linked accounts without one
(refreshes balance outside the financial tx). Card/loan balances are owed → negative.
Owner follow-up: linking felt disconnected (had to create an account elsewhere first) and a
linked account should not need a manual starting balance. YNAB: after bank sign-in each
bank account is linked to a NEW account or an existing unlinked one, balance from the bank.
Expanded plan: (1) Plaid listAccounts returns currentBalance (DONE, unit test 14 passed);
(2) finance `account.opening` (only on an account with no transactions); (3) linkAccount
sets the opening from the bank balance when the account is empty; (4) provider API
`account.create_linked` creates a MyNAB account from a discovered bank account (type and
participation mapped) and links it with the bank balance; (5) sync backfills a starting
balance for linked accounts with no transactions (fixes owner's PNC Checking); (6)
connections UI: per bank account "Add to MyNAB" or link-existing, right after linking.
Linking like YNAB VERIFIED locally: Plaid balances (unit), `account.opening`,
`fillStartingBalances` (link and after every sync; bank balance minus imports since the
link date, dated the link date; skips accounts with owner history before the link; never
fails link/sync), `createLinkedAccount` + provider API `account.create_linked` ("Add to
MyNAB" on each unlinked bank account, existing-account link as alternative). check 239,
integration 127, build, e2e 114 (axe 0), backup passed. Owner's "PNC Checking" (linked
2026-09-25, empty) will get its starting balance on the next Sync now after deploy.
Release 0.3.14 BUILT and REHEARSED (not deployed): images 22cb5f1956fc / c55785f690ce from
5f91604; backup /home/plex/mynab/backups/mynab-pre-0.3.14-20260925T222926Z.dump; migration
rehearsal passed (33 migrations). NEXT: owner pastes stack.yml for 0.3.14, then Sync now on
PNC to backfill the starting balance; owner can delete the empty "PNC Import" account.

## Soft navigation everywhere — IN PROGRESS (Claude, 2026-09-25, owner /goal)
Owner: many buttons do full page reloads though only a section changes. Approach (Next.js
idiom): GET filter forms → `next/form` <Form> (client-side navigation, scroll kept);
internal <a href> → <Link>; same-page state links (inspect, filters, tabs, drilldowns,
paging) get scroll={false}; native POST forms to /api/plans and /api/household → client
fetch component with JSON responses + router.push/refresh. FinanceForm already uses
fetch + router.refresh. Verify with an e2e check that navigation keeps a window marker.
Soft navigation VERIFIED locally: 11 GET forms → `next/form` <Form action=… scroll={false}>
(budget x2, reports, forecast, register, payees, schedules, rules, account page x2, debt);
FocusedViewTabs and register account links → <Link>; same-page query links (month nav,
Today, paging, reports filters/drill, goals months, schedules overdue) keep scroll;
panel-revealing links jump to #inspector-heading / #auto-assign / #money-moves /
#drill-heading; Plans (5) and Household (4) forms → `src/components/action-form.tsx`
(fetch; /api/plans and /api/household answer Accept: application/json with
{redirect}, else 303 as before). Left as real navigations on purpose: sign-in, sign-out,
export downloads, Plaid OAuth return, in-page #anchors. New e2e keeps a window marker across
those actions. check 239, integration 127, build, e2e 116 (axe 0), backup passed.
Convention for new code: in-page controls use Link/Form/FinanceForm/ActionForm, never
plain <a>/<form method>.
Release 0.3.15 BUILT (not deployed): mynab 6675dcf16844, mynab-tools abbfcc3b1ab8. Server
still ran 0.3.13, so 0.3.15 also applies migration 202609250018 (rehearsed for 0.3.14).
Fresh pre-0.3.15 backup taken on the host.

## Unlink / delete of file-imported account — IN PROGRESS (Claude, 2026-09-25)
Owner: "PNC Import" delete refused ("Disconnect this account from bank sync") — it is
mapped to the "File imports" pseudo-connection from the CSV import. Plan: account.delete
detaches file-import links automatically (history kept); add YNAB-style "Unlink from bank"
(`account.unlink`) on the account page for Plaid links; keep imported transactions.
Unlink/delete VERIFIED locally: account.delete detaches FILE-import links (history kept on
the ProviderAccount), refuses bank links with "Unlink it in Account settings first";
`account.unlink` (accountId/linkedFrom → null, imports kept); file import reattaches a
detached `account:<id>` link; account page shows link + "Unlink from bank". check 239,
integration 128, build, e2e 116 (axe 0), backup passed.
Release 0.3.16 BUILT (not deployed): mynab 2c7f8d7bc106 / tools 7efb4b649b72; server runs 0.3.15; no migrations.

## Budget editing redesign (YNAB-style) — IN PROGRESS (Claude, 2026-09-25, owner approved)
Owner approved: (1) target create/edit/snooze/clear inside the category inspector on
Budget; inspector also renames, notes, moves group, reorders, hides, assigns; (2) inline
"+ Add category" per group and "+ Add group" in the Envelopes list, group rename/hide
inline; (3) inspector sticky in the right column; remove right-column Add group/Add
category/Targets boxes and the bottom "Manage categories and groups" section (keep
focused-view management); (4) rename Goals → Targets (nav, page copy, route /targets with
/goals redirect). No data model change. Keep existing test markers where possible and update
e2e tests that used removed panels.
Step 1 IN PROGRESS: shared TargetEditor component + inspector integration.
Codex resumed with the owner-approved plan after Claude's cutoff. Recovery showed
Claude's uncommitted redesign intact on eaea2cb plus a later e2e edit. No files
were reverted. `npm run check` passed (239 unit tests, lint, typecheck) on that
recovered tree. Next batch IN PROGRESS: make the Budget side column shorter by
collapsing Move money and Money moves when idle; check the inspector controls,
inline group/category creation, and target workflow in browser tests. Expected
files: `src/app/(protected)/budget/page.tsx`, `tests/e2e/finance.spec.ts`,
then docs and handoff. Preserve current financial records and built images.
Inline bill workflow passed on desktop/mobile after closing creation popovers
and opening the new category inspector. The right-column Move money and Money
moves sections are now disclosures; verification is pending. Next batch IN
PROGRESS: make `/targets` an overview and change its category rows into
Budget-inspector links; preserve the fund-all action but move creation/edit/
snooze/removal entirely into Budget. Expected files: Targets page,
`tests/e2e/finance.spec.ts`, related screenshots/a11y tests if needed.
Targets overview conversion IMPLEMENTED; local `npm run check` passed (239),
`npm run test:integration` passed (128) before the latest browser-test edits.
First full browser run reached the new snooze workflow, then the test navigated
away before its request completed; test now awaits the saved inspector state.
Next batch IN PROGRESS: wire an Add schedule link from the category inspector
to a schedule form preselected to that category. Expected files: Budget page,
Schedules page, `src/components/schedule-fields.tsx`, browser tests.
Redesign implementation VERIFIED locally before release edits: `npm run check`
(239), `npm run test:integration` (128), `/mynab` production build,
`APP_BASE_PATH=/mynab npm run test:e2e` (118, desktop/mobile axe 0),
`PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup` (39
tables). After making group names the inline editing trigger, repeated check,
build, targeted desktop/mobile bill workflow (2), and targeted a11y (2, axe
0) passed. Screenshot suite passed (2, contrast 0). A focused-view mobile
browser test needed direct touch because Playwright's auto-scroll click hit
testing landed on a visible neighboring disclosure; touch passed. No schema
change. Next batch IN PROGRESS: refresh `PROJECT_SPEC.md`, `NEXT_STEPS.md`,
`DEVELOPMENT_LOG.md`, README and deployment guide; prepare a new image tag,
commit, and build images on Linux. Expected files: those docs, package JSON/
lockfile and Portainer stack. Do not update Portainer or production data.

0.3.17 image build VERIFIED: `npm run release` exited 0 from 3ba29d2,
web image 6a3733a2333f and tools image 11525fafac3e, linux/amd64,
APP_BASE_PATH=/mynab, runtime user node. Running stack was 0.3.16 and not
changed. 0.3.18 return-to-RTA action IMPLEMENTED and locally VERIFIED:
`npm run check` 239, `npm run test:integration` 129, `/mynab` production
build, targeted browser 4 desktop/mobile. Isolated inspector browser run
failed for missing Food seed; rerun with the preceding manual-cycle test passed.
No 0.3.18 images yet; Portainer and live data untouched. Next: commit, release.

0.3.18 image build VERIFIED: `npm run release` exited 0 from 9d44b4f;
web 3a98c0212b5b, tools a5591231ce51, amd64/user node. Host still ran
0.3.16 after the build. Source/stack point to 0.3.18. Next action: owner pastes
the full Portainer stack YAML (re-pull off), then verify health and the UI.

Stock category catalog IMPLEMENTED and locally VERIFIED: `starter.add` uses the
existing authorized finance command layer; Budget's compact picker chooses one
category and opens its inspector; unselected suggestions do not materialize.
`npm run check` 239, `npm run test:integration` 130, `/mynab` build,
targeted e2e desktop/mobile 2 passed. A formatting-only expansion in finance
and integration tests was removed without changing the new logic. Version
bumped to 0.3.19, docs in progress. Next: repeat check/build after final
edits, commit, build both Linux images. Running stack remains 0.3.16 at last
read-only check. No production data mutation.

0.3.19 full local gate VERIFIED: check 239, integration 130, /mynab build,
e2e 120 (desktop/mobile axe 0), screenshot/contrast 2 (0 failures),
backup/restore 39 tables. Screenshot seeding now selects five catalog
categories instead of the removed bulk button. No migration. Next: commit
and build images; running stack not changed.
## Faster transaction categorization — IN PROGRESS (Codex, 2026-09-30)
Owner wants YNAB-inspired categorization for transactions needing categories:
easy multi-select and a category list showing budget availability. Preserve
existing journaled edits, import approval, plan isolation, and phone navigation.
Recovery found a clean tree at `1beb012d`; previous checkpoint preceded the
documentation commit but its content matches. Existing All Accounts desktop
has checkboxes and bulk command, but its native category select is names-only;
recovered approved Uncategorized charges are absent from the unapproved queue.
Batch 1 VERIFIED: edited `src/app/(protected)/accounts/register/page.tsx`,
`src/components/register-bulk.tsx`, `src/components/finance-form.tsx`, and added
`src/components/category-availability-picker.tsx`.
Added Needs category filter over live system-Uncategorized splits and views,
grouped searchable picker with current Available values, clearer selection
actions and selected spending total. Existing journaled command unchanged.
`npm run check` passed (lint, typecheck, 271 unit). Batch 2 IN PROGRESS:
wire the same interaction into the phone All Accounts register; expected files
`src/app/(protected)/accounts/register/page.tsx`, its `phone.tsx`,
`src/components/phone/register.tsx`, `src/components/phone/bulk-categorize.tsx`,
`src/app/globals.css`, `src/app/(protected)/accounts/[id]/page.tsx`, its
`phone.tsx`, and focused browser coverage in `tests/e2e/finance.spec.ts`
and `tests/e2e/phone.spec.ts`.
Batch 2 VERIFIED: phone selection and category picker added; account register
links directly to its category-needed queue. `npm run check` passed (271 unit),
`APP_BASE_PATH=/mynab npm run build` passed, and focused Playwright commands
`APP_BASE_PATH=/mynab npx playwright test --project=desktop --grep 'bulk categorizes needed transactions'`
and `APP_BASE_PATH=/mynab npx playwright test --project=phone --grep 'selects several uncategorized expenses'`
each passed (1). The first desktop test attempt used the wrong Playwright role
for a native `<summary>`; the second revealed an EmptyState paragraph, not a
heading. Only test locators changed; both flows pass. Batch 3 VERIFIED:
reviewed desktop and phone picker screenshots; the first phone screenshot
showed a category at the bottom edge, so this picker now has a 65% minimum
mobile sheet height. `npm run check` passed (271 unit),
`APP_BASE_PATH=/mynab npm run build` passed, focused desktop and phone
Playwright flows passed, and Axe WCAG 2.1 AA returned zero violations with
the picker open in both. `APP_BASE_PATH=/mynab npx playwright test
--project=phone --grep 'selects several uncategorized expenses|phone pages pass automated WCAG'`
passed (2). Batch 4 VERIFIED: packaged this UI as 0.3.58, committed as
`734c8e5`, and built `mynab:0.3.58` and `mynab-tools:0.3.58` on the Linux
host. Backup `/home/plex/mynab/backups/mynab-pre-0.3.58-20260930T135600Z.dump`
verified with container `pg_restore -l` (SHA256
`64a9551bf010bacec5ac10622052c3253cc644bf25031354d358d382859fac5a`,
mode 600, 672664 bytes). Old Portainer stack matched exact 0.3.57 YAML;
0.3.58 Compose config passed. Previous stack saved at
`/home/plex/mynab/releases/0.3.58/portainer-stack-before.yml`. Deployed
full stack 91 from local images, no pull; new stack SHA256
`0ac501d90916642a82c899c53157eb30b5b9a6f37d36e1f51aa39e609569c421`.
App/worker/db healthy, migrate exited 0, public readiness HTTP 200. Live
read-only SQL verified all 12 recovered bank entries, -38082 cents, all 12
linked to transactions. Their current categories: Groceries 2/-15805 cents;
Uncategorized 10/-22277 cents. This deployment made no ledger writes and
included no migration.
## Compact theme and category menus — IN PROGRESS (Codex, 2026-09-30)
Owner reports dropdowns are too tall, especially the nav theme menu and the
new category picker. Recovery: clean tree at `e0e4940d`; previous checkpoint
preceded the final 0.3.58 documentation commit but contents match. The theme
control is a native select whose open menu height is browser-controlled; the
category picker forces 29rem desktop width, an 18rem list, and a 65dvh phone
minimum, leaving excess blank space for short lists. Acceptance: compact
theme choices with unchanged persistence and keyboard access; category menu
fits short lists and caps/scrolls long ones, retaining Available amounts and
touch targets; no regression to sheets or categorization.
Batch 1 IMPLEMENTED: changed `src/components/theme-toggle.tsx`,
`src/components/category-availability-picker.tsx`, and `src/app/globals.css`.
The theme menu is a compact 2-column choice panel; category panel width/list
height are bounded on desktop and phone has a content-sized 58dvh cap.
Batch 2 IN PROGRESS: update theme/menu browser tests in
`tests/e2e/foundation.spec.ts`, `tests/e2e/phone.spec.ts`, and
`tests/screenshots/shots.spec.ts`, then run checks, build, screenshot/a11y QA.
Deployment is not yet started.
