# Final gate, YNAB parity and onboarding research (2026-09-25)

Scope: the final release gate from NEXT_STEPS item 8, a comparison of behaviours MyNAB
shares with YNAB, and how YNAB teaches new users, to shape MyNAB's in-app guide.
Release under review: 0.3.10 (commit 34ca5e1), deployed and running on 192.168.1.7.

## 1. Gate results

| Check                      | Result | Evidence                                                                                                                                              |
| -------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean install              | Pass   | Fresh clone, `npm ci`, `npm run check`: lint, typecheck, 202 unit/property tests                                                                      |
| Dependency audit           | Pass   | `npm audit`: 0 vulnerabilities (all, and production only)                                                                                             |
| Integration                | Pass   | 97 PostgreSQL tests                                                                                                                                   |
| Browser                    | Pass   | 66 desktop + mobile tests, including the axe WCAG 2.1 A/AA audit (0 violations)                                                                       |
| Backup round trip          | Pass   | `npm run test:backup`: all 35 tables match                                                                                                            |
| Contrast                   | Pass   | Screenshot harness, both themes: 0 failures                                                                                                           |
| Fresh migrations           | Pass   | Empty database: all migrations apply; composite ownership FKs present                                                                                 |
| Production schema          | Pass   | 19/19 migrations; 41 composite ownership FKs; `Job_live_dedupeKey` partial index present                                                              |
| Production health          | Pass   | app, worker, db healthy, 0 restarts; readiness 200; worker ran daily maintenance                                                                      |
| Persistence across upgrade | Pass   | 0.3.8 to 0.3.10 upgrade kept the database container and data (db up 2 days)                                                                           |
| Live security              | Pass   | CSP with nonce, HSTS, nosniff, DENY framing, same-origin referrer, no-store; anonymous page 307 to login; anonymous export 401; cross-origin POST 403 |

Not verified (recorded, not blocking):

- Automated or off-host backups: declined by the owner (2026-09-24).
- A live OAuth bank sign-in round trip (needs `PLAID_REDIRECT_URI` registered with Plaid).
- Manual screen-reader, Safari and Firefox review (automated audit only).
- Real-bank sign verification for the owner's institution (Sandbox signs are verified).

## 2. Specification audit

Status per PROJECT_SPEC section. "Met" means implemented and covered by recorded tests.

| Section                        | Status | Notes                                                                                                                                                                        |
| ------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Vision and boundaries        | Met    | Manual operation works with no provider; no housing-specific core                                                                                                            |
| 2 Terminology and money        | Met    | Integer cents; sub-cent input refused (unit and property tests)                                                                                                              |
| 3 Architecture                 | Met    | domain/application/infrastructure layering; worker uses the same modules                                                                                                     |
| 4 Ledger and budget accounting | Met    | Conservation, cash backing and replay property tests; negative Ready to Assign per YNAB parity                                                                               |
| 5 Accounts and transactions    | Met    | Immutable corrections, splits, transfers, cleared/reconciled state, pending kept separate                                                                                    |
| 6 Credit cards                 | Met    | Payment reserves, positive card balances, cash vs credit overspending                                                                                                        |
| 7 Goals and targets            | Met    | Nine target types with effective dating and derived completion history                                                                                                       |
| 8 Debt planning                | Met    | Effective-dated APR and minimum rules, budget cap, scenarios never stored                                                                                                    |
| 9 Scheduling, rules, forecasts | Met    | Approval-based schedules, deterministic rules, 1/3/6/12-month forecasts                                                                                                      |
| 10 Providers and portability   | Met    | Plaid with leases and review; CSV/OFX/QFX import; versioned export. OFX reader is an in-house tag scanner rather than a third-party parser (deliberate; hostile-input tests) |
| 11 Reconciliation and reports  | Met    | Reconciliation lineage; reports on one pure layer with reconciling cash flow                                                                                                 |
| 12 Authentication and security | Met    | Argon2id; `__Host-` HttpOnly SameSite=Lax cookies; 7-day absolute, 24-hour idle expiry; Origin + Fetch Metadata checks; CSP; AES-256-GCM provider secrets with AAD           |
| 13 Deployment and recovery     | Partly | Non-root images, migration gate, readiness, worker with healthcheck. Nightly/encrypted backups declined by the owner                                                         |
| 14 Phases                      | Met    | Phases 1-8 complete; each ended with tests, docs and commits                                                                                                                 |
| 15 Test strategy               | Met    | Unit/property, PostgreSQL integration, browser (desktop/mobile), backup round trip, accessibility                                                                            |

## 3. YNAB parity: shared features

Sources: YNAB's public help centre (links at the end). MyNAB implements these concepts
independently; the comparison is of behaviour only.

### Behaves the same

| Feature                              | YNAB                                                                                               | MyNAB                                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Only budget money you have           | Assign what is in Ready to Assign                                                                  | Same; assignments cannot exceed free resources except as below                                                  |
| Negative Ready to Assign             | Allowed, shown as "assigned too much"                                                              | Allowed, shown in red with the same explanation                                                                 |
| Assigning ahead                      | Future-month assignments reduce Ready to Assign                                                    | Same (future reservations)                                                                                      |
| Cash overspending                    | Negative Available is taken from next month's Ready to Assign                                      | Same (cash deficit reduces next month's Ready to Assign)                                                        |
| Credit overspending                  | Stays as card debt; the payment category is short                                                  | Same (unfunded card spending remains debt)                                                                      |
| Funded card spending                 | Moves money into the card's payment category                                                       | Same (card payment reserves)                                                                                    |
| Positive card balance                | Treated as cash in Ready to Assign                                                                 | Same (reported separately from withdrawable cash)                                                               |
| Moving money between categories      | Move money, cover overspending                                                                     | Same (`move`)                                                                                                   |
| Targets                              | Weekly/monthly/yearly/custom; "set aside another" vs "refill up to"; "have a balance of by a date" | Same set: WEEKLY/MONTHLY with refill or set-aside, PERIODIC, BALANCE_BY_DATE, BALANCE, MAINTAIN, SPENDING_LIMIT |
| Card payoff targets                  | Pay off a card balance by a date or monthly                                                        | Same (DEBT_PAYOFF, DEBT_PAYOFF_BY_DATE; amount read from the ledger)                                            |
| Underfunded auto-assign              | Funds targets in priority order                                                                    | Same idea (`target.fund`), capped by money that exists                                                          |
| Split transactions, transfers, memos | Supported                                                                                          | Supported                                                                                                       |
| Tracking accounts                    | Loans/investments outside the plan                                                                 | Same (TRACKING participation)                                                                                   |
| Reconciliation                       | Compare cleared balance, add an adjustment, lock                                                   | Same, with affected-statement flags on later corrections                                                        |
| Imported transactions need approval  | Approve or match                                                                                   | Same                                                                                                            |
| Payee memory                         | Suggests the last category used for a payee                                                        | Similar (most-used category, recency breaks ties)                                                               |
| File import                          | CSV/OFX/QFX with column mapping                                                                    | Same, plus a dry-run preview and batch undo                                                                     |
| Reports                              | Spending, income vs expense, net worth                                                             | Same, plus reconciling cash flow and savings rate                                                               |

### Behaves differently on purpose (spec decisions)

| Feature                              | YNAB                                                        | MyNAB                                                      | Why                                                           |
| ------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| Scheduled transactions               | Enter the register automatically on their date (unapproved) | Wait for explicit approval, match or skip                  | Spec: never create money because the calendar advanced        |
| Unapproved imports                   | Counted in the plan under the suggested category            | Land in Uncategorized until approved                       | Spec: a wrong silent category compounds; approval is explicit |
| Matching manual and imported entries | Automatic when equal; manual match keeps the bank's amount  | Suggested only, exact amount within 5 days, owner confirms | Spec: never silently merge plausible repeats                  |
| Editing history                      | Edits in place, with undo                                   | Every correction voids and appends a replacement           | Spec: accepted transactions are immutable                     |

### Gaps (YNAB has it, MyNAB does not)

| Gap                                            | YNAB behaviour                                                                                             | Impact                                     | Suggestion                                                                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Auto-Assign variants                           | Assigned last month, spent last month, average assigned, average spent, reduce overfunding, reset assigned | Monthly assigning takes more clicks        | High value: add these as one-click options next to "fund targets"                                                           |
| Matching with a different amount               | A manual entry can be matched to an import with a different amount (tips); the bank amount wins            | Tipped purchases become duplicates to void | High value: allow owner-confirmed matches with a small difference, keeping the owner's payee/category and the bank's amount |
| Age of Money                                   | Days between earning and spending money (last ten cash outflows)                                           | A motivating progress metric is missing    | Medium: add to Reports                                                                                                      |
| Automatic payee-category update rule           | Default switches when 2 of the last 3 differ                                                               | Slightly different suggestions             | Low: current "most used" rule is reasonable                                                                                 |
| Category notes, hide/reorder categories, flags | Supported                                                                                                  | Organising is less flexible                | Low/medium                                                                                                                  |
| Bulk transaction actions                       | Categorise/approve/flag many at once                                                                       | Reviewing many imports is slower           | Medium: bulk approve in import review                                                                                       |
| Multiple plans, sharing                        | Several plans; YNAB Together                                                                               | Single owner, single budget                | Out of scope (spec)                                                                                                         |
| Mobile apps                                    | Native apps                                                                                                | Responsive web only                        | Out of scope                                                                                                                |

## 4. How YNAB teaches new users

- A flexible setup checklist, one step at a time; users can leave and come back, and always
  see what is done and what is next.
- Setup order: build the category template (pre-built categories to rename), set targets for
  true expenses, add accounts (linked or by hand with today's balance), then assign money
  until Ready to Assign reaches zero.
- A single guiding question, "what does this money need to do before I'm paid again?", and a
  short set of principles (give every dollar a job, plan for irregular expenses, adjust when
  plans change, build a buffer).
- A payday routine (assign), ongoing transaction recording, and community workshops.
- A template library and a long-form get-started guide outside the app.

## 5. Proposal for MyNAB's guide (built last, in our own words)

The spec forbids copying YNAB's copy, branding or interface designs, so the guide borrows
the teaching structure, not the text.

1. **Getting started checklist** on the Budget page for new budgets: create categories
   (starter template), add accounts with today's balance or connect a bank/import a file,
   assign until Ready to Assign is zero, set a target for one irregular expense, approve your
   first imports. Each step is ticked from the ledger itself, so nothing extra is stored, and it
   can be dismissed and resumed.
2. **A /guide section**: MyNAB's own principles; the routine (payday: assign; weekly: approve
   imports and match; month end: reconcile and review reports); and task pages for credit cards,
   overspending, targets, schedules and rules, debt plans, reports and forecasts, and moving data
   in and out.
3. **Contextual help**: a short "what is this?" link beside key concepts (Ready to Assign,
   card payment reserves, Uncategorized, forecast assumptions) opening the relevant guide page.

## Sources

- [When Ready to Assign is Negative](https://support.ynab.com/en_us/when-ready-to-assign-is-negative-an-overview-HylZA0zCc)
- [Handling Credit Card Overspending](https://support.ynab.com/en_us/credit-card-overspending-an-overview-HkMGpSbJs)
- [Credit Cards with a Positive Balance](https://support.ynab.com/en_us/credit-cards-with-a-positive-balance-an-overview-By_H6uzJo)
- [Scheduled Transactions](https://support.ynab.com/en_us/scheduled-transactions-a-guide-BygrAIFA9)
- [Approving and Matching Transactions](https://support.ynab.com/en_us/approving-and-matching-transactions-a-guide-ByYNZaQ1i)
- [Categorizing Transactions](https://support.ynab.com/en_us/categorizing-transactions-a-guide-HyRl60sks)
- [How to Use Auto-Assign](https://support.ynab.com/en_us/auto-assign-a-guide-r1gBNbBJo)
- [How to Use Targets](https://support.ynab.com/en_us/how-to-use-targets-rk5kkI9ks)
- [Age of Money](https://support.ynab.com/en_us/age-of-money-H1ZS84W1s)
- [The YNAB Method](https://support.ynab.com/en_us/the-ynab-method-an-overview-SJmiqpi6j)
- [Set Up YNAB at Your Own Pace](https://www.ynab.com/whats-new/set-up-ynab-at-your-own-pace)
- [The Ultimate Get Started Guide](https://www.ynab.com/guide/the-ultimate-get-started-guide)
