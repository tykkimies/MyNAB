import Link from "next/link";
import type { ReactNode } from "react";
import type { reportsPage } from "@/application/finance-page";
import { formatUSD, money } from "@/domain/money";
import { Amount } from "@/components/amount";
import { SummaryStrip, Stat } from "@/components/ui/summary-strip";
import { EmptyState } from "@/components/ui/empty-state";
import { Help } from "@/components/ui/help";
import { Pill } from "@/components/ui/pill";
import {
  ColumnChart,
  OTHER,
  PartBar,
  SERIES,
  type Series,
} from "@/components/report-charts";

/**
 * One view per report tab. Each takes the whole width: a summary strip of
 * its headline figures, its chart, then the table the chart is drawn from,
 * so every value is readable without hovering and every chart has a text
 * equivalent.
 */
export type ReportData = Awaited<ReturnType<typeof reportsPage>>;
export interface TabContext {
  r: ReportData;
  /** A link on this tab, keeping the period, comparison and filters. */
  href: (extra?: string) => string;
  /** The same period and comparison with other filters, on this tab. */
  periodHref: (extra: string) => string;
  compareLabel: string;
  /** Fixed colour per spending group, shared by Breakdown and Trends. */
  groupColor: (key: string) => string;
  /** Paychecks: bills ahead, or spending behind. */
  paycheckView?: "bills" | "spending";
}

const MUTED = "text-table text-ink-2";
const usd = (v: bigint) => formatUSD(money(v));
const abs = (v: bigint) => (v < 0n ? -v : v);
const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
const shortMonth = (month: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
const pct = (v: number | null) =>
  v === null ? "Unavailable" : `${(v * 100).toFixed(1)}%`;
const signed = (v: bigint) => `${v < 0n ? "−" : "+"}${usd(abs(v))}`;
/** Month labels: short names, with the year where a range crosses one. */
const axisLabels = (months: string[]) =>
  months.map((m, i) =>
    i === 0 || m.endsWith("-01") ? `${shortMonth(m)} ’${m.slice(2, 4)}` : shortMonth(m),
  );
const delta = (
  ctx: TabContext,
  now: bigint,
  before: bigint | null | undefined,
) =>
  before === null || before === undefined
    ? undefined
    : `${signed(now - before)} vs ${ctx.compareLabel}`;

/** A full-width report section: a heading row, then its content. */
export function Panel({
  id,
  title,
  help,
  action,
  children,
  flush = false,
}: {
  id: string;
  title: string;
  help?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** Content runs to the edges (a table). */
  flush?: boolean;
}) {
  return (
    <section className="surface" aria-labelledby={`${id}-heading`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-2 lg:px-6">
        <h2 id={`${id}-heading`} className="section-title">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {action}
          {help && (
            <Help label={`About ${title.toLowerCase()}`} align="right">
              {help}
            </Help>
          )}
        </div>
      </div>
      <div className={flush ? "" : "px-4 py-4 lg:px-6"}>{children}</div>
    </section>
  );
}

/** A thin share bar for a table cell, scaled to the row's share. */
function ShareBar({ share, color }: { share: number; color: string }) {
  return (
    <span className="block h-1.5 w-full rounded-full bg-surface-sunken" aria-hidden>
      <span
        className="block h-1.5 rounded-full"
        style={{ width: `${Math.max(share > 0 ? 1 : 0, share)}%`, background: color }}
      />
    </span>
  );
}

// ----------------------------------------------------------------------------
// Spending Breakdown

export function Breakdown(ctx: TabContext) {
  const { r } = ctx;
  const f = r.flows;
  const p = r.previous;
  const months = r.months.length;
  const average = months ? f.consumption / BigInt(months) : 0n;
  const groups = f.byGroup.filter((g) => g.amount > 0n);
  const colored = groups.filter((g) => ctx.groupColor(g.key) !== OTHER);
  const rest = groups
    .filter((g) => ctx.groupColor(g.key) === OTHER)
    .reduce((t, g) => t + g.amount, 0n);
  const previousByCategory = new Map(
    (p?.byCategory ?? []).map((c) => [c.key, c.amount]),
  );
  const groupOfCategory = new Map(
    r.options.groups.flatMap((g) => g.categories.map((c) => [c.id, g] as const)),
  );
  const positive = f.byCategory.filter((c) => c.amount !== 0n);
  const top = positive.reduce((m, c) => (c.amount > m ? c.amount : m), 1n);
  const payees = f.byPayee.slice(0, 15);
  const topPayee = payees.reduce((m, c) => (c.amount > m ? c.amount : m), 1n);
  const share = (a: bigint, of: bigint) => (of > 0n ? Number((a * 1000n) / of) / 10 : 0);
  // A group narrows every report to its categories.
  const groupHref = (key: string) => {
    const members = r.options.groups.find((g) => g.id === key)?.categories ?? [];
    return members.length
      ? ctx.periodHref(
          `${r.filters.accounts.map((id) => `&accounts=${id}`).join("")}${members.map((c) => `&categories=${c.id}`).join("")}`,
        )
      : undefined;
  };
  return (
    <>
      <SummaryStrip ariaLabel="Spending summary">
        <Stat
          lead
          label="Total spending"
          value={usd(f.consumption)}
          note={delta(ctx, f.consumption, p?.consumption) ?? "Net of refunds"}
        />
        <Stat
          label="Average per month"
          value={usd(average)}
          note={`Over ${months} month${months === 1 ? "" : "s"}`}
        />
        <Stat
          label="Largest group"
          value={groups[0] ? groups[0].name : "—"}
          note={
            groups[0] ? (
              <>
                <Amount>{usd(groups[0].amount)}</Amount> ·{" "}
                {share(groups[0].amount, f.consumption).toFixed(1)}% of spending
              </>
            ) : undefined
          }
        />
        <Stat
          label="Top payee"
          value={f.byPayee[0]?.payee ?? "—"}
          note={
            f.byPayee[0] ? (
              <>
                <Amount>{usd(f.byPayee[0].amount)}</Amount> over{" "}
                {f.byPayee[0].count} transaction
                {f.byPayee[0].count === 1 ? "" : "s"}
              </>
            ) : undefined
          }
        />
      </SummaryStrip>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4">
        <Panel
          id="group"
          title="Spending by group"
          help="Each group's share of spending in this period. Choose a group to narrow every report to its categories."
        >
          {!groups.length ? (
            <p className={MUTED}>No spending in this period.</p>
          ) : (
            <>
              <PartBar
                label="Share of spending by group"
                parts={[
                  ...colored.map((g) => ({
                    name: g.name,
                    color: ctx.groupColor(g.key),
                    amount: g.amount,
                    href: groupHref(g.key),
                  })),
                  ...(rest > 0n
                    ? [{ name: "Other groups", color: OTHER, amount: rest }]
                    : []),
                ]}
              />
            </>
          )}
        </Panel>

        <Panel
          id="category"
          title="Spending by category"
          flush
          help="Refunds reduce the category they return to. Card payments and transfers are not spending. Choose a category to see its transactions."
        >
          {!positive.length ? (
            <p className={`px-4 py-4 lg:px-6 ${MUTED}`}>No spending in this period.</p>
          ) : (
            <div className="max-sm:overflow-x-auto" tabIndex={0} role="region" aria-label="Spending by category table">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col" data-hide="sm">
                      Group
                    </th>
                    <th scope="col" className="w-[28%]" data-hide="sm">
                      <span className="sr-only">Share</span>
                    </th>
                    <th scope="col" className="num">
                      Spent
                    </th>
                    <th scope="col" className="num" data-hide="sm">
                      Share
                    </th>
                    {p && (
                      <th scope="col" className="num" data-hide="sm">
                        Before
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {positive.map((c) => {
                    const group = groupOfCategory.get(c.key);
                    const color = ctx.groupColor(
                      group?.id ?? (c.key.startsWith("account:") ? "off-budget" : "ungrouped"),
                    );
                    return (
                      <tr key={c.key}>
                        <th scope="row">
                          <Link
                            className="underline-offset-2 hover:underline"
                            href={`${ctx.href(`&line=${encodeURIComponent(c.key)}`)}`}
                            scroll={false}
                          >
                            {c.name}
                          </Link>
                          <span className="ledger-sub">
                            {c.count} transaction{c.count === 1 ? "" : "s"}
                          </span>
                        </th>
                        <td className="text-ink-2" data-hide="sm">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="inline-block size-2 shrink-0 rounded-sm"
                              style={{ background: color }}
                              aria-hidden
                            />
                            {group?.name ?? (c.key.startsWith("account:") ? "Off-budget" : "Other")}
                          </span>
                        </td>
                        <td data-hide="sm">
                          <ShareBar share={Number((c.amount * 1000n) / top) / 10} color={color} />
                        </td>
                        <td className="num text-ink">
                          <Amount>{usd(c.amount)}</Amount>
                        </td>
                        <td className="num text-ink-2" data-hide="sm">
                          {share(c.amount, f.consumption).toFixed(1)}%
                        </td>
                        {p && (
                          <td className="num text-ink-2" data-hide="sm">
                            <Amount>{usd(previousByCategory.get(c.key) ?? 0n)}</Amount>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel id="payee" title="Top payees" flush help="Where the money went, by payee. Choose one to see its transactions.">
          {!payees.length ? (
            <p className={`px-4 py-4 lg:px-6 ${MUTED}`}>No spending in this period.</p>
          ) : (
            <div className="max-sm:overflow-x-auto" tabIndex={0} role="region" aria-label="Top payees table">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Payee</th>
                    <th scope="col" className="w-[36%]" data-hide="sm">
                      <span className="sr-only">Share</span>
                    </th>
                    <th scope="col" className="num" data-hide="sm">
                      Transactions
                    </th>
                    <th scope="col" className="num">
                      Spent
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payees.map((c) => (
                    <tr key={c.payee}>
                      <th scope="row">
                        <Link
                          className="underline-offset-2 hover:underline"
                          href={ctx.href(`&payee=${encodeURIComponent(c.payee)}`)}
                          scroll={false}
                        >
                          {c.payee}
                        </Link>
                      </th>
                      <td data-hide="sm">
                        <ShareBar share={Number((c.amount * 1000n) / topPayee) / 10} color="var(--chart-1)" />
                      </td>
                      <td className="num text-ink-2" data-hide="sm">
                        {c.count}
                      </td>
                      <td className="num text-ink">
                        <Amount>{usd(c.amount)}</Amount>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
// Spending Trends

export function Trends(ctx: TabContext) {
  const { r } = ctx;
  const ie = r.incomeExpense;
  const months = ie.months;
  const total = ie.expenseTotal;
  const monthly = total.amounts;
  // The month in progress is not yet a month's spending: leave it out of
  // highest and lowest unless it is all there is.
  const complete = months
    .map((m, i) => i)
    .filter((i) => months[i] !== r.current || months.length === 1);
  const high = complete.reduce((m, i) => (monthly[i] > monthly[m] ? i : m), complete[0]);
  const low = complete.reduce((m, i) => (monthly[i] < monthly[m] ? i : m), complete[0]);
  // One series per coloured group, in the budget's order; the rest fold.
  const colored = ie.expenses.filter((g) => ctx.groupColor(g.key) !== OTHER);
  const folded = ie.expenses.filter((g) => ctx.groupColor(g.key) === OTHER);
  const order = new Map(SERIES.map((c, i) => [c, i]));
  const series: Series[] = [
    ...colored
      .map((g) => ({
        name: g.name,
        color: ctx.groupColor(g.key),
        values: g.amounts.map(Number),
      }))
      .sort((a, b) => order.get(a.color)! - order.get(b.color)!),
    ...(folded.length
      ? [
          {
            name: "Other groups",
            color: OTHER,
            values: months.map((_, i) =>
              Number(folded.reduce((t, g) => t + g.amounts[i], 0n)),
            ),
          },
        ]
      : []),
  ];
  const any = monthly.some((v) => v !== 0n);
  return (
    <>
      <SummaryStrip ariaLabel="Spending trend summary">
        <Stat lead label="Total spending" value={usd(total.total)} note={`${months.length} month${months.length === 1 ? "" : "s"}`} />
        <Stat label="Average per month" value={usd(total.average)} />
        <Stat
          label="Highest month"
          value={any ? monthName(months[high]) : "—"}
          note={any ? <Amount>{usd(monthly[high])}</Amount> : undefined}
        />
        <Stat
          label="Lowest month"
          value={any ? monthName(months[low]) : "—"}
          note={any ? <Amount>{usd(monthly[low])}</Amount> : undefined}
        />
      </SummaryStrip>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4">
        <Panel
          id="trends"
          title="Spending by month"
          help="Each month's spending, stacked by category group, against the average for the period. Refunds reduce spending; transfers are left out."
        >
          {!any ? (
            <p className={MUTED}>No spending in this period.</p>
          ) : (
            <ColumnChart
              label="Spending by month, stacked by group"
              labels={axisLabels(months)}
              tipLabels={months.map(monthName)}
              series={series}
              reference={{ label: "Average", value: Number(total.average) }}
            />
          )}
        </Panel>
        <Panel id="trends-table" title="By group and month" flush>
          <MonthMatrix
            label="Spending by group and month"
            months={months}
            rows={[
              ...ie.expenses.map((g) => ({ ...g, color: ctx.groupColor(g.key) })),
            ]}
            total={total}
          />
        </Panel>
      </div>
    </>
  );
}

type MatrixRow = ReportData["incomeExpense"]["expenseTotal"];
function MonthMatrix({
  label,
  months,
  rows,
  total,
}: {
  label: string;
  months: string[];
  rows: (MatrixRow & { color?: string })[];
  total: MatrixRow;
}) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${label}, scrolls sideways`}>
      <table className="ledger min-w-max">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-surface-sunken">
              Group
            </th>
            {months.map((m) => (
              <th scope="col" key={m} className="num">
                {monthName(m)}
              </th>
            ))}
            <th scope="col" className="num">
              Average
            </th>
            <th scope="col" className="num">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {[...rows, { ...total, name: "Total spending", color: undefined }].map((row, i) => {
            const last = i === rows.length;
            return (
              <tr key={row.key} className={last ? "font-semibold text-ink" : "text-ink-2"}>
                <th scope="row" className="sticky left-0 z-10 bg-surface text-left font-normal">
                  <span className="inline-flex items-center gap-1.5">
                    {row.color && (
                      <span className="inline-block size-2 shrink-0 rounded-sm" style={{ background: row.color }} aria-hidden />
                    )}
                    <span className={last ? "font-semibold" : ""}>{row.name}</span>
                  </span>
                </th>
                {row.amounts.map((a, j) => (
                  <td className="num" key={j}>
                    <Amount>{usd(a)}</Amount>
                  </td>
                ))}
                <td className="num">
                  <Amount>{usd(row.average)}</Amount>
                </td>
                <td className="num">
                  <Amount>{usd(row.total)}</Amount>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Net Worth

export function Worth(ctx: TabContext) {
  const { r } = ctx;
  const w = r.worth;
  const first = w[0];
  const last = w.at(-1)!;
  const change = last.net - first.net;
  const kinds = (["Assets", "Debts"] as const).map((group) => ({
    group,
    rows: r.balances.filter(
      (b) => b.balance !== 0n && (group === "Debts" ? b.balance < 0n : b.balance > 0n),
    ),
  }));
  return (
    <>
      <SummaryStrip ariaLabel="Net worth summary">
        <Stat
          lead
          label="Net worth"
          value={usd(last.net)}
          tone={last.net < 0n ? "negative" : "neutral"}
          note={`At the end of ${monthName(last.month)}`}
        />
        <Stat
          label="Change"
          value={<Amount>{signed(change)}</Amount>}
          tone={change < 0n ? "negative" : change > 0n ? "positive" : "neutral"}
          note={`Since the end of ${monthName(first.month)}`}
        />
        <Stat label="Assets" value={usd(last.assets)} />
        <Stat label="Debts" value={usd(last.liabilities)} />
      </SummaryStrip>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4">
        <Panel
          id="worth"
          title="Net worth"
          help="Every account, budget and tracking, at each month end: assets above the line, debts below, net worth as the line. Transfers between your accounts cancel out; valuations count here and nowhere else."
        >
          <ColumnChart
            label="Assets, debts and net worth at each month end"
            labels={axisLabels(w.map((x) => x.month))}
            tipLabels={w.map((x) => `End of ${monthName(x.month)}`)}
            series={[
              { name: "Assets", color: SERIES[0], values: w.map((x) => Number(x.assets)) },
              { name: "Debts", color: SERIES[1], values: w.map((x) => -Number(x.liabilities)) },
            ]}
            line={{ name: "Net worth", color: "var(--ink)", values: w.map((x) => Number(x.net)) }}
          />
          <div className="mt-4 -mx-4 lg:-mx-6" tabIndex={0} role="region" aria-label="Net worth by month end">
            <table className="ledger">
              <caption className="sr-only">Net worth by month end</caption>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col" className="num">
                    Assets
                  </th>
                  <th scope="col" className="num">
                    Debts
                  </th>
                  <th scope="col" className="num">
                    Net worth
                  </th>
                  <th scope="col" className="num" data-hide="sm">
                    Change
                  </th>
                </tr>
              </thead>
              <tbody>
                {w.map((x, i) => (
                  <tr key={x.month}>
                    <td className="text-ink-2">{monthName(x.month)}</td>
                    <td className="num text-ink">
                      <Amount>{usd(x.assets)}</Amount>
                    </td>
                    <td className="num text-ink">
                      <Amount>{usd(x.liabilities)}</Amount>
                    </td>
                    <td className="num font-semibold text-ink">
                      <Amount>{usd(x.net)}</Amount>
                    </td>
                    <td className="num text-ink-2" data-hide="sm">
                      {i ? <Amount>{signed(x.net - w[i - 1].net)}</Amount> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel id="balances" title={`Balances on ${r.period.through}`} flush>
          <div className="grid md:grid-cols-2 md:divide-x md:divide-hairline">
            {kinds.map(({ group, rows }) => (
              <div key={group}>
                <h3 className="px-4 pt-3 text-caps uppercase text-ink-3 lg:px-6">{group}</h3>
                {!rows.length ? (
                  <p className={`px-4 py-2 lg:px-6 ${MUTED}`}>None.</p>
                ) : (
                  <ul className="divide-y divide-hairline text-table">
                    {rows.map((b) => (
                      <li className="flex justify-between gap-2 px-4 py-1.5 lg:px-6" key={b.id}>
                        <Link className="min-w-0 truncate underline-offset-2 hover:underline" href={`/accounts/${b.id}`}>
                          {b.name}
                          {b.participation !== "BUDGET" && <span className="text-ink-3"> · tracking</span>}
                        </Link>
                        <span className="text-num text-ink" data-numeric>
                          <Amount>{usd(abs(b.balance))}</Amount>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <p className={`border-t border-hairline px-4 py-2 lg:px-6 ${MUTED}`}>
            Payoff dates and interest estimates are on{" "}
            <Link className="link" href="/debt">
              Debt
            </Link>
            .
          </p>
        </Panel>
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
// Income v Expense

export function IncomeExpense(ctx: TabContext) {
  const { r } = ctx;
  const f = r.flows;
  const p = r.previous;
  const ie = r.incomeExpense;
  const net = f.income + f.credits - f.consumption;
  const anyMonth = r.months.some((m) => m.income || m.consumption);
  return (
    <>
      <SummaryStrip ariaLabel="Income and expense summary">
        <Stat
          lead
          label="Income"
          value={usd(f.income + f.credits)}
          note={
            f.credits > 0n
              ? `Includes ${usd(f.credits)} of card credits`
              : delta(ctx, f.income + f.credits, p ? p.income + p.credits : null)
          }
        />
        <Stat label="Spending" value={usd(f.consumption)} note={delta(ctx, f.consumption, p?.consumption) ?? "Net of refunds"} />
        <Stat
          label="Income minus spending"
          value={usd(net)}
          tone={net < 0n ? "negative" : "neutral"}
          note={delta(ctx, net, p ? p.income + p.credits - p.consumption : null)}
        />
        <Stat
          label="Savings rate"
          value={pct(f.savingsRate)}
          note={
            f.savingsRate === null
              ? "No earned income in this period"
              : p && p.savingsRate !== null
                ? `${pct(p.savingsRate)} in the ${ctx.compareLabel}`
                : "(Earned income − spending) ÷ earned income"
          }
        />
      </SummaryStrip>
      <div className="mt-4">
        <Panel
          id="income-expense"
          title="Income v Expense"
          flush
          help="Income by payee and spending by group and category, month by month. Refunds reduce spending; transfers between your accounts are left out."
        >
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Income v Expense table, scrolls sideways">
            <table className="income-expense ledger min-w-max">
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 bg-surface-sunken">
                    {monthName(r.from)} – {monthName(r.through)}
                  </th>
                  {ie.months.map((m) => (
                    <th scope="col" key={m} className="num">
                      {monthName(m)}
                    </th>
                  ))}
                  <th scope="col" className="num">
                    Average
                  </th>
                  <th scope="col" className="num">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                <IeBlock heading="Income" rows={ie.income} total={ie.incomeTotal} />
                {ie.expenses.map((g) => (
                  <IeBlock key={g.key} heading={g.name} rows={g.categories} total={g} />
                ))}
                <IeRow row={ie.expenseTotal} strong />
                <IeRow row={ie.net} strong />
              </tbody>
            </table>
          </div>
          {!anyMonth && <EmptyState title="Nothing recorded in this period." />}
        </Panel>
      </div>
    </>
  );
}

function IeRow({ row, strong }: { row: MatrixRow; strong?: boolean }) {
  return (
    <tr className={strong ? "font-semibold text-ink" : "text-ink-2"}>
      <th scope="row" className={`sticky left-0 z-10 bg-surface text-left ${strong ? "font-semibold" : "pl-8! font-normal"}`}>
        {row.name}
      </th>
      {row.amounts.map((amount, i) => (
        <td className="num" key={i}>
          <Amount>{usd(amount)}</Amount>
        </td>
      ))}
      <td className="num">
        <Amount>{usd(row.average)}</Amount>
      </td>
      <td className="num">
        <Amount>{usd(row.total)}</Amount>
      </td>
    </tr>
  );
}
function IeBlock({ heading, rows, total }: { heading: string; rows: MatrixRow[]; total: MatrixRow }) {
  // Income totals follow their payees; a spending group heads its categories.
  const income = heading === "Income";
  const summary = <IeRow row={{ ...total, name: income ? "Total income" : heading }} strong />;
  return (
    <>
      {!income && summary}
      {rows.map((row) => (
        <IeRow key={row.key} row={row} />
      ))}
      {income && summary}
    </>
  );
}

// ----------------------------------------------------------------------------
// Age of Money

export function Age(ctx: TabContext) {
  const { r } = ctx;
  const series = r.ageSeries ?? [];
  const known = series.filter((s) => s.days !== null);
  const change =
    known.length >= 2 ? known.at(-1)!.days! - known[0].days! : null;
  return (
    <>
      <SummaryStrip ariaLabel="Age of Money summary">
        <Stat
          lead
          labelTag="h2"
          label="Age of Money"
          value={r.ageOfMoney.days === null ? "Not enough history" : `${r.ageOfMoney.days} days`}
          note={
            r.ageOfMoney.sampleCount < 10
              ? `${r.ageOfMoney.sampleCount} of 10 cash outflows recorded`
              : "Over your last ten cash outflows"
          }
        />
        <Stat
          label="Change in this period"
          value={change === null ? "—" : `${change >= 0 ? "+" : "−"}${Math.abs(change)} days`}
          tone={change === null ? "neutral" : change > 0 ? "positive" : change < 0 ? "negative" : "neutral"}
          note={known.length >= 2 ? `Since the end of ${monthName(known[0].month)}` : "Needs two months with an age"}
        />
      </SummaryStrip>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4">
        <Panel
          id="age"
          title="Age of Money over time"
          help="How many days, on average, a dollar sat in your accounts before it was spent: your last ten cash outflows, each drawing on your oldest money first. Higher means you are spending older money, which is the goal. Each point is the age at a month end."
        >
          {known.length < 2 ? (
            <p className={MUTED}>
              Not enough history to chart yet. Age of Money needs ten cash
              outflows, and the chart needs two month ends with an age.
            </p>
          ) : (
            <ColumnChart
              label="Age of Money at each month end"
              labels={axisLabels(series.map((s) => s.month))}
              tipLabels={series.map((s) => `End of ${monthName(s.month)}`)}
              series={[]}
              line={{ name: "Age of Money", color: SERIES[0], values: series.map((s) => s.days) }}
              format="days"
              legend={false}
            />
          )}
        </Panel>
        <Panel
          id="age-samples"
          title="Behind today’s figure"
          flush
          help="The ten most recent cash outflows, and how old the money each one spent was. Card payments count; moving money between your own cash accounts does not."
        >
          {!r.ageSamples.length ? (
            <p className={`px-4 py-4 lg:px-6 ${MUTED}`}>No cash outflows yet.</p>
          ) : (
            <table className="ledger">
              <caption className="sr-only">Cash outflows behind Age of Money</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Payee</th>
                  <th scope="col" data-hide="sm">
                    Account
                  </th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                  <th scope="col" className="num">
                    Age
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.ageSamples.map((s) => (
                  <tr key={s.transactionId}>
                    <td className="text-num text-ink-2">{s.date}</td>
                    <td className="text-ink">{s.payee || "—"}</td>
                    <td data-hide="sm">
                      <Link className="underline-offset-2 hover:underline" href={`/accounts/${s.accountId}`}>
                        {r.accountNames.get(s.accountId) ?? "Account"}
                      </Link>
                    </td>
                    <td className="num text-ink">
                      <Amount>{usd(s.amount)}</Amount>
                    </td>
                    <td className="num text-ink">{s.days} days</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
// Cash Flow

export function CashFlow(ctx: TabContext) {
  const { r } = ctx;
  const f = r.flows;
  const lines: [string, bigint, string | null][] = [
    ["Income", f.budgetIncome, "income"],
    ["Card credits", f.budgetCredits, "credits"],
    ["Spending from budget accounts", -(f.consumption - f.offBudgetConsumption), null],
    ["Moved to tracking accounts", -f.financing, "financing"],
    ["Adjustments", f.adjustments, "adjustments"],
    ["Opening balances", f.openings, null],
  ];
  const moneyIn = lines.filter(([, v]) => v > 0n).reduce((t, [, v]) => t + v, 0n);
  const moneyOut = lines.filter(([, v]) => v < 0n).reduce((t, [, v]) => t - v, 0n);
  const any = r.months.some((m) => m.income || m.consumption);
  return (
    <>
      <SummaryStrip ariaLabel="Cash flow summary">
        <Stat lead label="Money in" value={usd(moneyIn)} note="To your budget accounts" />
        <Stat label="Money out" value={usd(moneyOut)} note="From your budget accounts" />
        <Stat
          label="Change in budget accounts"
          value={<Amount>{signed(f.budgetChange)}</Amount>}
          tone={f.budgetChange < 0n ? "negative" : "neutral"}
        />
      </SummaryStrip>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4">
        <Panel
          id="monthly"
          title="Income and spending by month"
          help="Income, including card credits, against spending net of refunds, each month. Transfers between your own accounts are neither."
        >
          {!any ? (
            <p className={MUTED}>No income or spending in this period.</p>
          ) : (
            <ColumnChart
              label="Income and spending by month"
              labels={axisLabels(r.months.map((m) => m.month))}
              tipLabels={r.months.map((m) => monthName(m.month))}
              mode="grouped"
              series={[
                { name: "Income", color: SERIES[0], values: r.months.map((m) => Number(m.income)) },
                { name: "Spending", color: SERIES[1], values: r.months.map((m) => Number(m.consumption)) },
              ]}
            />
          )}
        </Panel>
        <Panel
          id="cash"
          title="Cash flow"
          help="How your budget accounts changed, line by line. The lines always add up to the total."
        >
          <dl className="max-w-2xl divide-y divide-hairline text-table">
            {lines
              .filter(([, v]) => v !== 0n)
              .map(([label, value, line]) => (
                <div className="flex justify-between gap-2 py-1.5" key={label}>
                  <dt className="text-ink">
                    {line ? (
                      <Link className="underline-offset-2 hover:underline" href={ctx.href(`&line=${line}`)} scroll={false}>
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </dt>
                  <dd className="text-num text-ink" data-numeric>
                    <Amount>{usd(value)}</Amount>
                  </dd>
                </div>
              ))}
            <div className="flex justify-between gap-2 py-1.5 font-semibold">
              <dt>Change in budget accounts</dt>
              <dd className="text-num" data-numeric>
                <Amount>{usd(f.budgetChange)}</Amount>
              </dd>
            </div>
          </dl>
          {f.offBudgetConsumption > 0n && (
            <p className={`mt-2 ${MUTED}`}>
              <Amount>{usd(f.offBudgetConsumption)}</Amount> of spending, such as
              loan interest, was recorded on tracking accounts and did not touch
              your budget accounts.
            </p>
          )}
        </Panel>
        <Panel id="monthly-table" title="Month by month" flush>
          <table className="ledger">
            <caption className="sr-only">Income and spending by month</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" className="num">
                  Income
                </th>
                <th scope="col" className="num">
                  Spending
                </th>
                <th scope="col" className="num">
                  Net
                </th>
              </tr>
            </thead>
            <tbody>
              {r.months.map((m) => (
                <tr key={m.month}>
                  <td className="text-ink-2">{monthName(m.month)}</td>
                  <td className="num text-ink">
                    <Amount>{usd(m.income)}</Amount>
                  </td>
                  <td className="num text-ink">
                    <Amount>{usd(m.consumption)}</Amount>
                  </td>
                  <td className={`num font-semibold ${m.net < 0n ? "text-negative" : "text-ink"}`}>
                    <Amount>{signed(m.net)}</Amount>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
// Budget vs Actual

export function BudgetActual(ctx: TabContext) {
  const { r } = ctx;
  const b = r.budgetVsActual!;
  const over = b.groups.flatMap((g) => g.categories).filter((c) => c.difference < 0n);
  const meter = (row: { assigned: bigint; spent: bigint }) => {
    const used =
      row.assigned > 0n
        ? Math.min(100, Number((row.spent * 1000n) / row.assigned) / 10)
        : row.spent > 0n
          ? 100
          : 0;
    const overspent = row.spent > row.assigned;
    return (
      <span
        className="mt-1 block h-1 w-full max-w-48 rounded-full bg-accent-soft"
        aria-hidden
      >
        <span
          className={`block h-1 rounded-full ${overspent ? "bg-negative" : "bg-accent"}`}
          style={{ width: `${Math.max(0, used)}%` }}
        />
      </span>
    );
  };
  const diff = (v: bigint) => (
    <span className={v < 0n ? "text-negative" : v > 0n ? "text-positive" : "text-ink-2"}>
      <Amount>{signed(v)}</Amount>
    </span>
  );
  return (
    <>
      <SummaryStrip ariaLabel="Budget vs actual summary">
        <Stat lead label="Assigned" value={usd(b.total.assigned)} note="Net of money moved back out" />
        <Stat label="Spent" value={usd(b.total.spent)} note="Net of refunds" />
        <Stat
          label={b.total.difference < 0n ? "Overspent" : "Left unspent"}
          value={usd(abs(b.total.difference))}
          tone={b.total.difference < 0n ? "negative" : "positive"}
        />
        <Stat
          label="Categories overspent"
          value={String(over.length)}
          tone={over.length ? "warning" : "neutral"}
          note={over.length ? over.slice(0, 3).map((c) => c.name).join(", ") + (over.length > 3 ? "…" : "") : "None in this period"}
        />
      </SummaryStrip>
      <div className="mt-4">
        <Panel
          id="budget-actual"
          title="Budget vs Actual"
          flush
          help="What you assigned to each category over the period against what you spent from it. Card payment categories are left out: that money pays a card, it is not a plan for spending. An account filter narrows spending only, since an assignment has no account."
        >
          {!b.groups.length ? (
            <p className={`px-4 py-4 lg:px-6 ${MUTED}`}>Nothing assigned or spent in this period.</p>
          ) : (
            <div className="max-sm:overflow-x-auto" tabIndex={0} role="region" aria-label="Budget vs Actual table">
              <table className="ledger budget-actual">
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col" className="num">
                      Assigned
                    </th>
                    <th scope="col" className="num">
                      Spent
                    </th>
                    <th scope="col" className="num">
                      Difference
                    </th>
                  </tr>
                </thead>
                {b.groups.map((g) => (
                  <tbody key={g.key}>
                    <tr className="bg-surface-sunken font-semibold text-ink">
                      <th scope="row">{g.name}</th>
                      <td className="num">
                        <Amount>{usd(g.assigned)}</Amount>
                      </td>
                      <td className="num">
                        <Amount>{usd(g.spent)}</Amount>
                      </td>
                      <td className="num">{diff(g.difference)}</td>
                    </tr>
                    {g.categories.map((c) => (
                      <tr key={c.key}>
                        <th scope="row" className="pl-8! font-normal">
                          <Link className="underline-offset-2 hover:underline" href={ctx.href(`&line=${encodeURIComponent(c.key)}`)} scroll={false}>
                            {c.name}
                          </Link>
                          {meter(c)}
                        </th>
                        <td className="num text-ink">
                          <Amount>{usd(c.assigned)}</Amount>
                        </td>
                        <td className="num text-ink">
                          <Amount>{usd(c.spent)}</Amount>
                        </td>
                        <td className="num">{diff(c.difference)}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
                <tbody>
                  <tr className="font-semibold text-ink">
                    <th scope="row">Total</th>
                    <td className="num">
                      <Amount>{usd(b.total.assigned)}</Amount>
                    </td>
                    <td className="num">
                      <Amount>{usd(b.total.spent)}</Amount>
                    </td>
                    <td className="num">{diff(b.total.difference)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

const dayName = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
const SOURCE = { schedule: "Scheduled", target: "Target", card: "Card terms" } as const;

/**
 * Paychecks (not a YNAB report): the bills each paycheck covers, to see where
 * due dates bunch up, and what was spent in each pay period. Read-only; due
 * dates change only through the target, schedule or card terms behind them.
 */
export function Paychecks(ctx: TabContext) {
  const p = ctx.r.paychecks;
  if (!p || p.noPaycheck)
    return (
      <div className="mt-4">
        <EmptyState
          title="No paycheck schedule yet."
          action={
            <Link className="btn btn-secondary btn-sm" href="/accounts/schedules">
              Add your paycheck as a schedule
            </Link>
          }
        >
          Pay periods come from a scheduled income, such as a paycheck on the
          15th and the 30th.
        </EmptyState>
      </div>
    );
  const view = ctx.paycheckView ?? "bills";
  const payQuery = p.choices.length > 1 ? `&pay=${p.pay.id}` : "";
  const toggle = (
    <nav aria-label="Paycheck view" className="flex gap-1">
      {(
        [
          ["bills", "Bills due"],
          ["spending", "Spending"],
        ] as const
      ).map(([key, label]) => (
        <Link
          key={key}
          className={`btn btn-sm ${view === key ? "btn-secondary" : "btn-ghost"}`}
          aria-current={view === key ? "page" : undefined}
          href={ctx.href(`&view=${key}${payQuery}`)}
          scroll={false}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
  const choose =
    p.choices.length > 1 ? (
      <nav aria-label="Which paycheck" className="flex flex-wrap gap-1">
        {p.choices.map((c) => (
          <Link
            key={c.id}
            className={`btn btn-sm ${c.id === p.pay.id ? "btn-secondary" : "btn-ghost"}`}
            aria-current={c.id === p.pay.id ? "page" : undefined}
            href={ctx.href(`&view=${view}&pay=${c.id}`)}
            scroll={false}
          >
            {c.name} · <Amount>{usd(c.amount)}</Amount>
          </Link>
        ))}
      </nav>
    ) : null;
  const left = (v: bigint) => (
    <span className={v < 0n ? "text-negative" : "text-positive"}>
      <Amount>{usd(v)}</Amount>
    </span>
  );
  const meter = (used: bigint, of: bigint) => {
    const share = of > 0n ? Math.min(100, Number((used * 1000n) / of) / 10) : used > 0n ? 100 : 0;
    return (
      <span className="mt-1 block h-1 w-full max-w-48 rounded-full bg-accent-soft" aria-hidden>
        <span
          className={`block h-1 rounded-full ${used > of ? "bg-negative" : "bg-accent"}`}
          style={{ width: `${share}%` }}
        />
      </span>
    );
  };

  if (view === "spending") {
    const rows = p.spending;
    const average = rows.filter((r) => !r.partial);
    const avg = average.length
      ? average.reduce((n, r) => n + r.spent, 0n) / BigInt(average.length)
      : 0n;
    const heaviest = [...average].sort((a, b) => Number(b.spent - a.spent))[0];
    return (
      <>
        <SummaryStrip ariaLabel="Spending per paycheck summary">
          <Stat lead label="Paycheck" value={usd(p.pay.amount)} note={p.pay.name} />
          <Stat label="Average spent per period" value={usd(avg)} note={`${average.length} complete periods`} />
          <Stat
            label="Heaviest period"
            value={heaviest ? usd(heaviest.spent) : "—"}
            note={heaviest ? `${dayName(heaviest.start)} – ${dayName(heaviest.end)}` : "No complete period yet"}
          />
        </SummaryStrip>
        <div className="mt-4">
          <Panel
            id="paycheck-spending"
            title="Spending per paycheck"
            flush
            action={<>{choose}{toggle}</>}
            help="What left your budget accounts between one payday and the next, net of refunds, by category. Moving money between your own accounts is not spending. Income is what actually arrived in the period."
          >
            {!rows.length ? (
              <p className={`px-4 py-4 lg:px-6 ${MUTED}`}>No pay periods in this range.</p>
            ) : (
              <div className="max-sm:overflow-x-auto" tabIndex={0} role="region" aria-label="Spending per paycheck table">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th scope="col">Pay period</th>
                      <th scope="col" className="num">Income</th>
                      <th scope="col" className="num">Spent</th>
                      <th scope="col" className="num">Left</th>
                      <th scope="col">Where it went</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.start}>
                        <th scope="row" className="font-normal">
                          {dayName(r.start)} – {dayName(r.end)}
                          {r.partial && <span className={`ml-2 ${MUTED}`}>so far</span>}
                          {meter(r.spent, r.income)}
                        </th>
                        <td className="num text-ink"><Amount>{usd(r.income)}</Amount></td>
                        <td className="num text-ink"><Amount>{usd(r.spent)}</Amount></td>
                        <td className="num">{left(r.income - r.spent)}</td>
                        <td className={MUTED}>
                          {r.top.map((c, i) => (
                            <span key={c.key}>
                              {i > 0 && " · "}
                              {c.name} <Amount>{usd(c.amount)}</Amount>
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </>
    );
  }

  const periods = p.bills;
  const heavy = [...periods].sort((a, b) => Number(b.due - a.due))[0];
  const light = [...periods].sort((a, b) => Number(a.due - b.due))[0];
  const short = periods.filter((x) => x.income - x.due < 0n);
  return (
    <>
      <SummaryStrip ariaLabel="Bills per paycheck summary">
        <Stat lead label="Paycheck" value={usd(p.pay.amount)} note={p.pay.name} />
        <Stat
          label="Heaviest period"
          value={heavy ? usd(heavy.due) : "—"}
          note={heavy ? `${dayName(heavy.start)} – ${dayName(heavy.end)}` : undefined}
          tone={heavy && heavy.due > heavy.income ? "negative" : "neutral"}
        />
        <Stat
          label="Lightest period"
          value={light ? usd(light.due) : "—"}
          note={light ? `${dayName(light.start)} – ${dayName(light.end)}` : undefined}
        />
        <Stat
          label="Periods short"
          value={String(short.length)}
          tone={short.length ? "warning" : "positive"}
          note={short.length ? "Bills due exceed that paycheck" : "Every paycheck covers its bills"}
        />
      </SummaryStrip>
      <div className="mt-4">
        <Panel
          id="paycheck-bills"
          title="Bills due per paycheck"
          flush
          action={
            <>
              <Link className="btn btn-ghost btn-sm" href="/reports/forecast">
                See cash day by day
              </Link>
              {choose}
              {toggle}
            </>
          }
          help={
            <>
              Each pay period runs from a payday to the day before the next.
              Bills come from your schedules, the due day on a target and a
              card&apos;s terms; a category paid by a schedule is counted once,
              from the schedule. Everyday spending is not included. To move a
              bill, change its due day on the target or card terms after the
              company agrees.
            </>
          }
        >
          {!periods.length ? (
            <p className={`px-4 py-4 lg:px-6 ${MUTED}`}>No pay periods ahead.</p>
          ) : (
            <div className="max-sm:overflow-x-auto" tabIndex={0} role="region" aria-label="Bills per paycheck table">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Pay period and bills</th>
                    <th scope="col">From</th>
                    <th scope="col" className="num">Due</th>
                    <th scope="col" className="num">Left of paycheck</th>
                  </tr>
                </thead>
                {periods.map((x) => (
                  <tbody key={x.start}>
                    <tr className="bg-surface-sunken font-semibold text-ink">
                      <th scope="row">
                        {dayName(x.start)} – {dayName(x.end)}
                        <span className={`ml-2 font-normal ${MUTED}`}>
                          {x.expected ? "paycheck expected" : "paid"} <Amount>{usd(x.income)}</Amount>
                        </span>
                        {meter(x.due, x.income)}
                      </th>
                      <td />
                      <td className="num"><Amount>{usd(x.due)}</Amount></td>
                      <td className="num">{left(x.income - x.due)}</td>
                    </tr>
                    {x.bills.length === 0 ? (
                      <tr>
                        <td colSpan={4} className={`pl-8! ${MUTED}`}>No bills due.</td>
                      </tr>
                    ) : (
                      x.bills.map((b, i) => (
                        <tr key={`${b.date}-${b.name}-${i}`}>
                          <th scope="row" className="pl-8! font-normal">
                            <span className={`mr-2 inline-block w-14 ${MUTED}`}>{dayName(b.date)}</span>
                            {b.name}
                          </th>
                          <td><Pill>{SOURCE[b.source]}</Pill></td>
                          <td className="num text-ink"><Amount>{usd(b.amount)}</Amount></td>
                          <td />
                        </tr>
                      ))
                    )}
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
