import Link from "next/link";
import { notFound } from "next/navigation";
import { financePage } from "@/application/finance-page";
import { FinanceForm } from "@/components/finance-form";
import { TransactionForm, dollars } from "@/components/finance-fields";
import { formatUSD, money } from "@/domain/money";
const usd = (n: bigint) => formatUSD(money(n));
const day = (value: Date) => value.toISOString().slice(0, 10);
export default async function Account({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await financePage();
  const account = s.accounts.find((a) => a.id === id);
  if (!account) notFound();
  const balance = s.projection.accounts.find((a) => a.id === id)!.balance;
  const spendable = s.categories
    .filter((c) => !c.archived && !c.paymentAccountId)
    .map((c) => ({ id: c.id, name: c.name }));
  const transferable = s.accounts
    .filter((a) => !a.closed)
    .map((a) => ({ id: a.id, name: a.name }));
  const legOf = (t: { accountId: string; amount: bigint }) =>
    t.accountId === id ? t.amount : -t.amount;
  const register = s.transactions.filter(
    (t) => t.accountId === id || t.transferAccountId === id,
  );
  const active = register.filter((t) => !t.voidedAt);
  // Oldest first for a running balance, then displayed newest first.
  const ordered = [...active].sort(
    (a, b) =>
      day(a.date).localeCompare(day(b.date)) || a.id.localeCompare(b.id),
  );
  const running = new Map<string, bigint>();
  let total = 0n;
  for (const t of ordered) {
    total += legOf(t);
    running.set(t.id, total);
  }
  const rows = [...ordered].reverse();
  const cleared = ordered
    .filter(
      (t) =>
        s.states.find((x) => x.transactionId === t.id && x.accountId === id)
          ?.cleared,
    )
    .reduce((n, t) => n + legOf(t), 0n);
  const voided = register.filter((t) => t.voidedAt);
  const latest = s.reconciliations.find((r) => r.accountId === id);
  const name = (categoryId: string) =>
    s.categories.find((c) => c.id === categoryId)?.name ?? "Unknown";
  return (
    <main id="main" className="main finance" tabIndex={-1}>
      <div className="page-heading">
        <span className="eyebrow">
          <Link href="/accounts">ACCOUNTS</Link> ·{" "}
          {account.participation === "BUDGET" ? "BUDGET" : "TRACKING"} ·{" "}
          {account.type.replaceAll("_", " ")}
        </span>
        <h1>{account.name}</h1>
        <p>
          {account.closed
            ? "This account is closed. Reopen it below before recording anything new."
            : "Every entry here is a record of what actually happened. Corrections reverse; they never rewrite."}
        </p>
      </div>
      <section className="money-summary" aria-label="Account balances">
        <article className={balance < 0n ? "negative" : ""}>
          <span>Current balance</span>
          <strong>{usd(balance)}</strong>
        </article>
        <article className={cleared < 0n ? "negative" : ""}>
          <span>Cleared balance</span>
          <strong>{usd(cleared)}</strong>
        </article>
        <article>
          <span>Uncleared</span>
          <strong>{usd(balance - cleared)}</strong>
        </article>
      </section>
      {latest && (
        <p className="muted">
          Last reconciled {day(latest.date)} against {usd(latest.observed)}.
          {latest.affectedAt
            ? " A later correction affected this statement comparison; review it."
            : ""}
        </p>
      )}
      {!account.closed && (
        <section className="finance-panel">
          <h2>Record a transaction</h2>
          <TransactionForm
            budgetId={s.budget.id}
            accountId={id}
            today={s.today}
            accounts={transferable}
            categories={spendable}
          />
        </section>
      )}
      <section className="finance-panel">
        <h2>Transactions</h2>
        {!rows.length && (
          <p className="muted">
            No transactions yet on this account.
            {account.participation === "BUDGET"
              ? " Record spending above and it will appear in your budget."
              : " Tracking accounts never add money to your budget."}
          </p>
        )}
        {rows.map((t) => {
          const leg = legOf(t);
          const state = s.states.find(
            (x) => x.transactionId === t.id && x.accountId === id,
          );
          const splits = s.splits.filter((x) => x.transactionId === t.id);
          const other = t.transferAccountId
            ? s.accounts.find(
                (a) =>
                  a.id ===
                  (t.accountId === id ? t.transferAccountId : t.accountId),
              )
            : undefined;
          const primary = t.accountId === id;
          return (
            <details className="register-row" key={t.id}>
              <summary>
                <span className="register-date">{day(t.date)}</span>
                <span className="register-payee">
                  {t.payee || t.kind.replaceAll("_", " ")}
                  {other && <small>Transfer · {other.name}</small>}
                  {!other && splits.length > 0 && (
                    <small>
                      {splits.map((x) => name(x.categoryId)).join(" · ")}
                    </small>
                  )}
                </span>
                <span
                  className={
                    leg < 0n ? "register-amount negative" : "register-amount"
                  }
                >
                  {usd(leg)}
                </span>
                <span className="register-balance">
                  {usd(running.get(t.id)!)}
                </span>
                <span className="register-flag">
                  {state?.cleared ? "Cleared" : "Uncleared"}
                </span>
              </summary>
              <div className="register-detail">
                <dl>
                  <div>
                    <dt>Kind</dt>
                    <dd>{t.kind.replaceAll("_", " ")}</dd>
                  </div>
                  {t.memo && (
                    <div>
                      <dt>Memo</dt>
                      <dd>{t.memo}</dd>
                    </div>
                  )}
                  {splits.length > 0 && (
                    <div>
                      <dt>Splits</dt>
                      <dd>
                        {splits.map((x) => (
                          <span key={x.id}>
                            {name(x.categoryId)} {usd(x.amount)}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Transaction ID</dt>
                    <dd>
                      <code>{t.id}</code>
                    </dd>
                  </div>
                </dl>
                {!account.closed && (
                  <div className="register-actions">
                    <FinanceForm
                      budgetId={s.budget.id}
                      command={{
                        type: "transaction.clear",
                        id: t.id,
                        accountId: id,
                      }}
                      label="Update cleared state"
                    >
                      <label className="check-field">
                        <input
                          type="checkbox"
                          name="cleared"
                          defaultChecked={state?.cleared ?? false}
                        />
                        Cleared by the institution on this account
                      </label>
                      {state?.reconciliationId && (
                        <label className="check-field">
                          <input type="checkbox" name="acknowledgeReconciled" />
                          This leg was reconciled; the statement comparison will
                          need review.
                        </label>
                      )}
                    </FinanceForm>
                    <details>
                      <summary>Void this transaction</summary>
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{ type: "transaction.void", id: t.id }}
                        label="Void with a reversing entry"
                      >
                        <label>
                          Reason
                          <input name="reason" required maxLength={500} />
                        </label>
                        <label className="check-field">
                          <input type="checkbox" name="acknowledgeReconciled" />
                          Any affected reconciliation will need review.
                        </label>
                      </FinanceForm>
                    </details>
                    {primary ? (
                      <details>
                        <summary>Correct this transaction</summary>
                        <TransactionForm
                          budgetId={s.budget.id}
                          accountId={id}
                          today={s.today}
                          accounts={transferable}
                          categories={spendable}
                          initial={{
                            id: t.id,
                            kind: t.kind,
                            date: day(t.date),
                            amount: dollars(t.amount),
                            payee: t.payee,
                            memo: t.memo,
                            transferAccountId: t.transferAccountId,
                            refundOfId: t.refundOfId,
                            splits: splits.map((x) => ({
                              categoryId: x.categoryId,
                              amount: dollars(x.amount),
                            })),
                          }}
                        />
                      </details>
                    ) : (
                      other && (
                        <p className="muted">
                          This is the other side of a transfer. Correct it from{" "}
                          <Link href={`/accounts/${other.id}`}>
                            {other.name}
                          </Link>
                          .
                        </p>
                      )
                    )}
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </section>
      {voided.length > 0 && (
        <details className="finance-panel">
          <summary>Corrected and voided entries ({voided.length})</summary>
          <p className="muted">
            These remain for lineage. Each has an exact reversing journal.
          </p>
          <ul className="void-list">
            {voided.map((t) => (
              <li key={t.id}>
                <span>
                  {day(t.date)} · {t.payee || t.kind} · {usd(legOf(t))}
                </span>
                <small>{t.voidReason}</small>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="finance-columns">
        {!account.closed && (
          <section className="finance-panel">
            <h2>Reconcile</h2>
            <p className="muted">
              Enter the balance your institution shows. Cleared entries through
              that date are compared against it.
            </p>
            <FinanceForm
              budgetId={s.budget.id}
              command={{ type: "reconcile", accountId: id }}
              label="Reconcile"
              reset
            >
              <div className="field-grid">
                <label>
                  Statement date
                  <input
                    type="date"
                    name="date"
                    required
                    min="1900-01-01"
                    max={s.today}
                    defaultValue={s.today}
                  />
                </label>
                <label>
                  Statement balance (USD)
                  <input
                    name="observed"
                    inputMode="decimal"
                    required
                    defaultValue={dollars(cleared)}
                  />
                </label>
              </div>
              <label>
                Adjustment reason (only if it differs)
                <input name="adjustmentReason" maxLength={500} />
              </label>
            </FinanceForm>
          </section>
        )}
        <section className="finance-panel">
          <h2>Account settings</h2>
          <FinanceForm
            budgetId={s.budget.id}
            command={{
              type: "account.update",
              id,
              version: account.version,
            }}
            label="Save account"
          >
            <label>
              Account name
              <input
                name="name"
                required
                maxLength={120}
                defaultValue={account.name}
              />
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                name="closed"
                defaultChecked={account.closed}
              />
              Closed
            </label>
            <p className="muted">
              Close only at a zero balance with every leg cleared and the latest
              reconciliation unaffected. Type and budget participation are fixed
              once an account exists.
            </p>
          </FinanceForm>
        </section>
      </div>
    </main>
  );
}
