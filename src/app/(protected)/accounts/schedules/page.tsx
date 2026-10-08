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
import { editStart, type Recurrence } from "@/domain/schedules";
import Form from "next/form";
import { Drawer, DrawerSection } from "@/components/drawer";
import { PageHeader } from "@/components/ui/page-header";
import { Notice, NoticeList } from "@/components/ui/notice";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { Help } from "@/components/ui/help";

const MUTED = "text-table text-ink-2";
const LINK = "link";
const usd = (n: bigint) => formatUSD(money(n));
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
      <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
        <PageHeader
          breadcrumb={[{ href: "/accounts", label: "Accounts" }]}
          title="Schedules"
        />
        <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
          <div className="mt-4">
            <Notice
              tone="warning"
              action={
                <Link className="btn btn-secondary btn-sm" href="/accounts/schedules">
                  Reset dates
                </Link>
              }
            >
              Unable to load this date range. Choose valid calendar dates and a
              shorter window.
            </Notice>
          </div>
        </div>
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
  const accountNameOf = (id: string) =>
    state.accounts.find((a) => a.id === id)?.name ?? "Account";
  const overdue = data.overdue.count > 0 && data.overdue.oldest! < data.start;
  // An edit keeps older versions for history; only the latest is listed, and
  // a link to an older one opens the latest.
  const listed = data.schedules.filter((s) => !s.replacedById);
  let open = data.schedules.find((s) => s.id === openId);
  for (let hops = 0; open?.replacedById && hops < 100; hops++)
    open = data.schedules.find((s) => s.id === open!.replacedById);
  const nextStart = open
    ? editStart(
        {
          id: open.id,
          startDate: open.startDate.toISOString().slice(0, 10),
          endDate: open.endDate?.toISOString().slice(0, 10),
          timezone: open.timezone,
          cadence: open.cadence as Recurrence["cadence"],
          interval: open.interval,
        },
        data.today,
        new Set(
          data.upcoming
            .filter((o) => o.schedule.id === open!.id && o.handled)
            .map((o) => o.date),
        ),
      )
    : data.today;
  const OCCURRENCE =
    "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 border-b border-hairline px-4 py-2 last:border-b-0 sm:grid-cols-[6rem_minmax(0,1fr)_7rem_minmax(0,1.4fr)] lg:px-6";
  return (
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        breadcrumb={[{ href: "/accounts", label: "Accounts" }]}
        title="Schedules"
        meta={`${listed.filter((s) => !s.archived).length} active`}
        actions={
          <>
            <Form
              action="/accounts/schedules"
              scroll={false}
              className="finance-form finance-form-inline"
            >
              <label>
                <span className="sr-only">From</span>
                <input
                  type="date"
                  name="from"
                  aria-label="From"
                  defaultValue={data.start}
                  required
                  className="w-36!"
                />
              </label>
              <span className="text-meta text-ink-3" aria-hidden>
                –
              </span>
              <label>
                <span className="sr-only">Through</span>
                <input
                  type="date"
                  name="through"
                  aria-label="Through"
                  defaultValue={data.end}
                  required
                  className="w-36!"
                />
              </label>
              <button className="btn btn-secondary" type="submit">
                Show dates
              </button>
            </Form>
            <Link className="btn btn-primary" href="#create">
              New schedule
            </Link>
            <Help label="About schedules" align="right">
              Scheduled transactions enter the register automatically on their
              date and wait for approval; they stay outside your budget until
              you approve them. Check for an existing bank import before
              approving. Monthly dates keep their original day after shorter
              months.
            </Help>
          </>
        }
      />
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        {(overdue || data.candidatesTruncated) && (
          <div className="mt-4">
            <NoticeList>
              {overdue && (
                <Notice
                  tone="warning"
                  role="status"
                  action={
                    <Link
                      className="btn btn-secondary btn-sm"
                      href={`/accounts/schedules?from=${data.overdue.oldest}&through=${data.end}`}
                      scroll={false}
                    >
                      Review overdue
                    </Link>
                  }
                >
                  {data.overdue.count} earlier occurrence
                  {data.overdue.count === 1 ? " needs" : "s need"} review, the
                  oldest from {data.overdue.oldest}.
                </Notice>
              )}
              {data.candidatesTruncated && (
                <Notice tone="warning">
                  Matching lists the newest 500 transactions in this window. Use
                  a shorter date range to find older entries.
                </Notice>
              )}
            </NoticeList>
          </div>
        )}

        <section className="surface mt-4" aria-labelledby="occurrences-heading">
          <div className="flex items-baseline justify-between gap-2 px-4 py-2 lg:px-6">
            <h2 id="occurrences-heading" className="section-title">
              Upcoming and handled occurrences
            </h2>
            <span className={MUTED}>
              {data.start} – {data.end}
            </span>
          </div>
          {!data.upcoming.length ? (
            <EmptyState title="No occurrences in this range." />
          ) : (
            <>
              <div
                className="hidden grid-cols-[6rem_minmax(0,1fr)_7rem_minmax(0,1.4fr)] gap-x-3 border-y border-hairline bg-surface-sunken px-4 py-1.5 text-caps uppercase text-ink-3 sm:grid lg:px-6"
                aria-hidden
              >
                <span>Date</span>
                <span>Schedule</span>
                <span className="text-right">Amount</span>
                <span>Status</span>
              </div>
              {data.upcoming.map((o) => (
                <article className={OCCURRENCE} key={o.key}>
                  <span className="hidden text-num font-normal text-ink-2 sm:block">
                    {o.date}
                  </span>
                  <span className="order-first col-span-2 min-w-0 sm:order-none sm:col-span-1">
                    <h3 className="truncate text-table font-medium text-ink">
                      {o.schedule.name} · {o.date}
                    </h3>
                    <span className="ledger-sub">
                      {accountNameOf(o.schedule.accountId)}
                    </span>
                  </span>
                  <span className="text-right text-num text-ink">
                    <Amount>{usd(o.schedule.amount)}</Amount>
                  </span>
                  <span className="col-span-2 flex flex-col gap-2 sm:col-span-1">
                    {o.handled?.status === "ENTERED" && o.removed ? (
                      <>
                        <Pill tone="neutral">Deleted from the register</Pill>
                        <span className="flex flex-wrap gap-1">
                          <FinanceForm
                            budgetId={state.budget.id}
                            command={{
                              type: "schedule.reject",
                              id: o.schedule.id,
                              date: o.date,
                            }}
                            label="Clear"
                            inline
                            buttonClassName="btn-sm"
                          />
                        </span>
                      </>
                    ) : o.handled?.status === "ENTERED" ? (
                      <>
                        <Pill tone={o.bankMatched ? "positive" : "warning"}>
                          {o.bankMatched
                            ? "Matched to your bank · approve to finish"
                            : "Entered in the register · awaiting approval"}
                        </Pill>
                        <span className="flex flex-wrap gap-1">
                          <FinanceForm
                            budgetId={state.budget.id}
                            command={{
                              type: "schedule.confirm",
                              id: o.schedule.id,
                              date: o.date,
                            }}
                            label="Approve transaction"
                            inline
                            buttonClassName="btn-sm"
                          />
                          {!o.bankMatched && (
                            <FinanceForm
                              budgetId={state.budget.id}
                              command={{
                                type: "schedule.reject",
                                id: o.schedule.id,
                                date: o.date,
                              }}
                              label="Remove transaction"
                              inline
                              buttonClassName="btn-sm"
                            />
                          )}
                        </span>
                      </>
                    ) : o.handled ? (
                      <Pill
                        tone={o.handled.status === "APPROVED" ? "positive" : "neutral"}
                      >
                        {o.handled.status === "APPROVED"
                          ? o.handled.matched
                            ? "Matched to existing transaction"
                            : "Approved into ledger"
                          : "Skipped"}
                      </Pill>
                    ) : (
                      <span className="flex flex-wrap items-start gap-1">
                        {o.due && (
                          <FinanceForm
                            budgetId={state.budget.id}
                            command={{
                              type: "schedule.approve",
                              id: o.schedule.id,
                              date: o.date,
                            }}
                            label="Approve transaction"
                            inline
                            buttonClassName="btn-sm"
                          />
                        )}
                        {o.candidates.length > 0 && (
                          <FinanceForm
                            budgetId={state.budget.id}
                            command={{
                              type: "schedule.match",
                              id: o.schedule.id,
                              date: o.date,
                            }}
                            label="Match existing transaction"
                            inline
                            buttonClassName="btn-sm"
                          >
                            <label>
                              <span className="sr-only">Existing transaction</span>
                              <select
                                name="transactionId"
                                aria-label="Existing transaction"
                              >
                                {o.candidates.map((t) => (
                                  <option value={t.id} key={t.id}>
                                    {formatDate(t.date, state.budget.dateFormat)} ·{" "}
                                    {t.payee || "No payee"} ·{" "}
                                    {usd(t.amount)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </FinanceForm>
                        )}
                        <FinanceForm
                          budgetId={state.budget.id}
                          command={{
                            type: "schedule.skip",
                            id: o.schedule.id,
                            date: o.date,
                          }}
                          label="Skip occurrence"
                          inline
                          buttonClassName="btn-sm btn-ghost"
                        />
                      </span>
                    )}
                  </span>
                </article>
              ))}
            </>
          )}
        </section>

        <section className="surface mt-4" aria-labelledby="recurring-heading">
          <div className="flex items-center justify-between gap-2 px-4 py-2 lg:px-6">
            <h2 id="recurring-heading" className="section-title">
              Possible recurring transactions
            </h2>
            <Help label="About recurring suggestions" align="right">
              Suggestions need at least three similar income or expense
              entries. Dates may differ by two days and amounts by 20%. This is
              evidence to review, not a prediction or permission to post.
            </Help>
          </div>
          {!active.length && <EmptyState title="No new recurring patterns found." />}
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
                className="border-t border-hairline"
              >
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-table hover:bg-row-hover lg:px-6">
                  <span className="font-medium text-ink">
                    {s.payee} · <Amount>{usd(s.amount)}</Amount> ·{" "}
                    {s.confidence === "EXACT"
                      ? "Regular pattern"
                      : "Approximate pattern"}
                  </span>
                  <span className="ml-auto text-meta text-ink-3">
                    Review ▾
                  </span>
                </summary>
                <div className="border-t border-hairline bg-surface-sunken/50 px-4 py-3 lg:px-6">
                  <p className={MUTED}>
                    {s.transactionIds.length} supporting transactions ·{" "}
                    {s.cadence.replace("_", " ").toLowerCase()} every {s.interval}.
                    The amount is the latest one. Review the amount, first date
                    and category before creating a schedule.
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-meta text-ink-3">
                    {history.map((t) => (
                      <li key={t.id}>
                        {formatDate(t.date, state.budget.dateFormat)} ·{" "}
                        <Amount>{usd(t.amount)}</Amount> ·{" "}
                        <Link className={LINK} href={`/accounts/${t.accountId}`}>
                          View account
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3">
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
                  </div>
                  <div className="mt-2">
                    <FinanceForm
                      budgetId={state.budget.id}
                      command={{ type: "recurring.dismiss", key: s.key }}
                      label="Not recurring"
                      inline
                      buttonClassName="btn-ghost btn-sm"
                    />
                  </div>
                </div>
              </details>
            );
          })}
          {dismissed.length > 0 && (
            <details className="border-t border-hairline">
              <summary className="cursor-pointer px-4 py-2 text-label text-ink-2 hover:text-ink lg:px-6">
                Dismissed patterns ({dismissed.length})
              </summary>
              <div className="border-t border-hairline">
                {dismissed.map((s) => (
                  <div
                    key={s.key}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-1.5 last:border-b-0 lg:px-6"
                  >
                    <span className={MUTED}>
                      {s.payee} · <Amount>{usd(s.amount)}</Amount>
                    </span>
                    <FinanceForm
                      budgetId={state.budget.id}
                      command={{ type: "recurring.restore", key: s.key }}
                      label="Restore"
                      inline
                      buttonClassName="btn-sm"
                    />
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>

        <section className="surface mt-4" aria-labelledby="manage-heading">
          <div className="flex items-center justify-between gap-2 px-4 py-2 lg:px-6">
            <h2 id="manage-heading" className="section-title">
              Manage schedules
            </h2>
            <Help label="About managing schedules" align="right">
              Choose a schedule to edit or delete it. An edit applies from the
              next occurrence; earlier ones keep their amounts. Deleting keeps
              the transactions you already approved.
            </Help>
          </div>
          <div
            className="max-sm:overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Schedules"
          >
            <table className="ledger">
              <caption className="sr-only">Schedules</caption>
              <thead>
                <tr>
                  <th scope="col">Schedule</th>
                  <th scope="col" data-hide="sm">
                    Account
                  </th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                  <th scope="col" data-hide="sm">
                    Repeats
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {!listed.length && (
                  <tr>
                    <td className="text-ink-2" colSpan={5}>
                      No schedules yet. Create one below, or from a suggestion
                      above.
                    </td>
                  </tr>
                )}
                {listed.map((s) => {
                  const fromAccount = state.accounts.find((a) => a.id === s.accountId);
                  const to = state.accounts.find(
                    (a) => a.id === s.transferAccountId,
                  );
                  return (
                    <tr key={s.id} data-selected={openId === s.id ? "" : undefined}>
                      <th scope="row">
                        <Link
                          className="underline-offset-2 hover:underline"
                          href={`/accounts/schedules?schedule=${s.id}`}
                          scroll={false}
                          aria-current={openId === s.id ? "true" : undefined}
                        >
                          {s.name}
                        </Link>
                        <span className="ledger-sub sm:hidden">
                          {fromAccount?.name ?? "Account"}
                          {to ? ` → ${to.name}` : ""} ·{" "}
                          {s.cadence.replace("_", " ").toLowerCase()}
                        </span>
                      </th>
                      <td className="text-ink-2" data-hide="sm">
                        {fromAccount?.name ?? "Account"}
                        {to ? ` → ${to.name}` : ""}
                      </td>
                      <td className="num text-ink">
                        <Amount>{usd(s.amount)}</Amount>
                      </td>
                      <td className="text-ink-2" data-hide="sm">
                        {s.cadence.replace("_", " ").toLowerCase()}
                        {s.interval > 1 ? ` · every ${s.interval}` : ""}
                      </td>
                      <td>
                        <Pill
                          tone={
                            s.archived
                              ? "neutral"
                              : s.paymentForAccountId
                                ? "accent"
                                : "positive"
                          }
                        >
                          {s.archived
                            ? "Archived"
                            : s.paymentForAccountId
                                ? "Card payment"
                                : "Active"}
                        </Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section
          id="create"
          className="surface mt-4 scroll-mt-16 p-4"
          aria-labelledby="create-heading"
        >
          <h2 id="create-heading" className="section-title">
            Create a schedule
          </h2>
          {!accounts.length ? (
            <p className={`mt-1 ${MUTED}`}>Add an account first.</p>
          ) : (
            <div className="mt-3">
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
            </div>
          )}
        </section>
      </div>
      {open && (
        <Drawer
          key={open.id}
          headingId="drawer-schedule-heading"
          eyebrow={`${open.cadence.replace("_", " ").toLowerCase()} · every ${open.interval} · ${open.timezone}`}
          title={open.name}
          closeHref="/accounts/schedules"
        >
          <div id={`schedule-${open.id}`}>
            {open.paymentForAccountId && !open.archived && (
              <Notice tone="accent">
                Kept in step with this card&apos;s terms: saving the terms again
                on the Debt page replaces it.
              </Notice>
            )}
            {!open.archived && (
              <details className="mt-4">
                <summary className="flex cursor-pointer items-center justify-between gap-2 border-b border-hairline pb-1">
                  <span className="text-caps uppercase text-ink-3">
                    Edit schedule
                  </span>
                  <span className="text-meta text-ink-3">▾</span>
                </summary>
                <p className={`mt-2 ${MUTED}`}>
                  Changes apply from the start date below, the next occurrence
                  by default. Earlier occurrences keep their amount and
                  categories.
                </p>
                <div className="mt-2">
                  <FinanceForm
                    budgetId={state.budget.id}
                    command={{
                      type: "schedule.replace",
                      id: open.id,
                      revision: open.revision,
                    }}
                    label="Save schedule"
                  >
                    <ScheduleFields
                      accounts={accounts}
                      categories={categories}
                      today={data.today}
                      timezone={state.budget.timezone}
                      initial={{
                        ...open,
                        startDate: nextStart,
                        endDate: open.endDate?.toISOString().slice(0, 10) ?? null,
                        splits: data.splits.filter(
                          (split) => split.scheduleId === open.id,
                        ),
                      }}
                    />
                  </FinanceForm>
                </div>
              </details>
            )}
            {open.archived && (
              <DrawerSection title="Restore">
                <FinanceForm
                  budgetId={state.budget.id}
                  command={{
                    type: "schedule.archive",
                    id: open.id,
                    archived: false,
                  }}
                  label="Restore schedule"
                  inline
                />
              </DrawerSection>
            )}
            <details className="delete-schedule mt-5">
              <summary className="cursor-pointer border-b border-hairline pb-1 text-caps uppercase text-negative">
                Delete schedule…
              </summary>
              <p className={`mt-2 ${MUTED}`}>
                Removes this schedule and its earlier versions. Transactions
                it entered that still await approval are removed too.
                {open.paymentForAccountId
                  ? " The card's payment target stays; remove it from the envelope if you no longer want it."
                  : ""}
              </p>
              <div className="mt-2">
                <FinanceForm
                  budgetId={state.budget.id}
                  command={{ type: "schedule.delete", id: open.id }}
                  label={`Delete ${open.name}`}
                  buttonClassName="btn-danger"
                >
                  <label className="check-field">
                    <input type="checkbox" name="removeApproved" />
                    Also delete the transactions from it I already approved
                  </label>
                </FinanceForm>
              </div>
            </details>
          </div>
        </Drawer>
      )}
    </main>
  );
}
