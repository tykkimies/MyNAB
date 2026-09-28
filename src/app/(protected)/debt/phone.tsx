import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { debtPage } from "@/application/finance-page";
import { Amount } from "@/components/amount";
import { Drawer } from "@/components/drawer";
import { FinanceForm } from "@/components/finance-form";
import { Pill } from "@/components/ui/pill";
import { formatUSD, money } from "@/domain/money";

type Debt = Awaited<ReturnType<typeof debtPage>>;
const usd = (n: bigint) => formatUSD(money(n));
const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
const longMonth = (month: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

/**
 * Debt on the phone, read-mostly: when everything is paid off, what to do at
 * the bank (with Done), and each debt's balance, payment and payoff month.
 * The what-if planner, terms and adopting a plan are on the desktop site.
 */
export function PhoneDebt({
  s,
  account,
  withAmounts,
  doneLabel,
}: {
  s: Debt;
  account?: string;
  withAmounts: (text: string) => ReactNode[];
  doneLabel: Record<string, string>;
}) {
  const plan = s.plan;
  const owed = s.debts.reduce((n, d) => n + d.balance, 0n);
  const outcome = (id: string) => plan?.debts.find((d) => d.accountId === id);
  const paymentThisMonth = (id: string) =>
    plan?.rows.find((r) => r.accountId === id && r.month === s.month)?.payment;
  const open = s.debts.find((d) => d.accountId === account);
  return (
    <main id="main" className="phone-page" tabIndex={-1}>
      <h1 className="sr-only">Debt</h1>
      <div className="phone-hero">
        <span className="text-label text-ink-2">Total owed</span>
        <span className="text-figure-lg text-ink" data-numeric>
          <Amount>{usd(owed)}</Amount>
        </span>
        {plan?.payoffMonth ? (
          <span className="text-meta text-ink-3">
            Debt free by <strong className="text-ink">{longMonth(plan.payoffMonth)}</strong>
            {" · "}
            <Amount>{usd(plan.totalInterest)}</Amount> interest
          </span>
        ) : (
          <span className="text-meta text-ink-3">
            {s.debts.length === 0
              ? "Nothing owed on your cards or loans."
              : "Record each debt's terms on the desktop site to see a payoff date."}
          </span>
        )}
        {s.adopted && s.showingAdopted && (
          <Pill tone="accent" className="mt-1">
            Following your payoff plan
          </Pill>
        )}
      </div>
      {s.reminders.length > 0 && (
        <section className="phone-list" aria-labelledby="bank-heading">
          <h2 id="bank-heading" className="phone-section-head">
            To do at the bank
          </h2>
          <ul>
            {s.reminders.map((r) => (
              <li
                key={r.id}
                data-reminder={r.kind}
                className="flex flex-col gap-2 border-b border-hairline px-gutter py-3"
              >
                <p className="text-body text-ink">
                  <Pill tone={r.level === "act" ? "warning" : "neutral"}>
                    {r.level === "act" ? "Do now" : "Check"}
                  </Pill>{" "}
                  {withAmounts(r.text)}
                </p>
                <FinanceForm
                  budgetId={s.budget.id}
                  command={{ type: "debt.reminder.done", id: r.id }}
                  inline
                  label={doneLabel[r.kind] ?? "Done"}
                  buttonClassName="btn-sm"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {s.debts.length > 0 && (
        <section className="phone-list" aria-labelledby="debts-heading">
          <h2 id="debts-heading" className="phone-section-head">
            Your debts
          </h2>
          <ul>
            {s.debts.map((d) => {
              const o = outcome(d.accountId);
              const pay = paymentThisMonth(d.accountId);
              return (
                <li key={d.accountId}>
                  <Link
                    href={`/debt?account=${d.accountId}`}
                    scroll={false}
                    className="phone-row"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{d.name}</span>
                      <span className="text-meta text-ink-3">
                        {!d.hasTerms
                          ? "No terms recorded"
                          : !plan
                            ? `${(d.aprBasisPoints / 100).toFixed(2)}% APR`
                            : o?.payoffMonth
                              ? `Paid off ${monthName(o.payoffMonth)}`
                              : "Not paid off within the plan"}
                        {pay !== undefined && (
                          <>
                            {" · "}
                            <Amount>{usd(pay)}</Amount> this month
                          </>
                        )}
                      </span>
                    </span>
                    <span className="text-num text-ink" data-numeric>
                      <Amount>{usd(d.balance)}</Amount>
                    </span>
                    <ChevronRight size={16} aria-hidden className="text-ink-3" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <p className="text-center text-table text-ink-2">
        Try a payoff plan or record terms on the desktop site.
      </p>
      {open && (
        <DebtSheet s={s} debt={open} />
      )}
    </main>
  );
}

function DebtSheet({
  s,
  debt,
}: {
  s: Debt;
  debt: Debt["debts"][number];
}) {
  const o = s.plan?.debts.find((d) => d.accountId === debt.accountId);
  const upcoming = (s.plan?.rows ?? [])
    .filter((r) => r.accountId === debt.accountId && r.payment > 0n)
    .slice(0, 6);
  return (
    <Drawer
      key={debt.accountId}
      headingId="debt-heading"
      eyebrow="Debt"
      title={debt.name}
      closeHref="/debt"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-label text-ink-2">Owed</span>
        <span className="text-figure-lg text-ink" data-numeric>
          <Amount>{usd(debt.balance)}</Amount>
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-table">
        <div className="rounded-md bg-surface-sunken px-2.5 py-2">
          <dt className="text-meta text-ink-3">APR</dt>
          <dd className="text-num text-ink">
            {debt.hasTerms ? `${(debt.aprBasisPoints / 100).toFixed(2)}%` : "—"}
          </dd>
        </div>
        <div className="rounded-md bg-surface-sunken px-2.5 py-2">
          <dt className="text-meta text-ink-3">Paid off</dt>
          <dd className="text-num text-ink">
            {o?.payoffMonth ? monthName(o.payoffMonth) : "—"}
          </dd>
        </div>
        <div className="rounded-md bg-surface-sunken px-2.5 py-2">
          <dt className="text-meta text-ink-3">Interest</dt>
          <dd className="text-num text-ink" data-numeric>
            {o ? <Amount>{usd(o.totalInterest)}</Amount> : "—"}
          </dd>
        </div>
        <div className="rounded-md bg-surface-sunken px-2.5 py-2">
          <dt className="text-meta text-ink-3">Total paid</dt>
          <dd className="text-num text-ink" data-numeric>
            {o ? <Amount>{usd(o.totalPaid)}</Amount> : "—"}
          </dd>
        </div>
      </dl>
      {o?.deferred && (
        <p className={`mt-3 text-table ${o.deferred.clearedInTime ? "text-ink-2" : "text-negative"}`}>
          {o.deferred.clearedInTime
            ? "Paid off before the deferred-interest deadline."
            : "Not paid off before the deferred-interest deadline."}
        </p>
      )}
      {upcoming.length > 0 && (
        <>
          <h3 className="mt-5 border-b border-hairline pb-1 text-caps uppercase text-ink-3">
            Next payments
          </h3>
          <ul className="divide-y divide-hairline">
            {upcoming.map((r) => (
              <li key={r.month} className="flex justify-between gap-2 py-2 text-table">
                <span className="text-ink">
                  {monthName(r.month)}
                  {r.fixed && <span className="text-ink-3"> · fixed by you</span>}
                </span>
                <span className="text-num text-ink" data-numeric>
                  <Amount>{usd(r.payment)}</Amount>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <Link className="link mt-4 inline-block text-table" href={`/accounts/${debt.accountId}`}>
        Transactions
      </Link>
    </Drawer>
  );
}
