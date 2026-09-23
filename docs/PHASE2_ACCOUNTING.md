# Phase 2 accounting contract

This document supplements PROJECT_SPEC.md. These decisions precede the Phase 2 calculations.

## Durable source data and atomic writes

Real accounts carry signed ledger balances. Internal contra accounts are represented by a
posting's systemAccount code (INCOME, EXPENSE, OPENING, ADJUSTMENT), exclusive of accountId.
Every journal has two or more nonzero postings and a zero sum, enforced by deferred SQL
constraint triggers. Journal/posting payloads are append-only. Date, account, amount, payee,
memo, and splits of accepted transactions are immutable. A correction marks the old record
void, appends an exact reversing journal and optionally a replacement transaction, and
records reason, actor, timestamp and lineage. A correction of reconciled data needs explicit
acknowledgment and marks the affected reconciliation event for review.

Clearing belongs to each transaction/account leg, so two sides of a transfer can clear
independently. Reconciliation records an immutable statement comparison and its transaction
set. A later correction marks it affected; it never rewrites its original totals.

All finance commands authorize budget membership and serialize on the budget row inside
SERIALIZABLE transactions with bounded retry. Budget-scoped idempotency keys bind to a
payload hash and stored result. Reuse with a different payload is rejected. The financial
revision counter, journal, state, and audit writes commit together.

## Month projection and conservation

Replay accepted transactions by date, then stable transaction ID. Opening balances and
transfers participate in account balances; only budget-account effects participate in envelopes.
For a card outflow, consume any positive card balance first; only the remainder creates debt.
For an inflow, reduce debt first; only the remainder creates a positive card asset.

Within each month and category:

1. Begin with the prior month's positive available amount and this month's net assignments.
2. Apply cash activity (including the asset portion of card transactions).
3. Net card purchases/refunds by card and category. Net debt refunds restore category funds
   and withdraw that amount from the card payment reserve. This is explicit reallocation,
   never new income. If the reserve is insufficient, show a payment funding deficit; covering
   it requires existing Ready to Assign or another envelope. Never invent budget money.
4. Use available funding for net card purchases in first-purchase date/ID order, cash first.
   This makes entry/import order irrelevant and recomputes payment reserves after corrections.
5. Cash-to-card payments consume reserves only for the portion repaying debt. Overpayments
   create positive card assets. Card-to-card debt transfers move existing reserves, capped by
   the source reserve and debt moved; they do not create cash deficits or money.
6. Cap positive payment reserves at debt owed at month end. Release excess into Ready to
   Assign and show the released amount. Negative reserves remain visible as funding deficits.

This monthly netting policy is the Phase 2 default for linked and unlinked refunds; purchase
links preserve attribution and validate cumulative refund amounts, but reserves are fungible
per card rather than immutable per-purchase lots. This replaces the earlier draft's tentative
funding-lineage policy. Reports retain full gross purchase/refund rows.

Let resources = signed budget cash balances + positive card balances. Let funded = sum of
positive ordinary category balances + positive payment reserves. Let deficits = cash deficits
in spending categories + negative payment reserves. Then:

    RTA = resources - funded + deficits - futureReservations
    resources = RTA + funded + futureReservations - deficits

Unfunded credit overspending is not a cash deficit. At rollover negative category/reserve
balances reset to zero; positive balances carry. Since resources still reflect actual spending,
cash deficits reduce the new month's RTA. Card debt remains without new reserves.

Future assignments reserve existing money. Each future category/month must have nonnegative
net assignment: future negative rollover cannot be borrowed back into the present. Commands
cannot worsen actual over-allocation in any affected month. Covering a deficit is permitted
because it restores backing rather than funding an additional envelope. Transactions always
record financial reality, even when they create deficits. No future-dated ledger entries;
future planning belongs to scheduled transactions in Phase 4. Future assignments: up to 24
months; all dates/months from 1900 onward with a bounded replay horizon.

## Transfer and correction rules

Budget cash to budget cash: no category, income, or spending. Budget cash to budget card:
payment. Budget card to budget cash: financing/cash advance; actual received borrowed cash
may be assigned, but is not income. Budget to tracking: categorize the budget outflow.
Tracking to budget: explicitly choose RTA or a category. Tracking-to-tracking: no envelope
effect. Interest/fees are separate categorized expenses; principal is a transfer.

Opening card debt reserves no cash. Statement credits reduce liability; they do not act as
cash income. Manual adjustments require a reason and affect RTA/resources where appropriate.
Account type and budget/tracking participation are immutable after creation; renaming and
closing/reopening are audited. Close only at zero with every active leg cleared and latest
reconciliation unaffected. Categories are archived, never deleted; move/cover their balances
and remove future assignments first. System payment categories follow their card account.

## Test gate

Before persistence/UI: examples and generated tests for journal balance, exact money,
assign/move, cash/card/mixed overspending, rollover, payments, old debt, refunds in later
months/after payoff, positive credit balances, cash advances, multi-card reserve order,
statement credits, tracking boundaries, future reservations, and deterministic replay.
Then real PostgreSQL tests for constraints, atomicity, cross-budget authorization, idempotency,
concurrent assignments, correction lineage, reconciliation invalidation, archive and closure.
No production deployment or migration is performed automatically by this development work.
