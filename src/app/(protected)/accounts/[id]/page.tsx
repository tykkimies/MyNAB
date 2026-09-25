import Link from "next/link";
import { notFound } from "next/navigation";
import { financePage, loanPlan } from "@/application/finance-page";
import { FinanceForm } from "@/components/finance-form";
import { TransactionForm, dollars } from "@/components/finance-fields";
import { formatUSD, money } from "@/domain/money";
import { nextMonth } from "@/domain/budget";
import { TrendLine } from "@/components/trend-line";
import { Amount } from "@/components/amount";
import { FLAG_COLORS, flagName, type FlagColor } from "@/domain/flags";
const usd = (n: bigint) => formatUSD(money(n));
const day = (value: Date) => value.toISOString().slice(0, 10);
const CARD = "rounded-lg border border-border-warm bg-surface-card";
const PANEL_H2 = "font-headline-md text-headline-md text-text-primary";
const MUTED = "font-body-sm text-body-sm leading-relaxed text-text-secondary";
// The register summary: a five-column ledger line on desktop that folds the
// payee onto its own row and drops the running balance and flag on a phone.
const REGISTER_SUMMARY =
  "grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-space-sm gap-y-1 px-space-lg py-space-sm transition-colors hover:bg-row-hover sm:grid-cols-[6rem_1fr_7rem_7rem_5.5rem]";
const REGISTER_PAYEE =
  "order-first col-span-2 font-body-md text-body-md font-semibold text-text-primary sm:order-none sm:col-span-1";
const REGISTER_SUB =
  "block font-body-sm text-body-sm font-normal text-text-tertiary";
const DETAIL_WRAP =
  "grid gap-space-lg border-t border-border-warm px-space-lg py-space-md lg:grid-cols-2";
const PAGE_SIZE = 50;
export default async function Account({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    page?: string;
    q?: string;
    extra?: string;
    lump?: string;
    lumpMonth?: string;
  }>;
}) {
  const { id } = await params;
  const {
    page: pageParam,
    q: rawQuery,
    extra,
    lump,
    lumpMonth,
  } = await searchParams;
  const query = (rawQuery ?? "").trim().slice(0, 80);
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
  // Lookups by transaction, so a long history does not cost a scan per row.
  const stateOf = new Map(
    s.states.filter((x) => x.accountId === id).map((x) => [x.transactionId, x]),
  );
  const splitsOf = new Map<string, typeof s.splits>();
  for (const x of s.splits)
    splitsOf.set(x.transactionId, [
      ...(splitsOf.get(x.transactionId) ?? []),
      x,
    ]);
  const cleared = ordered
    .filter((t) => stateOf.get(t.id)?.cleared)
    .reduce((n, t) => n + legOf(t), 0n);
  // Newest first; running balances above are over the whole history, so a
  // page or a search never changes what a row's balance says.
  const needle = query.toLowerCase();
  const matching = [...ordered]
    .reverse()
    .filter(
      (t) =>
        !needle ||
        t.payee.toLowerCase().includes(needle) ||
        t.memo.toLowerCase().includes(needle),
    );
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const pageNumber = Math.min(
    pages,
    Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1),
  );
  const rows = matching.slice(
    (pageNumber - 1) * PAGE_SIZE,
    pageNumber * PAGE_SIZE,
  );
  // Month-end balances for the last twelve months, from the same running total.
  const history: { label: string; value: bigint }[] = [];
  {
    const current = s.today.slice(0, 7);
    let cursor = 0;
    let balanceSoFar = 0n;
    for (let i = 11; i >= 0; i--) {
      const month = nextMonth(current, -i);
      while (
        cursor < ordered.length &&
        day(ordered[cursor].date).slice(0, 7) <= month
      )
        balanceSoFar = running.get(ordered[cursor++].id)!;
      history.push({ label: month, value: balanceSoFar });
    }
  }
  const firstActivity = ordered[0] ? day(ordered[0].date).slice(0, 7) : null;
  const shownHistory = history.filter(
    (h) => firstActivity !== null && h.label >= firstActivity,
  );
  const pageHref = (n: number) =>
    `/accounts/${id}?page=${n}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
  const voided = register.filter((t) => t.voidedAt);
  const loan = account.closed
    ? null
    : await loanPlan(id, { extra, lump, lumpMonth });
  const loanMonth = (m: string | null) =>
    m
      ? new Intl.DateTimeFormat("en-US", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${m}-01T00:00:00Z`))
      : "Not within 50 years";
  const latest = s.reconciliations.find((r) => r.accountId === id);
  const name = (categoryId: string) =>
    s.categories.find((c) => c.id === categoryId)?.name ?? "Unknown";
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
          · {account.participation === "BUDGET" ? "Budget" : "Tracking"} ·{" "}
          {account.type.replaceAll("_", " ")}
        </span>
        <h1 className="mt-space-xs font-headline-hero-mobile text-headline-hero-mobile leading-none text-text-primary lg:font-headline-lg lg:text-headline-lg">
          {account.name}
        </h1>
        <p className="mt-space-sm font-body-lg text-body-lg leading-relaxed text-text-secondary">
          {account.closed
            ? "This account is closed. Reopen it below before recording anything new."
            : "Review, edit and reconcile transactions here."}
        </p>
      </div>
      <section
        className="mt-space-lg grid grid-cols-1 gap-space-md md:grid-cols-3"
        aria-label="Account balances"
      >
        <Balance label="Current balance" amount={balance} />
        <Balance label="Cleared balance" amount={cleared} />
        <Balance label="Uncleared" amount={balance - cleared} />
      </section>
      {latest && (
        <p className={`mt-space-md ${MUTED}`}>
          Last reconciled {day(latest.date)} against <Amount>{usd(latest.observed)}</Amount>.
          {latest.affectedAt
            ? " A later correction affected this statement comparison; review it."
            : ""}
        </p>
      )}
      {loan && (
        <section
          className={`finance-panel mt-space-lg ${CARD} p-space-lg`}
          aria-labelledby="loan-planner-heading"
        >
          <h2 id="loan-planner-heading" className={PANEL_H2}>
            Loan planner
          </h2>
          <p className={`mt-space-xs ${MUTED}`}>
            See what paying more does to this debt alone, using its recorded
            rate and minimum. Nothing here changes your budget.
          </p>
          <form method="get" className="finance-form mt-space-md">
            <div className="field-grid">
              <label>
                Extra each month (USD)
                <input name="extra" inputMode="decimal" defaultValue={extra ?? ""} />
              </label>
              <label>
                One-time payment (USD)
                <input name="lump" inputMode="decimal" defaultValue={lump ?? ""} />
              </label>
              <label>
                Paid in
                <input name="lumpMonth" type="month" defaultValue={loan.lumpMonth} />
              </label>
            </div>
            <button className="secondary-button" type="submit">
              Show the difference
            </button>
          </form>
          <dl className="loan-planner mt-space-md grid gap-space-md sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className={MUTED}>Paying minimums only</dt>
              <dd className="font-body-md text-body-md font-semibold text-text-primary">
                {loanMonth(loan.baseline.payoffMonth)} ·{" "}
                <Amount>{usd(loan.baseline.totalInterest)}</Amount> interest
              </dd>
            </div>
            <div>
              <dt className={MUTED}>With this plan</dt>
              <dd className="font-body-md text-body-md font-semibold text-text-primary">
                {loanMonth(loan.planned.payoffMonth)} ·{" "}
                <Amount>{usd(loan.planned.totalInterest)}</Amount> interest
              </dd>
            </div>
            <div>
              <dt className={MUTED}>Time saved</dt>
              <dd className="font-body-md text-body-md font-semibold text-text-primary">
                {loan.monthsSaved === null
                  ? "—"
                  : `${loan.monthsSaved} month${loan.monthsSaved === 1 ? "" : "s"}`}
              </dd>
            </div>
            <div>
              <dt className={MUTED}>Interest saved</dt>
              <dd className="font-body-md text-body-md font-semibold text-text-primary">
                <Amount>{usd(loan.interestSaved)}</Amount>
              </dd>
            </div>
          </dl>
          {loan.baseline.negativelyAmortising.length > 0 && (
            <p className={`mt-space-sm ${MUTED}`}>
              At the minimum alone, interest outgrows the payment, so this debt
              never clears.
            </p>
          )}
          <p className={`mt-space-sm ${MUTED}`}>
            Compare every debt together on{" "}
            <Link className="font-semibold text-secondary underline underline-offset-2" href="/debt">
              Debt
            </Link>
            .
          </p>
        </section>
      )}
      {!account.closed && (
        <section className={`finance-panel mt-space-lg ${CARD} p-space-lg`}>
          <h2 className={PANEL_H2}>Record a transaction</h2>
          <TransactionForm
            budgetId={s.budget.id}
            accountId={id}
            today={s.today}
            accounts={transferable}
            categories={spendable}
          />
        </section>
      )}
      {shownHistory.length > 1 && (
        <section className={`finance-panel mt-space-lg ${CARD} p-space-lg`}>
          <h2 className={PANEL_H2}>Balance over time</h2>
          <p className={`mt-space-xs ${MUTED}`}>
            Month-end balances: <Amount>{usd(shownHistory[0].value)}</Amount> at the end of{" "}
            {shownHistory[0].label}, <Amount>{usd(shownHistory.at(-1)!.value)}</Amount> now.
          </p>
          <TrendLine points={shownHistory} label={`${account.name} balance`} />
        </section>
      )}
      <section className={`finance-panel mt-space-lg overflow-hidden ${CARD}`}>
        <div className="flex flex-wrap items-end justify-between gap-space-md border-b border-border-warm px-space-lg py-space-md">
          <h2 className={PANEL_H2}>Transactions</h2>
          {active.length > PAGE_SIZE || query ? (
            <form method="get" className="finance-form finance-form-inline">
              <label>
                Search payee or memo
                <input name="q" type="search" defaultValue={query} />
              </label>
              <button className="secondary-button" type="submit">
                Search
              </button>
              {query && (
                <Link className="secondary-button" href={`/accounts/${id}`}>
                  Clear
                </Link>
              )}
            </form>
          ) : null}
        </div>
        {query && (
          <p className={`px-space-lg pt-space-sm ${MUTED}`}>
            {matching.length} matching “{query}”.
          </p>
        )}
        {!rows.length && query && (
          <p className={`px-space-lg py-space-md ${MUTED}`}>
            Nothing on this account matches.
          </p>
        )}
        {!rows.length && !query && (
          <p className={`px-space-lg py-space-md ${MUTED}`}>
            No transactions yet on this account.
            {account.participation === "BUDGET"
              ? " Record spending above and it will appear in your budget."
              : " Tracking accounts never add money to your budget."}
          </p>
        )}
        {rows.map((t) => {
          const leg = legOf(t);
          const state = stateOf.get(t.id);
          const splits = splitsOf.get(t.id) ?? [];
          const other = t.transferAccountId
            ? s.accounts.find(
                (a) =>
                  a.id ===
                  (t.accountId === id ? t.transferAccountId : t.accountId),
              )
            : undefined;
          const primary = t.accountId === id;
          return (
            <details
              className="register-row border-b border-border-warm last:border-b-0"
              key={t.id}
            >
              <summary className={REGISTER_SUMMARY}>
                <span className="hidden font-data-mono text-data-mono font-normal text-text-secondary sm:block">
                  {day(t.date)}
                </span>
                <span className={REGISTER_PAYEE}>
                  {s.flags.get(t.id) && (
                    <span
                      className="flag-dot mr-1"
                      data-flag={s.flags.get(t.id)}
                      title={flagName(s.flags.get(t.id) as FlagColor, s.flagNames)}
                      aria-label={`${flagName(s.flags.get(t.id) as FlagColor, s.flagNames)} flag`}
                      role="img"
                    />
                  )}
                  {t.payee || t.kind.replaceAll("_", " ")}
                  <small className={REGISTER_SUB}>
                    <span className="sm:hidden">{day(t.date)} · </span>
                    {other
                      ? `Transfer · ${other.name}`
                      : splits.length > 0
                        ? splits.map((x) => name(x.categoryId)).join(" · ")
                        : ""}
                  </small>
                </span>
                <span
                  className={`text-right font-data-mono text-data-mono ${leg < 0n ? "text-status-negative-text" : "text-text-primary"}`}
                >
                  <Amount>{usd(leg)}</Amount>
                </span>
                <span className="hidden text-right font-data-mono text-data-mono font-normal text-text-tertiary sm:block">
                  <Amount>{usd(running.get(t.id)!)}</Amount>
                </span>
                <span className="hidden text-right font-label-caps text-label-caps uppercase text-text-tertiary sm:block">
                  {state?.cleared ? "Cleared" : "Uncleared"}
                </span>
              </summary>
              <div className={DETAIL_WRAP}>
                <dl className="m-0 flex flex-col gap-space-sm">
                  <div>
                    <dt className="font-label-caps text-label-caps uppercase text-text-tertiary">
                      Kind
                    </dt>
                    <dd className="mt-0.5 font-body-sm text-body-sm text-text-primary">
                      {t.kind.replaceAll("_", " ")}
                    </dd>
                  </div>
                  {t.memo && (
                    <div>
                      <dt className="font-label-caps text-label-caps uppercase text-text-tertiary">
                        Memo
                      </dt>
                      <dd className="mt-0.5 font-body-sm text-body-sm text-text-primary">
                        {t.memo}
                      </dd>
                    </div>
                  )}
                  {splits.length > 0 && (
                    <div>
                      <dt className="font-label-caps text-label-caps uppercase text-text-tertiary">
                        Splits
                      </dt>
                      <dd className="mt-0.5 font-body-sm text-body-sm text-text-primary">
                        {splits.map((x) => (
                          <span className="block" key={x.id}>
                            {name(x.categoryId)} <Amount>{usd(x.amount)}</Amount>
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="font-label-caps text-label-caps uppercase text-text-tertiary">
                      Transaction ID
                    </dt>
                    <dd className="mt-0.5">
                      <code className="break-all font-body-sm text-body-sm text-text-tertiary">
                        {t.id}
                      </code>
                    </dd>
                  </div>
                </dl>
                {!account.closed && (
                  <div className="flex flex-col gap-space-md">
                    <FinanceForm
                      budgetId={s.budget.id}
                      command={{ type: "transaction.flag", ids: [t.id] }}
                      label="Save flag"
                    >
                      <label>
                        Flag
                        <select
                          name="flag"
                          defaultValue={s.flags.get(t.id) ?? ""}
                        >
                          <option value="">No flag</option>
                          {FLAG_COLORS.map((color) => (
                            <option key={color} value={color}>
                              {flagName(color, s.flagNames)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </FinanceForm>
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
                    {t.replacesId && (
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{ type: "transaction.undo", id: t.id }}
                        label="Undo last edit"
                      >
                        {(state?.reconciliationId ||
                          s.states.some(
                            (prior) =>
                              prior.transactionId === t.replacesId &&
                              prior.accountId === id &&
                              prior.reconciliationId,
                          )) && (
                          <label className="check-field">
                            <input
                              type="checkbox"
                              name="acknowledgeReconciled"
                            />
                            This transaction was reconciled; review the
                            statement again.
                          </label>
                        )}
                      </FinanceForm>
                    )}
                    <details className="rounded-md border border-border-warm p-space-md">
                      <summary className="cursor-pointer font-label-sm text-label-sm font-semibold text-text-primary">
                        Delete transaction
                      </summary>
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{
                          type: "transaction.void",
                          id: t.id,
                          reason: "Deleted in register",
                        }}
                        label="Delete transaction"
                      >
                        <label className="check-field">
                          <input type="checkbox" name="acknowledgeReconciled" />
                          Any affected reconciliation will need review.
                        </label>
                      </FinanceForm>
                    </details>
                    {primary ? (
                      <details className="rounded-md border border-border-warm p-space-md">
                        <summary className="cursor-pointer font-label-sm text-label-sm font-semibold text-text-primary">
                          Edit transaction
                        </summary>
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
                            cleared: state?.cleared ?? false,
                            transferAccountId: t.transferAccountId,
                            refundOfId: t.refundOfId,
                            splits: splits.map((x) => ({
                              categoryId: x.categoryId,
                              amount: dollars(x.amount),
                            })),
                          }}
                        />
                      </details>
                    ) : !primary ? (
                      other && (
                        <p className={MUTED}>
                          This is the other side of a transfer. Correct it from{" "}
                          <Link
                            className="font-semibold text-secondary underline underline-offset-2"
                            href={`/accounts/${other.id}`}
                          >
                            {other.name}
                          </Link>
                          .
                        </p>
                      )
                    ) : null}
                  </div>
                )}
              </div>
            </details>
          );
        })}
        {pages > 1 && (
          <nav
            aria-label="Transaction pages"
            className="flex flex-wrap items-center justify-between gap-space-sm border-t border-border-warm px-space-lg py-space-sm"
          >
            <span className={MUTED}>
              Page {pageNumber} of {pages} · {matching.length} transactions
            </span>
            <span className="flex gap-space-xs">
              {pageNumber > 1 && (
                <Link
                  className="secondary-button"
                  href={pageHref(pageNumber - 1)}
                >
                  Newer
                </Link>
              )}
              {pageNumber < pages && (
                <Link
                  className="secondary-button"
                  href={pageHref(pageNumber + 1)}
                >
                  Older
                </Link>
              )}
            </span>
          </nav>
        )}
      </section>
      {voided
        .filter(
          (t) =>
            t.voidReason === "Deleted in register" &&
            !s.transactions.some((next) => next.replacesId === t.id),
        )
        .map((t) => (
          <div
            className={`finance-panel mt-space-md ${CARD} p-space-md`}
            key={t.id}
          >
            <p className={MUTED}>
              Deleted {day(t.date)} · {t.payee || t.kind} · <Amount>{usd(legOf(t))}</Amount>
            </p>
            <FinanceForm
              budgetId={s.budget.id}
              command={{ type: "transaction.undo", id: t.id }}
              label="Undo delete"
            >
              <label className="check-field">
                <input type="checkbox" name="acknowledgeReconciled" />I
                understand a reconciled statement may need review.
              </label>
            </FinanceForm>
          </div>
        ))}
      <div className="mt-space-lg grid grid-cols-1 items-start gap-space-lg lg:grid-cols-2">
        {!account.closed && (
          <section className={`finance-panel ${CARD} p-space-lg`}>
            <h2 className={PANEL_H2}>Reconcile</h2>
            <p className={`mt-space-sm ${MUTED}`}>
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
        <section className={`finance-panel ${CARD} p-space-lg`}>
          <h2 className={PANEL_H2}>Account settings</h2>
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
            <p className={MUTED}>
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
function Balance({ label, amount }: { label: string; amount: bigint }) {
  return (
    <article className="flex flex-col rounded-lg border border-border-warm bg-surface-card p-space-lg">
      <span className="font-label-caps text-label-caps uppercase tracking-wider text-text-tertiary">
        {label}
      </span>
      <strong
        className={`mt-space-sm font-data-lg text-data-lg ${amount < 0n ? "text-status-negative-text" : "text-text-primary"}`}
        data-numeric
      >
        <Amount>{usd(amount)}</Amount>
      </strong>
    </article>
  );
}
