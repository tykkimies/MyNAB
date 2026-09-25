# YNAB experience parity inventory — 2026-09-25

The owner's objective is the user-visible YNAB experience in a self-hosted app,
without a subscription. This is an evolving acceptance inventory, not a claim
that MyNAB is finished. Match behavior where useful; do not copy YNAB branding,
text, or visual design. `docs/FINAL_GATE.md` records an older comparison and
some gaps there are now implemented. Recheck YNAB sources as they change.

Statuses: **working** means implemented and locally tested, not necessarily
deployed; **partial** means a substantial workflow exists but named controls
are missing; **missing** means no user-facing equivalent verified in the repo;
**unassessed** needs a deeper comparison. The 0.3.11 Portainer images predate
the Auto-Assign, Age of Money, and payoff-date work in this inventory.

| Experience | Current MyNAB evidence and status | YNAB reference / next acceptance target |
| --- | --- | --- |
| Envelopes, rollover, cash/card overspending, payment reserves | **Working locally.** `src/domain/budget.ts`, Phase 2 invariant tests. | Recheck category activity details and current YNAB payment-reserve display. |
| Targets and underfunded assignment | **Partial.** Target types, progress, date pace, fund-underfunded and one-month snooze work locally. Snooze preserves progress, excludes current-month funding need, resumes next month and refuses card payment targets. | [Snooze a Target](https://support.ynab.com/en_us/snooze-a-target-HyS4E5rZT): compare target colors and recurring cadence behavior with live YNAB. |
| Auto-Assign from history and reset options | **Working locally, not in 0.3.11.** Pure planner, preview, stale-preview protection, one/all categories. | [Auto-Assign guide](https://support.ynab.com/en_us/auto-assign-a-guide-r1gBNbBJo). Compare edge-case averages and target overfunding with real YNAB examples. |
| Age of Money | **Working locally, not in 0.3.11.** FIFO cash lots, last ten cash outflows, Budget and Reports. | [Age of Money](https://support.ynab.com/en_us/age-of-money-H1ZS84W1s): verify mixed-lot rounding with a known YNAB example if possible. |
| Debt payoff simulator | **Partial.** `src/domain/debt.ts` and Debt page model rate/minimum changes, avalanche/snowball, extra monthly budget and lump sums. A payoff-month input now solves the least whole-cent monthly budget locally. | [YNAB loan payoff simulator](https://support.ynab.com/en_us/paired-targets-BJJI8rdC5?mobile-help=true) offers payment→date, date→payment and one-time payment. Verify loan-specific target pairing and progress. |
| Registers, scheduled entries, reconciliation, imports | **Working locally.** Manual and Plaid ingestion, bank-match review, editing/undo, worker-entered schedules, reconciliation. | Test real institution/OAuth behavior; compare bulk category edits, flags and register filters. |
| Category organization | **Partial.** Groups, categories, renaming, archival exist; notes, hide/unhide, manual order and custom focused views were not found. | [Category customization](https://support.ynab.com/en_us/adding-removing-and-customizing-categories-a-guide-HJFO5j909?mobile-help=true), [Focused Views](https://support.ynab.com/en_us/focused-views-a-guide-BksnNYqLh): implement compact editing, persistence and keyboard controls. |
| Money Moves and explainability | **Partial.** Assignment/move records and audit data exist; no recent-moves/category-moves UI was found. | [Moving Money in Your Plan](https://support.ynab.com/moving-money-in-your-plan-ryyCKbBJi): show who, when, source/destination, and one-click category drilldown. |
| Reports and forecasting | **Partial.** Spending, cash flow, net worth, trends and forecasts exist; report views and filters need direct comparison. | [Spending Breakdown](https://support.ynab.com/en_us/spending-breakdown-H1H7YxmD0): category/account filtering and transaction drilldown; assess other Reflect views. |
| Multiple plans, Fresh Start, plan reset | **Missing/partial.** Owner/membership data anticipates more users, but UI selects the first budget. Reset Assigned is implemented; a reversible whole-plan Fresh Start is not. | [Multiple Plans](https://support.ynab.com/en_us/navigating-multiple-plans-r1qeOvbC5), [Plan Resets and Fresh Starts](https://support.ynab.com/plan-resets-and-fresh-starts-HkXYR_c0q). Preserve old plan and sync boundaries. |
| Household sharing | **Missing.** One owner and one active plan in the UI. | [YNAB Together](https://support.ynab.com/en_us/partner-HJqX5Br1j): explicit memberships, role permissions, and per-member audit attribution. |
| Fast mobile entry and native conveniences | **Partial.** Responsive web and mobile browser checks pass; no native app, device widgets or offline entry. | [Adding Transactions Without Direct Import](https://support.ynab.com/en_us/adding-transactions-without-direct-import-B1kBALVaxx): prioritize fast add and payee/category memory, then offline-capable PWA/device shortcuts; native-only integrations need a platform decision. |
| Currency and financial settings | **Partial.** USD-only and integer cents are a founding constraint; YNAB supports plan-level currency settings. | [Plan Settings](https://support.ynab.com/en_us/how-to-adjust-your-plan-settings-SyFt35cAq). Assess multi-currency scope before altering storage/accounting. |
| Setup and learning | **Missing.** No guided in-app setup; documentation exists. | [YNAB onboarding research](FINAL_GATE.md#4-how-ynab-teaches-new-users): build the owner's requested guide last, after the financial workflows stabilize. |
| Privacy and personalization | **Unassessed.** Light/dark themes exist; no verified Hide Amounts, pinned categories or home priority view. | [Hide Amounts](https://support.ynab.com/en_us/hide-amounts-ry0jgLaOJg?mobile-help=true), [At Home](https://support.ynab.com/spotlight-BkdHBZUokg). |

The immediate work after target snooze is category organization. The old “out of scope” labels for multiple
plans, sharing and mobile are superseded by the owner's parity objective;
delivery order and platform approach still need technical decisions. Keep
real-bank/OAuth and non-Chromium manual checks explicitly unverified until run.
