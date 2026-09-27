import Link from "next/link";
import { DETAILS_DRAWER } from "@/components/drawer";
import { DetailsClose } from "@/components/details-close";
import { EnterNow } from "@/components/pending-entries";
import { readReview } from "@/application/ingestion";
import { connectionsPage } from "@/application/finance-page";
import {
  ConnectBank,
  ProviderAction,
  ProviderSelect,
  BulkApprove,
} from "@/components/provider-link";
import { formatUSD, money } from "@/domain/money";
import { getConfig, plaidConfigured } from "@/infrastructure/config";
import { Amount } from "@/components/amount";
import { formatDate } from "@/domain/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Notice, NoticeList } from "@/components/ui/notice";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { Help } from "@/components/ui/help";

const usd = (n: bigint) => formatUSD(money(n));
const MUTED = "text-table text-ink-2";
const LINK = "link";
// The review line: date · payee with its account beneath · amount · state.
const REVIEW_COLUMNS = "sm:grid-cols-[5.5rem_minmax(0,1fr)_7rem_5.5rem]";
const REVIEW_SUMMARY = `grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2 text-table transition-colors hover:bg-row-hover lg:px-6 ${REVIEW_COLUMNS}`;

export default async function Connections() {
  const configured = plaidConfigured(getConfig());
  // A billed Plaid add-on: offered only when the owner turned it on.
  const refreshable = configured && getConfig().PLAID_REFRESH === "on";
  const s = await connectionsPage();
  const day = (value: Date) => formatDate(value, s.budget.dateFormat);
  const unlinked = s.providerAccounts.filter((p) => !p.accountId);
  const linkable = s.accounts.filter(
    (a) =>
      !a.closed && !s.providerAccounts.some((p) => p.accountId === a.id),
  );
  const spendable = s.categories
    .filter((c) => !c.paymentAccountId && !c.system)
    .map((c) => ({ id: c.id, name: c.name }));
  const accountName = (id: string) =>
    s.accounts.find((a) => a.id === id)?.name ?? "Unknown account";
  const live = s.connections.some((c) => c.status !== "DISCONNECTED");
  const notices =
    !configured ||
    (configured && live && !s.worker.running) ||
    (s.connections.length > 0 && !s.accounts.length);

  return (
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        breadcrumb={[{ href: "/accounts", label: "Accounts" }]}
        title="Bank sync"
        meta={
          configured && live && s.worker.running
            ? `Automatic sync about every ${s.worker.intervalHours} hours; imports wait for your review`
            : "Imported spending waits for your review"
        }
        actions={
          <>
            {configured && <ConnectBank />}
            <Help label="About bank sync" align="right">
              Your bank credentials go to Plaid, never to MyNAB: Plaid collects
              your sign-in and returns only a token. Like YNAB, a linked account
              starts from your bank’s balance on the day you link it and
              imports every transaction after that, so there is no starting
              balance to type and older history is never counted twice. Only
              linked accounts are synced. Plaid pulls from each bank one to
              four times a day, pending charges included; Sync now reads what
              it has pulled so far.
            </Help>
          </>
        }
      />
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        {notices && (
          <div className="mt-4">
            <NoticeList>
              {!configured && (
                <Notice tone="warning">
                  <strong>Bank sync is not configured.</strong> Set
                  PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV on the server,
                  then restart. Without all three, MyNAB runs with no provider
                  at all.
                </Notice>
              )}
              {configured && live && !s.worker.running && (
                <Notice tone="warning">
                  <strong>Automatic sync is off.</strong> The background worker
                  is not running
                  {s.worker.seenAt ? ` (last seen ${day(s.worker.seenAt)})` : ""}.
                  Use Sync now, or start the worker service on the server.
                </Notice>
              )}
              {s.connections.length > 0 && !s.accounts.length && (
                <Notice
                  tone="warning"
                  action={
                    <Link className="btn btn-secondary btn-sm" href="/accounts">
                      Add an account
                    </Link>
                  }
                >
                  <strong>Create your accounts before linking.</strong> Your
                  bank is connected, but this budget has no accounts yet, so
                  there is nothing to link to. Add one for each account you
                  want to sync, using the balance your bank shows today.
                </Notice>
              )}
            </NoticeList>
          </div>
        )}

        {s.connections.map((connection) => {
          const owned = s.providerAccounts.filter(
            (p) => p.connectionId === connection.id,
          );
          const removed = connection.status === "DISCONNECTED";
          return (
            <section
              className="surface mt-4"
              key={connection.id}
              aria-labelledby={`connection-${connection.id}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 lg:px-6">
                <span className="flex items-baseline gap-2">
                  <h2 id={`connection-${connection.id}`} className="section-title">
                    {connection.institutionName}
                  </h2>
                  <span className="text-meta text-ink-3">
                    {removed
                      ? "Disconnected; imported history is kept"
                      : connection.lastSyncedAt
                        ? `Last synced ${day(connection.lastSyncedAt)}`
                        : "Not synced yet"}
                  </span>
                </span>
                {!removed && (
                  <span className="flex flex-wrap items-center gap-2">
                    <ProviderAction
                      command={{ type: "sync", connectionId: connection.id }}
                      label="Sync now"
                      busyLabel="Syncing…"
                      secondary
                    />
                    {refreshable && (
                    <ProviderAction
                      command={{ type: "refresh", connectionId: connection.id }}
                      label="Refresh from bank"
                      busyLabel="Asking the bank…"
                      secondary
                      confirm={`Ask Plaid to fetch fresh data from ${connection.institutionName} now? Sync now only reads what Plaid already pulled (one to four times a day); this fetches today's charges, pending ones included, within a few minutes. Plaid bills each refresh.`}
                    />
                    )}
                    <ProviderAction
                      command={{ type: "disconnect", connectionId: connection.id }}
                      label="Disconnect"
                      secondary
                      confirm={`Disconnect ${connection.institutionName}? Imported transactions are kept, but no new ones will arrive.`}
                    />
                  </span>
                )}
              </div>
              {connection.status === "ERROR" && (
                <div className="px-4 pb-2 lg:px-6">
                  <Notice
                    tone="warning"
                    action={
                      connection.errorCode === "REAUTH_REQUIRED" && configured ? (
                        <ConnectBank
                          connectionId={connection.id}
                          label="Sign in again"
                        />
                      ) : undefined
                    }
                  >
                    <strong>This connection needs attention.</strong>{" "}
                    {connection.errorCode === "REAUTH_REQUIRED"
                      ? "Your bank needs you to sign in again before syncing can continue. Automatic sync is paused until you do; your history and links stay as they are."
                      : "The institution could not be reached last time. Try syncing again."}
                  </Notice>
                </div>
              )}
              <div
                className="max-sm:overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label={`${connection.institutionName} accounts`}
              >
                <table className="ledger">
                  <caption className="sr-only">
                    Accounts at {connection.institutionName}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">At your bank</th>
                      <th scope="col">In MyNAB</th>
                      <th scope="col">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {owned.map((provider) => (
                      <tr key={provider.id}>
                        <th scope="row">
                          {provider.name}
                          <span className="ledger-sub uppercase">
                            {provider.type}
                            {provider.mask ? ` ····${provider.mask}` : ""}
                          </span>
                        </th>
                        <td className="text-ink">
                          {provider.accountId ? (
                            <Link
                              className={LINK}
                              href={`/accounts/${provider.accountId}`}
                            >
                              {accountName(provider.accountId)}
                            </Link>
                          ) : (
                            <span className="text-ink-3">Not linked</span>
                          )}
                        </td>
                        <td className="py-2 text-ink-2">
                          {provider.accountId ? (
                            <>
                              <Pill tone="positive">Linked</Pill>
                              {/* A standing status, not work in progress: say
                                  what will import rather than implying
                                  something is happening right now. */}
                              <span className="ledger-sub">
                                {provider.linkedFrom
                                  ? `Imports transactions dated after ${day(provider.linkedFrom)}`
                                  : "Imports from the account's opening balance"}
                              </span>
                            </>
                          ) : removed ? (
                            <span className="text-ink-3">&mdash;</span>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <ProviderAction
                                command={{
                                  type: "account.create_linked",
                                  providerAccountId: provider.id,
                                }}
                                label="Add to MyNAB"
                                busyLabel="Adding…"
                              />
                              <span className="text-meta text-ink-3">
                                Creates the account with your bank&rsquo;s
                                current balance and imports from today.
                              </span>
                              {linkable.length > 0 && (
                                <ProviderSelect
                                  command={{
                                    type: "account.link",
                                    providerAccountId: provider.id,
                                  }}
                                  field="accountId"
                                  options={linkable.map((a) => ({
                                    id: a.id,
                                    name: a.name,
                                  }))}
                                  label={`Or link ${provider.name} to an existing account`}
                                  action="Link"
                                />
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        {unlinked.length > 0 && (
          <p className={`mt-2 ${MUTED}`}>
            {unlinked.length} discovered account
            {unlinked.length === 1 ? " is" : "s are"} not linked and will be
            ignored entirely.
          </p>
        )}

        <section className="surface mt-4" aria-labelledby="duplicates-heading">
          <div className="flex items-center justify-between gap-2 px-4 py-2 lg:px-6">
            <h2 id="duplicates-heading" className="section-title">
              Possible duplicates and transfers ({s.proposals.length})
            </h2>
            <Help label="About duplicates and transfers" align="right">
              Both posted entries affect balances until you confirm a match.
              Compare the account, amount and date first. A transfer uses the
              outflow date for both account legs.
            </Help>
          </div>
          {s.proposals.length === 0 ? (
            <EmptyState title="Nothing looks duplicated." />
          ) : (
            <ul className="border-t border-hairline">
              {s.proposals.map((p, i) => (
                <li
                  className="flex flex-col gap-2 border-b border-hairline px-4 py-2 last:border-b-0 lg:px-6"
                  key={`${p.entryId}-${i}`}
                >
                  <span className="min-w-0">
                    <span className="block text-table font-medium text-ink">
                      {p.sourceLabel}
                    </span>
                    <span className="ledger-sub">
                      {p.label} ·{" "}
                      {p.otherEntryId ? "Possible transfer" : "Possible manual match"}
                    </span>
                  </span>
                  {/* Left-aligned, so an open review drawer never covers them. */}
                  <span className="flex flex-wrap items-start gap-2 lg:max-w-[calc(100%-28rem)]">
                    <ProviderAction
                      command={{
                        type: "match.resolve",
                        entryId: p.entryId,
                        transactionId: p.transactionId,
                        otherEntryId: p.otherEntryId,
                      }}
                      label={p.otherEntryId ? "Join as transfer" : "Match manual entry"}
                      acknowledgement
                      confirm="Confirm these represent the same movement of money? The duplicate imported entry will be reversed; history is retained."
                    />
                    <ProviderAction
                      command={{
                        type: "match.resolve",
                        entryId: p.entryId,
                        decline: true,
                      }}
                      label="Keep separate"
                      secondary
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="surface mt-4" aria-labelledby="review-heading">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 lg:px-6">
            <h2 id="review-heading" className="section-title">
              Needs review ({s.entries.length})
            </h2>
            <BulkApprove
              entryIds={s.entries
                .filter(
                  (e) =>
                    !e.approved &&
                    !e.review &&
                    e.status === "POSTED" &&
                    e.transactionId,
                )
                .map((e) => e.id)}
            />
          </div>
          {!s.entries.length && (
            <EmptyState title="Nothing waiting.">
              Imported transactions appear here until you approve them.
            </EmptyState>
          )}
          {s.entries.length > 0 && (
            <div
              className={`hidden gap-x-3 border-y border-hairline bg-surface-sunken px-4 py-1.5 text-caps uppercase text-ink-3 sm:grid lg:px-6 ${REVIEW_COLUMNS}`}
              aria-hidden
            >
              <span>Date</span>
              <span>Payee</span>
              <span className="text-right">Amount</span>
              <span className="text-right">State</span>
            </div>
          )}
          {s.entries.map((entry) => {
            const review = readReview(entry.review);
            return (
              <details
                className="register-row border-b border-hairline last:border-b-0 [&[open]>summary]:bg-row-selected"
                key={entry.id}
                name="review-entry"
              >
                <summary className={REVIEW_SUMMARY}>
                  <span className="hidden text-num font-normal text-ink-2 sm:block">
                    {day(entry.date)}
                  </span>
                  <span className="order-first col-span-2 min-w-0 truncate font-medium text-ink sm:order-none sm:col-span-1">
                    {entry.payee || "No payee"}
                    <span className="block truncate text-meta font-normal text-ink-3">
                      <span className="sm:hidden">{day(entry.date)} · </span>
                      {accountName(entry.accountId)}
                      {entry.status === "PENDING" ? " · Pending" : ""}
                      {entry.amount < 0n && entry.status === "POSTED" && !review
                        ? ` · ${entry.currentCategoryId ? (s.categories.find((c) => c.id === entry.currentCategoryId)?.name ?? "") : "Uncategorized"}`
                        : ""}
                    </span>
                  </span>
                  <span
                    className={`text-right text-num ${entry.amount < 0n ? "text-negative" : "text-ink"}`}
                  >
                    <Amount>{usd(entry.amount)}</Amount>
                  </span>
                  <span className="hidden text-right text-caps uppercase text-ink-3 sm:block">
                    {entry.status === "PENDING" && !review ? "Pending" : "Review"}
                  </span>
                </summary>
                <div
                  className={`flex flex-col gap-4 border-t border-hairline px-4 py-3 text-table text-ink-2 lg:px-6 ${DETAILS_DRAWER}`}
                >
                  <div className="hidden items-start justify-between gap-2 border-b border-hairline pb-2 md:flex">
                    <span className="text-caps uppercase text-ink-3">
                      Review imported transaction
                    </span>
                    <DetailsClose />
                  </div>
                  {review ? (
                    <>
                      <p>
                        The bank reported{" "}
                        {review.kind === "change"
                          ? `a change to ${review.entry?.date}: ${usd(BigInt(review.entry?.amount ?? "0"))} · ${review.entry?.payee}`
                          : review.kind === "legacy-pending"
                            ? "a pending observation that an older release put in the ledger"
                            : "that this entry was removed"}
                        . Your ledger is unchanged until you decide.
                      </p>
                      <ProviderAction
                        command={{
                          type: "entry.resolve",
                          entryId: entry.id,
                          reviewId: review.id,
                          apply: true,
                        }}
                        label="Apply bank change"
                        acknowledgement
                        confirm="Apply this change? The original transaction will be reversed. A replacement expense starts in Uncategorized and needs categorization again."
                      />
                      {review.kind !== "legacy-pending" && (
                        <ProviderAction
                          command={{
                            type: "entry.resolve",
                            entryId: entry.id,
                            reviewId: review.id,
                            apply: false,
                          }}
                          label="Keep my ledger entry"
                          secondary
                        />
                      )}
                    </>
                  ) : entry.status === "PENDING" ? (
                    <>
                      <p>
                        Pending at the bank: it counts in no balance or budget
                        figure until it posts, or you enter it now.
                      </p>
                      <EnterNow
                        entry={{
                          id: entry.id,
                          suggestedCategoryId: entry.suggestedCategoryId,
                          canCategorize:
                            entry.amount < 0n &&
                            s.accounts.find((a) => a.id === entry.accountId)
                              ?.participation === "BUDGET",
                        }}
                        categories={spendable}
                      />
                    </>
                  ) : (
                    <>
                      <p className={MUTED}>
                        {entry.amount < 0n
                          ? "This already counts in your budget under the category below. Approve it, or choose a different category first."
                          : "Cash inflows reach Ready to Assign; card inflows reduce debt or create a positive card balance. Approve after checking its meaning. Use the register to correct a refund or transfer."}
                      </p>
                      <div className="flex flex-col gap-4">
                        {entry.amount < 0n && spendable.length > 0 && (
                          <ProviderSelect
                            command={{ type: "entry.approve", entryId: entry.id }}
                            field="categoryId"
                            options={spendable}
                            label="Category"
                            action="Approve"
                            acknowledgement
                            suggested={entry.suggestedCategoryId}
                            hint={
                              entry.suggestionRule &&
                              entry.currentCategoryId ===
                                entry.suggestedCategoryId
                                ? `Filed by your rule “${entry.suggestionRule}”. Change it if it is wrong.`
                                : entry.currentCategoryId &&
                                    entry.suggestionSupport > 0
                                  ? `Filed from ${entry.suggestionSupport} earlier transaction${entry.suggestionSupport === 1 ? "" : "s"} with this payee. Change it if it is wrong.`
                                  : entry.currentCategoryId
                                    ? undefined
                                    : "No earlier choice for this payee yet, so it is Uncategorized. Choose a category."
                            }
                          />
                        )}
                        {entry.ruleReviewId && (
                          <p className={MUTED}>
                            Your rules also propose other changes to this entry.{" "}
                            <Link
                              className={LINK}
                              href={`/accounts/rules?transactionId=${entry.ruleReviewId}`}
                            >
                              Review them in Rules
                            </Link>
                            .
                          </p>
                        )}
                        <ProviderAction
                          command={{
                            type: "entry.approve",
                            entryId: entry.id,
                            categoryId: null,
                          }}
                          label="Approve as is"
                          secondary
                        />
                      </div>
                    </>
                  )}
                </div>
              </details>
            );
          })}
        </section>
      </div>
    </main>
  );
}
