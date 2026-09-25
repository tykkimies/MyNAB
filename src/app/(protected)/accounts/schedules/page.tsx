import { detectRecurring } from "@/domain/recurring";
import { ScheduleFields } from "@/components/schedule-fields";
import Link from "next/link";
import { financePage } from "@/application/finance-page";
import { requireUser } from "@/application/session";
import { getSchedules } from "@/application/schedules";
import { FinanceForm } from "@/components/finance-form";
import { formatUSD, money } from "@/domain/money";
import { Amount } from "@/components/amount";
import { formatDate } from "@/domain/dates";
import Form from "next/form";

const CARD = "rounded-lg border border-border-warm bg-surface-card";
const PANEL_H2 = "font-headline-md text-headline-md text-text-primary";
const PANEL_H3 = "font-headline-sm text-headline-sm text-text-primary";
const MUTED = "font-body-sm text-body-sm leading-relaxed text-text-secondary";
const NOTICE =
  "rounded-md border border-status-warning-border bg-status-warning-bg p-space-md font-body-sm text-body-sm leading-relaxed text-text-secondary";
const MAIN =
  "mx-auto w-full max-w-canvas px-gutter pb-space-xl pt-space-lg outline-none lg:px-space-lg";
const LINK = "font-semibold text-secondary underline underline-offset-2";
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
      <main id="main" className={MAIN}>
        <h1 className="font-headline-lg text-headline-lg text-text-primary">
          Schedules
        </h1>
        <p className={`mt-space-sm ${MUTED}`}>
          Unable to load this date range. Choose valid calendar dates and a
          shorter window.
        </p>
        <Link
          className={`mt-space-md inline-block ${LINK}`}
          href="/accounts/schedules"
        >
          Reset dates
        </Link>
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
  );
  const dismissed = suggestions.filter((s) => data.dismissed.includes(s.key));
  const active = suggestions.filter(
    (s) =>
      !data.dismissed.includes(s.key) &&
      !data.schedules.some(
        (existing) =>
          !existing.archived &&
          !existing.replacedById &&
          existing.accountId === s.accountId &&
          existing.payee.trim().toLowerCase() === s.payee.trim().toLowerCase(),
      ),
  );
  return (
    <main id="main" className={MAIN} tabIndex={-1}>
      <div className="flex max-w-2xl flex-col">
        <span className="font-label-caps text-label-caps uppercase tracking-widest text-secondary">
          Accounts · Schedules
        </span>
        <h1 className="mt-space-xs font-headline-hero-mobile text-headline-hero-mobile leading-none text-text-primary lg:font-headline-hero lg:text-headline-hero">
          Plan what comes next.
        </h1>
        <p className="mt-space-sm font-body-lg text-body-lg leading-relaxed text-text-secondary">
          Scheduled money stays outside your budget until you approve it. Check
          for an existing bank import before approving.
        </p>
        <Link className={`mt-space-md self-start ${LINK}`} href="/accounts">
          Back to accounts
        </Link>
      </div>
      <section className={`finance-panel mt-space-lg ${CARD} p-space-lg`}>
        <h2 className={PANEL_H2}>Create a schedule</h2>
        {!accounts.length ? (
          <p className={`mt-space-sm ${MUTED}`}>Add an account first.</p>
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
      <section className={`finance-panel mt-space-lg ${CARD} p-space-lg`}>
        <h2 className={PANEL_H2}>Upcoming and handled occurrences</h2>
        <Form action="/accounts/schedules" scroll={false} className="finance-form">
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
          <button className="secondary-button" type="submit">
            Show dates
          </button>
        </Form>
        <p className={`mt-space-md ${MUTED}`}>
          Scheduled transactions enter the register automatically on their date
          and wait for approval. Monthly dates keep their original day after
          shorter months.
        </p>
        {data.overdue.count > 0 && data.overdue.oldest! < data.start && (
          <p className={`mt-space-md ${NOTICE}`} role="status">
            {data.overdue.count} earlier occurrence
            {data.overdue.count === 1 ? " needs" : "s need"} review, the oldest
            from {data.overdue.oldest}.{" "}
            <Link
              className={LINK}
              href={`/accounts/schedules?from=${data.overdue.oldest}&through=${data.end}`}
              scroll={false}
            >
              Review overdue
            </Link>
          </p>
        )}
        {data.candidatesTruncated && (
          <p className={`mt-space-md ${NOTICE}`}>
            Matching lists the newest 500 transactions in this window. Use a
            shorter date range to find older entries.
          </p>
        )}
        {!data.upcoming.length && (
          <p className={`mt-space-md ${MUTED}`}>
            No occurrences in this range.
          </p>
        )}
        {data.upcoming.map((o) => (
          <article
            className={`finance-panel mt-space-md ${CARD} p-space-md`}
            key={o.key}
          >
            <h3 className={PANEL_H3}>
              {o.schedule.name} · {o.date}
            </h3>
            <p className={`mt-space-xs ${MUTED}`}>
              <Amount>{formatUSD(money(o.schedule.amount))}</Amount> ·{" "}
              {state.accounts.find((a) => a.id === o.schedule.accountId)?.name}
            </p>
            {o.corrected && (
              <p className={`mt-space-sm ${NOTICE}`}>
                The linked transaction was corrected or voided. This occurrence
                stays handled; review the account register.
              </p>
            )}
            {o.handled?.status === "ENTERED" ? (
              <div className="mt-space-sm field-grid">
                <p className={NOTICE}>
                  Entered in the register · awaiting approval
                </p>
                <FinanceForm
                  budgetId={state.budget.id}
                  command={{
                    type: "schedule.confirm",
                    id: o.schedule.id,
                    date: o.date,
                  }}
                  label="Approve transaction"
                />
                <FinanceForm
                  budgetId={state.budget.id}
                  command={{
                    type: "schedule.reject",
                    id: o.schedule.id,
                    date: o.date,
                  }}
                  label="Remove transaction"
                />
              </div>
            ) : o.handled ? (
              <p className={`mt-space-sm ${MUTED}`}>
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
                            {formatDate(t.date, state.budget.dateFormat)} ·{" "}
                            {t.payee || "No payee"} ·{" "}
                            <Amount>{formatUSD(money(t.amount))}</Amount>
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className={MUTED}>
                      Same account, type and amount within seven days. Matching
                      creates no money.
                    </p>
                  </FinanceForm>
                )}
                {o.due && (
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
      <section className={`finance-panel mt-space-lg ${CARD} p-space-lg`}>
        <h2 className={PANEL_H2}>Possible recurring transactions</h2>
        <p className={`mt-space-sm ${MUTED}`}>
          Suggestions need at least three similar income or expense entries.
          Dates may differ by two days and amounts by 20%. This is evidence to
          review, not a prediction or permission to post.
        </p>
        {!active.length && (
          <p className={`mt-space-md ${MUTED}`}>
            No new recurring patterns found.
          </p>
        )}
        {active.map((s) => {
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
            <details
              key={s.key}
              className={`finance-panel mt-space-md rounded-md border border-border-warm p-space-md`}
            >
              <summary className="cursor-pointer font-label-sm text-label-sm font-semibold text-text-primary">
                {s.payee} · <Amount>{formatUSD(money(s.amount))}</Amount> ·{" "}
                {s.confidence === "EXACT"
                  ? "Regular pattern"
                  : "Approximate pattern"}
              </summary>
              <p>
                {s.transactionIds.length} supporting transactions ·{" "}
                {s.cadence.replace("_", " ").toLowerCase()} every {s.interval}. Review the first
                date and category before creating a schedule.
              </p>
              <ul>
                {history.map((t) => (
                  <li key={t.id}>
                    {formatDate(t.date, state.budget.dateFormat)} ·{" "}
                    <Amount>{formatUSD(money(t.amount))}</Amount> ·{" "}
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
              <FinanceForm
                budgetId={state.budget.id}
                command={{ type: "recurring.dismiss", key: s.key }}
                label="Not recurring"
                inline
              />
            </details>
          );
        })}
        {dismissed.length > 0 && (
          <details className="mt-space-md">
            <summary className="cursor-pointer font-label-sm text-label-sm font-semibold text-text-primary">
              Dismissed patterns ({dismissed.length})
            </summary>
            {dismissed.map((s) => (
              <div
                key={s.key}
                className="mt-space-sm flex flex-wrap items-center justify-between gap-space-sm"
              >
                <span className={MUTED}>
                  {s.payee} · <Amount>{formatUSD(money(s.amount))}</Amount>
                </span>
                <FinanceForm
                  budgetId={state.budget.id}
                  command={{ type: "recurring.restore", key: s.key }}
                  label="Restore"
                  inline
                />
              </div>
            ))}
          </details>
        )}
      </section>
      <section className={`finance-panel mt-space-lg ${CARD} p-space-lg`}>
        <h2 className={PANEL_H2}>Manage schedules</h2>
        <p className={`mt-space-sm ${MUTED}`}>
          Archive a schedule to stop future occurrences; approved transactions
          remain in your ledger.
        </p>
        {data.schedules.map((s) => (
          <div
            className="finance-panel mt-space-md rounded-md border border-border-warm p-space-md"
            key={s.id}
          >
            <h3 className={PANEL_H3}>{s.name}</h3>
            <p className={`mt-space-xs ${MUTED}`}>
              {s.cadence.replace("_", " ").toLowerCase()} · every {s.interval} · {s.timezone}
            </p>
            {!s.archived && !s.replacedById && (
              <details className="mt-space-sm">
                <summary className="cursor-pointer font-label-sm text-label-sm font-semibold text-text-primary">
                  Change future occurrences
                </summary>
                <p className={`mt-space-sm ${MUTED}`}>
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
              <p className={`mt-space-sm ${MUTED}`}>
                A later version replaces future occurrences.
              </p>
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
