import Link from "next/link";
import { CalendarCheck, Percent, Wallet } from "lucide-react";
import { debtPage } from "@/application/finance-page";
import { FinanceForm } from "@/components/finance-form";
import { formatUSD, money } from "@/domain/money";
import { DEBT_TYPES } from "@/application/finance";
import { Amount, MaybeAmount } from "@/components/amount";
import { formatDate } from "@/domain/dates";

const usd = (n: bigint) => formatUSD(money(n));
// Form values must round-trip through parseUSD, which rejects separators, so a
// prefilled amount is plain decimal rather than the display formatting.
const plain = (n: bigint) =>
  `${n / 100n}.${(n % 100n).toString().padStart(2, "0")}`;
const percent = (basisPoints: number) => `${(basisPoints / 100).toFixed(2)}%`;
const CARD = "rounded-lg border border-border-warm bg-surface-card";
const PANEL_H2 = "font-headline-md text-headline-md text-text-primary";
const MUTED = "font-body-sm text-body-sm leading-relaxed text-text-secondary";
const TH =
  "px-space-sm py-space-sm text-left font-label-caps text-label-caps uppercase text-text-tertiary first:pl-space-lg last:pr-space-lg";
const TD = "px-space-sm py-space-sm align-middle font-body-sm text-body-sm";
const NUM = "font-data-mono text-data-mono";
const ROW =
  "border-b border-border-warm transition-colors last:border-b-0 hover:bg-row-hover";
const ROW_TH =
  "py-space-sm pl-space-lg pr-space-sm text-left align-middle font-body-md text-body-md font-medium text-text-primary";
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
    budget?: string;
    lump?: string;
    lumpMonth?: string;
    payoffBy?: string;
  }>;
}) {
  const s = await debtPage(await searchParams);
  const eligible = s.accounts.filter(
    (a) => DEBT_TYPES.includes(a.type) && !a.closed,
  );
  const missing = s.debts.filter((d) => !d.hasTerms);

  return (
    <main
      id="main"
      className="mx-auto w-full max-w-canvas px-gutter pb-space-xl pt-space-lg outline-none lg:px-space-lg"
      tabIndex={-1}
    >
      <div className="flex max-w-2xl flex-col">
        <span className="font-label-caps text-label-caps uppercase tracking-widest text-secondary">
          Debt
        </span>
        <h1 className="mt-space-xs font-headline-hero-mobile text-headline-hero-mobile leading-none text-text-primary lg:font-headline-hero lg:text-headline-hero">
          Find your way forward.
        </h1>
        <p className="mt-space-sm font-body-lg text-body-lg leading-relaxed text-text-secondary">
          Balances come from your ledger. Everything after today is an estimate
          built on your recorded rates, and no plan here ever moves real money
          or assigns anything.
        </p>
      </div>

      {s.plan && (
        <section
          className="mt-space-lg grid grid-cols-1 gap-space-md md:grid-cols-3"
          aria-label="Payoff estimate"
        >
          <article className="flex flex-col justify-between overflow-hidden rounded-lg bg-linear-to-br from-primary-container via-primary to-tertiary p-space-lg text-on-primary">
            <div className="flex items-start justify-between gap-space-sm">
              <span className="font-label-caps text-label-caps uppercase tracking-widest text-hero-muted">
                Debt free
              </span>
              <CalendarCheck size={20} aria-hidden />
            </div>
            <strong className="mt-space-md block font-headline-lg text-headline-lg font-normal text-hero-text">
              {s.plan.payoffMonth ? monthName(s.plan.payoffMonth) : "Never"}
            </strong>
            <span className="mt-space-sm font-body-sm text-body-sm text-hero-muted">
              On the plan shown, at today’s recorded terms
            </span>
          </article>
          <Metric
            label="Interest you would pay"
            value={usd(s.plan.totalInterest)}
            note="The cost of carrying these balances"
            Icon={Percent}
            tone="negative"
          />
          <Metric
            label="Total paid"
            value={usd(s.plan.totalPaid)}
            note="Principal and interest together"
            Icon={Wallet}
            tone="neutral"
          />
        </section>
      )}

      {missing.length > 0 && (
        <aside className="mt-space-md flex flex-col gap-space-xs rounded-lg border border-status-warning-border bg-status-warning-bg p-space-md">
          <strong className="font-headline-sm text-headline-sm text-status-warning-text">
            Terms are missing
          </strong>
          <p className={MUTED}>
            {missing.map((d) => d.name).join(", ")} owe money but have no rate
            or minimum recorded. No payoff plan is shown, because assuming a
            missing rate is zero would model an interest-free loan and flatter
            every number below.
          </p>
        </aside>
      )}

      {s.plan && s.plan.shortfallMonths.length > 0 && (
        <aside className="mt-space-md flex flex-col gap-space-xs rounded-lg border border-status-negative-border bg-status-negative-bg p-space-md">
          <strong className="font-headline-sm text-headline-sm text-status-negative-text">
            The budget does not cover the minimums
          </strong>
          <p className={MUTED}>
            In {s.plan.shortfallMonths.length} month
            {s.plan.shortfallMonths.length === 1 ? "" : "s"}, starting{" "}
            {monthName(s.plan.shortfallMonths[0])}, the required minimums are
            more than <Amount>{usd(s.monthlyBudget ?? 0n)}</Amount>. The plan still pays them,
            because minimums are not optional.
          </p>
        </aside>
      )}

      {s.payoffError && (
        <p className="mt-space-md rounded-lg border border-status-warning-border bg-status-warning-bg p-space-md text-status-warning-text" role="alert">
          Payoff date: {s.payoffError}.
        </p>
      )}

      {s.requiredMonthlyBudget !== null && (
        <p className="mt-space-md rounded-lg border border-border-warm bg-surface-card p-space-md font-body-md text-body-md text-text-primary">
          To clear the recorded debt by {monthName(s.payoffBy)}, plan about{" "}
          <strong><Amount>{usd(s.requiredMonthlyBudget)}</Amount> each month</strong>, including
          minimums. This is an estimate and does not assign money.
        </p>
      )}

      {s.plan && s.plan.negativelyAmortising.length > 0 && (
        <aside className="mt-space-md flex flex-col gap-space-xs rounded-lg border border-status-negative-border bg-status-negative-bg p-space-md">
          <strong className="font-headline-sm text-headline-sm text-status-negative-text">
            These never get paid off this way
          </strong>
          <p className={MUTED}>
            {s.plan.negativelyAmortising
              .map(
                (id) =>
                  s.debts.find((d) => d.accountId === id)?.name ?? "Account",
              )
              .join(", ")}
            : the interest charged each month is at least the minimum payment,
            so the balance grows no matter how long you keep paying. Pay more
            than the minimum, or the balance will not move.
          </p>
        </aside>
      )}

      <div className="mt-space-lg grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
        <div className="flex flex-col gap-space-lg xl:col-span-8">
          {!eligible.length && (
            <section className={`finance-panel ${CARD} p-space-lg`}>
              <h2 className={PANEL_H2}>No debt accounts yet</h2>
              <p className={`mt-space-sm ${MUTED}`}>
                Credit cards, lines of credit and loans appear here once you{" "}
                <Link
                  className="font-semibold text-secondary underline underline-offset-2"
                  href="/accounts"
                >
                  add one
                </Link>
                . Nothing is owed on an account with a zero or positive balance,
                so it is left out.
              </p>
            </section>
          )}

          {eligible.length > 0 && (
            <section className={`finance-panel overflow-hidden ${CARD}`}>
              <div className="border-b border-border-warm px-space-lg py-space-md">
                <h2 className={PANEL_H2}>What you owe</h2>
              </div>
              <div
                className="overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Debt accounts and their terms"
              >
                <table className="w-full min-w-[36rem] border-collapse">
                  <caption className="sr-only">
                    Debt accounts and their terms
                  </caption>
                  <thead>
                    <tr className="border-b border-border-warm bg-surface-container-low">
                      {["Account", "Balance", "APR", "Minimum", "Due day"].map(
                        (h) => (
                          <th className={TH} key={h}>
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {eligible.map((account) => {
                      const debt = s.debts.find(
                        (d) => d.accountId === account.id,
                      );
                      const terms = s.terms.find(
                        (t) => t.accountId === account.id,
                      );
                      return (
                        <tr className={ROW} key={account.id}>
                          <th className={ROW_TH} scope="row">
                            <Link
                              className="underline-offset-2 hover:underline"
                              href={`/accounts/${account.id}`}
                            >
                              {account.name}
                            </Link>
                            <small className="block font-body-sm text-body-sm font-normal uppercase text-text-tertiary">
                              {account.type.replaceAll("_", " ")}
                            </small>
                          </th>
                          <td
                            className={`${TD} ${NUM} ${debt ? "text-status-negative-text" : "text-text-secondary"}`}
                          >
                            <Amount>{debt ? usd(-debt.balance) : usd(0n)}</Amount>
                          </td>
                          <td className={`${TD} ${NUM} text-text-primary`}>
                            {terms ? percent(terms.aprBasisPoints) : "—"}
                          </td>
                          <td className={`${TD} ${NUM} text-text-primary`}>
                            {terms ? <Amount>{usd(terms.minimumPayment)}</Amount> : "—"}
                          </td>
                          <td
                            className={`py-space-sm pl-space-sm pr-space-lg align-middle ${NUM} text-text-secondary`}
                          >
                            {terms?.dueDay ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {s.plan && (
            <>
              {s.comparison &&
                (s.comparison.interestDelta !== 0n ||
                  s.comparison.baselineMonth !==
                    s.comparison.candidateMonth) && (
                  <p
                    className={`rounded-lg border border-border-warm bg-surface-container-low p-space-md ${MUTED}`}
                  >
                    Against paying only the minimums, this plan changes interest
                    by <Amount>{usd(s.comparison.interestDelta)}</Amount> and moves being debt
                    free from{" "}
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

              <section className={`finance-panel overflow-hidden ${CARD}`}>
                <div className="border-b border-border-warm px-space-lg py-space-md">
                  <h2 className={PANEL_H2}>Each debt</h2>
                </div>
                <div
                  className="overflow-x-auto"
                  tabIndex={0}
                  role="region"
                  aria-label="Estimated outcome per debt"
                >
                  <table className="w-full min-w-[34rem] border-collapse">
                    <caption className="sr-only">
                      Estimated outcome per debt
                    </caption>
                    <thead>
                      <tr className="border-b border-border-warm bg-surface-container-low">
                        {["Account", "Paid off", "Interest", "Total paid"].map(
                          (h) => (
                            <th className={TH} key={h}>
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {s.plan.debts.map((d) => (
                        <tr className={ROW} key={d.accountId}>
                          <th className={ROW_TH} scope="row">
                            {d.name}
                          </th>
                          <td className={`${TD} text-text-primary`}>
                            {d.payoffMonth ? monthName(d.payoffMonth) : "Never"}
                          </td>
                          <td
                            className={`${TD} ${NUM} text-status-negative-text`}
                          >
                            <Amount>{usd(d.totalInterest)}</Amount>
                          </td>
                          <td
                            className={`py-space-sm pl-space-sm pr-space-lg align-middle ${NUM} text-text-primary`}
                          >
                            <Amount>{usd(d.totalPaid)}</Amount>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {s.plan.truncated && (
                  <p
                    className={`border-t border-border-warm px-space-lg py-space-md ${MUTED}`}
                  >
                    The estimate stops after 30 years with money still owed, so
                    these totals are a floor rather than a final figure.
                  </p>
                )}
              </section>

              <details className={`finance-panel ${CARD} p-space-lg`}>
                <summary className={`cursor-pointer ${PANEL_H2}`}>
                  Month by month ({s.plan.rows.length} rows)
                </summary>
                <p className={`mt-space-sm ${MUTED}`}>
                  An estimate using recorded rate changes and today’s minimum
                  payments, with interest charged before an end-of-month
                  payment. Your statement will differ, and unknown future fees
                  are not included.
                </p>
                <div
                  className="mt-space-md overflow-x-auto"
                  tabIndex={0}
                  role="region"
                  aria-label="Estimated payment schedule"
                >
                  <table className="w-full min-w-[40rem] border-collapse">
                    <caption className="sr-only">
                      Estimated payment schedule
                    </caption>
                    <thead>
                      <tr className="border-b border-border-warm bg-surface-container-low">
                        {[
                          "Month",
                          "Account",
                          "Payment",
                          "Interest",
                          "Principal",
                          "Balance",
                        ].map((h) => (
                          <th
                            className="px-space-sm py-space-sm text-left font-label-caps text-label-caps uppercase text-text-tertiary"
                            key={h}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.plan.rows.slice(0, 240).map((r, i) => (
                        <tr
                          className="border-b border-border-warm last:border-b-0"
                          key={`${r.month}-${r.accountId}-${i}`}
                        >
                          <th
                            className={`px-space-sm py-space-sm text-left align-middle ${NUM} text-text-primary`}
                            scope="row"
                          >
                            {r.month}
                          </th>
                          <td className={`${TD} text-text-secondary`}>
                            {
                              s.debts.find((d) => d.accountId === r.accountId)
                                ?.name
                            }
                          </td>
                          <td className={`${TD} ${NUM} text-text-primary`}>
                            <Amount>{usd(r.payment)}</Amount>
                          </td>
                          <td
                            className={`${TD} ${NUM} text-status-negative-text`}
                          >
                            <Amount>{usd(r.interest)}</Amount>
                          </td>
                          <td className={`${TD} ${NUM} text-text-primary`}>
                            <Amount>{usd(r.principal)}</Amount>
                          </td>
                          <td className={`${TD} ${NUM} text-text-secondary`}>
                            <Amount>{usd(r.balance)}</Amount>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </div>

        <div className="flex flex-col gap-space-lg xl:col-span-4">
          {s.ready && (
            <section
              className={`finance-panel ${CARD} border-status-ready-border bg-status-ready-bg/40 p-space-lg`}
            >
              <h2 className={PANEL_H2}>Try a payoff plan</h2>
              {/*
               * A plain GET form: the scenario lives in the query string and is
               * never stored, so there is nothing here for FinanceForm to post.
               */}
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
                      Or a total monthly budget (USD)
                      <input
                        name="budget"
                        aria-label="Total monthly budget (USD)"
                        inputMode="decimal"
                        aria-describedby="budget-help"
                        defaultValue={
                          s.monthlyBudget !== undefined
                            ? plain(s.monthlyBudget)
                            : ""
                        }
                      />
                      <small id="budget-help">
                        Everything you can put toward debt, minimums included.
                        Replaces the extra amount.
                      </small>
                    </label>
                    <label>
                      One-off payment (USD)
                      <input
                        name="lump"
                        inputMode="decimal"
                        defaultValue={
                          s.lumpAmount > 0n ? plain(s.lumpAmount) : ""
                        }
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
                    <label>
                      Or pay off by month
                      <input
                        name="payoffBy"
                        type="month"
                        defaultValue={s.payoffBy}
                        aria-describedby="payoff-date-help"
                      />
                      <small id="payoff-date-help">
                        Calculates the monthly payment needed. Clear this to
                        use the extra or total monthly budget above instead.
                      </small>
                    </label>
                  </div>
                  <button className="primary-button" type="submit">
                    Show the plan
                  </button>
                </fieldset>
              </form>
              <p className={`mt-space-sm ${MUTED}`}>
                Nothing is saved. Changing these only recalculates the estimate.
              </p>
            </section>
          )}

          {eligible.length > 0 && (
            <section className={`finance-panel ${CARD} p-space-lg`}>
              <h2 className={PANEL_H2}>Record the terms</h2>
              <p className={`mt-space-sm ${MUTED}`}>
                From your statement. These are contract facts MyNAB cannot read
                from the ledger, and they are never guessed. Saving again
                records a new version rather than overwriting the old one, so a
                promotional rate is the intro rate now and the go-to rate from
                the month it ends.
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
                    <small id="apr-help">
                      A yearly percentage, such as 19.99.
                    </small>
                  </label>
                  <label>
                    Minimum payment (USD)
                    <input name="minimumPayment" required inputMode="decimal" />
                  </label>
                  <label>
                    Or percent of balance
                    <input
                      name="minimumPercent"
                      aria-label="Minimum percent of balance"
                      inputMode="decimal"
                      placeholder="1"
                      aria-describedby="minimum-percent-help"
                    />
                    <small id="minimum-percent-help">
                      Optional. The minimum is then the larger of the two.
                    </small>
                  </label>
                  <label className="check-field">
                    <input type="checkbox" name="minimumIncludesInterest" />
                    Percentage minimum adds the month&apos;s interest
                  </label>
                  <label>
                    Statement balance (USD)
                    <input
                      name="statementBalance"
                      inputMode="decimal"
                      aria-label="Statement balance (USD)"
                    />
                  </label>
                  <label>
                    Statement date
                    <input
                      type="date"
                      name="statementDate"
                      aria-label="Statement date"
                    />
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
                      Defaults to this month. Use the month a promotional rate
                      ends to record the rate that replaces it.
                    </small>
                  </label>
                </div>
              </FinanceForm>
            </section>
          )}

          {s.termHistory.length > 0 && (
            <section className={`finance-panel overflow-hidden ${CARD}`}>
              <div className="border-b border-border-warm px-space-lg py-space-md">
                <h2 className={PANEL_H2}>Recorded terms</h2>
                <p className={`mt-space-sm ${MUTED}`}>
                  Every version, newest first. The plan charges whichever rate
                  is in force in each month it works through, so a rate that
                  changes later is not applied to the months before it.
                </p>
              </div>
              {/* A table, not a list: the suite reads these back as rows. */}
              <div
                className="overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Recorded term versions"
              >
                <table className="w-full border-collapse">
                  <caption className="sr-only">Recorded term versions</caption>
                  <thead>
                    <tr className="border-b border-border-warm bg-surface-container-low">
                      {["Account", "From", "APR", "Min"].map((h) => (
                        <th className={TH} key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.termHistory.map((t) => (
                      <tr
                        className={ROW}
                        key={`${t.accountId}-${t.effectiveFrom}`}
                      >
                        <th className={ROW_TH} scope="row">
                          {s.accounts.find((a) => a.id === t.accountId)?.name ??
                            "Account"}
                          {t.statementBalance !== null && t.statementDate && (
                            <small className="block font-normal text-text-secondary">
                              Statement <Amount>{usd(t.statementBalance)}</Amount> ·{" "}
                              {formatDate(t.statementDate, s.budget.dateFormat)}
                            </small>
                          )}
                        </th>
                        <td className={`${TD} text-text-secondary`}>
                          {t.effectiveFrom === "1900-01"
                            ? "Always"
                            : monthName(t.effectiveFrom)}
                        </td>
                        <td className={`${TD} ${NUM} text-text-primary`}>
                          {percent(t.aprBasisPoints)}
                        </td>
                        <td
                          className={`py-space-sm pl-space-sm pr-space-lg align-middle ${NUM} text-text-primary`}
                        >
                          <Amount>{usd(t.minimumPayment)}</Amount>
                          {t.minimumPercentBasisPoints > 0 &&
                            ` or ${percent(t.minimumPercentBasisPoints)}${t.minimumIncludesInterest ? " + interest" : ""}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details className="m-space-lg mt-space-md rounded-md border border-border-warm p-space-md">
                <summary className="cursor-pointer font-label-sm text-label-sm font-semibold text-text-primary">
                  Remove a version
                </summary>
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
        </div>
      </div>
    </main>
  );
}
function Metric({
  label,
  value,
  note,
  Icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  Icon: typeof Wallet;
  tone: "negative" | "neutral";
}) {
  return (
    <article className="flex flex-col justify-between rounded-lg border border-border-warm bg-surface-card p-space-lg">
      <div className="flex items-start justify-between gap-space-sm">
        <span className="font-label-caps text-label-caps uppercase tracking-wider text-text-tertiary">
          {label}
        </span>
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${
            tone === "negative"
              ? "bg-status-negative-bg text-status-negative-text"
              : "bg-surface-container-low text-text-secondary"
          }`}
        >
          <Icon size={18} aria-hidden />
        </span>
      </div>
      <strong
        className={`mt-space-md block font-data-lg text-data-lg ${tone === "negative" ? "text-status-negative-text" : "text-text-primary"}`}
        data-numeric
      >
        <MaybeAmount value={value} />
      </strong>
      <span className="mt-space-sm font-body-sm text-body-sm text-text-secondary">
        {note}
      </span>
    </article>
  );
}
