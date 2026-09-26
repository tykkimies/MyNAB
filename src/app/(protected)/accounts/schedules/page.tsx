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
import { Drawer } from "@/components/drawer";

const CARD = "rounded-lg border border-border-warm bg-surface-card";
const PANEL_H2 = "font-headline-md text-headline-md text-text-primary";
const MUTED = "font-body-sm text-body-sm leading-relaxed text-text-secondary";
const NOTICE =
  "rounded-md border border-status-warning-border bg-status-warning-bg p-space-md font-body-sm text-body-sm leading-relaxed text-text-secondary";
const MAIN =
  "mx-auto w-full max-w-canvas px-gutter pb-space-xl pt-space-lg outline-none lg:px-space-lg";
const LINK = "font-semibold text-secondary underline underline-offset-2";
const TH =
  "px-space-sm py-space-xs text-left font-label-caps text-label-caps uppercase text-text-tertiary first:pl-space-lg last:pr-space-lg";
const TD = "px-space-sm py-space-sm align-middle font-body-sm text-body-sm";
export default async function Schedules({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    through?: string;
    categoryId?: string;
    schedule?: string;
  }>;
}) {
  const state = await financePage();
  const { from, through, categoryId, schedule: openId } = await searchParams;
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
  const suggestedCategory = categories.find(
    (category) => category.id === categoryId,
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
        <h1 className="mt-space-xs font-headline-lg text-headline-lg leading-tight text-text-primary">
          Plan what comes next.
        </h1>
        <p className="mt-space-xs font-body-md text-body-md leading-relaxed text-text-secondary">
          Scheduled money stays outside your budget until you approve it. Check
          for an existing bank import before approving.
        </p>
        <Link className={`mt-space-md self-start ${LINK}`} href="/accounts">
          Back to accounts
        </Link>
      </div>
      <section className={`finance-panel mt-space-lg ${CARD} p-space-lg`}>
        <h2 className={PANEL_H2}>Upcoming and handled occurrences</h2>
        <Form
          action="/accounts/schedules"
          scroll={false}
          className="finance-form"
        >
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
        {/* One continuous list of occurrence rows rather than a stack of
            cards, like the ledger on the other pages. */}
        {data.upcoming.map((o, index) => (
          <article
            className={`finance-panel border-border-warm py-space-md ${index === 0 ? "mt-space-md border-y" : "border-b"}`}
            key={o.key}
          >
            <h3 className="font-body-md text-body-md font-semibold text-text-primary">
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
                {s.cadence.replace("_", " ").toLowerCase()} every {s.interval}.
                The amount is the latest one. Review the amount, first date and
                category before creating a schedule.
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
      <section className={`finance-panel mt-space-lg overflow-hidden ${CARD}`}>
        <div className="px-space-lg pt-space-lg">
          <h2 className={PANEL_H2}>Manage schedules</h2>
          <p className={`mt-space-sm ${MUTED}`}>
            Choose a schedule to change its future occurrences, archive it or
            delete it. Archiving stops future occurrences; approved
            transactions remain in your ledger.
          </p>
        </div>
        <div
          className="mt-space-md overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Schedules"
        >
          <table className="w-full min-w-[40rem] border-collapse">
            <caption className="sr-only">Schedules</caption>
            <thead>
              <tr className="border-y border-border-warm bg-surface-container-low">
                {["Schedule", "Account", "Amount", "Repeats", "Status"].map(
                  (h) => (
                    <th className={TH} key={h}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {!data.schedules.length && (
                <tr>
                  <td className={`${TD} px-space-lg text-text-secondary`} colSpan={5}>
                    No schedules yet. Create one below, or from a suggestion
                    above.
                  </td>
                </tr>
              )}
              {data.schedules.map((s) => {
                const from = state.accounts.find((a) => a.id === s.accountId);
                const to = state.accounts.find(
                  (a) => a.id === s.transferAccountId,
                );
                return (
                  <tr
                    className={`border-b border-border-warm transition-colors last:border-b-0 hover:bg-row-hover ${openId === s.id ? "bg-row-hover" : ""}`}
                    key={s.id}
                  >
                    <th className={`${TD} pl-space-lg text-left font-medium text-text-primary`} scope="row">
                      <Link
                        className="underline-offset-2 hover:underline"
                        href={`/accounts/schedules?schedule=${s.id}`}
                        scroll={false}
                        aria-current={openId === s.id ? "true" : undefined}
                      >
                        {s.name}
                      </Link>
                    </th>
                    <td className={`${TD} text-text-secondary`}>
                      {from?.name ?? "Account"}
                      {to ? ` → ${to.name}` : ""}
                    </td>
                    <td className={`${TD} tabular-nums text-text-primary`}>
                      <Amount>{formatUSD(money(s.amount))}</Amount>
                    </td>
                    <td className={`${TD} text-text-secondary`}>
                      {s.cadence.replace("_", " ").toLowerCase()}
                      {s.interval > 1 ? ` · every ${s.interval}` : ""}
                    </td>
                    <td className={`${TD} pr-space-lg`}>
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-label-sm text-label-sm ${s.archived ? "bg-surface-container text-text-tertiary" : s.replacedById ? "bg-surface-container text-text-secondary" : "bg-status-ready-bg text-status-ready-text"}`}
                      >
                        {s.archived
                          ? "Archived"
                          : s.replacedById
                            ? "Replaced"
                            : s.paymentForAccountId
                              ? "Card payment"
                              : "Active"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
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
              defaultCategoryId={suggestedCategory?.id}
              defaultName={suggestedCategory?.name}
            />
          </FinanceForm>
        )}
      </section>
      {data.schedules
        .filter((s) => s.id === openId)
        .map((s) => (
          <Drawer
            key={s.id}
            className="finance-panel"
            headingId="drawer-schedule-heading"
            eyebrow="Schedule"
            title={s.name}
            closeHref="/accounts/schedules"
          >
            <div id={`schedule-${s.id}`}>
            {s.paymentForAccountId && !s.archived && !s.replacedById && (
              <p className={`mt-space-xs ${MUTED}`}>
                Kept in step with this card&apos;s terms: saving the terms
                again on the Debt page replaces it.
              </p>
            )}
            <p className={`mt-space-xs ${MUTED}`}>
              {s.cadence.replace("_", " ").toLowerCase()} · every {s.interval} ·{" "}
              {s.timezone}
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
            {!s.replacedById && (
              <details className="delete-schedule mt-space-sm">
                <summary className="cursor-pointer font-label-sm text-label-sm font-semibold text-status-negative-text">
                  Delete schedule…
                </summary>
                <p className={`mt-space-xs ${MUTED}`}>
                  Removes this schedule and its earlier versions. Transactions
                  it entered that still await approval are removed too.
                  {s.paymentForAccountId
                    ? " The card's payment target stays; remove it from the envelope if you no longer want it. Saving the card's terms with a Pay from account creates a new schedule."
                    : ""}
                </p>
                <FinanceForm
                  budgetId={state.budget.id}
                  command={{ type: "schedule.delete", id: s.id }}
                  label={`Delete ${s.name}`}
                >
                  <label className="check-field">
                    <input type="checkbox" name="removeApproved" />
                    Also delete the transactions from it I already approved
                  </label>
                </FinanceForm>
              </details>
            )}
            </div>
          </Drawer>
        ))}
    </main>
  );
}
