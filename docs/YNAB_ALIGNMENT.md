# YNAB alignment (owner decision, 2026-09-25)

The owner decided MyNAB should **operate the same as YNAB** in the four places it
previously differed on purpose, and should add the four most valuable missing YNAB
features. This document is the source of truth for that work. Claude and Codex both
work from it; update the status column as items land. Background and sources:
`docs/FINAL_GATE.md` sections 3 and 4.

Rule of thumb for every item: match YNAB's user-visible behaviour. Internals may stay
stricter (integer cents, audited, immutable journal lineage) as long as the owner sees
YNAB's behaviour.

## A. Former deliberate differences, now aligned with YNAB

| #   | Area                                 | Old MyNAB behaviour                                                                        | New behaviour (YNAB)                                                                                                                                                                                                                                                                                                               | Status          |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| A1  | Imported transactions                | Landed in Uncategorized until approved; approving with a category replaced the transaction | Arrive already categorised from rules, then payee memory; counted in the budget immediately but marked **unapproved**. Approving only marks them approved. Changing the category of an unapproved import is allowed. Nothing suggested: Uncategorized, as before                                                                   | DONE 2026-09-25 |
| A2  | Matching manual and imported entries | Suggested only; exact amount within 5 days; owner confirms                                 | An import with **exactly one** unimported manual (or scheduled-entered) candidate in the same account, same amount, within 10 days, is **matched automatically** and approved: no new transaction, the owner's date/payee/category kept. Several candidates: no automatic match, suggestions shown. Declined matches stay declined | DONE 2026-09-25 |
| A3  | Scheduled transactions               | Waited for explicit approval, match or skip                                                | On their date (schedule and budget time zone) the worker **enters** them automatically as real, uncleared transactions that count in the budget, marked **unapproved** until the owner approves them or an import matches them (which approves them). Skip and "enter now" remain                                                  | DONE locally 2026-09-25; unreleased |
| A4  | Editing history                      | Corrections shown as void + replacement lineage                                            | Owner-facing **edit in place** and **delete**, plus **undo** of the last edit or delete. Internally the journal stays immutable (void + replacement), but the register shows only the current version and never asks the owner to think about lineage. Editing reconciled history still asks for confirmation, as YNAB does        | DONE locally; unreleased |

## B. New YNAB features

| #   | Feature                       | YNAB behaviour to match                                                                                                                                                                                                                                                                                                                                                                                         | Status          |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| B1  | Auto-Assign variants          | Beside "fund underfunded targets": Assigned last month, Spent last month, Average assigned, Average spent (up to 12 prior months, current excluded, from the first month with activity), Reduce overfunding (return money assigned beyond target needs to Ready to Assign), Reset assigned (this month to zero), Reset available (make Available zero). Applies to every category, or one category from its row | DONE locally 2026-09-25; unreleased |
| B2  | Match with a different amount | Owner can match a manual entry to an import whose amount differs (tips, conversions). Keeps the owner's date, payee and category; takes the **bank's amount**. A single split takes the new amount; with several splits the difference goes to the largest split                                                                                                                                                | DONE 2026-09-25 |
| B3  | Age of Money                  | Days between money arriving in budget cash accounts and leaving them, first in first out, averaged over the last ten cash outflows (card payments included). Shown on Budget and Reports; "not enough history" until ten outflows exist                                                                                                                                                                         | DONE locally 2026-09-25; unreleased |
| B4  | Bulk approve                  | In import review, select several (or all) unapproved imports and approve them at once with their current categories                                                                                                                                                                                                                                                                                             | DONE 2026-09-25 |

## Order of work

A1 and B4 first (they share the approval model), then A2 with B2 (matching), A3
(scheduled entry, which relies on A2 matching), A4 (register editing), B1, B3.

## Invariants that do not change

- Integer cents; no floats; sub-cent input refused.
- Composite ownership foreign keys; authorization on every command.
- The journal remains append-only for audit and reconciliation lineage (A4 changes the
  presentation, not the storage).
- GET requests never write. Automatic entry of scheduled transactions (A3) happens in the
  worker, never during a page load.
- Every change is idempotent, audited and covered by unit, integration and browser tests.

## Implementation notes

- **A1** (done): `importCategorizer` in `src/application/ingestion.ts` files each new
  outflow on arrival (enabled rule category, then payee memory, spendable categories only).
  Payee memory (`filingHistory`) ignores unapproved imports so guesses never teach guesses.
  Approving with the current category only marks the row approved; choosing another
  category still replaces the transaction internally. Rules affect only imports that arrive
  after the rule exists, as in YNAB. Bank-change corrections still return to Uncategorized.
- **B4** (done): `approveEntries` (one serialised write, skips pending and reviewed rows);
  `entries.approve` on `/api/provider` takes up to 150 ids; the page batches larger sets.
- **A2** (done): `manualMatcher` in `commitEntries` links a posted import to the single
  unimported owner entry with the same amount within 10 days (declined matches excluded),
  clears it, and records the import as `approved` and `matched` (migration
  `202609250005_ynab_alignment` adds `IngestedEntry.matched`). No match when several
  candidates exist; they appear as suggestions. File-import undo only unlinks matched rows.
- **B2** (done): suggestions include same-direction, non-transfer owner entries within 10 days
  whose amount is within 30% of the bank's; accepting one (`resolveMatch`) replaces the owner's
  entry at the bank's amount via `withBankAmount`, keeping date, payee, memo, categories
  (difference on the largest split), cleared state and preferences.
- **A3** (done locally, unreleased): the worker queues an hourly, budget-scoped
  `schedules.enter` job. It enters each due occurrence through the authorized,
  idempotent finance command as a real uncleared transaction with `ENTERED`
  occurrence status. Entries created before a schedule was made are excluded from
  automatic backfill. The schedule page shows older unapproved entries, with
  Approve and Remove actions. Approve changes status without new postings; Remove
  writes an audited reversal and marks the occurrence skipped. A bank import that
  matches the entry marks the occurrence approved. Migration
  `202609250006_scheduled_entry` extends the occurrence/job checks without changing
  the previously committed alignment migration.
- **A4** (done locally, unreleased): transactions now show Edit,
  Delete and Undo in the account register. `transaction.undo` recreates the
  previous amount, date, payee, memo and splits using the validated command
  path; the underlying revisions and reversing journals remain in storage and
  exports, while the register shows only the active version. Reconciled
  history still requires acknowledgment. Opening-balance edits retain their
  special `OPENING` kind. The command accepts that kind only when replacing
  the same account's opening lineage, so it cannot create a second balance.
- **B1** (done locally, unreleased): the Budget page previews seven Auto-Assign
  variants for all eligible categories or one category. The pure planner uses
  exact cents and the prior twelve months for averages. Applying checks the
  preview fingerprint against the current budget inside an authorized,
  serialized, idempotent command; a stale preview is refused. The resulting
  Ready to Assign comes from a fresh projection, including card reserve caps.
- **B3** (done locally, unreleased): `src/domain/age-of-money.ts` tracks FIFO lots
  across budget cash accounts, seeded by positive opening balances and inflows.
  Cash expenses and cash-to-card payments consume lots; card purchases wait
  until paid, while internal cash transfers are not samples. Each outflow's
  age is weighted by cents drawn from its lots; the last ten transaction ages
  are averaged equally and rounded to a whole day. YNAB publishes the FIFO/
  ten-outflow behavior, but not its exact mixed-lot rounding rule, so that
  subdetail remains an approximation pending a product comparison. Historical
  corrections replay the active ledger; no age figure is stored.
  accept a percentage-only minimum (the fixed amount is an optional floor).
  Saving terms with a due day and "Set the payment target" ticked upserts a
  `DEBT_PAYOFF` target on the card's payment category (the chosen amount, or
  today's calculated minimum capped at what is owed). **No schedule is created
  for a card** (owner decision 2026-09-27, as in YNAB, which never makes a
  schedule for you): bank sync or a manual entry records the payment. Managed
  card schedules made before this stay until the owner deletes them on
  Schedules; closing or deleting the card archives them. YNAB's card targets are likewise an amount the
  owner chooses; YNAB does not derive one from card terms, so this is a
  convenience on top of parity. The category inspector shows card terms,
  target and upcoming schedules together, and "+ Add group" now holds both
  custom groups and stock groups, with stock suggestions under each group's
  "+ Add category".
- **Tracking-loan payment setup**: loans retain the same APR and minimum terms,
  but do not use a card payment envelope. A chosen on-budget payment account
  creates a monthly transfer to the tracking loan, categorized to the selected
  budget category; leaving the payer blank keeps the loan unscheduled and can
  end an existing managed payment. No transaction is posted when terms are
  saved.
- **Pending bank transactions** (done locally, unreleased, owner 2026-09-26): as
  YNAB's pending section. Each register (one account, All accounts) lists what
  the bank has seen but not settled in a greyed, collapsible "Pending at the
  bank" section above the ledger; these count in no balance or budget figure.
  "Enter now" puts one in the register as an uncleared, approved transaction
  (a category is offered for an outflow on a budget account, prefilled from
  rules and payee memory); a manual entry with the same amount within ten
  days is matched at the pending stage. When the bank posts it, the ledger
  row clears in place, or takes the bank's amount and keeps the owner's
  category, memo and flag when the amount changed (a tip). A pending row that
  never posts simply stays in the section; a posted row the bank later
  withdraws is a review, as before.
- **Target colours** (done locally, unreleased, owner 2026-09-26): as in YNAB,
  a target that still needs money this month shows **yellow** (its status on
  Budget and Targets, and the category's Available pill while it is not
  overspent); **red** is only for overspending and a spending limit passed.
  Deliberate deviation, owner decision: "Build up to an amount" (`BALANCE`,
  no date) is a **no-ask tracker**. It reports progress ("Saving up", state
  `BUILDING`) and never asks for money in a month, so it stays out of
  "Targets need $X this month", Fund every target and the Underfunded view.
  YNAB's dateless "Have a balance of" asks for the whole remainder until met;
  use "Save up by a date" or "Needed every month" here to be prompted.
- **Budget drag and drop, and "Needs $X" funding** (done locally, unreleased,
  owner 2026-09-27): as in YNAB, groups and categories are dragged into order
  on Budget (grip in the left gutter; mouse, touch and keyboard), and a
  category can be dropped into another group; card payment categories stay in
  their group, and nothing else enters it. Off while a Focused View is shown.
  Commands `group.move` / `category.move` (`beforeId`, null for the end); Move
  up/down stay. A target's "Needs $X" is a button that assigns exactly what it
  still asks for this month (`target.fund` with `categoryId`, one Money Move,
  so Undo reverses it), like YNAB's per-category underfunded quick budget.
  Clicking a row's empty space opens the category, and each row with a
  target shows a progress bar under its name and "Needs $X by <due>" (or
  "$X to go by <month>"), YNAB's expanded-row reading without expanding.
- **Adopted payoff plan** (done locally, unreleased, owner 2026-09-26): beyond
  YNAB, which has no multi-debt planner. "Adopt this plan" stores the scenario's
  settings (`DebtPlan`); applying a month re-plans from real balances and sets
  each card's `DEBT_PAYOFF` target to that month's planned payment (never a
  schedule, owner decision 2026-09-27). The worker does this at the start of each month (the Budget
  page offers it too until then); a card that is paid off leaves the plan with
  no target (and any older managed schedule ended), and new spending on it does not
  bring it back. Nothing moves money and schedules still wait for approval. Deferred-interest promotions are modelled
  (held-back interest charged in full if a balance remains at the deadline), and
  a Custom order ranks debts by hand.
