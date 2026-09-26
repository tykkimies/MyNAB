import Link from "next/link";
import { Drawer, DrawerSection } from "@/components/drawer";
import { reportsPage } from "@/application/finance-page";
import { FinanceError } from "@/application/finance";
import { formatUSD, money } from "@/domain/money";
import { TrendLine } from "@/components/trend-line";
import { Amount } from "@/components/amount";
import Form from "next/form";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryStrip, Stat } from "@/components/ui/summary-strip";
import { Notice } from "@/components/ui/notice";
import { Popover } from "@/components/ui/popover";
import { EmptyState } from "@/components/ui/empty-state";
import { Help } from "@/components/ui/help";

const MUTED = "text-table text-ink-2";
const LINK = "link";
const usd = (v: bigint) => formatUSD(money(v));
const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
const pct = (v: number | null) =>
  v === null ? "Unavailable" : `${(v * 100).toFixed(1)}%`;

type Search = {
  from?: string;
  through?: string;
  compare?: string;
  line?: string;
  payee?: string;
  accounts?: string | string[];
  categories?: string | string[];
};
const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);

/** A report section: heading, an optional note, then its rows. */
function Report({
  id,
  title,
  help,
  children,
  className = "",
}: {
  id: string;
  title: string;
  help?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface ${className}`} aria-labelledby={`${id}-heading`}>
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2 lg:px-6">
        <h2 id={`${id}-heading`} className="section-title">
          {title}
        </h2>
        {help && (
          <Help label={`About ${title.toLowerCase()}`} align="right">
            {help}
          </Help>
        )}
      </div>
      <div className="px-4 py-3 lg:px-6">{children}</div>
    </section>
  );
}

/** One bar row: a name, a thin bar scaled to the largest, the amount. */
function BarRow({
  label,
  amount,
  max,
  tone = "spending",
  note,
}: {
  label: React.ReactNode;
  amount: bigint;
  max: bigint;
  tone?: "income" | "spending";
  note?: React.ReactNode;
}) {
  const width = `${amount > 0n ? Math.max(1, Number((amount * 1000n) / max) / 10) : 0}%`;
  return (
    <li className="py-1">
      <div className="flex items-baseline justify-between gap-3 text-table">
        <span className="min-w-0 truncate text-ink">{label}</span>
        <span className="shrink-0 text-num text-ink" data-numeric>
          <Amount>{usd(amount)}</Amount>
          {note && <span className="ml-1 font-normal text-ink-3">{note}</span>}
        </span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-surface-sunken" aria-hidden>
        <div
          className={`h-1 rounded-full ${tone === "income" ? "bg-chart-1" : "bg-chart-2"}`}
          style={{ width }}
        />
      </div>
    </li>
  );
}

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  let r;
  try {
    r = await reportsPage({
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
  const f = r.flows;
  const p = r.previous;
  const filterQuery = [
    ...r.filters.accounts.map((id) => `&accounts=${id}`),
    ...r.filters.categories.map((id) => `&categories=${id}`),
  ].join("");
  const base = `from=${r.from}&through=${r.through}&compare=${r.compare}${filterQuery}`;
  const period = `from=${r.from}&through=${r.through}&compare=${r.compare}`;
  const filtering = filterQuery !== "";
  const chosenAccounts = new Set(r.filters.accounts);
  const chosenCategories = new Set(r.filters.categories);
  const ie = r.incomeExpense;
  const maxGroup = f.byGroup.reduce((m, g) => (g.amount > m ? g.amount : m), 1n);
  const net = f.income + f.credits - f.consumption;
  const previousNet = p ? p.income + p.credits - p.consumption : null;
  const compareLabel =
    r.compare === "year" ? "same period last year" : "previous period";
  const delta = (now: bigint, before: bigint | null | undefined) =>
    before === null || before === undefined
      ? null
      : `${now - before >= 0n ? "+" : "−"}${usd(now - before < 0n ? before - now : now - before)} vs ${compareLabel}`;
  const previousByCategory = new Map(
    (p?.byCategory ?? []).map((c) => [c.key, c.amount]),
  );
  const maxCategory = f.byCategory.reduce(
    (m, c) => (c.amount > m ? c.amount : m),
    1n,
  );
  const maxPayee = f.byPayee.reduce(
    (m, c) => (c.amount > m ? c.amount : m),
    1n,
  );
  const maxMonth = r.months.reduce(
    (m, row) =>
      [row.income, row.consumption].reduce((a, b) => (b > a ? b : a), m),
    1n,
  );
  const width = (v: bigint, max: bigint) =>
    `${v > 0n ? Math.max(1, Number((v * 1000n) / max) / 10) : 0}%`;
  const anyMonth = r.months.some((m) => m.income || m.consumption);

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
        <Form
          action="/reports"
          scroll={false}
          className="finance-form finance-form-inline"
          aria-label="Report period and filters"
        >
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
            <Link className={LINK} href={`/reports?${period}`} scroll={false}>
              Clear account and category filters
            </Link>
          )}
        </Form>
      </PageHeader>
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        <SummaryStrip ariaLabel="Summary">
          <Stat
            lead
            label="Income"
            value={usd(f.income + f.credits)}
            note={
              f.credits > 0n
                ? `Includes ${usd(f.credits)} of card credits · ${delta(f.income + f.credits, p ? p.income + p.credits : null) ?? ""}`
                : delta(f.income + f.credits, p ? p.income + p.credits : null)
            }
          />
          <Stat
            label="Spending"
            value={usd(f.consumption)}
            note={delta(f.consumption, p?.consumption) ?? "Net of refunds"}
          />
          <Stat
            label="Income minus spending"
            value={usd(net)}
            tone={net < 0n ? "negative" : "neutral"}
            note={delta(net, previousNet)}
          />
          <Stat
            label="Savings rate"
            value={pct(f.savingsRate)}
            note={
              f.savingsRate === null
                ? "No earned income in this period"
                : p && p.savingsRate !== null
                  ? `${pct(p.savingsRate)} in the ${compareLabel}`
                  : "(Earned income − spending) ÷ earned income"
            }
          />
          <Stat
            labelTag="h2"
            label="Age of Money"
            value={
              r.ageOfMoney.days === null
                ? "Not enough history"
                : `${r.ageOfMoney.days} days`
            }
            note={
              r.ageOfMoney.sampleCount < 10
                ? `${r.ageOfMoney.sampleCount} of 10 cash outflows recorded`
                : "Over your last ten cash outflows"
            }
          />
        </SummaryStrip>
        {filtering && (
          <div className="mt-3">
            <Notice>
              <strong>Filtered report.</strong> Categories narrow spending only;
              income is narrowed by account. Cash flow shows only the chosen
              lines, so it will not reconcile to account balances.
            </Notice>
          </div>
        )}

        {r.drill && (
          <Drawer
            headingId="drill-heading"
            eyebrow="Transactions behind the figure"
            title="Behind this figure"
            closeHref={`/reports?${base}`}
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

        <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">
          <Report
            id="group"
            title="Spending by group"
            help="Choose a group to narrow every report to its categories."
          >
            {!f.byGroup.length ? (
              <p className={MUTED}>No spending in this period.</p>
            ) : (
              <ul>
                {f.byGroup.map((g) => {
                  const members =
                    r.options.groups.find((item) => item.id === g.key)
                      ?.categories ?? [];
                  return (
                    <BarRow
                      key={g.key}
                      amount={g.amount}
                      max={maxGroup}
                      label={
                        members.length ? (
                          <Link
                            className="underline-offset-2 hover:underline"
                            href={`/reports?${period}${r.filters.accounts.map((id) => `&accounts=${id}`).join("")}${members.map((c) => `&categories=${c.id}`).join("")}`}
                            scroll={false}
                          >
                            {g.name}
                          </Link>
                        ) : (
                          g.name
                        )
                      }
                    />
                  );
                })}
              </ul>
            )}
          </Report>

          <Report
            id="category"
            title="Spending by category"
            help="Refunds reduce the category they return to. Card payments and transfers are not spending. Choose a category to see its transactions."
          >
            {!f.byCategory.length ? (
              <p className={MUTED}>No spending in this period.</p>
            ) : (
              <ul>
                {f.byCategory.map((c) => (
                  <BarRow
                    key={c.key}
                    amount={c.amount}
                    max={maxCategory}
                    label={
                      <Link
                        className="underline-offset-2 hover:underline"
                        href={`/reports?${base}&line=${encodeURIComponent(c.key)}#drill-heading`}
                        scroll={false}
                      >
                        {c.name}
                      </Link>
                    }
                    note={
                      p ? (
                        <>
                          · was <Amount>{usd(previousByCategory.get(c.key) ?? 0n)}</Amount>
                        </>
                      ) : undefined
                    }
                  />
                ))}
              </ul>
            )}
          </Report>

          <Report id="monthly" title="Income and spending by month">
            <p className={`flex flex-wrap gap-4 ${MUTED}`}>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-4 rounded-sm bg-chart-1" aria-hidden />
                Income
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-4 rounded-sm bg-chart-2" aria-hidden />
                Spending
              </span>
            </p>
            {!anyMonth ? (
              <p className={`mt-2 ${MUTED}`}>No income or spending in this period.</p>
            ) : (
              <ul className="mt-2">
                {r.months.map((m) => (
                  <li key={m.month} className="py-1">
                    <div className="flex items-baseline justify-between gap-2 text-table">
                      <span className="font-medium text-ink">{monthName(m.month)}</span>
                      <span className="text-num text-ink-2" data-numeric>
                        {m.net >= 0n ? "+" : "−"}
                        <Amount>{usd(m.net < 0n ? -m.net : m.net)}</Amount>
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-meta">
                      <div className="h-1 rounded-full bg-chart-1" style={{ width: width(m.income, maxMonth) }} aria-hidden />
                      <span className="shrink-0 text-ink-2" data-numeric>
                        <span className="sr-only">Income </span>
                        <Amount>{usd(m.income)}</Amount>
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-meta">
                      <div className="h-1 rounded-full bg-chart-2" style={{ width: width(m.consumption, maxMonth) }} aria-hidden />
                      <span className="shrink-0 text-ink-2" data-numeric>
                        <span className="sr-only">Spending </span>
                        <Amount>{usd(m.consumption)}</Amount>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Report>

          <Report
            id="cash"
            title="Cash flow"
            help="How your budget accounts changed, line by line. The lines always add up to the total."
          >
            <dl className="divide-y divide-hairline text-table">
              {[
                ["Income", f.budgetIncome, "income"],
                ["Card credits", f.budgetCredits, "credits"],
                [
                  "Spending from budget accounts",
                  -(f.consumption - f.offBudgetConsumption),
                  null,
                ],
                ["Moved to tracking accounts", -f.financing, "financing"],
                ["Adjustments", f.adjustments, "adjustments"],
                ["Opening balances", f.openings, null],
              ]
                .filter(([, v]) => v !== 0n)
                .map(([label, value, line]) => (
                  <div className="flex justify-between gap-2 py-1" key={label as string}>
                    <dt className="text-ink">
                      {line ? (
                        <Link
                          className="underline-offset-2 hover:underline"
                          href={`/reports?${base}&line=${line}#drill-heading`}
                          scroll={false}
                        >
                          {label as string}
                        </Link>
                      ) : (
                        (label as string)
                      )}
                    </dt>
                    <dd className="text-num text-ink" data-numeric>
                      <Amount>{usd(value as bigint)}</Amount>
                    </dd>
                  </div>
                ))}
              <div className="flex justify-between gap-2 py-1 font-semibold">
                <dt>Change in budget accounts</dt>
                <dd className="text-num" data-numeric>
                  <Amount>{usd(f.budgetChange)}</Amount>
                </dd>
              </div>
            </dl>
            {f.offBudgetConsumption > 0n && (
              <p className={`mt-2 ${MUTED}`}>
                <Amount>{usd(f.offBudgetConsumption)}</Amount> of spending, such
                as loan interest, was recorded on tracking accounts and did not
                touch your budget accounts.
              </p>
            )}
          </Report>

          <Report id="payee" title="Top payees">
            {!f.byPayee.length ? (
              <p className={MUTED}>No spending in this period.</p>
            ) : (
              <ul>
                {f.byPayee.slice(0, 10).map((c) => (
                  <BarRow
                    key={c.payee}
                    amount={c.amount}
                    max={maxPayee}
                    label={
                      <Link
                        className="underline-offset-2 hover:underline"
                        href={`/reports?${base}&payee=${encodeURIComponent(c.payee)}#drill-heading`}
                        scroll={false}
                      >
                        {c.payee}
                      </Link>
                    }
                  />
                ))}
              </ul>
            )}
          </Report>

          <Report
            id="worth"
            title="Net worth"
            help="Every account, budget and tracking, at each month end. Transfers between your accounts cancel out; valuations count here and nowhere else."
          >
            <TrendLine
              points={r.worth.map((w) => ({ label: w.month, value: w.net }))}
              label="Net worth"
            />
            <div
              className="mt-3 -mx-4 lg:-mx-6"
              tabIndex={0}
              role="region"
              aria-label="Net worth by month end"
            >
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
                      Net
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {r.worth.map((w) => (
                    <tr key={w.month}>
                      <td className="text-ink-2">{monthName(w.month)}</td>
                      <td className="num text-ink">
                        <Amount>{usd(w.assets)}</Amount>
                      </td>
                      <td className="num text-ink">
                        <Amount>{usd(w.liabilities)}</Amount>
                      </td>
                      <td className="num font-semibold text-ink">
                        <Amount>{usd(w.net)}</Amount>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Report>

          <Report id="balances" title={`Balances on ${r.period.through}`}>
            {(["Assets", "Debts"] as const).map((group) => {
              const rows = r.balances.filter(
                (b) =>
                  b.balance !== 0n &&
                  (group === "Debts" ? b.balance < 0n : b.balance > 0n),
              );
              if (!rows.length) return null;
              return (
                <div key={group} className="mb-3 last:mb-0">
                  <h3 className="text-caps uppercase text-ink-3">{group}</h3>
                  <ul className="mt-1 divide-y divide-hairline text-table">
                    {rows.map((b) => (
                      <li className="flex justify-between gap-2 py-1" key={b.id}>
                        <Link
                          className="min-w-0 truncate underline-offset-2 hover:underline"
                          href={`/accounts/${b.id}`}
                        >
                          {b.name}
                          {b.participation !== "BUDGET" && (
                            <span className="text-ink-3"> · tracking</span>
                          )}
                        </Link>
                        <span className="text-num text-ink" data-numeric>
                          <Amount>{usd(b.balance < 0n ? -b.balance : b.balance)}</Amount>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <p className={`mt-2 ${MUTED}`}>
              Payoff dates and interest estimates are on{" "}
              <Link className={LINK} href="/debt">
                Debt
              </Link>
              ; target progress is on{" "}
              <Link className={LINK} href="/targets">
                Targets
              </Link>
              .
            </p>
          </Report>
        </div>

        <section className="surface mt-4" aria-labelledby="income-expense-heading">
          <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2 lg:px-6">
            <h2 id="income-expense-heading" className="section-title">
              Income v Expense
            </h2>
            <Help label="About Income v Expense" align="right">
              Income by payee and spending by group and category, month by
              month. Refunds reduce spending; transfers between your accounts
              are left out.
            </Help>
          </div>
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Income v Expense table, scrolls sideways"
          >
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
                {[
                  { heading: "Income", rows: ie.income, total: ie.incomeTotal },
                ].map((block) => (
                  <IeBlock key={block.heading} {...block} />
                ))}
                {ie.expenses.map((g) => (
                  <IeBlock key={g.key} heading={g.name} rows={g.categories} total={g} />
                ))}
                <IeRow row={ie.expenseTotal} strong />
                <IeRow row={ie.net} strong />
              </tbody>
            </table>
          </div>
          {!anyMonth && <EmptyState title="Nothing recorded in this period." />}
        </section>
      </div>
    </main>
  );
}

type IeMatrixRow = { key: string; name: string; amounts: bigint[]; total: bigint; average: bigint };
function IeRow({ row, strong }: { row: IeMatrixRow; strong?: boolean }) {
  return (
    <tr className={strong ? "font-semibold text-ink" : "text-ink-2"}>
      <th
        scope="row"
        className={`sticky left-0 z-10 bg-surface text-left ${strong ? "font-semibold" : "pl-8! font-normal"}`}
      >
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
function IeBlock({ heading, rows, total }: { heading: string; rows: IeMatrixRow[]; total: IeMatrixRow }) {
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
