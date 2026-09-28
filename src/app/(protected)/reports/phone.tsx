import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Amount } from "@/components/amount";
import { Drawer } from "@/components/drawer";
import {
  ColumnChart,
  OTHER,
  PartBar,
  SERIES,
  type Series,
} from "@/components/report-charts";
import { nextMonth } from "@/domain/budget";
import { formatUSD, money } from "@/domain/money";
import type { TabContext } from "./tabs";

const usd = (v: bigint) => formatUSD(money(v));
const abs = (v: bigint) => (v < 0n ? -v : v);
const shortMonth = (month: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

/** The four reports that read well on a phone; the rest are desktop only. */
const PHONE_TABS = [
  { tab: "breakdown", label: "Spending" },
  { tab: "trends", label: "Trends" },
  { tab: "worth", label: "Net worth" },
  { tab: "income", label: "Income v Expense" },
] as const;
const SHORT_LIST = 8;

/**
 * Reports on the phone: one headline, one chart and one short list per
 * report, with a group's categories a tap away. Filters, comparison tables
 * and the matrix views are on the desktop site.
 */
export function PhoneReports({
  ctx,
  group,
  all,
}: {
  ctx: TabContext;
  /** A spending group whose categories are open in a sheet. */
  group?: string;
  /** Show every row of the list, not just the first few. */
  all: boolean;
}) {
  const { r } = ctx;
  const known = PHONE_TABS.some((t) => t.tab === r.tab);
  const periodQuery = `from=${r.from}&through=${r.through}&compare=${r.compare}`;
  const href = (tab: string, query = periodQuery) => `/reports?tab=${tab}&${query}`;
  const presets = [
    ["This month", r.current, r.current],
    ["3 months", nextMonth(r.current, -2), r.current],
    ["6 months", nextMonth(r.current, -5), r.current],
    ["12 months", nextMonth(r.current, -11), r.current],
  ] as const;
  return (
    <main id="main" className="phone-page" tabIndex={-1}>
      <h1 className="sr-only">Reports</h1>
      <nav className="phone-chips" aria-label="Reports">
        {PHONE_TABS.map(({ tab, label }) => (
          <Link
            key={tab}
            href={href(tab)}
            scroll={false}
            className="phone-chip"
            aria-current={r.tab === tab ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {r.tab !== "worth" && (
        <nav className="phone-segment" aria-label="Report period">
          {presets.map(([name, from, through]) => (
            <Link
              key={name}
              href={href(r.tab, `from=${from}&through=${through}&compare=${r.compare}`)}
              scroll={false}
              aria-current={r.from === from && r.through === through ? "page" : undefined}
            >
              {name}
            </Link>
          ))}
        </nav>
      )}
      {!known ? (
        <p className="py-10 text-center text-body text-ink-2">
          This report is on the desktop site.
        </p>
      ) : r.tab === "breakdown" ? (
        <Spending ctx={ctx} all={all} group={group} />
      ) : r.tab === "trends" ? (
        <SpendingTrends ctx={ctx} />
      ) : r.tab === "worth" ? (
        <NetWorth ctx={ctx} />
      ) : (
        <IncomeVsExpense ctx={ctx} />
      )}
    </main>
  );
}

function Headline({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: bigint;
  note?: React.ReactNode;
  tone?: "neutral" | "negative" | "positive";
}) {
  return (
    <div className="phone-hero">
      <span className="text-label text-ink-2">{label}</span>
      <span
        className={`text-figure-lg ${tone === "negative" ? "text-negative" : tone === "positive" ? "text-positive" : "text-ink"}`}
        data-numeric
      >
        <Amount>{usd(value)}</Amount>
      </span>
      {note && <span className="text-meta text-ink-3">{note}</span>}
    </div>
  );
}

function Spending({
  ctx,
  all,
  group,
}: {
  ctx: TabContext;
  all: boolean;
  group?: string;
}) {
  const { r } = ctx;
  const f = r.flows;
  const groups = f.byGroup.filter((g) => g.amount > 0n);
  const months = r.months.length;
  const shown = all ? groups : groups.slice(0, SHORT_LIST);
  const base = `/reports?tab=breakdown&from=${r.from}&through=${r.through}&compare=${r.compare}`;
  const open = groups.find((g) => g.key === group);
  const members = new Set(
    r.options.groups.find((g) => g.id === group)?.categories.map((c) => c.id) ?? [],
  );
  const categories = f.byCategory.filter(
    (c) => members.has(c.key) && c.amount !== 0n,
  );
  const colored = groups.filter((g) => ctx.groupColor(g.key) !== OTHER);
  const rest = groups
    .filter((g) => ctx.groupColor(g.key) === OTHER)
    .reduce((t, g) => t + g.amount, 0n);
  return (
    <>
      <Headline
        label="Spent"
        value={f.consumption}
        note={
          months > 1 ? (
            <>
              <Amount>{usd(f.consumption / BigInt(months))}</Amount> a month
            </>
          ) : (
            "Net of refunds"
          )
        }
      />
      {groups.length === 0 ? (
        <p className="py-6 text-center text-body text-ink-2">
          No spending in this period.
        </p>
      ) : (
        <>
          <PartBar
            label="Share of spending by group"
            legend={false}
            parts={[
              ...colored.map((g) => ({
                name: g.name,
                color: ctx.groupColor(g.key),
                amount: g.amount,
              })),
              ...(rest > 0n ? [{ name: "Other", color: OTHER, amount: rest }] : []),
            ]}
          />
          <section className="phone-list" aria-label="Spending by group">
            <ul>
              {shown.map((g) => (
                <li key={g.key}>
                  <Link
                    href={`${base}&group=${g.key}`}
                    scroll={false}
                    className="phone-row"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-sm"
                      style={{ background: ctx.groupColor(g.key) }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{g.name}</span>
                    <span className="text-meta text-ink-3">
                      {f.consumption > 0n
                        ? `${(Number((g.amount * 1000n) / f.consumption) / 10).toFixed(0)}%`
                        : ""}
                    </span>
                    <span className="text-num" data-numeric>
                      <Amount>{usd(g.amount)}</Amount>
                    </span>
                    <ChevronRight size={16} aria-hidden className="text-ink-3" />
                  </Link>
                </li>
              ))}
            </ul>
            {!all && groups.length > SHORT_LIST && (
              <Link className="phone-row justify-center text-accent-text" href={`${base}&all=1`} scroll={false}>
                Show all {groups.length} groups
              </Link>
            )}
          </section>
          {f.byPayee.length > 0 && (
            <section className="phone-list" aria-labelledby="payees-heading">
              <h2 id="payees-heading" className="phone-section-head">
                Top payees
              </h2>
              <ul>
                {f.byPayee.slice(0, 5).map((p) => (
                  <li key={p.payee} className="phone-row">
                    <span className="min-w-0 flex-1 truncate">{p.payee}</span>
                    <span className="text-num" data-numeric>
                      <Amount>{usd(p.amount)}</Amount>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {open && (
        <Drawer
          headingId="group-heading"
          eyebrow={`${monthName(r.from)} – ${monthName(r.through)}`}
          title={open.name}
          closeHref={base}
        >
          <p className="text-figure-lg text-ink" data-numeric>
            <Amount>{usd(open.amount)}</Amount>
          </p>
          <ul className="mt-3 divide-y divide-hairline">
            {categories.map((c) => (
              <li key={c.key}>
                <Link
                  className="flex min-h-11 items-center justify-between gap-2 text-table text-ink"
                  href={`/accounts/register?category=${c.key}&from=${r.period.from}&through=${r.period.through}`}
                >
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span className="flex items-center gap-1">
                    <span className="text-num" data-numeric>
                      <Amount>{usd(c.amount)}</Amount>
                    </span>
                    <ChevronRight size={16} aria-hidden className="text-ink-3" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Drawer>
      )}
    </>
  );
}

function SpendingTrends({ ctx }: { ctx: TabContext }) {
  const { r } = ctx;
  const ie = r.incomeExpense;
  const total = ie.expenseTotal;
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
            values: ie.months.map((_, i) =>
              Number(folded.reduce((t, g) => t + g.amounts[i], 0n)),
            ),
          },
        ]
      : []),
  ];
  const any = total.amounts.some((v) => v !== 0n);
  return (
    <>
      <Headline
        label="Average a month"
        value={total.average}
        note={
          <>
            <Amount>{usd(total.total)}</Amount> over {ie.months.length} month
            {ie.months.length === 1 ? "" : "s"}
          </>
        }
      />
      {any ? (
        <ColumnChart
          label="Spending by month, stacked by group"
          labels={ie.months.map(shortMonth)}
          tipLabels={ie.months.map(monthName)}
          series={series}
          reference={{ label: "Average", value: Number(total.average) }}
        />
      ) : (
        <p className="py-6 text-center text-body text-ink-2">
          No spending in this period.
        </p>
      )}
      <section className="phone-list" aria-label="Spending by month">
        <ul>
          {[...ie.months].reverse().map((m) => {
            const i = ie.months.indexOf(m);
            return (
              <li key={m} className="phone-row">
                <span className="flex-1">{monthName(m)}</span>
                <span className="text-num" data-numeric>
                  <Amount>{usd(total.amounts[i])}</Amount>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

function NetWorth({ ctx }: { ctx: TabContext }) {
  const { r } = ctx;
  const w = r.worth;
  const last = w.at(-1)!;
  const change = last.net - w[0].net;
  const assets = r.balances.filter((b) => b.balance > 0n);
  const debts = r.balances.filter((b) => b.balance < 0n);
  return (
    <>
      <Headline
        label="Net worth"
        value={last.net}
        tone={last.net < 0n ? "negative" : "neutral"}
        note={
          <>
            {change < 0n ? "Down " : "Up "}
            <Amount>{usd(abs(change))}</Amount> since {monthName(w[0].month)}
          </>
        }
      />
      <ColumnChart
        label="Assets, debts and net worth at each month end"
        labels={w.map((x) => shortMonth(x.month))}
        tipLabels={w.map((x) => `End of ${monthName(x.month)}`)}
        series={[
          { name: "Assets", color: SERIES[0], values: w.map((x) => Number(x.assets)) },
          { name: "Debts", color: SERIES[1], values: w.map((x) => -Number(x.liabilities)) },
        ]}
        line={{ name: "Net worth", color: "var(--ink)", values: w.map((x) => Number(x.net)) }}
      />
      {[
        { title: "Assets", rows: assets, total: last.assets },
        { title: "Debts", rows: debts, total: last.liabilities },
      ].map(({ title, rows, total }) =>
        rows.length ? (
          <section key={title} className="phone-list" aria-labelledby={`${title}-heading`}>
            <h2 id={`${title}-heading`} className="phone-section-head">
              <span className="flex-1">{title}</span>
              <span className="text-num" data-numeric>
                <Amount>{usd(total)}</Amount>
              </span>
            </h2>
            <ul>
              {rows.map((b) => (
                <li key={b.id}>
                  <Link href={`/accounts/${b.id}`} className="phone-row">
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                    <span className="text-num" data-numeric>
                      <Amount>{usd(abs(b.balance))}</Amount>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </>
  );
}

function IncomeVsExpense({ ctx }: { ctx: TabContext }) {
  const { r } = ctx;
  const f = r.flows;
  const ie = r.incomeExpense;
  const net = f.income + f.credits - f.consumption;
  return (
    <>
      <Headline
        label="Income minus spending"
        value={net}
        tone={net < 0n ? "negative" : net > 0n ? "positive" : "neutral"}
        note={
          f.savingsRate === null
            ? "No earned income in this period"
            : `Savings rate ${(f.savingsRate * 100).toFixed(1)}%`
        }
      />
      <ColumnChart
        label="Income and spending by month"
        labels={ie.months.map(shortMonth)}
        tipLabels={ie.months.map(monthName)}
        mode="grouped"
        series={[
          { name: "Income", color: SERIES[2], values: ie.incomeTotal.amounts.map(Number) },
          { name: "Spending", color: SERIES[1], values: ie.expenseTotal.amounts.map(Number) },
        ]}
      />
      <section className="phone-list" aria-label="Income and spending by month">
        <ul>
          {[...ie.months].reverse().map((m) => {
            const i = ie.months.indexOf(m);
            const n = ie.net.amounts[i];
            return (
              <li key={m} className="phone-row">
                <span className="flex flex-1 flex-col">
                  {monthName(m)}
                  <span className="text-meta text-ink-3">
                    In <Amount>{usd(ie.incomeTotal.amounts[i])}</Amount> · Out{" "}
                    <Amount>{usd(ie.expenseTotal.amounts[i])}</Amount>
                  </span>
                </span>
                <span
                  className={`text-num ${n < 0n ? "text-negative" : "text-ink"}`}
                  data-numeric
                >
                  <Amount>{usd(n)}</Amount>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
