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

const MUTED = "text-table text-ink-2";
const LINK = "link";
const usd = (v: bigint) => formatUSD(money(v));
const signed = (v: bigint) => (v === 0n ? "—" : usd(v));
const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

export default async function Forecast({
  searchParams,
}: {
  searchParams: Promise<{ months?: string; spending?: string; extra?: string }>;
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
          <button className="btn btn-secondary" type="submit">
            Update forecast
          </button>
        </Form>
      </PageHeader>
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
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
