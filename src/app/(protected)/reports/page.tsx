import Link from "next/link";
import { Check } from "lucide-react";
import { Drawer, DrawerSection } from "@/components/drawer";
import { reportsPage } from "@/application/finance-page";
import { FinanceError } from "@/application/finance";
import { REPORT_TABS, type ReportTab } from "@/application/reports";
import { formatUSD, money } from "@/domain/money";
import { nextMonth } from "@/domain/budget";
import { Amount } from "@/components/amount";
import Form from "next/form";
import { PageHeader } from "@/components/ui/page-header";
import { Notice } from "@/components/ui/notice";
import { Popover } from "@/components/ui/popover";
import { Help } from "@/components/ui/help";
import { OTHER, SERIES } from "@/components/report-charts";
import {
  Age,
  Breakdown,
  BudgetActual,
  Paychecks,
  CashFlow,
  IncomeExpense,
  Trends,
  Worth,
  type TabContext,
} from "./tabs";
import { isPhone } from "@/infrastructure/view";
import { PhoneReports } from "./phone";

const MUTED = "text-table text-ink-2";
const LINK = "link";
const usd = (v: bigint) => formatUSD(money(v));
const width = (v: bigint, max: bigint) =>
  `${v > 0n ? Math.max(1, Number((v * 1000n) / max) / 10) : 0}%`;
const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

/** YNAB's report tabs, then the two this app adds. */
const TABS: Record<ReportTab, { label: string; view: (ctx: TabContext) => React.ReactNode }> = {
  breakdown: { label: "Spending Breakdown", view: Breakdown },
  trends: { label: "Spending Trends", view: Trends },
  worth: { label: "Net Worth", view: Worth },
  income: { label: "Income v Expense", view: IncomeExpense },
  age: { label: "Age of Money", view: Age },
  cashflow: { label: "Cash Flow", view: CashFlow },
  budget: { label: "Budget vs Actual", view: BudgetActual },
  paychecks: { label: "Paychecks", view: Paychecks },
};

type Search = {
  tab?: string;
  from?: string;
  through?: string;
  compare?: string;
  line?: string;
  payee?: string;
  accounts?: string | string[];
  categories?: string | string[];
  group?: string;
  all?: string;
  view?: string;
  pay?: string;
};
const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  let r;
  try {
    r = await reportsPage({
      tab: REPORT_TABS.find((t) => t === search.tab) ?? "breakdown",
      from: search.from || undefined,
      through: search.through || undefined,
      compare:
        search.compare === "none" || search.compare === "year"
          ? search.compare
          : "previous",
      line: search.line || undefined,
      payee: search.payee,
      accounts: list(search.accounts),
      categories: list(search.categories),
      pay: /^[0-9a-f-]{36}$/i.test(search.pay ?? "") ? search.pay : undefined,
    });
  } catch (error) {
    if (!(error instanceof FinanceError)) throw error;
    return (
      <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
        <PageHeader title="Reports" />
        <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
          <div className="mt-4">
            <Notice
              tone="warning"
              action={
                <Link className="btn btn-secondary btn-sm" href="/reports">
                  Reset filters
                </Link>
              }
            >
              {error.message}
            </Notice>
          </div>
        </div>
      </main>
    );
  }
  const filterQuery = [
    ...r.filters.accounts.map((id) => `&accounts=${id}`),
    ...r.filters.categories.map((id) => `&categories=${id}`),
  ].join("");
  const period = `from=${r.from}&through=${r.through}&compare=${r.compare}`;
  const base = `${period}${filterQuery}`;
  const tabHref = (tab: ReportTab, query = base) => `/reports?tab=${tab}&${query}`;
  const filtering = filterQuery !== "";
  const chosenAccounts = new Set(r.filters.accounts);
  const chosenCategories = new Set(r.filters.categories);
  // Each spending group keeps one colour across Breakdown and Trends: the
  // six largest in this period get a hue, in the budget's own group order;
  // the rest fold into Other rather than cycling the palette.
  const groupOrder = new Map(r.options.groups.map((g, i) => [g.id, i]));
  const colored = r.flows.byGroup
    .filter((g) => g.amount > 0n)
    .slice(0, SERIES.length)
    .map((g) => g.key)
    .sort((x, y) => (groupOrder.get(x) ?? 1e9) - (groupOrder.get(y) ?? 1e9));
  const colors = new Map(colored.map((key, i) => [key, SERIES[i]]));
  const ctx: TabContext = {
    r,
    href: (extra = "") => `${tabHref(r.tab)}${extra}`,
    periodHref: (extra) => `${tabHref(r.tab, period)}${extra}`,
    compareLabel: r.compare === "year" ? "same period last year" : "previous period",
    groupColor: (key) => colors.get(key) ?? OTHER,
    paycheckView: search.view === "spending" ? "spending" : "bills",
  };
  if (await isPhone())
    return (
      <PhoneReports ctx={ctx} group={search.group} all={search.all === "1"} />
    );
  const View = TABS[r.tab].view;
  // Period presets, counted back from this month in the budget's timezone.
  const year = r.current.slice(0, 4);
  const presets = [
    ["This month", r.current, r.current],
    ["Last 3 months", nextMonth(r.current, -2), r.current],
    ["Last 6 months", nextMonth(r.current, -5), r.current],
    ["Last 12 months", nextMonth(r.current, -11), r.current],
    ["This year", `${year}-01`, r.current],
    ["Last year", `${Number(year) - 1}-01`, `${Number(year) - 1}-12`],
  ] as const;
  const preset = presets.find(([, from, through]) => from === r.from && through === r.through);

  return (
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        title="Reports"
        meta={`${monthName(r.from)} – ${monthName(r.through)}`}
        actions={
          <>
            <Link className="btn btn-ghost" href="/reports/forecast">
              Look ahead with a forecast
            </Link>
            <Help label="About reports" align="right">
              Every figure comes from your ledger and can be opened to the
              transactions behind it. Moving money between your own accounts
              is never counted as income or spending.
            </Help>
          </>
        }
      >
        <nav aria-label="Reports" className="tabs -mx-3 mb-2 min-w-0">
          {REPORT_TABS.map((tab) => (
            <Link
              key={tab}
              className="tab whitespace-nowrap"
              aria-current={r.tab === tab ? "page" : undefined}
              href={tabHref(tab)}
              scroll={false}
            >
              {TABS[tab].label}
            </Link>
          ))}
        </nav>
        <Form
          action="/reports"
          scroll={false}
          className="finance-form finance-form-inline"
          aria-label="Report period and filters"
        >
          <input type="hidden" name="tab" value={r.tab} />
          <Popover
            summary={preset ? preset[0] : "Custom period"}
            className="period-presets"
            panelClassName="w-56"
          >
            <ul className="grid gap-0.5" aria-label="Period presets">
              {presets.map(([name, from, through]) => (
                <li key={name}>
                  <Link
                    className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-table text-ink hover:bg-row-hover"
                    href={tabHref(r.tab, `from=${from}&through=${through}&compare=${r.compare}${filterQuery}`)}
                    aria-current={preset?.[0] === name ? "true" : undefined}
                    scroll={false}
                  >
                    {name}
                    {preset?.[0] === name && <Check size={16} strokeWidth={2.5} aria-hidden />}
                  </Link>
                </li>
              ))}
            </ul>
          </Popover>
          <label>
            <span className="sr-only">From</span>
            <input
              type="month"
              name="from"
              defaultValue={r.from}
              required
              aria-label="From"
              className="w-40!"
            />
          </label>
          <span className="text-meta text-ink-3" aria-hidden>
            –
          </span>
          <label>
            <span className="sr-only">Through</span>
            <input
              type="month"
              name="through"
              defaultValue={r.through}
              required
              aria-label="Through"
              className="w-40!"
            />
          </label>
          <label>
            <span className="sr-only">Compare with</span>
            <select name="compare" defaultValue={r.compare} aria-label="Compare with">
              <option value="previous">Previous period</option>
              <option value="year">Same period last year</option>
              <option value="none">No comparison</option>
            </select>
          </label>
          <Popover
            summary={
              chosenAccounts.size
                ? `Accounts: ${chosenAccounts.size} selected`
                : "Accounts: all"
            }
            panelClassName="w-80"
          >
            <fieldset className="grid gap-1">
              <legend className="sr-only">Accounts to include</legend>
              {r.options.accounts.map((a) => (
                <label className="check-field" key={a.id}>
                  <input
                    type="checkbox"
                    name="accounts"
                    value={a.id}
                    defaultChecked={chosenAccounts.has(a.id)}
                  />
                  {a.name}
                  {a.closed ? " (closed)" : ""}
                </label>
              ))}
            </fieldset>
          </Popover>
          <Popover
            summary={
              chosenCategories.size
                ? `Categories: ${chosenCategories.size} selected`
                : "Categories: all"
            }
            panelClassName="w-[min(30rem,calc(100vw-2rem))]"
          >
            {r.options.groups.map((g) =>
              g.categories.length ? (
                <fieldset className="mb-2 last:mb-0" key={g.id}>
                  <legend className="text-caps uppercase text-ink-3">
                    {g.name}
                  </legend>
                  <div className="mt-1 grid gap-1 sm:grid-cols-2">
                    {g.categories.map((c) => (
                      <label className="check-field" key={c.id}>
                        <input
                          type="checkbox"
                          name="categories"
                          value={c.id}
                          defaultChecked={chosenCategories.has(c.id)}
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null,
            )}
          </Popover>
          <button className="btn btn-secondary" type="submit">
            Show report
          </button>
          {filtering && (
            <Link className={LINK} href={tabHref(r.tab, period)} scroll={false}>
              Clear account and category filters
            </Link>
          )}
        </Form>
      </PageHeader>
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        <div className="mt-4">
        {filtering && (
          <div className="mb-3">
            <Notice>
              <strong>Filtered report.</strong> Categories narrow spending only;
              income is narrowed by account. Cash flow shows only the chosen
              lines, so it will not reconcile to account balances.
            </Notice>
          </div>
        )}

        </div>
        {r.drill && (
          <Drawer
            headingId="drill-heading"
            eyebrow="Transactions behind the figure"
            title="Behind this figure"
            closeHref={tabHref(r.tab)}
          >
            <p className={MUTED}>
              {r.drill.length} line{r.drill.length === 1 ? "" : "s"} totalling{" "}
              <Amount>{usd(r.drill.reduce((n, l) => n + l.amount, 0n))}</Amount>.
              A split transaction appears once per category. Refunds show as
              negative spending.
            </p>
            {r.trend && (
              <DrawerSection title={`${r.trendName ?? "This category"} by month`}>
                <ul>
                  {r.trend.map((t) => {
                    const max = r.trend!.reduce(
                      (m, x) => (x.amount > m ? x.amount : m),
                      1n,
                    );
                    return (
                      <li
                        className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 py-0.5 text-table"
                        key={t.month}
                      >
                        <span className="text-ink-2">{monthName(t.month)}</span>
                        <span className="h-1 rounded-full bg-surface-sunken" aria-hidden>
                          <span
                            className="block h-1 rounded-full bg-chart-2"
                            style={{ width: width(t.amount, max) }}
                          />
                        </span>
                        <span className="text-num" data-numeric>
                          <Amount>{usd(t.amount)}</Amount>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </DrawerSection>
            )}
            <div
              className="mt-4 -mx-5 overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Transactions behind the figure"
            >
              <table className="ledger">
                <caption className="sr-only">Transactions behind the figure</caption>
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
                  </tr>
                </thead>
                <tbody>
                  {r.drill.slice(0, 500).map((l) => (
                    <tr key={`${l.transactionId}-${l.key}`}>
                      <td className="text-num font-normal text-ink-2">{l.date}</td>
                      <td className="text-ink">{l.payee || "—"}</td>
                      <td data-hide="sm">
                        <Link
                          className="underline-offset-2 hover:underline"
                          href={`/accounts/${l.accountId}`}
                        >
                          {r.accountNames.get(l.accountId) ?? "Account"}
                        </Link>
                      </td>
                      <td className="num text-ink">
                        <Amount>{usd(l.amount)}</Amount>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r.drill.length > 500 && (
              <p className={`mt-2 ${MUTED}`}>
                Showing the first 500. Narrow the dates to see the rest.
              </p>
            )}
          </Drawer>
        )}

        <View {...ctx} />
      </div>
    </main>
  );
}
