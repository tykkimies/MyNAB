import Link from "next/link";
import { readReview } from "@/application/ingestion";
import { connectionsPage } from "@/application/finance-page";
import {
  ConnectBank,
  ProviderAction,
  ProviderSelect,
} from "@/components/provider-link";
import { formatUSD, money } from "@/domain/money";
import { getConfig, plaidConfigured } from "@/infrastructure/config";

const usd = (n: bigint) => formatUSD(money(n));
const day = (value: Date) => value.toISOString().slice(0, 10);
const CARD = "rounded-lg border border-border-warm bg-surface-card";
const PANEL_H2 = "font-headline-md text-headline-md text-text-primary";
const MUTED = "font-body-sm text-body-sm leading-relaxed text-text-secondary";
const TH =
  "px-space-sm py-space-sm text-left font-label-caps text-label-caps uppercase text-text-tertiary first:pl-space-lg last:pr-space-lg";
const TD = "px-space-sm py-space-sm align-middle font-body-sm text-body-sm";
const ROW =
  "border-b border-border-warm transition-colors last:border-b-0 hover:bg-row-hover";
const ROW_TH =
  "py-space-sm pl-space-lg pr-space-sm text-left align-middle font-body-md text-body-md font-medium text-text-primary";
const NOTICE_WARN =
  "mt-space-md flex flex-col gap-space-xs rounded-lg border border-status-warning-border bg-status-warning-bg p-space-md";
const NOTICE_TITLE =
  "font-headline-sm text-headline-sm text-status-warning-text";
const REGISTER_SUMMARY =
  "grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-space-sm gap-y-1 px-space-lg py-space-sm transition-colors hover:bg-row-hover sm:grid-cols-[6rem_1fr_7rem_5.5rem]";

export default async function Connections() {
  const configured = plaidConfigured(getConfig());
  const s = await connectionsPage();
  const unlinked = s.providerAccounts.filter((p) => !p.accountId);
  const linkable = s.accounts.filter(
    (a) => !s.providerAccounts.some((p) => p.accountId === a.id),
  );
  const spendable = s.categories
    .filter((c) => !c.paymentAccountId && !c.system)
    .map((c) => ({ id: c.id, name: c.name }));
  const accountName = (id: string) =>
    s.accounts.find((a) => a.id === id)?.name ?? "Unknown account";

  return (
    <main
      id="main"
      className="mx-auto w-full max-w-canvas px-gutter pb-space-xl pt-space-lg outline-none lg:px-space-lg"
      tabIndex={-1}
    >
      <div className="flex max-w-2xl flex-col">
        <span className="font-label-caps text-label-caps uppercase tracking-widest text-secondary">
          <Link className="underline-offset-2 hover:underline" href="/accounts">
            Accounts
          </Link>{" "}
          · Bank sync
        </span>
        <h1 className="mt-space-xs font-headline-hero-mobile text-headline-hero-mobile leading-none text-text-primary lg:font-headline-hero lg:text-headline-hero">
          Bring your accounts in.
        </h1>
        <p className="mt-space-sm font-body-lg text-body-lg leading-relaxed text-text-secondary">
          Your bank credentials go to Plaid, never to MyNAB. Imported spending
          waits in Uncategorized until you say what it was.
        </p>
      </div>

      {!configured && (
        <aside className={NOTICE_WARN}>
          <strong className={NOTICE_TITLE}>Bank sync is not configured</strong>
          <p className={MUTED}>
            Set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV on the server, then
            restart. Without all three, MyNAB runs with no provider at all.
          </p>
        </aside>
      )}

      {configured && (
        <section className={`finance-panel mt-space-lg ${CARD} p-space-lg`}>
          <h2 className={PANEL_H2}>Connect an institution</h2>
          <p className={`mt-space-sm mb-space-md ${MUTED}`}>
            Plaid collects your sign-in and returns only a token. MyNAB never
            sees your banking password.
          </p>
          <ConnectBank />
        </section>
      )}

      {s.connections.length > 0 && !s.accounts.length && (
        <aside className={NOTICE_WARN}>
          <strong className={NOTICE_TITLE}>
            Create your accounts before linking
          </strong>
          <p className={MUTED}>
            Your bank is connected, but this budget has no accounts yet, so
            there is nothing to link to.{" "}
            <Link
              className="font-semibold text-secondary underline underline-offset-2"
              href="/accounts"
            >
              Add an account
            </Link>{" "}
            for each one you want to sync, using the balance your bank shows
            today. That balance is the starting line: earlier transactions are
            already inside it and are skipped, so importing cannot double your
            balance.
          </p>
        </aside>
      )}

      {s.connections.map((connection) => {
        const owned = s.providerAccounts.filter(
          (p) => p.connectionId === connection.id,
        );
        const removed = connection.status === "DISCONNECTED";
        return (
          <section
            className={`finance-panel mt-space-lg overflow-hidden ${CARD}`}
            key={connection.id}
          >
            <div className="border-b border-border-warm px-space-lg py-space-md">
              <h2 className={PANEL_H2}>{connection.institutionName}</h2>
              <p className={`mt-space-xs ${MUTED}`}>
                {removed
                  ? "Disconnected. Imported history is kept."
                  : connection.lastSyncedAt
                    ? `Last synced ${day(connection.lastSyncedAt)}.`
                    : "Not synced yet."}
              </p>
            </div>
            {connection.status === "ERROR" && (
              <aside className={`m-space-lg mb-0 ${NOTICE_WARN} mt-space-md`}>
                <strong className={NOTICE_TITLE}>
                  This connection needs attention
                </strong>
                <p className={MUTED}>
                  {connection.errorCode === "REAUTH_REQUIRED"
                    ? "Your bank needs you to sign in again before syncing can continue."
                    : "The institution could not be reached last time. Try syncing again."}
                </p>
              </aside>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse">
                <caption className="sr-only">
                  Accounts at {connection.institutionName}
                </caption>
                <thead>
                  <tr className="border-b border-border-warm bg-surface-container-low">
                    {["At your bank", "In MyNAB", "Link"].map((h) => (
                      <th className={TH} key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {owned.map((provider) => (
                    <tr className={ROW} key={provider.id}>
                      <th className={ROW_TH} scope="row">
                        {provider.name}
                        <small className="block font-body-sm text-body-sm font-normal uppercase text-text-tertiary">
                          {provider.type}
                          {provider.mask ? ` ····${provider.mask}` : ""}
                        </small>
                      </th>
                      <td className={`${TD} text-text-primary`}>
                        {provider.accountId ? (
                          <Link
                            className="font-semibold text-secondary underline underline-offset-2"
                            href={`/accounts/${provider.accountId}`}
                          >
                            {accountName(provider.accountId)}
                          </Link>
                        ) : (
                          "Not linked"
                        )}
                      </td>
                      <td
                        className={`py-space-sm pl-space-sm pr-space-lg align-middle font-body-sm text-body-sm text-text-secondary`}
                      >
                        {provider.accountId ? (
                          <>
                            Linked
                            {/* A standing status, not work in progress: say what
                                will import rather than implying something is
                                happening right now. */}
                            <small className="block font-body-sm text-body-sm text-text-tertiary">
                              {provider.linkedFrom
                                ? `Imports transactions dated after ${day(provider.linkedFrom)}`
                                : "Imports from the account's opening balance"}
                            </small>
                          </>
                        ) : removed ? (
                          <span className="text-text-tertiary">&mdash;</span>
                        ) : !linkable.length ? (
                          <span className="text-text-tertiary">
                            <Link
                              className="font-semibold text-secondary underline underline-offset-2"
                              href="/accounts"
                            >
                              Create an account
                            </Link>{" "}
                            with today&rsquo;s balance, then link it here.
                          </span>
                        ) : (
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
                            label={`Link ${provider.name} to`}
                            action="Link"
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p
              className={`border-t border-border-warm px-space-lg py-space-md ${MUTED}`}
            >
              A linked account shows nothing until the bank reports a
              transaction dated after its start date, so a freshly linked
              account is expected to be empty at first. Only linked accounts are
              synced. Importing starts the day after the account&rsquo;s opening
              balance, because everything before that is already inside it.
              Older history is skipped rather than added on top, which would
              both double the balance and invent months of unassigned spending.
            </p>
            {!removed && (
              <div className="flex flex-wrap gap-space-sm border-t border-border-warm px-space-lg py-space-md">
                <ProviderAction
                  command={{ type: "sync", connectionId: connection.id }}
                  label="Sync now"
                  busyLabel="Syncing…"
                />
                <ProviderAction
                  command={{ type: "disconnect", connectionId: connection.id }}
                  label="Disconnect"
                  secondary
                  confirm={`Disconnect ${connection.institutionName}? Imported transactions are kept, but no new ones will arrive.`}
                />
              </div>
            )}
          </section>
        );
      })}

      {unlinked.length > 0 && (
        <p className={`mt-space-md ${MUTED}`}>
          {unlinked.length} discovered account
          {unlinked.length === 1 ? " is" : "s are"} not linked and will be
          ignored entirely.
        </p>
      )}

      <section className={`finance-panel mt-space-lg ${CARD} p-space-lg`}>
        <h2 className={PANEL_H2}>
          Possible duplicates and transfers ({s.proposals.length})
        </h2>
        <p className={`mt-space-sm ${MUTED}`}>
          Both posted entries affect balances until you confirm a match. Compare
          the account, amount and date first. A transfer uses the outflow date
          for both account legs.
        </p>
        {s.proposals.map((p, i) => (
          <div
            className="mt-space-md flex flex-col gap-space-sm rounded-md border border-border-warm p-space-md"
            key={`${p.entryId}-${i}`}
          >
            <p className="font-body-sm text-body-sm text-text-secondary">
              <strong className="block font-body-md text-body-md text-text-primary">
                {p.sourceLabel}
              </strong>
              {p.label} ·{" "}
              {p.otherEntryId ? "Possible transfer" : "Possible manual match"}
            </p>
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
          </div>
        ))}
      </section>
      <section className={`finance-panel mt-space-lg overflow-hidden ${CARD}`}>
        <div className="border-b border-border-warm px-space-lg py-space-md">
          <h2 className={PANEL_H2}>Needs review ({s.entries.length})</h2>
        </div>
        {!s.entries.length && (
          <p className={`px-space-lg py-space-md ${MUTED}`}>
            Nothing waiting. Imported transactions appear here until you give
            them a category.
          </p>
        )}
        {s.entries.map((entry) => {
          const review = readReview(entry.review);
          return (
            <details
              className="register-row border-b border-border-warm last:border-b-0"
              key={entry.id}
            >
              <summary className={REGISTER_SUMMARY}>
                <span className="hidden font-data-mono text-data-mono font-normal text-text-secondary sm:block">
                  {day(entry.date)}
                </span>
                <span className="order-first col-span-2 font-body-md text-body-md font-semibold text-text-primary sm:order-none sm:col-span-1">
                  {entry.payee || "No payee"}
                  <small className="block font-body-sm text-body-sm font-normal text-text-tertiary">
                    <span className="sm:hidden">{day(entry.date)} · </span>
                    {accountName(entry.accountId)}
                    {entry.status === "PENDING" ? " · Pending" : ""}
                  </small>
                </span>
                <span
                  className={`text-right font-data-mono text-data-mono ${entry.amount < 0n ? "text-status-negative-text" : "text-text-primary"}`}
                >
                  {usd(entry.amount)}
                </span>
                <span className="hidden text-right font-label-caps text-label-caps uppercase text-text-tertiary sm:block">
                  {entry.status === "PENDING" && !review ? "Pending" : "Review"}
                </span>
              </summary>
              <div className="flex flex-col gap-space-md border-t border-border-warm px-space-lg py-space-md font-body-sm text-body-sm leading-relaxed text-text-secondary">
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
                  <p>
                    Pending at the institution. This observation does not affect
                    your ledger or budget. Review it after it posts.
                  </p>
                ) : (
                  <>
                    <p className={MUTED}>
                      {entry.amount < 0n
                        ? "Choose the category this was spent from. Approving replaces the entry rather than editing it, so the record stays intact."
                        : "Cash inflows reach Ready to Assign; card inflows reduce debt or create a positive card balance. Approve after checking its meaning. Use the register to correct a refund or transfer."}
                    </p>
                    <div className="flex flex-col gap-space-md">
                      {entry.amount < 0n && spendable.length > 0 && (
                        <ProviderSelect
                          command={{ type: "entry.approve", entryId: entry.id }}
                          field="categoryId"
                          options={spendable}
                          label="Category"
                          action="Approve with category"
                          acknowledgement
                          suggested={entry.suggestedCategoryId}
                          hint={
                            entry.suggestedCategoryId
                              ? `Suggested from ${entry.suggestionSupport} earlier transaction${entry.suggestionSupport === 1 ? "" : "s"} with this payee. Change it if it is wrong.`
                              : undefined
                          }
                        />
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
    </main>
  );
}
