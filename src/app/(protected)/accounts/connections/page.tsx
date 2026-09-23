import Link from "next/link";
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
    <main id="main" className="main finance" tabIndex={-1}>
      <div className="page-heading">
        <span className="eyebrow">
          <Link href="/accounts">ACCOUNTS</Link> · BANK SYNC
        </span>
        <h1>Bring your accounts in.</h1>
        <p>
          Your bank credentials go to Plaid, never to MyNAB. Imported spending
          waits in Uncategorized until you say what it was.
        </p>
      </div>

      {!configured && (
        <aside className="finance-notice">
          <strong>Bank sync is not configured</strong>
          <p>
            Set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV on the server, then
            restart. Without all three, MyNAB runs with no provider at all.
          </p>
        </aside>
      )}

      {configured && (
        <section className="finance-panel">
          <h2>Connect an institution</h2>
          <p className="muted">
            Plaid collects your sign-in and returns only a token. MyNAB never
            sees your banking password.
          </p>
          <ConnectBank />
        </section>
      )}

      {s.connections.map((connection) => {
        const owned = s.providerAccounts.filter(
          (p) => p.connectionId === connection.id,
        );
        const removed = connection.status === "DISCONNECTED";
        return (
          <section className="finance-panel" key={connection.id}>
            <h2>{connection.institutionName}</h2>
            <p className="muted">
              {removed
                ? "Disconnected. Imported history is kept."
                : connection.lastSyncedAt
                  ? `Last synced ${day(connection.lastSyncedAt)}.`
                  : "Not synced yet."}
            </p>
            {connection.status === "ERROR" && (
              <aside className="finance-notice">
                <strong>This connection needs attention</strong>
                <p>
                  {connection.errorCode === "REAUTH_REQUIRED"
                    ? "Your bank needs you to sign in again before syncing can continue."
                    : "The institution could not be reached last time. Try syncing again."}
                </p>
              </aside>
            )}
            <div className="table-scroll">
              <table>
                <caption className="sr-only">
                  Accounts at {connection.institutionName}
                </caption>
                <thead>
                  <tr>
                    <th>At your bank</th>
                    <th>In MyNAB</th>
                    <th>Link</th>
                  </tr>
                </thead>
                <tbody>
                  {owned.map((provider) => (
                    <tr key={provider.id}>
                      <th scope="row">
                        {provider.name}
                        <small>
                          {provider.type}
                          {provider.mask ? ` ····${provider.mask}` : ""}
                        </small>
                      </th>
                      <td>
                        {provider.accountId ? (
                          <Link href={`/accounts/${provider.accountId}`}>
                            {accountName(provider.accountId)}
                          </Link>
                        ) : (
                          "Not linked"
                        )}
                      </td>
                      <td>
                        {provider.accountId ? (
                          "Syncing"
                        ) : removed || !linkable.length ? (
                          <span className="muted">
                            {removed ? "—" : "Create an account first"}
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
            <p className="muted">
              Only linked accounts are synced. Opening balances are never
              imported: enter one when you create the account, and history
              before that stays out of your budget.
            </p>
            {!removed && (
              <div className="register-actions">
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
        <p className="muted">
          {unlinked.length} discovered account
          {unlinked.length === 1 ? " is" : "s are"} not linked and will be
          ignored entirely.
        </p>
      )}

      <section className="finance-panel">
        <h2>Needs review ({s.entries.length})</h2>
        {!s.entries.length && (
          <p className="muted">
            Nothing waiting. Imported transactions appear here until you give
            them a category.
          </p>
        )}
        {s.entries.map((entry) => (
          <details className="register-row" key={entry.id}>
            <summary>
              <span className="register-date">{day(entry.date)}</span>
              <span className="register-payee">
                {entry.payee || "No payee"}
                <small>
                  {accountName(entry.accountId)}
                  {entry.status === "PENDING" ? " · Pending" : ""}
                </small>
              </span>
              <span
                className={
                  entry.amount < 0n
                    ? "register-amount negative"
                    : "register-amount"
                }
              >
                {usd(entry.amount)}
              </span>
              <span className="register-flag">Review</span>
            </summary>
            <div className="register-detail">
              <p className="muted">
                {entry.amount < 0n
                  ? "Choose the category this was spent from. Approving replaces the entry rather than editing it, so the record stays intact."
                  : "Money coming in goes to Ready to Assign. Approve it to clear it from this list."}
              </p>
              <div className="register-actions">
                {entry.amount < 0n && spendable.length > 0 && (
                  <ProviderSelect
                    command={{ type: "entry.approve", entryId: entry.id }}
                    field="categoryId"
                    options={spendable}
                    label="Category"
                    action="Approve with category"
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
            </div>
          </details>
        ))}
      </section>
    </main>
  );
}
