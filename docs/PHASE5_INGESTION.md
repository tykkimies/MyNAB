# Phase 5 ingestion contract

This document supplements PROJECT_SPEC.md sections 3, 10, 11 and 12. These decisions
precede the Phase 5 schema, commands and provider adapters, in the same way
PHASE2_ACCOUNTING.md preceded the ledger.

Plaid is the first provider, in Sandbox. The owner supplies credentials; none are invented
or committed. Everything below is provider-agnostic: ManualProvider and FileImportProvider
feed the same ingestion commands, so adding CSV and QFX/OFX later adds a parser, not a
second ingestion path.

## Boundary between provider and ledger

Adapters never write ledger tables. An adapter's only output is a normalized batch:
provider, connection, external account ID, external transaction ID, optional pending ID,
status, date, `amountMinor` as a signed string, currency, description/payee, and provenance.
Ingestion commands authorize budget membership, validate, reconcile identity, and then use
the Phase 2 command layer so that every imported entry is an ordinary balanced journal with
the same constraints, audit rows and revision counter as a hand-entered one.

External calls never happen inside a financial transaction. A sync runs in three stages:
fetch every page into staging outside any ledger transaction; compute the decisions; then
commit the ledger changes, the staging outcome and the next cursor together in one
SERIALIZABLE transaction. A sync interrupted before that commit changes nothing and is
retried from the original cursor. A per-connection lock prevents concurrent syncs.

## Identity and idempotency

Identity is `(connectionId, externalId)`, unique. Reimporting a batch is a no-op for rows
whose content is unchanged, so retries and overlapping cursors are safe. Import batches
carry a batch hash, and file imports additionally carry a file hash and per-row identity,
so re-uploading the same file changes nothing.

A pending entry carries `pendingExternalId`. When a posted entry arrives, match it to its
pending entry by `pendingExternalId` first, and only then by fingerprint. Pending and posted
can arrive on different pages of the same sync, so matching happens after all pages are
staged, never page by page. A changed amount between pending and posted is expected, for
example a tip, and updates the entry in place because a pending entry was never a statement
fact. An ambiguous fallback match is never applied silently; it goes to review.

Once an entry is posted and accepted it is immutable, exactly like any other accepted
transaction. A later provider change to a posted entry, including removal, appends an
audited correction with a reversing journal and lineage. Imports never silently delete or
rewrite ledger history. A correction of reconciled data still requires acknowledgment and
marks the reconciliation affected.

## Matching against existing manual entries

The owner may already have entered a transaction that the bank then delivers. A
date/amount/payee fingerprint within a bounded date window proposes a match; it never merges
automatically, because plausible repeated purchases are common and a wrong merge destroys a
real record. Proposals are presented for a decision: link, or keep both. Declining is
remembered for that external ID so the same proposal does not reappear. User overrides
always survive a later sync.

## Uncategorized imports and budget truth

An imported transaction posts to the ledger immediately and is marked unapproved until the
owner reviews it. Account balances therefore stay truthful and reconcilable from the moment
of import, which is the point of importing at all.

A bank file carries no envelope information, so spending on a budget account imports into a
system `Uncategorized` category. It behaves as an ordinary spending category: it is not a
payment category, it cannot be archived while unapproved entries remain, and money spent
from it that was never assigned shows as overspending. This follows Phase 2's rule that
transactions record financial reality even when they create deficits. Approving an entry is
what assigns it a real category; it is not what makes it real.

Transfers between two linked accounts appear once from each side. Detect the pair by
opposing amount, date proximity and both accounts being linked, and propose a single
transfer rather than two categorized entries. Unconfirmed pairs stay in review; a wrongly
merged transfer is worse than two entries the owner joins deliberately.

## Connections, accounts and health

A connection stores institution identity, status, cursor, last successful sync, and an
actionable error state. An external account is linked to at most one `FinancialAccount`, and
an account may be linked to at most one external account. Linking is explicit: discovering
accounts never creates budget accounts, because participation and type are owner decisions
that are immutable afterwards. Unlinked external accounts are ignored entirely, not synced.

Opening balance is not imported. A newly linked account starts from an owner-entered opening
balance and an owner-chosen start date; earlier provider history is not backfilled into the
budget, because inventing months of unassigned history would corrupt envelope rollover.

Retry uses bounded backoff. A connection that needs the owner's attention says so plainly
and stops retrying rather than failing silently in a loop.

## Secrets

Plaid Link handles institution credentials; this application never receives a banking
password. Access tokens are encrypted with AES-256-GCM using the existing versioned envelope
and a contextual AAD of the connection ID, and are stored only in that form. Link tokens are
short-lived and never persisted. No token, public token or item ID is ever logged, included
in an error message, or returned to the browser. Provider requests log outcome and timing
only. `SECRET_ENCRYPTION_KEY` loss makes tokens unrecoverable and requires re-linking; this
is documented rather than mitigated, since the alternative is a recoverable key.

Sandbox and production credentials are configuration, never defaults. The application
refuses to start with a Plaid environment it does not recognize, and never silently falls
back from production to sandbox.

## Test gate

Before any provider adapter is wired to real HTTP: a stub provider and generated tests for
identity uniqueness, repeated and overlapping batches, pending to posted across pages,
changed pending amounts, provider removal producing corrections, fingerprint proposals
without silent merging, declined proposals staying declined, transfer pair detection,
unlinked accounts being ignored, and cursor commit atomicity including an interrupted sync
changing nothing. Then real PostgreSQL tests for per-connection locking, concurrent sync
attempts, cross-budget authorization, token encryption round-trips and tamper rejection,
and correction lineage through reconciliation.

Only then the Plaid adapter against Sandbox, with recorded fixtures so the suite does not
depend on network access. No production provider access, real institution credentials, or
production deployment is performed automatically by this development work.

## 0.3.1 implementation corrections (2026-09-23)

This section supersedes any earlier implementation claim in this contract. Sync batches
are deltas, not complete snapshots: only the explicit removed-ID list can withdraw a known
observation. Empty/partial deltas leave prior rows alone. The planner fetches no data itself.

New pending observations have a nullable transaction link and never create journals,
cleared states, category activity or RTA on sync. As in YNAB, the registers list them
in a greyed, collapsible "Pending at the bank" section above the ledger, outside every
balance; the owner may **enter one now** (`entry.enter`), which writes it as an
uncleared, approved transaction with a category, or their own manual entry may match it
at the pending stage. When the bank posts such a row, the ledger row clears in place
(same amount) or takes the bank's amount while keeping the owner's category, memo and
flag (different amount); a reconciled row, a transfer or a change of direction goes to
review instead. Untouched pending rows still post as new unapproved imports. Promotion may arrive with pending removal on
another page; it creates one posted transaction. A same-batch pending row superseded by
that posted identity is not independently accepted. Removed observations are retained as
identities, not deleted. Older pending transactions are marked for explicit corrective
review by the additive migration; their financial history is not silently rewritten.

Posted imports are persisted even when possible matches exist. The connections page shows
manual and transfer proposals, with both account/date/amount/payee descriptions. No match
is automatic; keep-separate decisions persist. Matching a manual entry reverses the duplicate
import and retains the manual entry/category. Joining two imports reverses both originals
and appends one transfer dated on its outgoing leg, with two independent cleared states.
Each external identity then references that transfer. Both balances temporarily include
unconfirmed duplicate imports until the owner resolves them; the UI explains this.

Bank changes/removals to accepted rows are versioned review proposals, committed with the
cursor. Accepting them appends a reversal/replacement; keeping one's ledger updates only the
provider baseline so the proposal does not recur. Applying a changed expense deliberately
returns it to Uncategorized for fresh review. Reconciled corrections require a checked
acknowledgment. Matched transfers must be corrected together in the register before keeping
the manual result; changing just one provider side cannot safely rewrite a whole transfer.

Commands serialize on the budget row with bounded serialization retry. A random sync lease
token is checked with the original cursor when committing fetched data. Failure cleanup is
conditional on that token; stale requests cannot release newer leases or revive disconnections.
Adding a newly linked account resets the cursor to replay history through existing identity
and date filters. Existing account links cannot be reassigned underneath imported history.

Implemented fetching stages pages in bounded memory, not a durable ImportBatch table.
Pagination mutation retries restart at the original cursor up to three total attempts.
Worker jobs, background retries, reauthentication Link and OAuth redirect completion were
added on 2026-09-24 (see PROJECT_SPEC section 18); webhooks remain out of scope because the
worker syncs periodically. The provider adapter supports configured Sandbox or Production; tests
use fixtures and an in-process stub, never production credentials.
