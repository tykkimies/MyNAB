import Link from "next/link";
import { debtPage } from "@/application/finance-page";
import { FinanceForm } from "@/components/finance-form";
import { formatUSD, money } from "@/domain/money";
import { DEBT_TYPES } from "@/application/finance";

const usd = (n: bigint) => formatUSD(money(n));
// Form values must round-trip through parseUSD, which rejects separators, so a
// prefilled amount is plain decimal rather than the display formatting.
const plain = (n: bigint) =>
  `${n / 100n}.${(n % 100n).toString().padStart(2, "0")}`;
const percent = (basisPoints: number) => `${(basisPoints / 100).toFixed(2)}%`;
const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

export default async function Debt({
  searchParams,
}: {
  searchParams: Promise<{
    strategy?: string;
    extra?: string;
    lump?: string;
    lumpMonth?: string;
  }>;
}) {
  const s = await debtPage(await searchParams);
  const eligible = s.accounts.filter(
    (a) => DEBT_TYPES.includes(a.type) && !a.closed,
  );
  const missing = s.debts.filter((d) => !d.hasTerms);

  return (
    <main id="main" className="main finance" tabIndex={-1}>
      <div className="page-heading">
        <span className="eyebrow">DEBT</span>
        <h1>Find your way forward.</h1>
        <p>
          Balances come from your ledger. Everything after today is an estimate
          built on a fixed rate, and no plan here ever moves real money or
          assigns anything.
        </p>
      </div>

      {!eligible.length && (
        <section className="finance-panel">
          <h2>No debt accounts yet</h2>
          <p className="muted">
            Credit cards, lines of credit and loans appear here once you{" "}
            <Link href="/accounts">add one</Link>. Nothing is owed on an account
            with a zero or positive balance, so it is left out.
          </p>
        </section>
      )}

      {eligible.length > 0 && (
        <section className="finance-panel">
          <h2>What you owe</h2>
          <div className="table-scroll">
            <table>
              <caption className="sr-only">
                Debt accounts and their terms
              </caption>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Balance</th>
                  <th>APR</th>
                  <th>Minimum</th>
                  <th>Due day</th>
                </tr>
              </thead>
              <tbody>
                {eligible.map((account) => {
                  const debt = s.debts.find((d) => d.accountId === account.id);
                  const terms = s.terms.find((t) => t.accountId === account.id);
                  return (
                    <tr key={account.id}>
                      <th scope="row">
                        <Link href={`/accounts/${account.id}`}>
                          {account.name}
                        </Link>
                        <small>{account.type.replaceAll("_", " ")}</small>
                      </th>
                      <td className={debt ? "negative" : ""}>
                        {debt ? usd(-debt.balance) : usd(0n)}
                      </td>
                      <td>{terms ? percent(terms.aprBasisPoints) : "—"}</td>
                      <td>{terms ? usd(terms.minimumPayment) : "—"}</td>
                      <td>{terms?.dueDay ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {missing.length > 0 && (
        <aside className="finance-notice">
          <strong>Terms are missing</strong>
          <p>
            {missing.map((d) => d.name).join(", ")} owe money but have no rate
            or minimum recorded. No payoff plan is shown, because assuming a
            missing rate is zero would model an interest-free loan and flatter
            every number below.
          </p>
        </aside>
      )}

      {eligible.length > 0 && (
        <section className="finance-panel">
          <h2>Record the terms</h2>
          <p className="muted">
            From your statement. These are contract facts MyNAB cannot read from
            the ledger, and they are never guessed. Saving again records a new
            version rather than overwriting the old one, so a promotional rate
            is the intro rate now and the go-to rate from the month it ends.
          </p>
          <FinanceForm
            budgetId={s.budget.id}
            command={{ type: "debt.terms.set" }}
            label="Save terms"
          >
            <div className="field-grid">
              <label>
                Account
                <select name="accountId" required aria-label="Debt account">
                  {eligible.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                APR
                <input
                  name="apr"
                  required
                  inputMode="decimal"
                  placeholder="19.99"
                  aria-label="APR"
                  aria-describedby="apr-help"
                />
                <small id="apr-help">A yearly percentage, such as 19.99.</small>
              </label>
              <label>
                Minimum payment (USD)
                <input name="minimumPayment" required inputMode="decimal" />
              </label>
              <label>
                Due day
                <input
                  name="dueDay"
                  inputMode="numeric"
                  placeholder="15"
                  aria-label="Due day"
                  aria-describedby="due-day-help"
                />
                <small id="due-day-help">Day of the month, optional.</small>
              </label>
              <label>
                Credit limit (USD)
                <input
                  name="creditLimit"
                  inputMode="decimal"
                  aria-label="Credit limit (USD)"
                />
              </label>
              <label>
                Takes effect from
                <input
                  name="effectiveFrom"
                  placeholder="2027-04"
                  maxLength={7}
                  aria-label="Takes effect from"
                  aria-describedby="effective-help"
                />
                <small id="effective-help">
                  Defaults to this month. Use the month a promotional rate ends
                  to record the rate that replaces it.
                </small>
              </label>
            </div>
          </FinanceForm>
        </section>
      )}

      {s.termHistory.length > 0 && (
        <section className="finance-panel">
          <h2>Recorded terms</h2>
          <p className="muted">
            Every version, newest first. The plan below charges whichever rate
            is in force in each month it works through, so a rate that changes
            later is not applied to the months before it.
          </p>
          <div className="table-scroll">
            <table>
              <caption className="sr-only">Recorded term versions</caption>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>From</th>
                  <th>APR</th>
                  <th>Minimum</th>
                </tr>
              </thead>
              <tbody>
                {s.termHistory.map((t) => (
                  <tr key={`${t.accountId}-${t.effectiveFrom}`}>
                    <th scope="row">
                      {s.accounts.find((a) => a.id === t.accountId)?.name ??
                        "Account"}
                    </th>
                    <td>
                      {t.effectiveFrom === "1900-01"
                        ? "Always"
                        : monthName(t.effectiveFrom)}
                    </td>
                    <td>{percent(t.aprBasisPoints)}</td>
                    <td>{usd(t.minimumPayment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>Remove a version</summary>
            <FinanceForm
              budgetId={s.budget.id}
              command={{ type: "debt.terms.clear" }}
              label="Remove version"
            >
              <div className="field-grid">
                <label>
                  Account
                  <select
                    name="accountId"
                    required
                    aria-label="Account to change"
                  >
                    {eligible.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Version month
                  <input
                    name="effectiveFrom"
                    placeholder="2027-04"
                    maxLength={7}
                    aria-label="Version month"
                    aria-describedby="remove-help"
                  />
                  <small id="remove-help">
                    Leave empty to remove every version for that account.
                  </small>
                </label>
              </div>
            </FinanceForm>
          </details>
        </section>
      )}

      {s.ready && (
        <section className="finance-panel">
          <h2>Try a payoff plan</h2>
          <form className="finance-form" method="get">
            <fieldset>
              <div className="field-grid">
                <label>
                  Strategy
                  <select
                    name="strategy"
                    defaultValue={s.strategy}
                    aria-label="Strategy"
                  >
                    <option value="AVALANCHE">
                      Avalanche · highest rate first
                    </option>
                    <option value="SNOWBALL">
                      Snowball · smallest balance first
                    </option>
                  </select>
                </label>
                <label>
                  Extra each month (USD)
                  <input
                    name="extra"
                    inputMode="decimal"
                    defaultValue={
                      s.extraMonthly > 0n ? plain(s.extraMonthly) : ""
                    }
                  />
                </label>
                <label>
                  One-off payment (USD)
                  <input
                    name="lump"
                    inputMode="decimal"
                    defaultValue={s.lumpAmount > 0n ? plain(s.lumpAmount) : ""}
                  />
                </label>
                <label>
                  In month
                  <input
                    name="lumpMonth"
                    placeholder="2026-12"
                    maxLength={7}
                    defaultValue={s.lumpMonth}
                  />
                </label>
              </div>
              <button className="primary-button" type="submit">
                Show the plan
              </button>
            </fieldset>
          </form>
          <p className="muted">
            Nothing is saved. Changing these only recalculates the estimate.
          </p>
        </section>
      )}

      {s.plan && (
        <>
          <section className="money-summary" aria-label="Payoff estimate">
            <article>
              <span>Debt free</span>
              <strong>
                {s.plan.payoffMonth ? monthName(s.plan.payoffMonth) : "Never"}
              </strong>
            </article>
            <article className="negative">
              <span>Interest you would pay</span>
              <strong>{usd(s.plan.totalInterest)}</strong>
            </article>
            <article>
              <span>Total paid</span>
              <strong>{usd(s.plan.totalPaid)}</strong>
            </article>
          </section>

          {s.plan.negativelyAmortising.length > 0 && (
            <aside className="finance-notice">
              <strong>These never get paid off this way</strong>
              <p>
                {s.plan.negativelyAmortising
                  .map(
                    (id) =>
                      s.debts.find((d) => d.accountId === id)?.name ??
                      "Account",
                  )
                  .join(", ")}
                : the interest charged each month is at least the minimum
                payment, so the balance grows no matter how long you keep
                paying. Pay more than the minimum, or the balance will not move.
              </p>
            </aside>
          )}

          {s.comparison &&
            (s.comparison.interestDelta !== 0n ||
              s.comparison.baselineMonth !== s.comparison.candidateMonth) && (
              <p className="muted">
                Against paying only the minimums, this plan changes interest by{" "}
                {usd(s.comparison.interestDelta)} and moves being debt free from{" "}
                {s.comparison.baselineMonth
                  ? monthName(s.comparison.baselineMonth)
                  : "never"}{" "}
                to{" "}
                {s.comparison.candidateMonth
                  ? monthName(s.comparison.candidateMonth)
                  : "never"}
                .
              </p>
            )}

          <section className="finance-panel">
            <h2>Each debt</h2>
            <div className="table-scroll">
              <table>
                <caption className="sr-only">
                  Estimated outcome per debt
                </caption>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Paid off</th>
                    <th>Interest</th>
                    <th>Total paid</th>
                  </tr>
                </thead>
                <tbody>
                  {s.plan.debts.map((d) => (
                    <tr key={d.accountId}>
                      <th scope="row">{d.name}</th>
                      <td>
                        {d.payoffMonth ? monthName(d.payoffMonth) : "Never"}
                      </td>
                      <td className="negative">{usd(d.totalInterest)}</td>
                      <td>{usd(d.totalPaid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {s.plan.truncated && (
              <p className="muted">
                The estimate stops after 30 years with money still owed, so
                these totals are a floor rather than a final figure.
              </p>
            )}
          </section>

          <details className="finance-panel">
            <summary>Month by month ({s.plan.rows.length} rows)</summary>
            <p className="muted">
              An estimate at a fixed rate, with interest charged before an
              end-of-month payment. Your statement will differ, and unknown
              future fees are not included.
            </p>
            <div className="table-scroll">
              <table>
                <caption className="sr-only">
                  Estimated payment schedule
                </caption>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Account</th>
                    <th>Payment</th>
                    <th>Interest</th>
                    <th>Principal</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {s.plan.rows.slice(0, 240).map((r, i) => (
                    <tr key={`${r.month}-${r.accountId}-${i}`}>
                      <th scope="row">{r.month}</th>
                      <td>
                        {s.debts.find((d) => d.accountId === r.accountId)?.name}
                      </td>
                      <td>{usd(r.payment)}</td>
                      <td className="negative">{usd(r.interest)}</td>
                      <td>{usd(r.principal)}</td>
                      <td>{usd(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </main>
  );
}
