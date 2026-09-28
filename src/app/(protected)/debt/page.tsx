import Link from "next/link";
import { debtPage } from "@/application/finance-page";
import { isPhone } from "@/infrastructure/view";
import { PhoneDebt } from "./phone";
import { FinanceForm } from "@/components/finance-form";
import { TermsForm } from "@/components/terms-form";
import { Drawer, DrawerSection } from "@/components/drawer";
import { requireUser } from "@/application/session";
import {
  cardPaymentTargets,
  managedLoanPayments,
} from "@/application/schedules";
import { formatUSD, money } from "@/domain/money";
import {
  deferredChargeMonth,
  deferredDeadline,
  firstPaymentMonth,
  paymentDueDate,
} from "@/domain/debt";
import { DEBT_TYPES } from "@/application/finance";
import { Amount } from "@/components/amount";
import { formatDate } from "@/domain/dates";
import Form from "next/form";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryStrip, Stat } from "@/components/ui/summary-strip";
import { Notice, NoticeList } from "@/components/ui/notice";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { Help } from "@/components/ui/help";
import { PushTest } from "@/components/push-test";
import { getConfig } from "@/infrastructure/config";
import { pushConfigured } from "@/infrastructure/push";
import type { ReactNode } from "react";

const usd = (n: bigint) => formatUSD(money(n));
// Form values must round-trip through parseUSD, which rejects separators, so a
// prefilled amount is plain decimal rather than the display formatting.
const plain = (n: bigint) =>
  `${n / 100n}.${(n % 100n).toString().padStart(2, "0")}`;
const percent = (basisPoints: number) => `${(basisPoints / 100).toFixed(2)}%`;
const MUTED = "text-table text-ink-2";
// Reminder wording carries dollar figures; each goes inside <Amount> so Hide
// Amounts masks it.
const withAmounts = (text: string): ReactNode[] =>
  text
    .split(/(\$[\d,]+\.\d{2})/)
    .map((part, i) =>
      i % 2 ? <Amount key={i}>{part}</Amount> : part,
    );
const DONE_LABEL: Record<string, string> = {
  PAYMENT_CHANGE: "Done at the bank",
  TERMS_CHECK: "Rates unchanged",
  UNDERPAID: "Checked",
  PROMO_AT_RISK: "Got it",
  PROMO_DEADLINE: "Got it",
  RATE_MISMATCH: "Rate is right",
};
const shortMonth = (month: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
const nextMonthOf = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};
const monthsBetweenPlan = (from: string, to: string) => {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
};
const longDate = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
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
    /** "schedule" opens the month-by-month drawer. */
    view?: string;
  }>;
}) {
  const params = await searchParams;
  // Which drawer is open is not part of the scenario.
  const { view, ...scenarioParams } = params;
  const s = await debtPage(scenarioParams);
  if (await isPhone())
    return (
      <PhoneDebt
        s={s}
        account={params.account}
        withAmounts={withAmounts}
        doneLabel={DONE_LABEL}
      />
    );
  const user = await requireUser();
  const payments = await cardPaymentTargets(user.userId, s.budget.id);
  const loanPayments = await managedLoanPayments(user.userId, s.budget.id);
  const eligible = s.accounts.filter(
    (a) => DEBT_TYPES.includes(a.type) && !a.closed,
  );
  // Monthly payments come from open, on-budget cash accounts.
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
  // The schedule by each card's due date, earliest first within a month.
  // Plan months are the months payments fall due, so a row's due date is its
  // month on the card's due day. Without a due day, just the month.
  const scheduleRows = (s.plan?.rows ?? [])
    .map((r) => {
      const debt = s.debts.find((d) => d.accountId === r.accountId);
      return { ...r, due: debt?.dueDay ? paymentDueDate(debt, r.month) : null };
    })
    .sort(
      (a, b) =>
        (a.due ?? `${a.month}-99`).localeCompare(b.due ?? `${b.month}-99`) ||
        a.month.localeCompare(b.month),
    );
  // What clears a deferred balance with the payments due before its last
  // day, from the first one not yet made (the plan's own rule).
  const deferredPerMonth = (
    debt: (typeof s.debts)[number],
  ): bigint | null => {
    if (!debt.deferred || debt.balance <= 0n) return null;
    const left = BigInt(
      monthsBetweenPlan(
        firstPaymentMonth(debt, s.month),
        deferredChargeMonth(debt, debt.deferred, s.month),
      ),
    );
    return left > 0n ? (debt.balance + left - 1n) / left : null;
  };
  // The scenario in the address, without the drawer that is open.
  const scenarioQuery = new URLSearchParams(
    Object.entries(scenarioParams).filter(
      (e): e is [string, string] => e[0] !== "account" && Boolean(e[1]),
    ),
  ).toString();
  const closeHref = `/debt${scenarioQuery ? `?${scenarioQuery}` : ""}`;
  const withDrawer = (drawer: string) =>
    `/debt?${scenarioQuery ? `${scenarioQuery}&` : ""}${drawer}`;
  const withAccount = (id: string) => withDrawer(`account=${id}`);
  const scheduleHref = withDrawer("view=schedule");
  const showSchedule = view === "schedule" && Boolean(s.plan);
  const plannerHref = withDrawer("view=plan");
  const showPlanner = view === "plan" && s.ready;
  // What the plan shown pays each month, as the summary strip reports it.
  const planMonthly =
    s.requiredMonthlyBudget ?? s.monthlyBudget ?? s.plannedBudget;
  const comparison =
    s.comparison &&
    (s.comparison.interestDelta !== 0n ||
      s.comparison.baselineMonth !== s.comparison.candidateMonth)
      ? s.comparison
      : null;
  const notices =
    missing.length > 0 ||
    (s.plan && s.plan.shortfallMonths.length > 0) ||
    s.payoffError ||
    s.requiredMonthlyBudget !== null ||
    (s.plan && s.plan.negativelyAmortising.length > 0) ||
    comparison;
  const selected = eligible.find((a) => a.id === preselected);
  const selectedOutcome =
    selected && s.plan?.debts.find((d) => d.accountId === selected.id);
  const selectedHistory = selected
    ? s.termHistory.filter((t) => t.accountId === selected.id)
    : [];
  // Keyed by account: moving from one debt's drawer to another's starts the
  // form afresh instead of keeping the last one's fields.
  const termsForm = selected && (
    <TermsForm
      key={selected.id}
      budgetId={s.budget.id}
      accounts={[selected].map((a) => {
        const t = s.terms.find((x) => x.accountId === a.id);
        // The next version after the one in force, read as the end of an
        // intro rate: its APR is the regular rate.
        const next = t
          ? s.termHistory
              .filter(
                (v) => v.accountId === a.id && v.effectiveFrom > t.effectiveFrom,
              )
              .sort((x, y) => x.effectiveFrom.localeCompare(y.effectiveFrom))[0]
          : undefined;
        const payment =
          a.participation === "TRACKING"
            ? loanPayments.find((p) => p.accountId === a.id)
            : payments.find((p) => p.cardId === a.id);
        return {
          id: a.id,
          name: a.name,
          isLoan: a.participation === "TRACKING",
          owed: s.debts.find((d) => d.accountId === a.id)?.balance ?? 0n,
          terms: t
            ? {
                apr: ((next ?? t).aprBasisPoints / 100).toFixed(2),
                introApr: next ? (t.aprBasisPoints / 100).toFixed(2) : "",
                // The exact last day when saved; for a promotion saved as a
                // month, the last day of the month before it (as planned).
                introEndsOn: next
                  ? t.promoEndsOn
                    ? t.promoEndsOn.toISOString().slice(0, 10)
                    : deferredDeadline({
                        endsMonth: next.effectiveFrom,
                        aprBasisPoints: 0,
                      })
                  : "",
                introDeferred: Boolean(next && t.deferredInterest),
                deferredAccrued:
                  t.deferredAccrued !== null ? plain(t.deferredAccrued) : "",
                minimumPercent: t.minimumPercentBasisPoints
                  ? (t.minimumPercentBasisPoints / 100).toFixed(2)
                  : "",
                minimumPayment: t.minimumPayment ? plain(t.minimumPayment) : "",
                minimumIncludesInterest: t.minimumIncludesInterest,
                statementBalance:
                  t.statementBalance !== null ? plain(t.statementBalance) : "",
                statementDate: t.statementDate
                  ? t.statementDate.toISOString().slice(0, 10)
                  : "",
                dueDay: t.dueDay ? String(t.dueDay) : "",
                creditLimit: t.creditLimit !== null ? plain(t.creditLimit) : "",
                effectiveFrom: t.effectiveFrom,
              }
            : null,
          payment: payment
            ? {
                payFromAccountId:
                  "payFromAccountId" in payment ? payment.payFromAccountId : "",
                amount: plain(payment.amount),
                categoryId: "categoryId" in payment ? payment.categoryId : null,
              }
            : null,
        };
      })}
      payers={payers.map((a) => ({ id: a.id, name: a.name }))}
      paymentCategories={s.paymentCategories}
      preselected={preselected}
    />
  );
  const termsHelp = (
    <Help label="About recording terms" align="right">
      From your statement or loan agreement. These are contract facts MyNAB
      cannot read from the ledger, and they are never guessed. Every field is
      filled in from the terms in force, and saving corrects them. A later
      “takes effect from” month records a change that starts then instead,
      such as a promotional rate ending.
    </Help>
  );

  return (
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        title="Debt"
        meta={
          eligible.length > 0
            ? `${eligible.length} ${eligible.length === 1 ? "account" : "accounts"} · estimates from your recorded terms`
            : undefined
        }
        actions={
          <>
            {s.ready && (
              <Link
                className="btn btn-secondary btn-sm"
                href={plannerHref}
                scroll={false}
              >
                Try a payoff plan
              </Link>
            )}
            {s.plan && (
              <Link
                className="btn btn-secondary btn-sm"
                href={scheduleHref}
                scroll={false}
              >
                Month by month
              </Link>
            )}
            <Help label="About the Debt page" align="right">
              Balances come from your ledger. Everything after today is an
              estimate built on your recorded rates, and no plan here ever
              moves real money or assigns anything.
            </Help>
          </>
        }
      />
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        {scenarioQuery && (s.adopted ? !s.showingAdopted : true) && (
          <div className="what-if mt-4">
            <Notice
              tone={s.adopted ? "warning" : "accent"}
              action={
                <Link className="btn btn-secondary btn-sm" href="/debt" scroll={false}>
                  {s.adopted ? "Back to my plan" : "Clear what-if"}
                </Link>
              }
            >
              <strong>
                {s.adopted
                  ? "You are looking at a what-if, not the plan you follow."
                  : "You are looking at a what-if."}
              </strong>{" "}
              Nothing here changes your budget until you adopt it.
            </Notice>
          </div>
        )}
        {s.plan && (
          <SummaryStrip ariaLabel="Payoff estimate">
            <Stat
              lead
              label="Debt free"
              value={s.plan.payoffMonth ? monthName(s.plan.payoffMonth) : "Never"}
              tone={s.plan.payoffMonth ? "neutral" : "negative"}
              note="On the plan shown, at today’s recorded terms"
            />
            <Stat
              label="Interest you would pay"
              value={usd(s.plan.totalInterest)}
              tone="negative"
              note="The cost of carrying these balances"
            />
            <Stat
              label="Total paid"
              value={usd(s.plan.totalPaid)}
              note="Principal and interest together"
            />
            {(s.requiredMonthlyBudget !== null ||
              s.monthlyBudget !== undefined ||
              s.plannedBudget !== undefined) && (
              // Always the total the schedule below was worked out with.
              <Stat
                label="Toward debt each month"
                value={usd(
                  s.requiredMonthlyBudget ??
                    s.monthlyBudget ??
                    s.plannedBudget ??
                    0n,
                )}
                note={
                  s.requiredMonthlyBudget !== null
                    ? `What clears everything by ${monthName(s.payoffBy)}`
                    : s.monthlyBudget !== undefined
                      ? "The budget this plan uses"
                      : "Your card payment targets, or the minimums where higher"
                }
              />
            )}
          </SummaryStrip>
        )}
        {notices && (
          <div className="mt-3">
            <NoticeList>
              {missing.length > 0 && (
                <Notice tone="warning">
                  <strong>Terms are missing.</strong>{" "}
                  {missing.map((d, i) => (
                    <span key={d.accountId}>
                      {i > 0 && ", "}
                      <Link
                        className="underline underline-offset-2"
                        href={withAccount(d.accountId)}
                        scroll={false}
                      >
                        {d.name}
                      </Link>
                    </span>
                  ))}{" "}
                  owe money but have no
                  rate or minimum recorded. No payoff plan is shown, because
                  assuming a missing rate is zero would model an interest-free
                  loan and flatter every number below.
                </Notice>
              )}
              {s.plan && s.plan.shortfallMonths.length > 0 && (
                <Notice tone="negative">
                  <strong>The budget does not cover the minimums.</strong> In{" "}
                  {s.plan.shortfallMonths.length} month
                  {s.plan.shortfallMonths.length === 1 ? "" : "s"}, starting{" "}
                  {monthName(s.plan.shortfallMonths[0])}, the required minimums
                  are more than <Amount>{usd(s.monthlyBudget ?? 0n)}</Amount>.
                  The plan still pays them, because minimums are not optional.
                </Notice>
              )}
              {s.payoffError && (
                <Notice tone="warning" role="alert">
                  Payoff date: {s.payoffError}.
                </Notice>
              )}
              {s.requiredMonthlyBudget !== null && (
                <Notice tone="accent">
                  To clear the recorded debt by {monthName(s.payoffBy)}, plan
                  about{" "}
                  <strong>
                    <Amount>{usd(s.requiredMonthlyBudget)}</Amount> each month
                  </strong>
                  , including minimums. This is an estimate and does not assign
                  money.
                </Notice>
              )}
              {s.plan && s.plan.negativelyAmortising.length > 0 && (
                <Notice tone="negative">
                  <strong>These never get paid off this way.</strong>{" "}
                  {s.plan.negativelyAmortising
                    .map(
                      (id) =>
                        s.debts.find((d) => d.accountId === id)?.name ?? "Account",
                    )
                    .join(", ")}
                  : the interest charged each month is at least the minimum
                  payment, so the balance grows no matter how long you keep
                  paying. Pay more than the minimum, or the balance will not
                  move.
                </Notice>
              )}
              {comparison && (
                <Notice>
                  Compared with paying only the minimums, this plan{" "}
                  {comparison.interestDelta <= 0n ? "saves" : "costs"}{" "}
                  <Amount>
                    {usd(
                      comparison.interestDelta < 0n
                        ? -comparison.interestDelta
                        : comparison.interestDelta,
                    )}
                  </Amount>{" "}
                  in interest and moves being debt free from{" "}
                  {comparison.baselineMonth
                    ? monthName(comparison.baselineMonth)
                    : "never"}{" "}
                  to{" "}
                  {comparison.candidateMonth
                    ? monthName(comparison.candidateMonth)
                    : "never"}
                  .
                </Notice>
              )}
            </NoticeList>
          </div>
        )}

        <div
          className={`mt-4 grid items-start gap-4 ${s.adopted ? "xl:grid-cols-[minmax(0,1fr)_24rem]" : ""}`}
        >
          <div className="flex min-w-0 flex-col gap-4">
            {s.terms.length > 0 && (
              <section
                className="surface"
                aria-labelledby="bank-heading"
                data-bank-todo
              >
                <div className="flex items-baseline justify-between gap-2 px-4 py-2 lg:px-6">
                  <h2 id="bank-heading" className="section-title">
                    To do at the bank
                  </h2>
                  <Help label="About bank reminders" align="right">
                    MyNAB can change a budget target, but not what your bank
                    pays. When the plan moves money between cards, a rate may
                    have changed, or a promotion is ending, it is listed here
                    until you mark it done. Marking a payment change done
                    records that amount as what your bank is set to pay.
                  </Help>
                </div>
                {s.reminders.length ? (
                  <ul className="divide-y divide-hairline text-table">
                    {s.reminders.map((r) => (
                      <li
                        key={r.id}
                        data-reminder={r.kind}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 lg:px-6"
                      >
                        <p className="min-w-0 flex-1">
                          <Pill tone={r.level === "act" ? "warning" : "neutral"}>
                            {r.level === "act" ? "Do now" : "Check"}
                          </Pill>{" "}
                          {withAmounts(r.text)}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          {(r.kind === "TERMS_CHECK" ||
                            r.kind === "RATE_MISMATCH") && (
                            <Link
                              className="btn btn-ghost btn-sm"
                              href={withAccount(r.accountId)}
                              scroll={false}
                            >
                              Update terms
                            </Link>
                          )}
                          <FinanceForm
                            budgetId={s.budget.id}
                            command={{ type: "debt.reminder.done", id: r.id }}
                            inline
                            label={DONE_LABEL[r.kind] ?? "Done"}
                            buttonClassName="btn-sm"
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={`${MUTED} px-4 pb-3 lg:px-6`}>
                    Nothing to change at the bank right now.
                  </p>
                )}
                <div className={`${MUTED} flex flex-wrap items-center justify-between gap-2 border-t border-hairline px-4 py-2 lg:px-6`}>
                  {pushConfigured(getConfig()) ? (
                    <>
                      <span>These reminders are also sent to your phone.</span>
                      <PushTest />
                    </>
                  ) : (
                    <span>
                      Set NTFY_TOPIC on the server to get these reminders on
                      your phone.
                    </span>
                  )}
                </div>
              </section>
            )}
            <section className="surface" aria-labelledby="owed-heading">
              <div className="flex items-baseline justify-between gap-2 px-4 py-2 lg:px-6">
                <h2 id="owed-heading" className="section-title">
                  What you owe
                </h2>
                {s.plan?.truncated && (
                  <span className={MUTED}>
                    Stops after 30 years with money still owed; totals are a
                    floor.
                  </span>
                )}
              </div>
              {!eligible.length ? (
                <EmptyState
                  title="No debt accounts yet"
                  action={
                    <Link className="btn btn-secondary" href="/accounts">
                      Add an account
                    </Link>
                  }
                >
                  Credit cards, lines of credit and loans appear here once you
                  add one. Nothing is owed on an account with a zero or
                  positive balance, so it is left out.
                </EmptyState>
              ) : (
                <div
                  className="max-sm:overflow-x-auto"
                  tabIndex={0}
                  role="region"
                  aria-label="Debt accounts and their terms"
                >
                  <table className="ledger">
                    <caption className="sr-only">
                      Debt accounts and their terms
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Account</th>
                        <th scope="col" className="num">
                          Balance
                        </th>
                        <th scope="col" className="num">
                          APR
                        </th>
                        <th scope="col" className="num" data-hide="sm">
                          Minimum
                        </th>
                        {s.plan && (
                          <>
                            <th scope="col" data-hide="sm">
                              Paid off
                            </th>
                            <th scope="col" className="num" data-hide="sm">
                              Interest
                            </th>
                          </>
                        )}
                        <th scope="col" className="num">
                          <span className="sr-only">Terms</span>
                        </th>
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
                        const outcome = s.plan?.debts.find(
                          (d) => d.accountId === account.id,
                        );
                        return (
                          <tr
                            key={account.id}
                            data-selected={
                              preselected === account.id ? "" : undefined
                            }
                          >
                            <th scope="row">
                              <Link
                                className="underline-offset-2 hover:underline"
                                href={`/accounts/${account.id}`}
                              >
                                {account.name}
                              </Link>
                              <span className="ledger-sub">
                                {account.type.replaceAll("_", " ").toLowerCase()}
                                {debt?.deferred ? (
                                  <>
                                    {` · deferred through ${longDate(deferredDeadline(debt.deferred))}`}
                                    {deferredPerMonth(debt) !== null && (
                                      <>
                                        {" · "}
                                        <Amount>
                                          {usd(deferredPerMonth(debt)!)}
                                        </Amount>
                                        /mo to clear
                                      </>
                                    )}
                                  </>
                                ) : (
                                  ""
                                )}
                              </span>
                              {outcome?.deferred && (
                                <DeferredOutcome deferred={outcome.deferred} />
                              )}
                            </th>
                            <td
                              className={`num ${debt ? "text-negative" : "text-ink-2"}`}
                            >
                              <Amount>{debt ? usd(-debt.balance) : usd(0n)}</Amount>
                            </td>
                            <td className="num text-ink">
                              {terms ? percent(terms.aprBasisPoints) : "—"}
                            </td>
                            <td className="num text-ink" data-hide="sm">
                              {debt?.currentMinimum != null ? (
                                <Amount>{usd(debt.currentMinimum)}</Amount>
                              ) : terms ? (
                                <Amount>{usd(terms.minimumPayment)}</Amount>
                              ) : (
                                "—"
                              )}
                              {terms && terms.minimumPercentBasisPoints > 0 && (
                                <span className="ledger-sub">
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
                                </span>
                              )}
                            </td>
                            {s.plan && (
                              <>
                                <td className="text-ink" data-hide="sm">
                                  {outcome
                                    ? outcome.payoffMonth
                                      ? monthName(outcome.payoffMonth)
                                      : "Never"
                                    : "—"}
                                </td>
                                <td className="num text-negative" data-hide="sm">
                                  {outcome ? (
                                    <Amount>{usd(outcome.totalInterest)}</Amount>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                              </>
                            )}
                            <td className="num">
                              <Link
                                className="btn btn-ghost btn-sm -mr-2"
                                href={withAccount(account.id)}
                                scroll={false}
                                aria-label={`Edit ${account.name} terms`}
                              >
                                {terms ? "Edit terms" : "Add terms"}
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

          </div>

          <div className="flex min-w-0 flex-col gap-4 empty:hidden">
            {s.adopted && (
              <section
                className="adopted-plan surface p-4"
                aria-labelledby="adopted-plan-heading"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 id="adopted-plan-heading" className="section-title">
                    Your payoff plan
                  </h2>
                  <Pill tone="accent">Following</Pill>
                </div>
                <p className={`mt-1 ${MUTED}`}>
                  {s.adopted.strategy === "AVALANCHE"
                    ? "Avalanche"
                    : s.adopted.strategy === "SNOWBALL"
                      ? "Snowball"
                      : "Custom order"}
                  {s.adopted.monthlyBudget ? (
                    <>
                      , <Amount>{usd(s.adopted.monthlyBudget)}</Amount> a month
                      toward debt
                    </>
                  ) : s.adopted.extraMonthly > 0n ? (
                    <>
                      , minimums plus{" "}
                      <Amount>{usd(s.adopted.extraMonthly)}</Amount>
                    </>
                  ) : (
                    ", minimums only"
                  )}
                  {s.adopted.clearDeferredFirst
                    ? ", clearing deferred-interest cards before their deadlines."
                    : "."}{" "}
                  {s.showingAdopted ? "The estimate on this page is this plan." : ""}
                </p>
                {s.showingAdopted && s.plan && (
                  <Link
                    className="mt-1 inline-block text-label text-accent-text underline-offset-2 hover:underline"
                    href={scheduleHref}
                    scroll={false}
                  >
                    See every payment, month by month
                  </Link>
                )}
                <Link
                  className="mt-1 ml-4 inline-block text-label text-accent-text underline-offset-2 hover:underline"
                  href={plannerHref}
                  scroll={false}
                >
                  Try something else
                </Link>
                <p className={`plan-tracking mt-2 ${MUTED}`}>
                  The plan keeps itself up to date: at the start of each month
                  it is worked out again from your balances and each card&apos;s
                  payment target is set. A card that is
                  paid off leaves the plan and stops asking for payments; new
                  spending on it does not bring it back.
                </p>
                {s.adopted.appliedMonth === s.month ? (
                  <ul className="plan-payments mt-2 divide-y divide-hairline text-table">
                    {Object.entries(s.adopted.applied)
                      .filter(([id]) => !s.adopted!.overridden.includes(id))
                      .map(([id, cents]) => {
                        const name =
                          s.accounts.find((a) => a.id === id)?.name ?? "Card";
                        const pinned = s.adopted!.pins.some(
                          (p) => p.accountId === id && p.month === s.month,
                        );
                        return (
                          <li
                            className="flex flex-wrap items-center justify-between gap-2 py-1"
                            key={id}
                            data-card={name}
                          >
                            <span className="min-w-0 flex-1">
                              {name}{" "}
                              {pinned && <Pill tone="accent">Fixed</Pill>}
                            </span>
                            <span className="text-num text-ink" data-numeric>
                              <Amount>{usd(BigInt(cents))}</Amount>
                            </span>
                            {pinned ? (
                              <FinanceForm
                                budgetId={s.budget.id}
                                command={{
                                  type: "debt.plan.pin",
                                  accountId: id,
                                  month: s.month,
                                }}
                                label="Use the plan"
                                buttonLabel={`Let the plan choose ${name}'s payment`}
                                inline
                                buttonClassName="btn-ghost btn-sm"
                              />
                            ) : (
                              <details className="popover" data-align="right">
                                <summary
                                  className="btn btn-ghost btn-sm"
                                  aria-label={`Set ${name}'s payment`}
                                >
                                  Set amount
                                </summary>
                                <div className="popover-panel">
                                  <FinanceForm
                                    budgetId={s.budget.id}
                                    command={{
                                      type: "debt.plan.pin",
                                      accountId: id,
                                      month: s.month,
                                    }}
                                    label="Fix this payment"
                                    closeDetailsOnSave
                                  >
                                    <label>
                                      {name} pays (USD)
                                      <input
                                        name="amount"
                                        inputMode="decimal"
                                        required
                                        defaultValue={plain(BigInt(cents))}
                                      />
                                    </label>
                                    <p className={MUTED}>
                                      For a payment the bank will take anyway.
                                      The other cards are planned around it.
                                    </p>
                                  </FinanceForm>
                                </div>
                              </details>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                ) : (
                  <div className="mt-2">
                    <Notice tone="warning">
                      {monthName(s.month)}&apos;s payments are not applied yet.
                      They are applied automatically within a day, or apply
                      them now.
                    </Notice>
                  </div>
                )}
                {s.adopted.paidOff.length > 0 && (
                  <div className="paid-off mt-2">
                    <p className="text-caps uppercase text-ink-3">
                      Paid off and out of the plan
                    </p>
                    <ul className="mt-1 divide-y divide-hairline text-table">
                      {s.adopted.paidOff.map((card) => (
                        <li
                          className="flex flex-wrap items-center justify-between gap-2 py-1"
                          key={card.id}
                        >
                          <span>{card.name}</span>
                          <FinanceForm
                            budgetId={s.budget.id}
                            command={{ type: "debt.plan.include", accountId: card.id }}
                            label={`Add ${card.name} back`}
                            inline
                            buttonClassName="btn-sm"
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {s.adopted.overridden.length > 0 && (
                  <p className={`mt-2 ${MUTED}`}>
                    Left alone because you changed their targets by hand:{" "}
                    {s.adopted.overridden
                      .map((id) => s.accounts.find((a) => a.id === id)?.name)
                      .join(", ")}
                    .
                  </p>
                )}
                {s.adopted.pins.some((p) => p.month > s.month) && (
                  <div className="plan-pins mt-2">
                    <p className="text-caps uppercase text-ink-3">
                      Fixed later payments
                    </p>
                    <ul className="mt-1 divide-y divide-hairline text-table">
                      {s.adopted.pins
                        .filter((p) => p.month > s.month)
                        .map((p) => {
                          const name =
                            s.accounts.find((a) => a.id === p.accountId)?.name ??
                            "Card";
                          return (
                            <li
                              className="flex flex-wrap items-center justify-between gap-2 py-1"
                              key={`${p.accountId}-${p.month}`}
                            >
                              <span className="min-w-0 flex-1">
                                {name} · {monthName(p.month)}
                              </span>
                              <span className="text-num text-ink" data-numeric>
                                <Amount>{usd(p.amount)}</Amount>
                              </span>
                              <FinanceForm
                                budgetId={s.budget.id}
                                command={{
                                  type: "debt.plan.pin",
                                  accountId: p.accountId,
                                  month: p.month,
                                }}
                                label="Remove"
                                buttonLabel={`Remove ${name}'s fixed payment for ${monthName(p.month)}`}
                                inline
                                buttonClassName="btn-ghost btn-sm"
                              />
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-label text-ink-2 hover:text-ink">
                    Fix a later payment
                  </summary>
                  <FinanceForm
                    budgetId={s.budget.id}
                    command={{ type: "debt.plan.pin" }}
                    label="Fix this payment"
                    reset
                  >
                    <label>
                      Card
                      <select name="accountId" required>
                        {Object.keys(s.adopted.applied).map((id) => (
                          <option key={id} value={id}>
                            {s.accounts.find((a) => a.id === id)?.name ?? "Card"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Plan month
                      <select name="month" required>
                        {Array.from({ length: 12 }, (_, i) =>
                          nextMonthOf(s.month, i),
                        ).map((m) => (
                          <option key={m} value={m}>
                            {monthName(m)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Payment (USD)
                      <input name="amount" inputMode="decimal" required />
                    </label>
                    <p className={MUTED}>
                      The plan month is the schedule&apos;s: a card whose due
                      date has passed this month is on its next due date.
                    </p>
                  </FinanceForm>
                </details>
                <div className="mt-3 flex flex-wrap gap-1">
                  <FinanceForm
                    budgetId={s.budget.id}
                    command={{ type: "debt.plan.apply" }}
                    label={
                      s.adopted.appliedMonth === s.month
                        ? "Recalculate this month"
                        : `Apply ${monthName(s.month)}'s payments`
                    }
                    inline
                  />
                  {s.adopted.overridden.length > 0 && (
                    <FinanceForm
                      budgetId={s.budget.id}
                      command={{ type: "debt.plan.apply", reclaim: true }}
                      label="Use the plan for those cards too"
                      inline
                    />
                  )}
                  <FinanceForm
                    budgetId={s.budget.id}
                    command={{ type: "debt.plan.stop" }}
                    label="Stop following"
                    inline
                    buttonClassName="btn-ghost"
                  />
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {showPlanner && (
        <Drawer
          headingId="scenario-heading"
          eyebrow="What-if"
          title="Try a payoff plan"
          closeHref={closeHref}
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <p className={`planned-note ${MUTED}`}>
              {s.plannedBudget !== undefined ? (
                <>
                  Showing what you pay now: your card payment targets, or
                  the minimum where that is higher, which comes to{" "}
                  <Amount>{usd(s.plannedBudget)}</Amount> a month. Enter an
                  extra amount, a budget or a date to try something else.
                </>
              ) : (
                "Every debt gets its minimum; everything above that goes to one debt at a time in strategy order, and a cleared debt's payment moves on to the next."
              )}
            </p>
            <Help label="How a payoff plan works" align="right">
              Every debt gets its minimum; everything above that goes to one
              debt at a time in strategy order, and a cleared debt&apos;s
              payment moves on to the next. Nothing is saved: changing these
              only recalculates the estimate.
            </Help>
          </div>
          {s.plan && !s.showingAdopted && (
            // The result, so the owner need not look behind the drawer.
            <dl
              className="scenario-result mb-3 grid grid-cols-3 gap-2 rounded-md bg-surface-sunken p-3 text-table"
              aria-label="This what-if"
            >
              <div>
                <dt className="text-ink-3">Debt free</dt>
                <dd className="text-ink">
                  {s.plan.payoffMonth ? monthName(s.plan.payoffMonth) : "Never"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">Interest</dt>
                <dd className="text-num text-negative">
                  <Amount>{usd(s.plan.totalInterest)}</Amount>
                </dd>
              </div>
              {planMonthly !== undefined && (
                <div>
                  <dt className="text-ink-3">Each month</dt>
                  <dd className="text-num text-ink">
                    <Amount>{usd(planMonthly)}</Amount>
                  </dd>
                </div>
              )}
            </dl>
          )}
          {/*
           * A plain GET form: the scenario lives in the query string and is
           * never stored, so there is nothing here for FinanceForm to post.
           */}
          <Form action="/debt" scroll={false} className="finance-form">
            {/* Keeps this drawer open over the recalculated page. */}
            <input type="hidden" name="view" value="plan" />
            <fieldset>
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
              <fieldset className="custom-order">
                <legend className="text-label text-ink-2">
                  Custom order
                </legend>
                <p className={`mt-0.5 ${MUTED}`}>
                  With Custom, 1 is paid first. Every debt still gets its
                  minimum; the rest goes down this order.
                </p>
                <div className="mt-1 grid gap-1">
                  {s.debts.map((d, index) => (
                    <div
                      className="grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-2 text-table"
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
                    Recommended sends each one just enough every month to
                    be cleared before its promotion ends; the strategy
                    decides the rest.
                  </small>
                </label>
              )}
              <div className="field-grid" data-cols="2">
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
                    Minimums included; replaces the extra amount.
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
              </div>
              <label>
                Or pay off by month
                <input
                  name="payoffBy"
                  type="month"
                  defaultValue={s.payoffBy}
                  aria-describedby="payoff-date-help"
                />
                <small id="payoff-date-help">
                  Calculates the monthly payment needed. Clear this to use
                  the extra or total monthly budget above instead.
                </small>
              </label>
            </fieldset>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit">
                Show the plan
              </button>
              {scenarioQuery && (
                <Link
                  className="btn btn-ghost"
                  href="/debt?view=plan"
                  scroll={false}
                >
                  {s.adopted ? "Back to my plan" : "Clear"}
                </Link>
              )}
            </div>
          </Form>
          {s.plan && !s.showingAdopted && (
            <div className="adopt-plan mt-3 border-t border-hairline pt-3">
              <h3 className="text-label text-ink">Follow this plan</h3>
              <p className={`mt-1 ${MUTED}`}>
                Adopting it sets each card&apos;s payment target to what
                this plan pays it this month.
                Each new month you are asked to apply the next amounts,
                worked out again from your real balances. No money moves
                by itself.
                {s.adopted ? " This replaces the plan you follow now." : ""}
              </p>
              <div className="mt-2">
                <FinanceForm
                  budgetId={s.budget.id}
                  command={{
                    type: "debt.plan.adopt",
                    strategy: s.strategy,
                    ...(() => {
                      const total =
                        s.requiredMonthlyBudget ??
                        s.monthlyBudget ??
                        s.plannedBudget;
                      return total
                        ? { monthlyBudget: plain(total) }
                        : s.extraMonthly > 0n
                          ? { extraMonthly: plain(s.extraMonthly) }
                          : {};
                    })(),
                    ranks: Object.fromEntries(
                      Object.entries(s.ranks).filter(
                        (entry): entry is [string, number] =>
                          entry[1] !== undefined,
                      ),
                    ),
                    clearDeferredFirst: s.clearDeferredFirst,
                  }}
                  label="Adopt this plan"
                />
              </div>
            </div>
          )}
        </Drawer>
      )}

      {showSchedule && s.plan && (
        <Drawer
          headingId="schedule-heading"
          eyebrow={
            s.showingAdopted
              ? "Your payoff plan"
              : scenarioQuery
                ? "Your what-if"
                : "This estimate"
          }
          title="Month by month"
          closeHref={closeHref}
          // Seven columns of figures: wider than a record's drawer.
          className="md:w-[min(760px,100vw)]!"
        >
          <p className={`mb-3 ${MUTED}`}>
            An estimate using recorded rate changes and today’s minimum
            payments. Each row is one payment on its due date: owed before
            (including that month’s interest), minus the payment, leaves what
            is owed after. Your statement will differ, and unknown future fees
            are not included. Each card gets its minimum; a deferred-interest
            card then gets what clears it before its promotion ends, and the
            rest goes to the first card in the plan’s order until it is paid
            off.
          </p>
          <div
            className="max-sm:overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Estimated payment schedule"
          >
            <table className="ledger">
              <caption className="sr-only">Estimated payment schedule</caption>
              <thead>
                <tr>
                  <th scope="col">Due</th>
                  <th scope="col">Account</th>
                  <th scope="col" className="num">
                    Owed before
                  </th>
                  <th scope="col" className="num">
                    Payment
                  </th>
                  <th scope="col" className="num">
                    Interest
                  </th>
                  <th scope="col" className="num" data-hide="sm">
                    Principal
                  </th>
                  <th scope="col" className="num">
                    Owed after
                  </th>
                </tr>
              </thead>
              <tbody>
                {scheduleRows.slice(0, 240).map((r, i) => (
                  <tr key={`${r.month}-${r.accountId}-${i}`}>
                    <th scope="row" className="text-num whitespace-nowrap">
                      {r.due
                        ? formatDate(r.due, s.budget.dateFormat)
                        : shortMonth(r.month)}
                    </th>
                    <td className="text-ink-2">
                      {s.debts.find((d) => d.accountId === r.accountId)?.name}
                      {r.fixed && <span className="ledger-sub">Fixed by you</span>}
                    </td>
                    {/* Owed once this month's interest is added, before the
                        payment: owed before − payment = owed after. */}
                    <td className="num text-ink-2">
                      <Amount>{usd(r.balance + r.payment)}</Amount>
                    </td>
                    <td className="num text-ink">
                      <Amount>{usd(r.payment)}</Amount>
                    </td>
                    <td className="num text-negative">
                      <Amount>{usd(r.interest)}</Amount>
                    </td>
                    <td className="num text-ink" data-hide="sm">
                      <Amount>{usd(r.principal)}</Amount>
                    </td>
                    <td className="num text-ink-2">
                      <Amount>{usd(r.balance)}</Amount>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Drawer>
      )}

      {selected && !showSchedule && !showPlanner && (
        <Drawer
          headingId="terms-heading"
          eyebrow={selected.type.replaceAll("_", " ").toLowerCase()}
          title={selected.name}
          closeHref={closeHref}
        >
          {selectedOutcome && (
            <DrawerSection title="On the plan shown">
              <dl className="grid grid-cols-3 gap-2 text-table">
                <div>
                  <dt className="text-ink-3">Paid off</dt>
                  <dd className="text-ink">
                    {selectedOutcome.payoffMonth
                      ? monthName(selectedOutcome.payoffMonth)
                      : "Never"}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-3">Interest</dt>
                  <dd className="text-num text-negative">
                    <Amount>{usd(selectedOutcome.totalInterest)}</Amount>
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-3">Total paid</dt>
                  <dd className="text-num text-ink">
                    <Amount>{usd(selectedOutcome.totalPaid)}</Amount>
                  </dd>
                </div>
              </dl>
              {selectedOutcome.deferred && (
                <DeferredOutcome deferred={selectedOutcome.deferred} />
              )}
            </DrawerSection>
          )}
          <DrawerSection title="Terms" action={termsHelp} id="terms">
            {termsForm}
          </DrawerSection>
          {selectedHistory.length > 0 && (
            <DrawerSection
              title="Recorded terms"
              action={
                <Help label="About term versions" align="right">
                  Every version, newest first. The plan charges whichever rate
                  is in force in each month it works through, so a rate that
                  changes later is not applied to the months before it.
                  Removing the only version leaves the account without terms.
                </Help>
              }
            >
              {/* A table, not a list: the suite reads these back as rows. */}
              <table className="ledger" aria-label="Recorded term versions">
                <thead>
                  <tr>
                    <th scope="col">From</th>
                    <th scope="col" className="num">
                      APR
                    </th>
                    <th scope="col" className="num">
                      Min
                    </th>
                    <th scope="col" className="num">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedHistory.map((t) => {
                    const from =
                      t.effectiveFrom === "1900-01"
                        ? "Always"
                        : monthName(t.effectiveFrom);
                    return (
                      <tr key={t.effectiveFrom}>
                        <th scope="row">
                          {from}
                          {t.statementBalance !== null && t.statementDate && (
                            <span className="ledger-sub">
                              Statement <Amount>{usd(t.statementBalance)}</Amount>{" "}
                              · {formatDate(t.statementDate, s.budget.dateFormat)}
                            </span>
                          )}
                        </th>
                        <td className="num text-ink">
                          {percent(t.aprBasisPoints)}
                        </td>
                        <td className="num text-ink">
                          <Amount>{usd(t.minimumPayment)}</Amount>
                          {t.minimumPercentBasisPoints > 0 &&
                            ` or ${percent(t.minimumPercentBasisPoints)}${t.minimumIncludesInterest ? " + interest" : ""}`}
                        </td>
                        <td className="num">
                          <FinanceForm
                            budgetId={s.budget.id}
                            command={{
                              type: "debt.terms.clear",
                              accountId: selected.id,
                              effectiveFrom: t.effectiveFrom,
                            }}
                            label="Remove"
                            buttonLabel={`Remove the version from ${from}`}
                            inline
                            buttonClassName="btn-ghost btn-sm -mr-2 text-negative"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DrawerSection>
          )}
        </Drawer>
      )}
    </main>
  );
}

/** Whether a deferred-interest card is cleared before its promotion ends. */
function DeferredOutcome({
  deferred,
}: {
  deferred: { clearedInTime: boolean; deadline: string; charged: bigint };
}) {
  return (
    <span
      className={`deferred-outcome ledger-sub ${deferred.clearedInTime ? "text-positive" : "text-negative"}`}
    >
      {deferred.clearedInTime ? (
        <>
          Paid off before the deferred-interest deadline (
          {longDate(deferred.deadline)}): no deferred interest.
        </>
      ) : (
        <>
          Still owed at the deadline: deferred interest of{" "}
          <Amount>{usd(deferred.charged)}</Amount> charged after{" "}
          {longDate(deferred.deadline)}.
        </>
      )}
    </span>
  );
}
