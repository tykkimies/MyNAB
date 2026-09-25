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

| #   | Area                                 | Old MyNAB behaviour                                                                        | New behaviour (YNAB)                                                                                                                                                                                                                                                                                                               | Status  |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| A1  | Imported transactions                | Landed in Uncategorized until approved; approving with a category replaced the transaction | Arrive already categorised from rules, then payee memory; counted in the budget immediately but marked **unapproved**. Approving only marks them approved. Changing the category of an unapproved import is allowed. Nothing suggested: Uncategorized, as before                                                                   | PLANNED |
| A2  | Matching manual and imported entries | Suggested only; exact amount within 5 days; owner confirms                                 | An import with **exactly one** unimported manual (or scheduled-entered) candidate in the same account, same amount, within 10 days, is **matched automatically** and approved: no new transaction, the owner's date/payee/category kept. Several candidates: no automatic match, suggestions shown. Declined matches stay declined | PLANNED |
| A3  | Scheduled transactions               | Waited for explicit approval, match or skip                                                | On their date (schedule and budget time zone) the worker **enters** them automatically as real, uncleared transactions that count in the budget, marked **unapproved** until the owner approves them or an import matches them (which approves them). Skip and "enter now" remain                                                  | PLANNED |
| A4  | Editing history                      | Corrections shown as void + replacement lineage                                            | Owner-facing **edit in place** and **delete**, plus **undo** of the last edit or delete. Internally the journal stays immutable (void + replacement), but the register shows only the current version and never asks the owner to think about lineage. Editing reconciled history still asks for confirmation, as YNAB does        | PLANNED |

## B. New YNAB features

| #   | Feature                       | YNAB behaviour to match                                                                                                                                                                                                                                                                                                                                                                                         | Status  |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| B1  | Auto-Assign variants          | Beside "fund underfunded targets": Assigned last month, Spent last month, Average assigned, Average spent (up to 12 prior months, current excluded, from the first month with activity), Reduce overfunding (return money assigned beyond target needs to Ready to Assign), Reset assigned (this month to zero), Reset available (make Available zero). Applies to every category, or one category from its row | PLANNED |
| B2  | Match with a different amount | Owner can match a manual entry to an import whose amount differs (tips, conversions). Keeps the owner's date, payee and category; takes the **bank's amount**. A single split takes the new amount; with several splits the difference goes to the largest split                                                                                                                                                | PLANNED |
| B3  | Age of Money                  | Days between money arriving in budget cash accounts and leaving them, first in first out, averaged over the last ten cash outflows (card payments included). Shown on Budget and Reports; "not enough history" until ten outflows exist                                                                                                                                                                         | PLANNED |
| B4  | Bulk approve                  | In import review, select several (or all) unapproved imports and approve them at once with their current categories                                                                                                                                                                                                                                                                                             | PLANNED |

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
