import { detectRecurring } from "@/domain/recurring";
import { ScheduleFields } from "@/components/schedule-fields";
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
  const suggestions = detectRecurring(
    state.transactions
      .filter(
        (t) =>
          !t.voidedAt &&
          ["INCOME", "EXPENSE"].includes(t.kind) &&
          accounts.some((a) => a.id === t.accountId),
      )
      .map((t) => ({
        id: t.id,
        accountId: t.accountId,
        payee: t.payee,
        date: t.date.toISOString().slice(0, 10),
        amount: t.amount,
        kind: t.kind as "INCOME" | "EXPENSE",
      })),
  ).filter(
    (s) =>
      !data.schedules.some(
        (existing) =>
          !existing.archived &&
          !existing.replacedById &&
          existing.accountId === s.accountId &&
          existing.payee.trim().toLowerCase() === s.payee.trim().toLowerCase(),
      ),
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
            <ScheduleFields
              accounts={accounts}
              categories={categories}
              today={data.today}
              timezone={state.budget.timezone}
            />
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
        {data.candidatesTruncated && (
          <p className="finance-notice">
            Matching lists the newest 500 transactions in this window. Use a
            shorter date range to find older entries.
          </p>
        )}
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
            {o.corrected && (
              <p className="finance-notice">
                The linked transaction was corrected or voided. This occurrence
                stays handled; review the account register.
              </p>
            )}
            {o.handled ? (
              <p>
                {o.handled.status === "APPROVED"
                  ? o.handled.matched
                    ? "Matched to existing transaction"
                    : "Approved into ledger"
                  : "Skipped"}
              </p>
            ) : (
              <div className="field-grid">
                {o.candidates.length > 0 && (
                  <FinanceForm
                    budgetId={state.budget.id}
                    command={{
                      type: "schedule.match",
                      id: o.schedule.id,
                      date: o.date,
                    }}
                    label="Match existing transaction"
                  >
                    <label>
                      Existing transaction
                      <select
                        name="transactionId"
                        aria-label="Existing transaction"
                      >
                        {o.candidates.map((t) => (
                          <option value={t.id} key={t.id}>
                            {t.date.toISOString().slice(0, 10)} ·{" "}
                            {t.payee || "No payee"} ·{" "}
                            {formatUSD(money(t.amount))}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p>
                      Same account, type and amount within seven days. Matching
                      creates no money.
                    </p>
                  </FinanceForm>
                )}
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
        <h2>Possible recurring transactions</h2>
        <p>
          Suggestions need at least three similar income or expense entries.
          Dates may differ by two days and amounts by 20%. This is evidence to
          review, not a prediction or permission to post.
        </p>
        {!suggestions.length && <p>No new recurring patterns found.</p>}
        {suggestions.map((s) => {
          const history = s.transactionIds.map((id) =>
            state.transactions.find((t) => t.id === id)!,
          );
          const source = history.at(-1)!;
          const previousSplits = state.splits.filter(
            (split) =>
              split.transactionId === source.id &&
              categories.some((c) => c.id === split.categoryId),
          );
          const defaults = {
            name: s.payee,
            accountId: s.accountId,
            transferAccountId: null,
            kind: source.kind,
            amount: s.amount,
            payee: s.payee,
            memo: "",
            startDate: s.nextDate,
            endDate: null,
            timezone: state.budget.timezone,
            cadence: s.cadence,
            interval: s.interval,
            splits:
              previousSplits.length === 1
                ? [
                    {
                      categoryId: previousSplits[0].categoryId,
                      amount: s.amount,
                    },
                  ]
                : [],
          };
          return (
            <details key={s.key} className="finance-panel">
              <summary>
                {s.payee} · {formatUSD(money(s.amount))} ·{" "}
                {s.confidence === "EXACT"
                  ? "Regular pattern"
                  : "Approximate pattern"}
              </summary>
              <p>
                {s.transactionIds.length} supporting transactions ·{" "}
                {s.cadence.toLowerCase()} every {s.interval}. Review the first
                date and category before creating a schedule.
              </p>
              <ul>
                {history.map((t) => (
                  <li key={t.id}>
                    {t.date.toISOString().slice(0, 10)} ·{" "}
                    {formatUSD(money(t.amount))} ·{" "}
                    <Link href={`/accounts/${t.accountId}`}>View account</Link>
                  </li>
                ))}
              </ul>
              <FinanceForm
                budgetId={state.budget.id}
                command={{ type: "schedule.create" }}
                label="Create reviewed schedule"
              >
                <ScheduleFields
                  accounts={accounts}
                  categories={categories}
                  today={data.today}
                  timezone={state.budget.timezone}
                  initial={defaults}
                />
              </FinanceForm>
            </details>
          );
        })}
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
            {!s.archived && !s.replacedById && (
              <details>
                <summary>Change future occurrences</summary>
                <p>
                  The first occurrence below starts a new version. Earlier
                  occurrences retain their original amount and categories.
                  Choose a date after any already-handled occurrence.
                </p>
                <FinanceForm
                  budgetId={state.budget.id}
                  command={{
                    type: "schedule.replace",
                    id: s.id,
                    revision: s.revision,
                  }}
                  label="Save future schedule"
                >
                  <ScheduleFields
                    accounts={accounts}
                    categories={categories}
                    today={data.today}
                    timezone={state.budget.timezone}
                    initial={{
                      ...s,
                      startDate: data.today,
                      endDate: s.endDate?.toISOString().slice(0, 10) ?? null,
                      splits: data.splits.filter(
                        (split) => split.scheduleId === s.id,
                      ),
                    }}
                  />
                </FinanceForm>
              </details>
            )}
            {s.replacedById && (
              <p>A later version replaces future occurrences.</p>
            )}
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
