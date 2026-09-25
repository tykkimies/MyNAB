import Link from "next/link";
import { reportsPage } from "@/application/finance-page";
import { FinanceError } from "@/application/finance";
import { formatUSD, money } from "@/domain/money";
import { TrendLine } from "@/components/trend-line";
import { Amount, MaybeAmount } from "@/components/amount";
import Form from "next/form";

const CARD = "rounded-lg border border-border-warm bg-surface-card";
const PANEL = `finance-panel ${CARD} p-space-lg`;
const H2 = "font-headline-md text-headline-md text-text-primary";
const MUTED = "font-body-sm text-body-sm leading-relaxed text-text-secondary";
const LINK = "font-semibold text-secondary underline underline-offset-2";
const NUM = "tabular-nums";
const MAIN =
  "mx-auto w-full max-w-canvas px-gutter pb-space-xl pt-space-lg outline-none lg:px-space-lg";

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
      <main id="main" className={MAIN} tabIndex={-1}>
        <h1 className="font-headline-lg text-headline-lg">Reports</h1>
        <p className={`mt-space-sm ${MUTED}`}>{error.message}</p>
        <Link className={`mt-space-md inline-block ${LINK}`} href="/reports">
          Reset filters
        </Link>
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

  return (
    <main id="main" className={MAIN} tabIndex={-1}>
      <div className="flex max-w-2xl flex-col">
        <span className="font-label-caps text-label-caps uppercase tracking-widest text-secondary">
          Reports
        </span>
        <h1 className="mt-space-xs font-headline-hero-mobile text-headline-hero-mobile leading-none text-text-primary lg:font-headline-hero lg:text-headline-hero">
          See where it went.
        </h1>
        <p className="mt-space-sm font-body-lg text-body-lg leading-relaxed text-text-secondary">
          Every figure comes from your ledger and can be opened to the
          transactions behind it. Moving money between your own accounts is
          never counted as income or spending.
        </p>
        <Link
          className="mt-space-md self-start font-semibold text-secondary underline underline-offset-2"
          href="/reports/forecast"
        >
          Look ahead with a forecast
        </Link>
      </div>

      <Form action="/reports" scroll={false} className={`finance-form mt-space-lg ${PANEL}`}>
        <div className="field-grid">
          <label>
            From
            <input type="month" name="from" defaultValue={r.from} required />
          </label>
          <label>
            Through
            <input
              type="month"
              name="through"
              defaultValue={r.through}
              required
            />
          </label>
          <label>
            Compare with
            <select name="compare" defaultValue={r.compare}>
              <option value="previous">Previous period</option>
              <option value="year">Same period last year</option>
              <option value="none">No comparison</option>
            </select>
          </label>
        </div>
        <div className="mt-space-md grid gap-space-md md:grid-cols-2">
          <details className="rounded-md border border-border-warm px-space-md py-space-sm">
            <summary className="cursor-pointer font-body-sm text-body-sm font-semibold text-text-primary">
              Accounts:{" "}
              {chosenAccounts.size ? `${chosenAccounts.size} selected` : "All accounts"}
            </summary>
            <fieldset className="mt-space-sm grid gap-space-xs sm:grid-cols-2">
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
          </details>
          <details className="rounded-md border border-border-warm px-space-md py-space-sm">
            <summary className="cursor-pointer font-body-sm text-body-sm font-semibold text-text-primary">
              Categories:{" "}
              {chosenCategories.size
                ? `${chosenCategories.size} selected`
                : "All categories"}
            </summary>
            {r.options.groups.map((g) =>
              g.categories.length ? (
                <fieldset className="mt-space-sm" key={g.id}>
                  <legend className="font-label-sm text-label-sm text-text-tertiary">
                    {g.name}
                  </legend>
                  <div className="grid gap-space-xs sm:grid-cols-2">
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
          </details>
        </div>
        <div className="mt-space-md flex flex-wrap items-center gap-space-md">
          <button className="secondary-button" type="submit">
            Show report
          </button>
          {filtering && (
            <Link className={LINK} href={`/reports?${period}`} scroll={false}>
              Clear account and category filters
            </Link>
          )}
        </div>
        {filtering && (
          <p className={`mt-space-sm ${MUTED}`}>
            Filtered report. Categories narrow spending only; income is
            narrowed by account. Cash flow shows only the chosen lines, so it
            will not reconcile to account balances.
          </p>
        )}
      </Form>

      <section
        aria-label="Summary"
        className="mt-space-lg grid gap-space-md sm:grid-cols-2 xl:grid-cols-4"
      >
        {[
          {
            label: "Income",
            value: usd(f.income + f.credits),
            note:
              f.credits > 0n
                ? `Includes ${usd(f.credits)} of card credits`
                : null,
            change: delta(
              f.income + f.credits,
              p ? p.income + p.credits : null,
            ),
          },
          {
            label: "Spending",
            value: usd(f.consumption),
            note: "Net of refunds",
            change: delta(f.consumption, p?.consumption),
          },
          {
            label: "Income minus spending",
            value: usd(net),
            note: null,
            change: delta(net, previousNet),
          },
          {
            label: "Savings rate",
            value: pct(f.savingsRate),
            note:
              f.savingsRate === null
                ? "No earned income in this period"
                : "(Earned income − spending) ÷ earned income; card credits excluded",
            change:
              p && p.savingsRate !== null && f.savingsRate !== null
                ? `${pct(p.savingsRate)} in the ${compareLabel}`
                : null,
          },
        ].map((tile) => (
          <div className={`${CARD} p-space-md`} key={tile.label}>
            <p className="font-label-caps text-label-caps uppercase tracking-widest text-text-secondary">
              {tile.label}
            </p>
            <p
              className={`mt-space-xs font-headline-md text-headline-md text-text-primary ${NUM}`}
            >
              <MaybeAmount value={tile.value} />
            </p>
            {tile.note && <p className={MUTED}>{tile.note}</p>}
            {tile.change && <p className={`${MUTED} ${NUM}`}>{tile.change}</p>}
          </div>
        ))}
      </section>

      <section className={`mt-space-md ${PANEL}`} aria-labelledby="age-of-money-heading">
        <h2 id="age-of-money-heading" className={H2}>Age of Money</h2>
        <p className="mt-space-xs font-data-lg text-data-lg text-text-primary" data-numeric>
          {r.ageOfMoney.days === null
            ? "Not enough history"
            : `${r.ageOfMoney.days} days`}
        </p>
        <p className={`mt-space-xs ${MUTED}`}>
          Average age of the dollars used in your last ten cash outflows,
          including credit card payments. {r.ageOfMoney.sampleCount < 10
            ? `${r.ageOfMoney.sampleCount} of 10 outflows recorded so far.`
            : "Internal transfers and card purchases are excluded until cash leaves."}
        </p>
      </section>

      {r.drill && (
        <section
          className={`mt-space-lg ${PANEL}`}
          aria-labelledby="drill-heading"
        >
          <h2 id="drill-heading" className={H2}>
            Behind this figure
          </h2>
          <p className={`mt-space-xs ${MUTED}`}>
            {r.drill.length} line{r.drill.length === 1 ? "" : "s"} totalling{" "}
            <Amount>{usd(r.drill.reduce((n, l) => n + l.amount, 0n))}</Amount>. A split
            transaction appears once per category. Refunds show as negative
            spending.{" "}
            <Link className={LINK} href={`/reports?${base}`} scroll={false}>
              Close
            </Link>
          </p>
          {r.trend && (
            <div className="mt-space-md">
              <h3 className="font-headline-sm text-headline-sm">
                {r.trendName ?? "This category"} by month
              </h3>
              <ul className="mt-space-xs space-y-space-xs">
                {r.trend.map((t) => {
                  const max = r.trend!.reduce(
                    (m, x) => (x.amount > m ? x.amount : m),
                    1n,
                  );
                  return (
                    <li
                      className="grid grid-cols-[6rem_1fr_auto] items-center gap-space-sm text-body-sm"
                      key={t.month}
                    >
                      <span>{monthName(t.month)}</span>
                      <span
                        className="h-2 rounded-r bg-chart-spending"
                        style={{ width: width(t.amount, max) }}
                        aria-hidden
                      />
                      <span className={NUM}><Amount>{usd(t.amount)}</Amount></span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div
            className="mt-space-md overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Transactions behind the figure"
          >
            <table className="w-full border-collapse text-body-sm">
              <caption className="sr-only">
                Transactions behind the figure
              </caption>
              <thead>
                <tr className="border-b border-border-warm text-left text-text-secondary">
                  <th className="py-space-xs pr-space-sm font-semibold">
                    Date
                  </th>
                  <th className="py-space-xs pr-space-sm font-semibold">
                    Payee
                  </th>
                  <th className="py-space-xs pr-space-sm font-semibold">
                    Account
                  </th>
                  <th className="py-space-xs text-right font-semibold">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.drill.slice(0, 500).map((l) => (
                  <tr
                    className="border-b border-border-warm"
                    key={`${l.transactionId}-${l.key}`}
                  >
                    <td className={`py-space-xs pr-space-sm ${NUM}`}>
                      {l.date}
                    </td>
                    <td className="py-space-xs pr-space-sm">
                      {l.payee || "—"}
                    </td>
                    <td className="py-space-xs pr-space-sm">
                      <Link
                        className="underline-offset-2 hover:underline"
                        href={`/accounts/${l.accountId}`}
                      >
                        {r.accountNames.get(l.accountId) ?? "Account"}
                      </Link>
                    </td>
                    <td className={`py-space-xs text-right ${NUM}`}>
                      <Amount>{usd(l.amount)}</Amount>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.drill.length > 500 && (
            <p className={`mt-space-sm ${MUTED}`}>
              Showing the first 500. Narrow the dates to see the rest.
            </p>
          )}
        </section>
      )}

      <div className="mt-space-lg grid items-start gap-space-lg xl:grid-cols-2">
        <section className={PANEL} aria-labelledby="group-heading">
          <h2 id="group-heading" className={H2}>
            Spending by group
          </h2>
          <p className={`mt-space-xs ${MUTED}`}>
            Choose a group to narrow every report to its categories.
          </p>
          {!f.byGroup.length && (
            <p className={`mt-space-md ${MUTED}`}>
              No spending in this period.
            </p>
          )}
          <ul className="mt-space-md space-y-space-sm">
            {f.byGroup.map((g) => {
              const members =
                r.options.groups.find((item) => item.id === g.key)
                  ?.categories ?? [];
              return (
                <li key={g.key}>
                  <div className="flex items-baseline justify-between gap-space-sm">
                    {members.length ? (
                      <Link
                        className="min-w-0 truncate underline-offset-2 hover:underline"
                        href={`/reports?${period}${r.filters.accounts.map((id) => `&accounts=${id}`).join("")}${members.map((c) => `&categories=${c.id}`).join("")}`}
                        scroll={false}
                      >
                        {g.name}
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate">{g.name}</span>
                    )}
                    <span className={`shrink-0 text-body-sm ${NUM}`}>
                      <Amount>{usd(g.amount)}</Amount>
                    </span>
                  </div>
                  <div
                    className="mt-1 h-2 rounded-r bg-chart-spending"
                    style={{ width: width(g.amount, maxGroup) }}
                    aria-hidden
                  />
                </li>
              );
            })}
          </ul>
        </section>

        <section className={PANEL} aria-labelledby="category-heading">
          <h2 id="category-heading" className={H2}>
            Spending by category
          </h2>
          <p className={`mt-space-xs ${MUTED}`}>
            Refunds reduce the category they return to. Card payments and
            transfers are not spending. Choose a category to see its
            transactions.
          </p>
          {!f.byCategory.length && (
            <p className={`mt-space-md ${MUTED}`}>
              No spending in this period.
            </p>
          )}
          <ul className="mt-space-md space-y-space-sm">
            {f.byCategory.map((c) => {
              const before = previousByCategory.get(c.key);
              return (
                <li key={c.key}>
                  <div className="flex items-baseline justify-between gap-space-sm">
                    <Link
                      className="min-w-0 truncate underline-offset-2 hover:underline"
                      href={`/reports?${base}&line=${encodeURIComponent(c.key)}#drill-heading`}
                      scroll={false}
                    >
                      {c.name}
                    </Link>
                    <span className={`shrink-0 text-body-sm ${NUM}`}>
                      <Amount>{usd(c.amount)}</Amount>
                      {p && (
                        <span className="text-text-secondary">
                          {" "}
                          · was <Amount>{usd(before ?? 0n)}</Amount>
                        </span>
                      )}
                    </span>
                  </div>
                  <div
                    className="mt-1 h-2 rounded-r bg-chart-spending"
                    style={{ width: width(c.amount, maxCategory) }}
                    title={`${c.name}: ${usd(c.amount)} across ${c.count} transaction${c.count === 1 ? "" : "s"}`}
                    aria-hidden
                  />
                </li>
              );
            })}
          </ul>
        </section>

        <section className={PANEL} aria-labelledby="monthly-heading">
          <h2 id="monthly-heading" className={H2}>
            Income and spending by month
          </h2>
          <p className={`mt-space-xs flex flex-wrap gap-space-md ${MUTED}`}>
            <span className="inline-flex items-center gap-space-xs">
              <span
                className="inline-block h-2 w-4 rounded-sm bg-chart-income"
                aria-hidden
              />
              Income
            </span>
            <span className="inline-flex items-center gap-space-xs">
              <span
                className="inline-block h-2 w-4 rounded-sm bg-chart-spending"
                aria-hidden
              />
              Spending
            </span>
          </p>
          {r.months.every((m) => !m.income && !m.consumption) && (
            <p className={`mt-space-md ${MUTED}`}>
              No income or spending in this period.
            </p>
          )}
          <ul className="mt-space-md space-y-space-md">
            {r.months
              .filter(() => r.months.some((m) => m.income || m.consumption))
              .map((m) => (
                <li key={m.month}>
                  <div className="flex items-baseline justify-between gap-space-sm text-body-sm">
                    <span className="font-semibold">{monthName(m.month)}</span>
                    <span className={`text-text-secondary ${NUM}`}>
                      {m.net >= 0n ? "+" : "−"}
                      <Amount>{usd(m.net < 0n ? -m.net : m.net)}</Amount>
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-space-sm text-body-sm">
                    <div
                      className="h-2 rounded-r bg-chart-income"
                      style={{ width: width(m.income, maxMonth) }}
                      aria-hidden
                    />
                    <span className={`shrink-0 ${NUM}`}>
                      <span className="sr-only">Income </span>
                      <Amount>{usd(m.income)}</Amount>
                    </span>
                  </div>
                  <div className="mt-[2px] flex items-center gap-space-sm text-body-sm">
                    <div
                      className="h-2 rounded-r bg-chart-spending"
                      style={{ width: width(m.consumption, maxMonth) }}
                      aria-hidden
                    />
                    <span className={`shrink-0 ${NUM}`}>
                      <span className="sr-only">Spending </span>
                      <Amount>{usd(m.consumption)}</Amount>
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        </section>

        <section className={PANEL} aria-labelledby="cash-heading">
          <h2 id="cash-heading" className={H2}>
            Cash flow
          </h2>
          <p className={`mt-space-xs ${MUTED}`}>
            How your budget accounts changed, line by line. The lines always add
            up to the total.
          </p>
          <dl className="mt-space-md divide-y divide-border-warm text-body-md">
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
                <div
                  className="flex justify-between gap-space-sm py-space-xs"
                  key={label as string}
                >
                  <dt>
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
                  <dd className={NUM}><Amount>{usd(value as bigint)}</Amount></dd>
                </div>
              ))}
            <div className="flex justify-between gap-space-sm py-space-xs font-semibold">
              <dt>Change in budget accounts</dt>
              <dd className={NUM}><Amount>{usd(f.budgetChange)}</Amount></dd>
            </div>
          </dl>
          {f.offBudgetConsumption > 0n && (
            <p className={`mt-space-sm ${MUTED}`}>
              <Amount>{usd(f.offBudgetConsumption)}</Amount> of spending, such as loan interest,
              was recorded on tracking accounts and did not touch your budget
              accounts.
            </p>
          )}
        </section>

        <section className={PANEL} aria-labelledby="payee-heading">
          <h2 id="payee-heading" className={H2}>
            Top payees
          </h2>
          {!f.byPayee.length && (
            <p className={`mt-space-md ${MUTED}`}>
              No spending in this period.
            </p>
          )}
          <ul className="mt-space-md space-y-space-sm">
            {f.byPayee.slice(0, 10).map((c) => (
              <li key={c.payee}>
                <div className="flex items-baseline justify-between gap-space-sm">
                  <Link
                    className="min-w-0 truncate underline-offset-2 hover:underline"
                    href={`/reports?${base}&payee=${encodeURIComponent(c.payee)}#drill-heading`}
                    scroll={false}
                  >
                    {c.payee}
                  </Link>
                  <span className={`shrink-0 text-body-sm ${NUM}`}>
                    <Amount>{usd(c.amount)}</Amount>
                  </span>
                </div>
                <div
                  className="mt-1 h-2 rounded-r bg-chart-spending"
                  style={{ width: width(c.amount, maxPayee) }}
                  title={`${c.payee}: ${usd(c.amount)}`}
                  aria-hidden
                />
              </li>
            ))}
          </ul>
        </section>

        <section className={PANEL} aria-labelledby="worth-heading">
          <h2 id="worth-heading" className={H2}>
            Net worth
          </h2>
          <p className={`mt-space-xs ${MUTED}`}>
            Every account, budget and tracking, at each month end. Transfers
            between your accounts cancel out; valuations count here and nowhere
            else.
          </p>
          <TrendLine
            points={r.worth.map((w) => ({ label: w.month, value: w.net }))}
            label="Net worth"
          />
          <div
            className="mt-space-md overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Net worth by month end"
          >
            <table className="w-full border-collapse text-body-sm">
              <caption className="sr-only">Net worth by month end</caption>
              <thead>
                <tr className="border-b border-border-warm text-left text-text-secondary">
                  <th className="py-space-xs pr-space-sm font-semibold">
                    Month
                  </th>
                  <th className="py-space-xs pr-space-sm text-right font-semibold">
                    Assets
                  </th>
                  <th className="py-space-xs pr-space-sm text-right font-semibold">
                    Debts
                  </th>
                  <th className="py-space-xs text-right font-semibold">Net</th>
                </tr>
              </thead>
              <tbody>
                {r.worth.map((w) => (
                  <tr className="border-b border-border-warm" key={w.month}>
                    <td className="py-space-xs pr-space-sm">
                      {monthName(w.month)}
                    </td>
                    <td className={`py-space-xs pr-space-sm text-right ${NUM}`}>
                      <Amount>{usd(w.assets)}</Amount>
                    </td>
                    <td className={`py-space-xs pr-space-sm text-right ${NUM}`}>
                      <Amount>{usd(w.liabilities)}</Amount>
                    </td>
                    <td
                      className={`py-space-xs text-right font-semibold ${NUM}`}
                    >
                      <Amount>{usd(w.net)}</Amount>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={PANEL} aria-labelledby="balances-heading">
          <h2 id="balances-heading" className={H2}>
            Balances on {r.period.through}
          </h2>
          {(["Assets", "Debts"] as const).map((group) => {
            const rows = r.balances.filter(
              (b) =>
                b.balance !== 0n &&
                (group === "Debts" ? b.balance < 0n : b.balance > 0n),
            );
            if (!rows.length) return null;
            return (
              <div key={group} className="mt-space-md">
                <h3 className="font-label-caps text-label-caps uppercase tracking-widest text-text-secondary">
                  {group}
                </h3>
                <ul className="mt-space-xs divide-y divide-border-warm">
                  {rows.map((b) => (
                    <li
                      className="flex justify-between gap-space-sm py-space-xs"
                      key={b.id}
                    >
                      <Link
                        className="min-w-0 truncate underline-offset-2 hover:underline"
                        href={`/accounts/${b.id}`}
                      >
                        {b.name}
                        {b.participation !== "BUDGET" && (
                          <span className="text-text-secondary">
                            {" "}
                            · tracking
                          </span>
                        )}
                      </Link>
                      <span className={NUM}>
                        <Amount>{usd(b.balance < 0n ? -b.balance : b.balance)}</Amount>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <p className={`mt-space-md ${MUTED}`}>
            Payoff dates and interest estimates are on{" "}
            <Link className={LINK} href="/debt">
              Debt
            </Link>
            ; target progress is on{" "}
            <Link className={LINK} href="/goals">
              Goals
            </Link>
            .
          </p>
        </section>
      </div>

      <section
        className={`mt-space-lg ${PANEL}`}
        aria-labelledby="income-expense-heading"
      >
        <h2 id="income-expense-heading" className={H2}>
          Income v Expense
        </h2>
        <p className={`mt-space-xs ${MUTED}`}>
          Income by payee and spending by group and category, month by month.
          Refunds reduce spending; transfers between your accounts are left out.
        </p>
        <div
          className="mt-space-md overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Income v Expense table, scrolls sideways"
        >
          <table className="income-expense w-full min-w-max border-collapse text-body-sm">
            <thead>
              <tr className="border-b border-border-warm text-left text-text-secondary">
                <th scope="col" className="sticky left-0 bg-surface-card py-space-xs pr-space-md font-semibold">
                  {monthName(r.from)} – {monthName(r.through)}
                </th>
                {ie.months.map((m) => (
                  <th scope="col" key={m} className={`px-space-sm py-space-xs text-right font-semibold ${NUM}`}>
                    {monthName(m)}
                  </th>
                ))}
                <th scope="col" className="px-space-sm py-space-xs text-right font-semibold">Average</th>
                <th scope="col" className="px-space-sm py-space-xs text-right font-semibold">Total</th>
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
      </section>
    </main>
  );
}

type IeMatrixRow = { key: string; name: string; amounts: bigint[]; total: bigint; average: bigint };
function IeRow({ row, strong }: { row: IeMatrixRow; strong?: boolean }) {
  const cell = `px-space-sm py-space-xs text-right ${NUM}`;
  return (
    <tr className={`border-b border-border-warm ${strong ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
      <th scope="row" className={`sticky left-0 bg-surface-card py-space-xs pr-space-md text-left ${strong ? "font-semibold" : "pl-space-md font-normal"}`}>
        {row.name}
      </th>
      {row.amounts.map((amount, i) => (
        <td className={cell} key={i}>
          <Amount>{usd(amount)}</Amount>
        </td>
      ))}
      <td className={cell}>
        <Amount>{usd(row.average)}</Amount>
      </td>
      <td className={cell}>
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
