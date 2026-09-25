import Link from "next/link";
import { requireUser } from "@/application/session";
import { openBudget } from "@/application/finance-page";
import { FinanceError } from "@/application/finance";
import { getForecast } from "@/application/forecasts";
import { formatUSD, money } from "@/domain/money";
import { Amount, MaybeAmount } from "@/components/amount";
import Form from "next/form";

const MUTED = "font-body-sm text-body-sm leading-relaxed text-text-secondary";
const LINK = "font-semibold text-secondary underline underline-offset-2";
const NUM = "tabular-nums";
// Dashed edges mark every forecast surface as an estimate, never budget money.
const ESTIMATE =
  "finance-panel rounded-lg border border-dashed border-border-muted bg-surface-card p-space-lg";
const MAIN =
  "mx-auto w-full max-w-canvas px-gutter pb-space-xl pt-space-lg outline-none lg:px-space-lg";
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
      <main id="main" className={MAIN} tabIndex={-1}>
        <h1 className="font-headline-lg text-headline-lg">Forecast</h1>
        <p className={`mt-space-sm ${MUTED}`}>{error.message}</p>
        <Link
          className={`mt-space-md inline-block ${LINK}`}
          href="/reports/forecast"
        >
          Reset
        </Link>
      </main>
    );
  }
  const a = f.assumptions;
  return (
    <main id="main" className={MAIN} tabIndex={-1}>
      <div className="flex max-w-2xl flex-col">
        <span className="font-label-caps text-label-caps uppercase tracking-widest text-secondary">
          <Link className="underline-offset-2 hover:underline" href="/reports">
            Reports
          </Link>{" "}
          · Forecast
        </span>
        <h1 className="mt-space-xs font-headline-hero-mobile text-headline-hero-mobile leading-none text-text-primary lg:font-headline-hero lg:text-headline-hero">
          Look ahead.
        </h1>
        <p className="mt-space-sm font-body-lg text-body-lg leading-relaxed text-text-secondary">
          An estimate of your budget accounts, card balances included, if the
          coming months look like your schedules and recent spending. It never
          assigns money or changes your budget.
        </p>
      </div>

      <Form action="/reports/forecast" scroll={false} className={`finance-form mt-space-lg ${ESTIMATE}`}>
        <div className="field-grid">
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
            />
          </label>
          <label>
            Extra monthly income (USD)
            <input
              name="extra"
              inputMode="decimal"
              defaultValue={f.query.extraIncome > 0n ? f.query.extra : ""}
            />
          </label>
        </div>
        <button className="secondary-button" type="submit">
          Update forecast
        </button>
      </Form>

      {f.shortfallMonth ? (
        <aside className="mt-space-md rounded-lg border border-status-warning-border bg-status-warning-bg p-space-md">
          <strong className="font-headline-sm text-headline-sm text-status-warning-text">
            Money may run short in {monthName(f.shortfallMonth)}
          </strong>
          <p className={MUTED}>
            On these assumptions your budget accounts would fall to{" "}
            <Amount>{usd(f.lowest.ending)}</Amount> by {monthName(f.lowest.month)}. Try the
            spending change above to see what closes the gap.
          </p>
        </aside>
      ) : (
        <p className={`mt-space-md ${MUTED}`}>
          On these assumptions your budget accounts stay above zero; the lowest
          point is <Amount>{usd(f.lowest.ending)}</Amount> in {monthName(f.lowest.month)}.
        </p>
      )}

      <section
        className={`mt-space-lg ${ESTIMATE}`}
        aria-labelledby="rows-heading"
      >
        <h2 id="rows-heading" className="font-headline-md text-headline-md">
          Month by month{" "}
          <span className="font-label-caps text-label-caps uppercase tracking-widest text-text-secondary">
            Estimate
          </span>
        </h2>
        <p className={`mt-space-xs ${MUTED}`}>
          Starting from <Amount>{usd(f.startPosition)}</Amount> today ({f.today}).
        </p>
        <div
          className="mt-space-md overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Forecast by month"
        >
          <table className="w-full border-collapse text-body-sm">
            <caption className="sr-only">Forecast by month</caption>
            <thead>
              <tr className="border-b border-border-warm text-left text-text-secondary">
                {[
                  "Month",
                  "Income",
                  "Scheduled bills",
                  "Everyday spending",
                  "Loan payments",
                  "Net",
                  "End of month",
                ].map((h, i) => (
                  <th
                    className={`py-space-xs pr-space-sm font-semibold ${i ? "text-right" : ""}`}
                    key={h}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {f.rows.map((r) => (
                <tr className="border-b border-border-warm" key={r.month}>
                  <td className="py-space-xs pr-space-sm">
                    {monthName(r.month)}
                    {r.partial && (
                      <span className="block text-text-secondary">
                        rest of month, scheduled items only
                      </span>
                    )}
                  </td>
                  <td className={`py-space-xs pr-space-sm text-right ${NUM}`}>
                    <MaybeAmount value={signed(r.income)} />
                  </td>
                  <td className={`py-space-xs pr-space-sm text-right ${NUM}`}>
                    <MaybeAmount value={signed(r.bills)} />
                  </td>
                  <td className={`py-space-xs pr-space-sm text-right ${NUM}`}>
                    <MaybeAmount value={signed(r.spending)} />
                  </td>
                  <td className={`py-space-xs pr-space-sm text-right ${NUM}`}>
                    <MaybeAmount value={signed(r.loans)} />
                  </td>
                  <td className={`py-space-xs pr-space-sm text-right ${NUM}`}>
                    <Amount>{usd(r.net)}</Amount>
                  </td>
                  <td
                    className={`py-space-xs text-right font-semibold ${NUM} ${r.ending < 0n ? "text-status-negative-text" : ""}`}
                  >
                    <Amount>{usd(r.ending)}</Amount>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className={`mt-space-lg ${ESTIMATE}`}
        aria-labelledby="assumptions-heading"
      >
        <h2
          id="assumptions-heading"
          className="font-headline-md text-headline-md"
        >
          What this assumes
        </h2>
        <ul
          className={`mt-space-sm list-disc space-y-space-xs pl-space-md ${MUTED}`}
        >
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
            Everyday spending: <Amount>{usd(a.averageSpending)}</Amount> a month, your average
            over the same months in categories no schedule pays
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
            Card spending counts when it happens; card balances already owed are
            part of the starting figure.
          </li>
        </ul>
      </section>
    </main>
  );
}
