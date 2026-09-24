import Link from "next/link";
import { financePage } from "@/application/finance-page";
import { requireUser } from "@/application/session";
import { getSchedules } from "@/application/schedules";
import { FinanceForm } from "@/components/finance-form";
import { formatUSD, money } from "@/domain/money";

export default async function Schedules({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; through?: string }>;
}) {
  const state = await financePage();
  const { from, through } = await searchParams;
  let data;
  try {
    data = await getSchedules(
      (await requireUser()).userId,
      state.budget.id,
      from,
      through,
    );
  } catch {
    return (
      <main id="main" className="main finance">
        <h1>Schedules</h1>
        <p>
          Unable to load this date range. Choose valid calendar dates and a
          shorter window.
        </p>
        <Link href="/accounts/schedules">Reset dates</Link>
      </main>
    );
  }
  const accounts = state.accounts.filter((a) => !a.closed);
  const categories = state.categories.filter(
    (c) => !c.archived && !c.paymentAccountId,
  );
  return (
    <main id="main" className="main finance" tabIndex={-1}>
      <div className="page-heading">
        <span className="eyebrow">ACCOUNTS</span>
        <h1>Plan what comes next.</h1>
        <p>
          Scheduled money stays outside your budget until you approve it. Check
          for an existing bank import before approving.
        </p>
        <Link href="/accounts">Back to accounts</Link>
      </div>
      <section className="finance-panel">
        <h2>Create a schedule</h2>
        {!accounts.length ? (
          <p>Add an account first.</p>
        ) : (
          <FinanceForm
            budgetId={state.budget.id}
            command={{ type: "schedule.create" }}
            label="Create schedule"
            reset
          >
            <div className="field-grid">
              <label>
                Name
                <input name="name" required maxLength={120} />
              </label>
              <label>
                Account
                <select aria-label="Account" name="accountId">
                  {accounts.map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select aria-label="Type" name="kind">
                  <option value="EXPENSE">Expense</option>
                  <option value="INCOME">Income</option>
                  <option value="TRANSFER">Transfer</option>
                </select>
              </label>
              <label>
                Amount (USD)
                <input
                  aria-label="Amount (USD)"
                  name="amount"
                  required
                  inputMode="decimal"
                />
                <small>
                  Negative for expenses and outgoing transfers; positive for
                  income.
                </small>
              </label>
              <label>
                Transfer destination
                <select
                  aria-label="Transfer destination"
                  name="transferAccountId"
                >
                  <option value="">None</option>
                  {accounts.map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Payee
                <input name="payee" maxLength={120} />
              </label>
              <label>
                Memo
                <input name="memo" maxLength={500} />
              </label>
              <label>
                First occurrence
                <input
                  name="startDate"
                  type="date"
                  required
                  defaultValue={data.today}
                />
              </label>
              <label>
                End date (optional)
                <input name="endDate" type="date" />
              </label>
              <label>
                Repeat
                <select aria-label="Repeat" name="cadence">
                  <option value="MONTHLY">Monthly</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="YEARLY">Yearly</option>
                  <option value="DAILY">Daily</option>
                  <option value="ONCE">Once</option>
                </select>
              </label>
              <label>
                Every
                <input
                  name="interval"
                  type="number"
                  min={1}
                  max={1200}
                  defaultValue={1}
                />
                <small>For example, every 2 weeks.</small>
              </label>
              <label>
                Timezone
                <input
                  name="timezone"
                  defaultValue={state.budget.timezone}
                  required
                />
              </label>
            </div>
            <p>
              Split expenses among categories. Split amounts must total the
              signed expense amount. Income and internal transfers need no
              category.
            </p>
            {[0, 1, 2, 3].map((i) => (
              <div className="field-grid" key={i}>
                <label>
                  Category {i + 1}
                  <select name="splitCategory">
                    <option value="">None</option>
                    {categories.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Split {i + 1} (USD)
                  <input name="splitAmount" inputMode="decimal" />
                </label>
              </div>
            ))}
          </FinanceForm>
        )}
      </section>
      <section className="finance-panel">
        <h2>Upcoming and handled occurrences</h2>
        <form method="get" className="finance-form">
          <div className="field-grid">
            <label>
              From
              <input
                type="date"
                name="from"
                defaultValue={data.start}
                required
              />
            </label>
            <label>
              Through
              <input
                type="date"
                name="through"
                defaultValue={data.end}
                required
              />
            </label>
          </div>
          <button type="submit">Show dates</button>
        </form>
        <p className="muted">
          Use an earlier start date to review overdue items. Approval is
          available on or after the occurrence date. Monthly dates keep their
          original day after shorter months.
        </p>
        {!data.upcoming.length && <p>No occurrences in this range.</p>}
        {data.upcoming.map((o) => (
          <article className="finance-panel" key={o.key}>
            <h3>
              {o.schedule.name} · {o.date}
            </h3>
            <p>
              {formatUSD(money(o.schedule.amount))} ·{" "}
              {state.accounts.find((a) => a.id === o.schedule.accountId)?.name}
            </p>
            {o.handled ? (
              <p>
                {o.handled.status === "APPROVED"
                  ? "Approved into ledger"
                  : "Skipped"}
              </p>
            ) : (
              <div className="field-grid">
                {o.date <= data.today && (
                  <FinanceForm
                    budgetId={state.budget.id}
                    command={{
                      type: "schedule.approve",
                      id: o.schedule.id,
                      date: o.date,
                    }}
                    label="Approve transaction"
                  />
                )}
                <FinanceForm
                  budgetId={state.budget.id}
                  command={{
                    type: "schedule.skip",
                    id: o.schedule.id,
                    date: o.date,
                  }}
                  label="Skip occurrence"
                />
              </div>
            )}
          </article>
        ))}
      </section>
      <section className="finance-panel">
        <h2>Manage schedules</h2>
        <p>
          Archive a schedule to stop future occurrences; approved transactions
          remain in your ledger.
        </p>
        {data.schedules.map((s) => (
          <div className="finance-panel" key={s.id}>
            <h3>{s.name}</h3>
            <p>
              {s.cadence.toLowerCase()} · every {s.interval} · {s.timezone}
            </p>
            <FinanceForm
              budgetId={state.budget.id}
              command={{
                type: "schedule.archive",
                id: s.id,
                archived: !s.archived,
              }}
              label={s.archived ? "Restore schedule" : "Archive schedule"}
            />
          </div>
        ))}
      </section>
    </main>
  );
}
