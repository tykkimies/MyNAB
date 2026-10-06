import Link from "next/link";
import { requireUser } from "@/application/session";
import { openBudget } from "@/application/finance-page";
import { FinanceError } from "@/application/finance";
import { getForecast } from "@/application/forecasts";
import { formatUSD, money } from "@/domain/money";
import { Amount, MaybeAmount } from "@/components/amount";
import Form from "next/form";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryStrip, Stat } from "@/components/ui/summary-strip";
import { Notice } from "@/components/ui/notice";
import { Pill } from "@/components/ui/pill";
import { Help } from "@/components/ui/help";
import { BalanceLine } from "@/components/report-charts";

const MUTED = "text-table text-ink-2";
const LINK = "link";
const usd = (v: bigint) => formatUSD(money(v));
const signed = (v: bigint) => (v === 0n ? "—" : usd(v));
const dayName = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

export default async function Forecast({
  searchParams,
}: {
  searchParams: Promise<{
    months?: string;
    spending?: string;
    extra?: string;
    basis?: string;
    cushion?: string;
  }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const budget = await openBudget(user.userId);
  let f;
  try {
    f = await getForecast(user.userId, budget.id, {
      months: q.months || undefined,
      spending: q.spending || undefined,
      extra: q.extra || undefined,
      basis: q.basis === "actual" ? "actual" : "plan",
      cushion: q.cushion || undefined,
    });
  } catch (error) {
    if (!(error instanceof FinanceError)) throw error;
    return (
      <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
        <PageHeader
          breadcrumb={[{ href: "/reports", label: "Reports" }]}
          title="Forecast"
        />
        <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
          <div className="mt-4">
            <Notice
              tone="warning"
              action={
                <Link className="btn btn-secondary btn-sm" href="/reports/forecast">
                  Reset
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
  const a = f.assumptions;
  const d = f.daily;
  return (
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        breadcrumb={[{ href: "/reports", label: "Reports" }]}
        title="Forecast"
        meta="An estimate; it never assigns money or changes your budget"
        actions={
          <Help label="About the forecast" align="right">
            An estimate of your budget accounts, card balances included, if the
            coming months look like your schedules and recent spending.
          </Help>
        }
      >
        <Form
          action="/reports/forecast"
          scroll={false}
          className="finance-form finance-form-inline"
          aria-label="Forecast assumptions"
        >
          <label>
            How far ahead
            <select name="months" defaultValue={String(f.query.months)}>
              <option value="1">1 month</option>
              <option value="3">3 months</option>
              <option value="6">6 months</option>
              <option value="12">12 months</option>
            </select>
          </label>
          <label>
            Everyday spending change (%)
            <input
              name="spending"
              type="number"
              min={-100}
              max={200}
              step={5}
              defaultValue={f.query.spending}
              className="w-20!"
            />
          </label>
          <label>
            Extra monthly income (USD)
            <input
              name="extra"
              inputMode="decimal"
              defaultValue={f.query.extraIncome > 0n ? f.query.extra : ""}
              className="w-28!"
            />
          </label>
          <label>
            Keep at least (USD)
            <input
              name="cushion"
              inputMode="decimal"
              defaultValue={(Number(f.query.cushion) / 100).toFixed(2)}
              className="w-28!"
            />
          </label>
          <label>
            Everyday spending
            <select name="basis" defaultValue={f.daily.basis}>
              <option value="plan">My targets</option>
              <option value="actual">What I actually spent</option>
            </select>
          </label>
          <button className="btn btn-secondary" type="submit">
            Update forecast
          </button>
        </Form>
      </PageHeader>
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        <SummaryStrip ariaLabel="Cash summary">
          <Stat
            lead
            label="Cash today"
            value={usd(d.start)}
            note={d.accounts.join(", ") || "No checking or savings account"}
          />
          <Stat
            label="Lowest point"
            value={usd(d.lowest.balance)}
            tone={d.lowest.balance < 0n ? "negative" : d.lowest.balance < d.cushion ? "warning" : "neutral"}
            note={dayName(d.lowest.date)}
          />
          <Stat
            label={`Your ${usd(d.cushion)} cushion`}
            value={d.firstBelowCushion ? `Below on ${dayName(d.firstBelowCushion)}` : "Stays above"}
            tone={d.firstBelowCushion ? "warning" : "positive"}
          />
          <Stat
            label="Everyday spending"
            value={`${usd(d.monthlySpending)}/mo`}
            note={
              d.basis === "plan"
                ? "From your targets"
                : `What you spent over the last ${d.actualDays} days`
            }
          />
        </SummaryStrip>
        <div className="mt-3">
          {d.firstNegative ? (
            <Notice tone="negative">
              <strong>Cash would run out on {dayName(d.firstNegative)}.</strong>{" "}
              Checking and savings would fall to{" "}
              <Amount>{usd(d.lowest.balance)}</Amount> on {dayName(d.lowest.date)}.
            </Notice>
          ) : d.firstBelowCushion ? (
            <Notice tone="warning">
              <strong>Cash dips below your cushion on {dayName(d.firstBelowCushion)}.</strong>{" "}
              The lowest point is <Amount>{usd(d.lowest.balance)}</Amount> on{" "}
              {dayName(d.lowest.date)}, before money comes back in.
            </Notice>
          ) : (
            <Notice tone="positive">
              Cash stays above your cushion; the lowest point is{" "}
              <Amount>{usd(d.lowest.balance)}</Amount> on {dayName(d.lowest.date)}.
            </Notice>
          )}
          {d.basis === "actual" && d.actualDays < 30 && (
            <div className="mt-2">
              <Notice tone="warning">
                Only {d.actualDays} days of spending so far, so this rate is
                rough. Your targets may be the better guide for now.
              </Notice>
            </div>
          )}
        </div>

        <section className="surface mt-4" aria-labelledby="cash-heading">
          <div className="flex items-center gap-2 border-b border-hairline px-4 py-2 lg:px-6">
            <h2 id="cash-heading" className="section-title">
              Cash day by day
            </h2>
            <Pill tone="warning">Estimate</Pill>
            <span className="ml-auto">
              <Help label="About cash day by day" align="right">
                Checking and savings from today: each paycheck on its day, each
                bill on its due day (the same bills as the Paychecks report),
                and everyday spending spread evenly over each month. Savings
                buckets are left out, because that money stays in your
                account until you spend it. Card spending reaches cash when you
                pay the card, so card payments count, at the payment planned on
                the card. Nothing here is stored.
              </Help>
            </span>
          </div>
          <div className="px-4 py-4 lg:px-6">
            <BalanceLine
              label="Projected cash in checking and savings, day by day"
              days={d.days.map((x) => ({
                date: x.date,
                label: dayName(x.date),
                balance: Number(x.balance),
                events: x.events.map((e) => ({ name: e.name, amount: Number(e.amount) })),
              }))}
              lowest={{
                date: d.lowest.date,
                label: dayName(d.lowest.date),
                balance: Number(d.lowest.balance),
              }}
              cushion={Number(d.cushion)}
            />
          </div>
          <div
            className="max-sm:overflow-x-auto border-t border-hairline"
            tabIndex={0}
            role="region"
            aria-label="Upcoming paydays and bills"
          >
            <table className="ledger">
              <caption className="sr-only">Upcoming paydays and bills</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">What happens</th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                  <th scope="col" className="num">
                    Cash after
                  </th>
                </tr>
              </thead>
              <tbody>
                {!d.days.some((x) => x.events.length > 0) && (
                  <tr>
                    <td colSpan={4} className={MUTED}>
                      No paydays or bills in this range. Add your paycheck and
                      bills as{" "}
                      <Link className={LINK} href="/accounts/schedules">
                        schedules
                      </Link>{" "}
                      or give targets a due day.
                    </td>
                  </tr>
                )}
                {d.days
                  .filter((x) => x.events.length > 0)
                  .map((x) => (
                    <tr key={x.date}>
                      <td className="text-ink">{dayName(x.date)}</td>
                      <td className="text-ink-2">
                        {x.events.map((e) => e.name).join(", ")}
                      </td>
                      <td className="num text-ink">
                        <Amount>{usd(x.events.reduce((n, e) => n + e.amount, 0n))}</Amount>
                      </td>
                      <td
                        className={`num font-semibold ${x.balance < 0n ? "text-negative" : x.balance < d.cushion ? "text-warning" : "text-ink"}`}
                      >
                        <Amount>{usd(x.balance)}</Amount>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>

        <h2 className="section-title mt-8">Whole budget, month by month</h2>
        <p className={`mt-1 ${MUTED}`}>
          Every budget account with card balances included, from your schedules
          and recent spending.
        </p>
        <SummaryStrip ariaLabel="Forecast summary">
          <Stat
            lead
            label="Budget accounts today"
            value={usd(f.startPosition)}
            note={`Starting point, ${f.today}`}
          />
          <Stat
            label="Lowest point"
            value={usd(f.lowest.ending)}
            tone={f.lowest.ending < 0n ? "negative" : "neutral"}
            note={`In ${monthName(f.lowest.month)}`}
          />
          <Stat
            label="Horizon"
            value={`${f.query.months} ${f.query.months === 1 ? "month" : "months"}`}
            note={
              f.query.spending !== 0
                ? `Everyday spending ${f.query.spending > 0 ? "+" : ""}${f.query.spending}%`
                : "Everyday spending at your recent average"
            }
          />
        </SummaryStrip>
        <div className="mt-3">
          {f.shortfallMonth ? (
            <Notice tone="warning">
              <strong>Money may run short in {monthName(f.shortfallMonth)}.</strong>{" "}
              On these assumptions your budget accounts would fall to{" "}
              <Amount>{usd(f.lowest.ending)}</Amount> by {monthName(f.lowest.month)}.
              Try the spending change above to see what closes the gap.
            </Notice>
          ) : (
            <Notice tone="positive">
              On these assumptions your budget accounts stay above zero; the
              lowest point is <Amount>{usd(f.lowest.ending)}</Amount> in{" "}
              {monthName(f.lowest.month)}.
            </Notice>
          )}
        </div>

        <section className="surface mt-4" aria-labelledby="rows-heading">
          <div className="flex items-center gap-2 border-b border-hairline px-4 py-2 lg:px-6">
            <h2 id="rows-heading" className="section-title">
              Month by month
            </h2>
            <Pill tone="warning">Estimate</Pill>
          </div>
          <div
            className="max-sm:overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Forecast by month"
          >
            <table className="ledger">
              <caption className="sr-only">Forecast by month</caption>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col" className="num" data-hide="sm">
                    Income
                  </th>
                  <th scope="col" className="num" data-hide="sm">
                    Scheduled bills
                  </th>
                  <th scope="col" className="num" data-hide="sm">
                    Everyday spending
                  </th>
                  <th scope="col" className="num" data-hide="md">
                    Loan payments
                  </th>
                  <th scope="col" className="num">
                    Net
                  </th>
                  <th scope="col" className="num">
                    End of month
                  </th>
                </tr>
              </thead>
              <tbody>
                {f.rows.map((r) => (
                  <tr key={r.month}>
                    <td className="text-ink">
                      {monthName(r.month)}
                      {r.partial && (
                        <span className="ledger-sub">
                          rest of month, scheduled items only
                        </span>
                      )}
                    </td>
                    <td className="num text-ink-2" data-hide="sm">
                      <MaybeAmount value={signed(r.income)} />
                    </td>
                    <td className="num text-ink-2" data-hide="sm">
                      <MaybeAmount value={signed(r.bills)} />
                    </td>
                    <td className="num text-ink-2" data-hide="sm">
                      <MaybeAmount value={signed(r.spending)} />
                    </td>
                    <td className="num text-ink-2" data-hide="md">
                      <MaybeAmount value={signed(r.loans)} />
                    </td>
                    <td className="num text-ink">
                      <Amount>{usd(r.net)}</Amount>
                    </td>
                    <td
                      className={`num font-semibold ${r.ending < 0n ? "text-negative" : "text-ink"}`}
                    >
                      <Amount>{usd(r.ending)}</Amount>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="surface mt-4 p-4" aria-labelledby="assumptions-heading">
          <h2 id="assumptions-heading" className="section-title">
            What this assumes
          </h2>
          <ul className={`mt-2 list-disc space-y-1 pl-5 ${MUTED}`}>
            <li>
              Income:{" "}
              {f.incomeSource === "scheduled"
                ? "your scheduled income only."
                : f.incomeSource === "average"
                  ? `${usd(a.averageIncome)} a month, your average from ${monthName(a.historyFrom)} to ${monthName(a.historyThrough)}, because no income is scheduled.`
                  : "none, because nothing is scheduled and nothing was earned in the last three months."}
              {f.query.extraIncome > 0n &&
                ` Plus ${usd(f.query.extraIncome)} a month you added.`}
            </li>
            <li>
              Scheduled bills and transfers: {a.scheduledCount} upcoming item
              {a.scheduledCount === 1 ? "" : "s"} from{" "}
              <Link className={LINK} href="/accounts/schedules">
                Schedules
              </Link>
              , counted once each. Past-due items are not included.
            </li>
            <li>
              Everyday spending: <Amount>{usd(a.averageSpending)}</Amount> a
              month, your average over the same months in categories no
              schedule pays
              {a.excludedCategories > 0
                ? ` (${a.excludedCategories} scheduled categor${a.excludedCategories === 1 ? "y is" : "ies are"} left out so bills are not counted twice)`
                : ""}
              {f.query.spending !== 0 &&
                `, changed by ${f.query.spending > 0 ? "+" : ""}${f.query.spending}%`}
              .
            </li>
            <li>
              Loan payments: minimums on tracked loans no schedule pays.
              {a.loans.length === 0
                ? " None."
                : ` ${a.loans
                    .map((l) =>
                      l.minimum === null
                        ? `${l.name}: no terms recorded, so nothing assumed`
                        : `${l.name}: ${usd(l.minimum)}`,
                    )
                    .join("; ")}.`}
            </li>
            <li>
              Card spending counts when it happens; card balances already owed
              are part of the starting figure.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
