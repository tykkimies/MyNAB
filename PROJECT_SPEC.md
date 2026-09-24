# MyNAB — living project specification

Status: Phases 1 and 2 are implemented; Phase 3 has working goals/debt with remaining
debt-contract gaps listed in section 18. Goals/debt covers every target type in section 7
including debt payoff and payoff by date, both strategies plus custom order, scenario
comparison, effective-dated targets and terms, promotional rate periods, and visible
completion history. Phase 4 now includes persisted schedules with explicit occurrence approval/skip and an
upcoming page. Schedule versioning, explicit existing-transaction matching and recurring suggestions are
implemented. Saved rules support editing, enable/disable, priority, previews and explicit reviewed
application with persisted tags and field protection; automatic application, worker
automation and forecasts remain incomplete. The owner brought manual Plaid ingestion forward ahead of Phase 3; Phase 5 remains
partial, with worker automation, reconnect/OAuth and durable fetch staging not implemented.
This document is the product and engineering source of truth. Read it with
NEXT_STEPS.md, DEVELOPMENT_LOG.md, README.md, migrations, and tests before working.
Update it whenever behavior, architecture, schema, or implementation status changes.
The roadmap describes intended functionality, not a claim that it exists.

## 1. Vision, philosophy, and boundaries

**Behavioural principle, set by the owner on 2026-09-23:** where a functional decision has
no strong reason to differ, match YNAB. The owner is an experienced YNAB user, and surprising
divergences cost more than they gain. Divergence is still allowed where this application's
accounting guarantees demand it, but it must be deliberate, recorded, and explained rather
than arrived at by default. The first application of this principle replaced the refusal to
over-assign with YNAB's negative Ready to Assign; see docs/PHASE2_ACCOUNTING.md.

Build an original, self-hosted, long-lived personal finance application. Only budget
money that actually exists; give every available dollar a job. The four pillars are
Budget, Accounts, Goals, and Debt. Transactions, automation, reporting, and imports
support them. A house deposit is only one possible savings goal. No housing-specific
workflow, categories, or assumptions belong in the core.

Priorities, in order: financial correctness, explainability, security, maintainability,
user ownership of data, accessibility, and polished interaction. UI state must never
be an accounting authority. Manual operation must work without any bank provider.
Implement concepts independently; do not copy commercial code, branding, assets,
copy, or interface designs.

Deployment update: owner selected `https://plexmanager.duckdns.org/mynab` through
nginx Proxy Manager on `192.168.1.7`. Version 0.1.1 adds a build-time `/mynab` base path;
APP_ORIGIN stays `https://plexmanager.duckdns.org`, and APP_BASE_PATH is `/mynab`.
The Portainer stack uses prebuilt local images and a separate operator console service.

Initial scope: USD, one owner, one initial budget, browser application, PostgreSQL,
Docker Compose on Linux behind the owner's nginx HTTPS proxy. Internal ownership
boundaries allow later multiple users/budgets. Multi-currency, native apps, tax filing,
trading, initiating real bank payments, investment advice, and business accounting
are not initial goals. MFA is optional future work by explicit owner preference.

## 2. Terminology and money

- Budget account: cash or revolving credit participating in envelopes.
- Tracking account: asset/liability included in net worth but excluded from envelopes.
- Assigned: explicit allocation to a category in a calendar month, net of moves.
- Activity: transaction effects; disclose automatic card-reserve movements separately.
- Available: remaining category spending capacity; may be negative when overspent.
- Ready to Assign (RTA): existing budget resources not assigned to any month/envelope.
- Payment reserve: existing cash allocated to pay a specific revolving credit account.
- Working balance: accepted ledger transactions including manually entered uncleared ones.
- Cleared balance: cleared/reconciled accepted ledger transactions only.
- Pending import: provisional bank observation, not yet a ledger transaction.
- Forecast: hypothetical future state, never a source of budget money.

Use signed integer cents (PostgreSQL BIGINT, TypeScript bigint). Positive cash account
values are assets; negative revolving-credit values are money owed. Display debt as
a positive amount owed with explicit labeling. API money is a canonical integer
string (e.g. "12345"), never a JSON number. USD text input is parsed without floating
point. Bounds are signed 64-bit; reject overflow. Percentages/rates use exact decimal
or rational arithmetic, with explicit cent rounding in simulations.

Financial dates are YYYY-MM-DD calendar dates; budget months are YYYY-MM. Never
convert these through UTC midnight for grouping. Audit/sync timestamps are UTC.
The budget timezone defaults to America/New_York and is stored, not inferred on each
request. Currency is constrained to USD; future conversion is a separate design.

## 3. Architecture and choices

A modular monolith: Next.js App Router + React + TypeScript, PostgreSQL, Prisma,
Zod validation, Tailwind CSS and Radix accessible primitives. npm and a lockfile
provide reproducibility. Use supported, pinned stable versions; record upgrades.

Layers:

1. app/components: presentation, request parsing, response formatting.
2. application: authorization, use cases, transactions, orchestration.
3. domain: pure money/date/accounting/goal/debt functions; no framework or ORM imports.
4. infrastructure: PostgreSQL, authentication cryptography, provider adapters, logs.

Server components may query through application services; browser components never
receive hashes, session tokens, provider credentials, or ORM models wholesale. Every
entry point checks authorization, including server-rendered pages and future APIs.
Prisma gives typed persistence and explicit migrations; SQL adds integrity constraints.
Do not use SQLite as an accounting-test substitute. Durable jobs later run in a
separate worker using the same application/domain modules and PostgreSQL job leases.
No Redis, hosted authentication, cloud database, or remote fonts required initially.

Financial writes use serializable DB transactions with bounded retry for serialization
conflicts, ownership checks, idempotency keys, audit events, and revisions. Never call
external providers while holding a financial DB transaction. Read projections may be
cached, but must be rebuildable and versioned against source data.

## 4. Ledger and budget accounting design (Phase 2)

Use double-entry journal postings beneath user-facing transactions. A journal has
at least two postings summing to zero in cents. Real accounts represent assets and
liabilities; internal contra accounts represent income, expenses, opening equity,
and adjustments. Journals are immutable after posting; corrections reverse and
replace, retaining links and a user-visible revision history. Split rows describe
category allocation and sum to the relevant transaction amount. Transfers are one
atomic journal, not two independently editable expenses.

Budget assignments are separate events: budget, month, category, signed cents,
actor, source, effective date, revision/idempotency key. A move records a balanced
pair in one transaction. Assigning does not move money between bank accounts.
Credit funding and rollovers are deterministic derived projections, not fabricated
bank transactions. Snapshot optimizations never replace source events.

### Conservation equation and definitions

At a chosen month horizon, include only accepted transactions through that horizon,
and reserve any assignments already made to later months. Let:

- C = signed total working balance of budget cash accounts.
- P = sum of positive revolving-credit account balances (spendable card assets).
- E = sum of nonnegative funded ordinary envelopes, including future reservations.
- R = sum of nonnegative card payment reserves, including future reservations.
- D = unresolved cash deficits in the current horizon (ordinary and payment categories).
- U = Ready to Assign, signed (negative means overallocated or a prior cash deficit).
  Then **C + P = U + E + R - D**.

Unfunded card spending is debt, not D, and never contributes a negative cash resource.
Negative card balances are not subtracted from C: their funded portion is already in R.
At rollover transfer cash deficit D to negative U and reset D, preserving the equation.
Unfunded card debt remains in account balances and its payment shortfall disclosure.
Positive card balance P can fund envelopes, but report it separately from withdrawable
cash; spending it reduces P before creating new revolving debt or reserve movements.
Transfers and adjustments must preserve this distinction.

Worked proofs (cents omitted for readability):

1. Opening cash 1,000: C=1,000, U=1,000. Assign groceries 400: U=600, E=400.
2. Card groceries 100: C=1,000, U=600, E=300, R=100; card balance=-100.
3. Pay card 100: C=900, U=600, E=300, R=0; card balance=0.
4. Cash groceries 450 after assigning 400: C=550, U=600, E=0, D=50.
   Next month C=550, U=550, D=0; no money is invented by resetting the category.
5. Card groceries 450 after assigning 400: C=1,000, U=600, R=400;
   debt=450, unfunded debt=50. New month retains R=400 and debt=450.
6. Opening card debt 800 with cash 1,000: U=1,000, R=0. Assign 200 to payment:
   U=800, R=200. Paying 200 leaves C=800, U=800, debt=600.
7. Cash 100 plus card credit balance 20: C+P=120. A 30 card purchase funded with
   30 reduces P by 20, creates debt 10, and moves only 10 to R; E falls by 30.

### Required invariants

Journals balance; splits equal their parent; moves preserve total assigned; all derived
balances reproduce from durable history. Funding never originates in future income,
credit limits, tracking assets, or forecasts. New assignments cannot exceed free resources
across all months. Imported spending is always recorded even when it makes a budget
negative; warn and explain the deficit rather than rejecting financial reality.

Cash takes priority over card reserve funding within each category/month. Recompute
funding from available resources after net cash activity, then allocate remaining backing
to card purchases in date/stable-ID order. Covering current overspending re-funds eligible
card purchases; subsequent cash spending can withdraw their reserves. Make this visible.
A category display includes cash deficit and credit deficit separately; do not add both
to D. Cover earlier-month card debt by assigning directly to its payment reserve.

Positive balances carry. At month close ordinary negative displays reset, cash deficits
reduce next-month RTA, and unfunded card purchases remain debt. Future assignments
are earmarks of existing money, never new resources. Backdated corrections recompute
all affected months and disclose downstream effects; never silently rewrite history.

## 5. Accounts and transactions

Account types: checking, savings, cash, credit card, line of credit, loan, mortgage,
auto loan, investment, retirement, other asset, other liability. Only cash and revolving
credit can be on-budget initially. Account records track currency, participation,
opening date, archive/closed state, linked/manual origin, and revisions.

Transaction fields: date, account, payee, signed amount, category/splits, memo,
clearance state, reconciliation link, source, imported identities, and revision.
Pending/posted is separate from uncleared/cleared/reconciled. A user-entered uncleared
transaction immediately affects working balance and budget. Pending imported records
appear separately and may show projected effects but do not increase RTA.

Opening balances use opening-equity postings. Positive cash opening balances enter RTA;
opening debt does not auto-fund payments. Cash budget-to-budget transfers have no
category or income/spending effect. Budget-to-tracking transfers need explicit category
allocation to express envelope impact; global net-worth reports eliminate both sides.
Loan payments split principal transfer from interest/fees expense. Asset valuation changes
are separate adjustment events, never earned income or budget funds.

Close accounts only at zero balance with no unresolved pending/reconciliation issues;
retain history. Archive referenced categories; moving them between groups changes
presentation, not history. Category merges need explicit migration previews and audits;
no cascade deleting financial history.

## 6. Credit cards and revolving credit

Each on-budget revolving account owns a system payment category. Users may assign
cash directly to it for old debt, interest, or reserve shortfalls. Credit limits never fund it.

- Funded purchase: spending envelope decreases, reserve increases for debt-funded portion.
- Unfunded purchase: debt increases without reserve; disclose shortfall.
- Payment: cash-to-card transfer reducing reserve, not new spending. Payment beyond its
  reserve creates cash overspending; overpayment beyond debt creates positive card P.
- Linked purchase refund: preserve attribution, but apply the monthly cash-first netting
  policy in docs/PHASE2_ACCOUNTING.md. Reserves are fungible per card, not purchase lots.
  A net debt refund restores category funds and withdraws the same reserve amount; an
  insufficient reserve is a visible funding deficit. Refund after payoff can create P.
- Unlinked refund: require explicit category attribution; flag ambiguity rather than
  pretending it is earned income. Recompute backing and reserve excess visibly.
- Statement credit/reward: liability adjustment, not cash income. E.g. debt 100 and R=100,
  credit 20 -> debt 80; release excess R=20 to U with an explained budget adjustment.
- Interest/fee: categorized expense on the credit account; funded portions reserve cash.
- Cash advance: transfer from card liability to cash; borrowed cash physically received
  increases cash/RTA but is labeled financing, not income. Advance fees are separate expense.
  Example cash 0/card 0 -> advance 100 gives C=100,U=100,debt=100,R=0.
- Positive balance: purchases first consume P. Example card +20, purchase 15 -> P=5,
  no new debt/reserve; assigned spending decreases E by 15.

Do not implement until automated examples also cover partial refunds, cross-month
refunds, refunds after payments, simultaneous cards, credit balance crossing zero,
reserve reallocation, payment overspending, and retrospective edits.

## 7. Goals and targets

Generic targets: target balance, save by date, monthly funding, spending limit, debt
payoff, debt payoff by date, maintain balance, periodic/annual expense. Store target type,
amount, optional date/cadence, category/account link, effective versions, and completion
history. Links cannot cross budgets or double-count the same backing.

Calculate progress, remaining amount, required contribution, projected completion,
and ahead/behind state. Save-by-date divides remaining need over inclusive remaining
funding months and rounds contributions up to cents. Monthly funding measures assigned
this month; balance goals measure available backing; spending limits measure net activity.
Periodic targets track each occurrence, roll to the next, and account for existing funding.
Overdue targets show remaining need now instead of dividing by zero. Goal suggestions never
assign money automatically without consent.

Implemented with versions rather than edits: a target row carries the month it takes effect
from, and a month reads the latest version effective on or before it. Completion stays
historically visible by **deriving** it — each past month is projected and the version in
force then is evaluated against it — rather than storing a flag that a later correction
could leave disagreeing with the ledger. A month before a target's first version reports no
target, because one did not exist yet. Debt payoff targets live on a card's payment
category and store no amount: what is owed is read from the ledger.

## 8. Debt planning

Store effective-dated APR, minimum payment rules/overrides, due dates, statement balances,
credit limits, and promotional-rate periods. A promotional period needs no column of its
own: it is the intro rate effective now and the go-to rate effective from the month it
ends, and the simulator charges whichever rate is in force in each month it walks through. Derive balances from the ledger, not scenarios.
Avalanche sorts effective APR descending; snowball sorts balances ascending; custom stores
explicit priority. Use stable ID tie breakers. Cover all minimums before extra payments;
report infeasible plans when the supplied budget cannot cover minimums.

Simulate monthly schedules with configurable extra monthly and dated lump-sum payments;
cap payments at remaining principal plus interest and roll released payments to the next
debt. Baseline assumption: fixed APR, monthly rate APR/12, interest rounded half-up to cents,
then end-of-month payments; future contracts can replace this approximation. Explicitly
label estimates, exclude unknown future fees, and detect negative amortization/no payoff.
Return payoff dates, total interest, principal/interest rows, and comparison deltas.
Never post scenario payments to the real ledger or count them as budget assignments.

## 9. Scheduling, rules, and forecasts

Schedules: amount, payee, account, category/splits, cadence, next occurrence, end date,
and timezone. Monthly day 29–31 clamps to month end. Occurrence keys prevent duplicates.
Scheduled income remains a plan until user approval or matched posted import; do not
create money merely because the calendar advances. Views: upcoming bills, subscriptions,
annual/monthly expenses, and expected income. Recurring detection is later suggestion-only.

Rules match payee/description, account, exact/ranged amounts; actions rename payee,
set category, memo/tag, or suggest transfer. Stable priority order, preview, explanations,
and user overrides required. Never overwrite locked user fields during re-sync. Automatic
transfer identification requires both sides and confirmation when ambiguous. Suggested
rules from repeated choices remain opt-in.

Forecasts project 1/3/6/12 months from income, bills, goals, debt, and spending assumptions.
They are versioned scenarios, visually distinct from budgets, and cannot write assignments.

## 10. Providers, ingestion, and portability

Provider interface covers capabilities, connection setup, account retrieval, normalized
transaction batches, cursor handling, disconnection, and health. ManualProvider and
FileImportProvider feed the same ingestion commands; Plaid first, SimpleFIN later.
Normalized input includes provider/connection/account IDs, external and pending IDs,
status, date, amountMinor string, currency, description/payee, and provenance.
Application commands authorize, validate, reconcile identities, and create journal revisions.
Query DTOs explicitly select safe fields; adapters never write ledger tables directly.

Plaid Link handles bank credentials; this app never receives banking passwords. Use
Sandbox during development. Encrypt access tokens; never log Link/access tokens. Stage
all /transactions/sync pages before committing changes and next cursor together. Retry
pagination mutations from the original cursor. Pending removal and posted addition can
be on different pages; match via pending_transaction_id first. Preserve user overrides.
Removed accepted imports create reviewed, audited corrections, not silent deletion.
A sync is an incremental delta: absence never means removal. Bank changes to posted entries
are persisted for owner review before any reversal. New pending observations have no
transaction or journal. Legacy pending ledger effects are flagged for explicit removal.
Suggestions never suppress importing a posted row: both entries remain visible until the
owner joins them. Matched manual entries keep their chosen categories. Confirmed transfer
pairs use the outgoing date for both account legs, disclosed before confirmation.
Each sync claim has a random lease token, checked with the original cursor under the same
serializable budget lock as manual mutations. A stale request cannot release a newer lease.
Linking a new account resets the fetch cursor for identity-deduplicated replay; imported
history cannot be moved to a different account by changing its link.

Unique external identity per provider connection/account; imports have batch/file hashes
and row identities. Reimport is idempotent. Date/amount/payee fingerprints propose manual
matches but do not silently merge plausible repeated purchases. Changed pending amounts
(e.g. tips) are allowed; ambiguous fallback matches stay in review. Retry/backoff, last
success, actionable error status, reconnect, and per-connection exclusion locks required.

CSV import includes mapping, date/amount preview, validation, dry run, and batch undo.
QFX/OFX use maintained parsers with file/record limits and no external entity resolution.
Existing budgeting exports are future adapters. Export transactions, accounts, categories,
assignments, goals, schedules, rules, and configuration to versioned JSON plus convenient
CSV tables. Escape spreadsheet formulas in CSV exports. Portable export omits reusable
secrets by default and is distinct from an encrypted operational backup.

## 11. Reconciliation, reports, and auditability

Reconciliation freezes a cleared-transaction set, statement date, observed balance,
computed balance, actor, and timestamp. Show uncleared, missing, duplicated, or mismatched
items. Only explicit adjustments can close a difference. Editing reconciled transactions
requires an explicit correction and marks the reconciliation affected; never rewrite it.

Reports: spending by category/payee/time, income vs expense, cash flow, net worth,
savings rate, debt balances/payoff/interest, account balances, category trends, and goal
progress. Date filters and custom/prior month/prior year comparisons share one query layer.
Distinguish consumption, cash movement, financing, and valuations. Exclude internal transfers
from income/expense; loan principal is cash outflow but not interest expense. Define savings
rate as (earned income - consumption expense)/earned income, exclude financing/valuation,
and show unavailable when denominator <=0. Explain category filters and refund treatment.

Audit events record actor, action, time, entity/revision, source, reason, and correlation ID.
Financial histories retain safe structured change metadata; never provider tokens, raw
passwords, session cookies, or unrestricted request payloads. Phase 1 auth logs use an
allowlist of event codes and opaque entity IDs. Avoid hard deletion of users with history.

## 12. Authentication and security

One owner bootstrapped via server command; no public registration. Argon2id hashes,
strong passphrases, bounded input, and no password arguments in shell history. Server-side
password reset revokes every session. MFA and email recovery are deferred intentionally.

Opaque random 256-bit session tokens; only SHA-256 token digests in PostgreSQL. HttpOnly,
SameSite=Lax cookies, Secure and __Host- prefix under HTTPS, Path=/, no Domain. Absolute
7-day expiry, 24-hour idle expiry, rotation on login, revocation on logout/reset. Protect
all writes with exact configured Origin validation and reject cross-site Fetch Metadata;
GET never mutates financial/account data. Login is CSRF protected too.

DB-backed global and per-username fixed-window throttling limits hashing work; hash limiter
keys, no dependence on attacker-supplied X-Forwarded-For. Forwarded host/proto never define
canonical origin. Set APP_ORIGIN explicitly; production requires HTTPS. Nginx must overwrite
forwarded headers, cap bodies, and expose only the app port. DB stays private.

CSP with per-response script nonce, no framing, same-origin assets/connections; allow inline
styles for UI primitives and development-only eval for tooling. Set nosniff, referrer policy,
permissions policy, and HSTS for HTTPS. Financial/auth responses are private/no-store.
Validate every boundary; authorization is checked server-side, not just in navigation.

Provider secret encryption: AES-256-GCM with random nonce, versioned envelope, and contextual
AAD binding to connection identity. 32-byte key from environment, not DB. Backup key separately;
loss makes provider secrets unrecoverable (re-link required). Rotation requires decrypt/re-encrypt
migration before retiring old keys. No production tokens exist in Phase 1.

Dependency audit in CI; review fixes and exceptions. No credentials, .env, financial imports,
or backups in Git. Operational logs must not serialize requests/errors indiscriminately.

## 13. Deployment, backup, and recovery

Multi-stage non-root Docker image; app, one-shot migration, and PostgreSQL services. App
starts after successful migrations and healthy DB. Persistent volume; no database host port.
Use an external nginx network override, or bind app to loopback for host nginx. Existing
reverse proxy supplies TLS. No live production deployment is part of initial development.

Liveness checks process health; readiness runs a bounded DB query and checks migration
compatibility. Responses disclose only status. Graceful restarts do not lose sessions/jobs.
Migration failures must block app startup; never auto-reset a production database.

Nightly pg_dump custom-format consistent snapshots; restricted directory/file permissions.
Encrypt backups before off-host transfer using an operator-controlled tool/key (e.g. age).
Suggested retention: 7 daily and 4 weekly, adjusted to storage needs. Back up environment
secrets separately in a password manager, especially encryption keys. Never place dumps
under a public directory or commit them. A usable backup needs a tested restore.

Restore into a fresh database with app stopped, matching app version and preserved secrets.
Verify migration status, readiness, login, counts, and sample financial reconciliation before
switching traffic. Test quarterly and before major upgrades. Phase 1 ships dump/restore
commands and a synthetic roundtrip test; Phase 7 adds user-facing exports and automation.

## 14. Development phases and gates

0. Specification: terminology, choices, full intended model, invariants, roadmap, handoff.
1. Foundation: schema/auth/domain primitives/shell/Compose/CI/backup. No real balances UI.
2. Manual system: accounts, categories, splits, ledger, allocations, transfers, cards,
   reconciliation. No live bank sync before invariant tests pass.
3. Goals/debt: all target types, strategies, schedules, scenario comparison.
4. Automation: schedules, deterministic rules, transparent recurring suggestions.
5. Bank integration: abstraction, Plaid Sandbox Link/sync, idempotency, matching, health.
6. Reports: common report semantics, filters, comparisons, explainable drilldown.
7. Portability/resilience: CSV/QFX/OFX, versioned full export, backup/restore UX.
8. Polish: mobile, accessibility, performance, notifications, advanced reports/forecasts.

Basic backup/restore and security are Phase 1 obligations, not deferred to Phase 7.
Each phase ends with tested behavior, updated documentation, and logical commits.

## 15. Test strategy and acceptance

Phase 1: unit/property tests for exact money/date validation, encryption tampering/AAD,
config safety, log redaction, sessions/cookies/origin policies. PostgreSQL integration
covers bootstrap, duplicate owner, hashes, good/bad login, throttling under concurrency,
expiry/logout/reset invalidation, authorization, membership, atomic audit records, constraints.
Browser tests cover login, protected routes, CSRF, keyboard navigation, themes, mobile shell,
security headers, and readiness. Build/lint/typecheck/audit plus clean install are required.
Compose persistence and backup/restore require an actual Docker host; record skipped checks.

Before Phase 2, implement example and property tests for journal conservation, allocation
conservation, cash backing, idempotency, and replay determinism. Matrix includes income,
assignments/moves, future reservations, rollover, cash/card/mixed overspending, refunds,
transfers crossing participation boundaries, cards on multiple accounts, opening debt,
interest/fees/advances, positive credit balance, partial/overpayments, reconciliation,
splits, deduplication, pending replacements, backdated edits, category archival/moves,
and account closure. Generate randomized event sequences and compare incremental state
with full replay. Concurrent writes must not double-spend budget availability.

## 16. Initial schema contract

Phase 1 physical tables:

- User: UUID, unique normalized username, passwordHash, authVersion, timestamps.
- Installation: singleton key and unique owner reference; serialize owner bootstrap.
- Budget: UUID, name, USD currency, IANA timezone, timestamps.
- BudgetMember: composite budget/user key, owner role; explicit authorization boundary.
- Session: tokenHash primary key, user reference, authVersion, created/lastSeen/expiry.
- LoginThrottle: hashed key, window start, attempt count; concurrent atomic increment.
- AuditEvent: UUID, nullable actor/budget, allowlisted action, safe entity ID, timestamp.

Planned Phase 2 entities described above are not empty migrated tables. Add them only with
their constraints, commands, tests, and migration plan. Cross-budget references must be
prevented by composite foreign keys, not only service checks. Financial journal balancing
requires deferred constraint triggers or an equivalent transaction-enforced posting API;
choose and document the final SQL implementation before the first ledger migration.

## 17. Known decisions, risks, and open questions

Confirmed by owner: USD only, cash/debt distinction, password login without MFA, home LAN
plus nginx internet access. MyNAB is the working name. No Git remote is assumed.

Main risks: card edge-case complexity; historical replay cost; conflicting imports/user edits;
provider production access and cost; exposure of financial data/backups; backup key loss;
debt estimates differing from institution interest contracts. Mitigate with explicit examples,
property tests, immutable lineage, manual fallback, secure deployment, and restored backups.

Deferred questions (not Phase 1 blockers): Plaid production eligibility/cost; owner-selected
institution scope; household sharing permissions; portable export compatibility; notifications
channel; variable-rate debt modeling. Actual nginx hostname/network and deployment secrets
are operator configuration, never invented or committed.

## 18. Implementation status and immediate tasks

The current baseline is 0.3.8 (e98f3fa), with unreleased rule and UI changes. The previous deployment handoff records that
0.3.7 was running after the redesign and 0.3.8 images were built; this turn did not access
production or independently verify that state.
Foundation, manual ledger/budgeting, explicit bank sync/review, goals, effective-dated
targets/terms and debt payoff scenarios are implemented. The review repaired avalanche
ordering across promotional rate changes, same-month reuse of unused final minimums,
and monthly debt-target double subtraction near payoff.

Debt projections currently vary APR by effective month but keep starting minimum payments
constant. Percentage-based minimum rules, a separate affordability cap and statement-balance
capture remain gaps against section 8. Do not call the full intended Phase 3 contract complete.
The simulator's infeasible flag describes unresolved non-amortization, not an entered total
payment budget. Scenarios never write to the ledger.

Phase 4 now persists schedules and their category splits, exposes an upcoming page under
Accounts, and supports creation, archival/restoration, explicit approval and skipping.
Approval converts the stored template into the existing transaction command inside the
same serializable, budget-locked transaction; the occurrence row, ledger and audit commit
together. A unique schedule/date key protects against duplicate concurrent approvals.
Skipped occurrences create no journal. Schedule creation never changes balances.
Referenced accounts/categories and approved ledger links have composite budget ownership FKs.

Original date anchors survive month-end clamping; date windows/end dates are inclusive,
intervals are positive integers, and expansion is bounded. The upcoming view defaults to
90 days and supports custom windows including overdue occurrences. Approval cannot post a
future budget date. The stored timezone is validated; dates are explicitly chosen calendar
dates. An occurrence is due only once its date has arrived in the schedule's own timezone
and in the budget's (the ledger never receives a future date). An overdue summary counts
unhandled due occurrences from the past year whatever window is shown. Recurring suggestions
can be dismissed and restored (RecurringDismissal, migration 202609250001; no ledger effect).
No durable automatic posting exists.
Suggested rules are opt-in: the Rules page proposes an EXACT payee → category rule only when
the owner filed that normalised payee to one spendable category at least three times without
exception (voided entries excluded) and no existing rule's payee condition covers it.
Schedule edits create a linked successor starting today or later, truncate the previous
version's future dates, and reject edits that cross already-handled occurrences. Earlier
versions and their splits remain intact. A revision number rejects stale edits; replaced
versions cannot be restored to produce duplicate future occurrences.

Explicit matching links an unvoided existing transaction of the same account, destination,
type and exact amount within seven calendar days. A unique transaction link prevents reuse
across occurrences. Matching changes neither categories nor journals. Archived schedules'
handled history remains visible; a corrected/voided linked entry is flagged without reopening
its occurrence. Queries cover at most one year, 2,000 occurrences and 500 candidate transactions;
truncated candidate searches are disclosed with a request to narrow the range.

Recurring suggestions require at least three same-payee/account/direction entries fitting
weekly, fortnightly, monthly, quarterly, half-yearly or annual cadence within two days and
20% of the median amount. Transfers, voided entries and irregular groups are excluded.
Evidence and editable defaults are presented before explicit schedule creation. Suggestions
never create transactions. Rule previews are pure and tested: original-input predicates,
stable priority/ID order, first matching writer per field, locked fields untouched, and
transfer actions remain suggestions. Saved rule CRUD uses the same authorized, audited, idempotent budget command boundary.
Rules have optimistic revisions, composite ownership references, exact BIGINT amount ranges,
validated conditions/actions and stable ordering. The new Accounts → Rules page previews
proposed fields against a chosen recent transaction without changing it. Multi-split category
choices remain protected in previews. Explicit application is implemented: TransactionPreference persists tags, protected fields
and a revision per transaction. Manual entries start fully protected; unapproved imports start
unprotected. The owner unlocks fields, reviews a fingerprinted preview (rules, transaction,
splits, preference, cleared/reconciled state) and applies it as a reversal/replacement that
keeps date, amount and cleared state. Stale fingerprints, pending bank-change reviews,
transfer suggestions and no-op changes are refused; reconciled history needs acknowledgment.
Tags and protection carry across manual and ingested replacements. Import review pre-fills
an enabled rule's unprotected, spendable category ahead of payee memory, names the rule and
links other proposed changes to the Rules preview. Rules never run automatically; worker lifecycle remains unfinished.

Fifteen migrations are required through `202609240004_transaction_preferences`, which adds
TransactionPreference with one composite ownership reference (39 in total); existing ledger
rows are unchanged.
This work is an unreleased continuation of 0.3.8. No new images or production deployment
are claimed. Preserve composite ownership FKs when generating future migrations.
Before release, back up the database and preserve the encryption key separately; build a new
image tag and paste the entire Portainer YAML with re-pull disabled.

Design continuation: retain the Warm Editorial Finance typography, Tailwind token system,
derived dark palette and prior contrast repairs. The owner prefers fewer competing colors
and compact editing surfaces. Repeated inline actions use neutral outlined buttons; forest
is retained for primary CTAs and meaningful budget state. Category/group management uses
responsive grids with direct inline group renaming. Mobile controls have 44px minimum
heights. Shared base/controls styles remain layered; do not undo independent button/hero
foreground/background tokens. Visual contrast checks now assert rather than merely report
failures, but skip gradients and unparseable colors and are not a full accessibility audit.

Next: finish Phase 4 (worker lifecycle, close debt-contract gaps, then complete every
remaining phase and its release gates. No current source images have been built or deployed.

## References consulted

- Next.js self-hosting: https://nextjs.org/docs/app/guides/self-hosting
- Next.js CSP: https://nextjs.org/docs/app/guides/content-security-policy
- Prisma transactions: https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions
- Plaid incremental sync: https://plaid.com/docs/transactions/sync-migration/
- Plaid transaction states: https://plaid.com/docs/transactions/transactions-data/
- OWASP password storage: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP sessions: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- YNAB rollover (concept reference only): https://support.ynab.com/en_us/when-the-month-rolls-over-a-guide-rkyyd6qC9
