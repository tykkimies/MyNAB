import Link from "next/link";
import { goalsPage } from "@/application/finance-page";
import { FinanceForm } from "@/components/finance-form";
import { TARGET_KIND, TARGET_STATE, WEEKDAYS } from "@/components/targets";
import { formatUSD, money } from "@/domain/money";
import { nextMonth } from "@/domain/budget";
import { budgetMonth } from "@/domain/dates";

const usd = (n: bigint) => formatUSD(money(n));
const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

export default async function Goals({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const q = await searchParams;
  let selected = q.month;
  try {
    if (selected) budgetMonth(selected);
  } catch {
    selected = undefined;
  }
  const s = await goalsPage(selected);
  const overdue = s.targets.filter((t) => t.progress.state === "OVERDUE");
  const assignable = s.categories.filter(
    (c) => !c.archived && !c.system && !c.paymentAccountId,
  );

  return (
    <main id="main" className="main finance" tabIndex={-1}>
      <div className="page-heading">
        <span className="eyebrow">GOALS</span>
        <h1>Make space for what’s ahead.</h1>
        <p>
          A target says what a category needs and by when. It never assigns
          money on its own, and nothing here creates money you do not have.
        </p>
      </div>

      <nav className="month-nav" aria-label="Goals month">
        {s.month > "1900-01" && (
          <Link href={`/goals?month=${nextMonth(s.month, -1)}`}>
            ← Previous
          </Link>
        )}
        <h2>{monthName(s.month)}</h2>
        {s.month < nextMonth(s.today.slice(0, 7), 24) && (
          <Link href={`/goals?month=${nextMonth(s.month)}`}>Next →</Link>
        )}
        <Link href="/goals">Today</Link>
      </nav>

      {s.summary.count === 0 && (
        <section className="finance-panel">
          <h2>No targets yet</h2>
          <p className="muted">
            Give a category a target below and it will tell you what to assign
            each month. A target is a plan, not a transfer: money only moves
            when you assign it on the <Link href="/budget">budget</Link>.
          </p>
        </section>
      )}

      {s.summary.count > 0 && (
        <section className="money-summary" aria-label="Target totals">
          <article className={s.summary.neededThisMonth > 0n ? "negative" : ""}>
            <span>Needed this month</span>
            <strong>{usd(s.summary.neededThisMonth)}</strong>
          </article>
          <article>
            <span>Still needed overall</span>
            <strong>{usd(s.summary.stillNeeded)}</strong>
          </article>
          <article>
            <span>Funded</span>
            <strong>
              {s.summary.met} of {s.summary.count}
            </strong>
          </article>
        </section>
      )}

      {s.projection.readyToAssign < 0n && (
        <aside className="finance-notice">
          <strong>You have assigned more than you have</strong>
          <p>
            Ready to Assign is {usd(s.projection.readyToAssign)}. Filling a
            target never creates money: categories are simply holding more than
            the budget contains. Resolve it on the{" "}
            <Link href="/budget">budget</Link> by moving money out of a category
            or reducing an assignment.
          </p>
        </aside>
      )}

      {overdue.length > 0 && (
        <aside className="finance-notice">
          <strong>Past the date you set</strong>
          <p>
            {overdue.map((t) => t.name).join(", ")} asked to be funded by a
            month that has passed, so the whole remainder is shown as needed now
            rather than spread over no months at all. Move the date or fund what
            is left.
          </p>
        </aside>
      )}

      {s.summary.neededThisMonth > 0n && (
        <section className="finance-panel">
          <h2>Fund every target</h2>
          <p className="muted">
            Assigns {usd(s.summary.neededThisMonth)} across the targets below,
            in one step. If that is more than the budget holds it still fills
            them and tells you by how much, leaving Ready to Assign negative for
            you to resolve, as YNAB does.
          </p>
          <FinanceForm
            budgetId={s.budget.id}
            command={{ type: "target.fund", month: s.month }}
            label="Assign what targets need"
          />
        </section>
      )}

      {s.summary.count > 0 && (
        <section className="finance-panel">
          <h2>Every target</h2>
          <div className="table-scroll">
            <table>
              <caption className="sr-only">
                Targets and their progress for {s.month}
              </caption>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Kind</th>
                  <th>Target</th>
                  <th>Funded</th>
                  <th>Still needed</th>
                  <th>This month</th>
                  <th>Expected</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {s.targets.map((t) => {
                  const limit = t.type === "SPENDING_LIMIT";
                  return (
                    <tr key={t.categoryId}>
                      <th scope="row">
                        {t.name}
                        <small>{t.group}</small>
                      </th>
                      <td>
                        {TARGET_KIND[t.type]}
                        {(t.type === "MONTHLY" || t.type === "WEEKLY") && (
                          <small>{t.refill ? "Refill" : "Set aside"}</small>
                        )}
                        {t.type === "PERIODIC" && (
                          <small>Every {t.cadenceMonths ?? 12} months</small>
                        )}
                        {t.type === "WEEKLY" && t.dayOfWeek !== undefined && (
                          <small>{WEEKDAYS[t.dayOfWeek]}</small>
                        )}
                      </td>
                      <td>
                        {usd(t.amount)}
                        {t.progress.dueMonth && (
                          <small>by {monthName(t.progress.dueMonth)}</small>
                        )}
                      </td>
                      <td>
                        {usd(t.progress.funded)}
                        {limit && <small>spent</small>}
                      </td>
                      <td>
                        {usd(t.progress.needed)}
                        {limit && <small>left to spend</small>}
                      </td>
                      <td
                        className={
                          t.progress.contribution > 0n ? "negative" : ""
                        }
                      >
                        {usd(t.progress.contribution)}
                      </td>
                      <td>
                        {t.completion === null ? (
                          <span className="muted">
                            —
                            {(t.type === "BALANCE" ||
                              t.type === "BALANCE_BY_DATE" ||
                              t.type === "PERIODIC") && (
                              <small>
                                {t.pace > 0n
                                  ? "Longer than this shows"
                                  : "Nothing assigned yet"}
                              </small>
                            )}
                          </span>
                        ) : t.completion.months === 0 ? (
                          "Now"
                        ) : (
                          <>
                            {monthName(t.completion.month)}
                            <small>at {usd(t.pace)} a month</small>
                          </>
                        )}
                      </td>
                      <td>
                        <span
                          className={`target-state ${t.progress.state.toLowerCase()}`}
                        >
                          {TARGET_STATE[t.progress.state]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted">
            “Expected” assumes you keep assigning what you assigned this month.
            It is an estimate from your own pace, not a promise, and a category
            you have not assigned to yet has no pace to project from.
          </p>
        </section>
      )}

      {assignable.length > 0 && (
        <section className="finance-panel">
          <h2>Set a target</h2>
          <p className="muted">
            Saving a target for a category that already has one replaces it.
            Card payment categories are left out: the budget already works out
            what a card needs, and a second answer would only disagree with it.
          </p>
          <FinanceForm
            budgetId={s.budget.id}
            command={{ type: "target.set" }}
            label="Save target"
          >
            <div className="field-grid">
              <label>
                Category
                <select name="categoryId" required aria-label="Target category">
                  {assignable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Kind
                <select name="targetType" aria-label="Target kind">
                  <option value="MONTHLY">Needs this much every month</option>
                  <option value="WEEKLY">Needs this much every week</option>
                  <option value="BALANCE">Build up to this amount</option>
                  <option value="BALANCE_BY_DATE">
                    Build up to this amount by a month
                  </option>
                  <option value="PERIODIC">
                    A bill that repeats every so many months
                  </option>
                  <option value="SPENDING_LIMIT">Stay under this amount</option>
                  <option value="MAINTAIN">Keep this much on hand</option>
                </select>
              </label>
              <label>
                Amount (USD)
                <input name="amount" required inputMode="decimal" />
              </label>
              <label>
                Due month
                <input
                  name="dueMonth"
                  placeholder="2026-12"
                  maxLength={7}
                  aria-label="Due month"
                  aria-describedby="due-month-help"
                />
                <small id="due-month-help">
                  Only for the two dated kinds, as YYYY-MM.
                </small>
              </label>
              <label>
                Repeats every (months)
                <input
                  name="cadenceMonths"
                  inputMode="numeric"
                  aria-label="Repeats every (months)"
                  aria-describedby="cadence-help"
                />
                <small id="cadence-help">
                  Only for a repeating bill. 12 is yearly.
                </small>
              </label>
              <label>
                Weekday
                <select
                  name="dayOfWeek"
                  aria-label="Weekday"
                  aria-describedby="weekday-help"
                >
                  <option value="">Not weekly</option>
                  {WEEKDAYS.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
                <small id="weekday-help">
                  Only for a weekly target. Months hold four or five of a given
                  weekday, and the amount asked for follows that.
                </small>
              </label>
            </div>
            <label className="check-field">
              <input type="checkbox" name="refill" />
              Refill up to this amount, counting what is already there
            </label>
            <p className="muted">
              Leave unticked to set aside the amount again each time regardless
              of what survived. Groceries are usually a refill; saving toward
              something is usually set aside.
            </p>
          </FinanceForm>

          {s.targets.length > 0 && (
            <details>
              <summary>Remove a target</summary>
              <FinanceForm
                budgetId={s.budget.id}
                command={{ type: "target.clear" }}
                label="Remove target"
              >
                <label>
                  Category
                  <select
                    name="categoryId"
                    required
                    aria-label="Target to remove"
                  >
                    {s.targets.map((t) => (
                      <option key={t.categoryId} value={t.categoryId}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="muted">
                  Removing a target leaves assigned money exactly where it is.
                  It only stops the reminder.
                </p>
              </FinanceForm>
            </details>
          )}
        </section>
      )}

      {s.withoutTarget.length > 0 && (
        <section className="finance-panel">
          <h2>Categories without a target</h2>
          <p className="muted">
            These are budgeted by hand. That is a legitimate choice, not a
            problem to fix: {s.withoutTarget.map((c) => c.name).join(", ")}.
          </p>
        </section>
      )}
    </main>
  );
}
