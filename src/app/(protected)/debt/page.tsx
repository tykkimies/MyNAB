import Link from "next/link";
import { CalendarCheck, Percent, Wallet } from "lucide-react";
import { debtPage } from "@/application/finance-page";
import { FinanceForm } from "@/components/finance-form";
import { TermsForm } from "@/components/terms-form";
import { requireUser } from "@/application/session";
import { managedCardPayments } from "@/application/schedules";
import { formatUSD, money } from "@/domain/money";
import { DEBT_TYPES } from "@/application/finance";
import { Amount, MaybeAmount } from "@/components/amount";
import { formatDate } from "@/domain/dates";
import Form from "next/form";

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
    account?: string;
  }>;
}) {
  const params = await searchParams;
  const s = await debtPage(params);
  const user = await requireUser();
  const payments = await managedCardPayments(user.userId, s.budget.id);
  const eligible = s.accounts.filter(
    (a) => DEBT_TYPES.includes(a.type) && !a.closed,
  );
  // Where a card's monthly payment can come from: open, on-budget cash.
  const payers = s.accounts.filter(
    (a) =>
      !DEBT_TYPES.includes(a.type) &&
      !a.closed &&
      a.participation === "BUDGET",
  );
  const preselected = eligible.some((a) => a.id === params.account)
    ? params.account
    : undefined;
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
                            {debt?.deferred && (
                              <small className="block font-body-sm text-body-sm font-normal text-status-warning-text">
                                deferred until{" "}
                                {monthName(debt.deferred.endsMonth)}
                              </small>
                            )}
                          </td>
                          <td className={`${TD} ${NUM} text-text-primary`}>
                            {debt?.currentMinimum != null ? (
                              <Amount>{usd(debt.currentMinimum)}</Amount>
                            ) : terms ? (
                              <Amount>{usd(terms.minimumPayment)}</Amount>
                            ) : (
                              "—"
                            )}
                            {terms && terms.minimumPercentBasisPoints > 0 && (
                              <small className="block font-body-sm text-body-sm font-normal text-text-tertiary">
                                {percent(terms.minimumPercentBasisPoints)}
                                {terms.minimumIncludesInterest
                                  ? " + interest"
                                  : ""}
                                {terms.minimumPayment > 0n && (
                                  <>
                                    , at least{" "}
                                    <Amount>{usd(terms.minimumPayment)}</Amount>
                                  </>
                                )}
                              </small>
                            )}
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
                    Compared with paying only the minimums, this plan{" "}
                    {s.comparison.interestDelta <= 0n ? "saves" : "costs"}{" "}
                    <Amount>
                      {usd(
                        s.comparison.interestDelta < 0n
                          ? -s.comparison.interestDelta
                          : s.comparison.interestDelta,
                      )}
                    </Amount>{" "}
                    in interest and moves being debt free from{" "}
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
                            {d.deferred && (
                              <small
                                className={`deferred-outcome block font-body-sm text-body-sm font-normal ${d.deferred.clearedInTime ? "text-status-ready-text" : "text-status-negative-text"}`}
                              >
                                {d.deferred.clearedInTime ? (
                                  <>
                                    Paid off before the deferred-interest
                                    deadline ({monthName(d.deferred.endsMonth)}
                                    ): no deferred interest.
                                  </>
                                ) : (
                                  <>
                                    Still owed at the deadline: deferred
                                    interest of{" "}
                                    <Amount>{usd(d.deferred.charged)}</Amount>{" "}
                                    charged in {monthName(d.deferred.endsMonth)}.
                                  </>
                                )}
                              </small>
                            )}
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
              <p className={`planned-note mt-space-sm ${MUTED}`}>
                {s.plannedBudget !== undefined ? (
                  <>
                    Showing what you pay now: your scheduled card payments,
                    or the minimum where that is higher, which comes to{" "}
                    <Amount>{usd(s.plannedBudget)}</Amount> a month. The
                    strategy sends everything above the minimums to one debt
                    at a time, and when a debt is cleared its whole payment
                    moves on to the next. Enter an extra amount, a budget or a
                    date below to try something else.
                  </>
                ) : (
                  "Every debt gets its minimum; everything above that goes to one debt at a time in strategy order, and a cleared debt's payment moves on to the next."
                )}
              </p>
              {/*
               * A plain GET form: the scenario lives in the query string and is
               * never stored, so there is nothing here for FinanceForm to post.
               */}
              <Form action="/debt" scroll={false} className="finance-form">
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
                        <option value="CUSTOM">Custom · your own order</option>
                      </select>
                    </label>
                    <fieldset className="custom-order col-span-full">
                      <legend className="font-label-sm text-label-sm font-semibold text-text-primary">
                        Custom order
                      </legend>
                      <p className={MUTED}>
                        With Custom, 1 is paid first. Every debt still gets its
                        minimum; the rest goes down this order.
                      </p>
                      <div className="mt-space-xs grid gap-space-xs">
                        {s.debts.map((d, index) => (
                          <div
                            className="grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-space-sm font-body-sm text-body-sm"
                            key={d.accountId}
                          >
                            <span className="min-w-0 truncate">{d.name}</span>
                            <input
                              name={`rank_${d.accountId}`}
                              inputMode="numeric"
                              maxLength={2}
                              aria-label={`Order for ${d.name}`}
                              defaultValue={String(
                                s.ranks[d.accountId] ?? index + 1,
                              )}
                            />
                          </div>
                        ))}
                      </div>
                    </fieldset>
                    {s.debts.some((d) => d.deferred) && (
                      <label>
                        Deferred-interest cards
                        <select
                          name="deferred"
                          aria-label="Deferred-interest cards"
                          defaultValue={s.clearDeferredFirst ? "" : "IGNORE"}
                          aria-describedby="deferred-help"
                        >
                          <option value="">
                            Pay off before the deadline (recommended)
                          </option>
                          <option value="IGNORE">
                            Treat like any other debt
                          </option>
                        </select>
                        <small id="deferred-help">
                          Recommended sends each one just enough every month
                          to be cleared before its promotion ends; the
                          strategy decides the rest.
                        </small>
                      </label>
                    )}
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
              </Form>
              <p className={`mt-space-sm ${MUTED}`}>
                Nothing is saved. Changing these only recalculates the estimate.
              </p>
            </section>
          )}

          {eligible.length > 0 && (
            <section
              className={`finance-panel ${CARD} p-space-lg`}
              id="terms"
            >
              <h2 className={PANEL_H2}>Record the terms</h2>
              <p className={`mt-space-sm ${MUTED}`}>
                From your statement. These are contract facts MyNAB cannot read
                from the ledger, and they are never guessed. Choose a card that
                already has terms to edit them: every field is filled in, and
                saving corrects them. A later &ldquo;takes effect
                from&rdquo; month records a change that starts then instead,
                such as a promotional rate ending.
              </p>
              <TermsForm
                budgetId={s.budget.id}
                accounts={eligible.map((a) => {
                  const t = s.terms.find((x) => x.accountId === a.id);
                  // The next version after the one in force, read as the end
                  // of an intro rate: its APR is the regular rate.
                  const next = t
                    ? s.termHistory
                        .filter(
                          (v) =>
                            v.accountId === a.id &&
                            v.effectiveFrom > t.effectiveFrom,
                        )
                        .sort((x, y) =>
                          x.effectiveFrom.localeCompare(y.effectiveFrom),
                        )[0]
                    : undefined;
                  const payment = payments.find((p) => p.cardId === a.id);
                  return {
                    id: a.id,
                    name: a.name,
                    owed: s.debts.find((d) => d.accountId === a.id)?.balance ?? 0n,
                    terms: t
                      ? {
                          apr: (
                            (next ?? t).aprBasisPoints / 100
                          ).toFixed(2),
                          introApr: next
                            ? (t.aprBasisPoints / 100).toFixed(2)
                            : "",
                          introEnds: next?.effectiveFrom ?? "",
                          introDeferred: Boolean(next && t.deferredInterest),
                          deferredAccrued:
                            t.deferredAccrued !== null
                              ? plain(t.deferredAccrued)
                              : "",
                          minimumPercent: t.minimumPercentBasisPoints
                            ? (t.minimumPercentBasisPoints / 100).toFixed(2)
                            : "",
                          minimumPayment: t.minimumPayment
                            ? plain(t.minimumPayment)
                            : "",
                          minimumIncludesInterest: t.minimumIncludesInterest,
                          statementBalance:
                            t.statementBalance !== null
                              ? plain(t.statementBalance)
                              : "",
                          statementDate: t.statementDate
                            ? t.statementDate.toISOString().slice(0, 10)
                            : "",
                          dueDay: t.dueDay ? String(t.dueDay) : "",
                          creditLimit:
                            t.creditLimit !== null ? plain(t.creditLimit) : "",
                          effectiveFrom: t.effectiveFrom,
                        }
                      : null,
                    payment: payment
                      ? {
                          payFromAccountId: payment.payFromAccountId,
                          amount: plain(payment.amount),
                        }
                      : null,
                  };
                })}
                payers={payers.map((a) => ({ id: a.id, name: a.name }))}
                preselected={preselected}
              />
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
