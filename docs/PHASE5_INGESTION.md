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
