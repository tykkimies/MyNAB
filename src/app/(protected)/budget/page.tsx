import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  PiggyBank,
  Landmark,
  Clock,
} from "lucide-react";
import { financePage } from "@/application/finance-page";
import { getAutoAssignPreview } from "@/application/finance";
import { getAttention } from "@/application/attention";
import { requireUser } from "@/application/session";
import { FinanceForm } from "@/components/finance-form";
import { formatUSD, money } from "@/domain/money";
import { nextMonth } from "@/domain/budget";
import {
  AUTO_ASSIGN_MODES,
  type AutoAssignMode,
} from "@/domain/auto-assign";
import { budgetMonth } from "@/domain/dates";
import { STARTER_GROUPS, STARTER_CATEGORY_COUNT } from "@/domain/starter";
import { TARGET_STATE } from "@/components/targets";
import { appPath } from "@/infrastructure/app-path";
const usd = (n: bigint) => formatUSD(money(n));
const CARD = "rounded-lg border border-border-warm bg-surface-card";
const PANEL_H2 = "font-headline-md text-headline-md text-text-primary";
const MUTED = "font-body-sm text-body-sm leading-relaxed text-text-secondary";
// table-fixed, so these percentages are the real column widths. The last one
// has to hold the inline amount field and its Assign button side by side.
const LEDGER_COLUMNS = [
  { head: "Category", width: "22%" },
  { head: "Assigned", width: "12%" },
  { head: "Activity", width: "12%" },
  { head: "Available", width: "14%" },
  { head: "Target", width: "16%" },
  { head: "Change assignment", width: "24%" },
];
const MONTH_BUTTON =
  "inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-label-sm text-label-sm text-text-secondary transition-colors hover:bg-surface-card hover:text-text-primary";
const AUTO_OPTIONS: { mode: AutoAssignMode; label: string }[] = [
  { mode: "LAST_ASSIGNED", label: "Assigned last month" },
  { mode: "LAST_SPENT", label: "Spent last month" },
  { mode: "AVERAGE_ASSIGNED", label: "Average assigned" },
  { mode: "AVERAGE_SPENT", label: "Average spent" },
  { mode: "REDUCE_OVERFUNDING", label: "Reduce overfunding" },
  { mode: "RESET_ASSIGNED", label: "Reset assigned" },
  { mode: "RESET_AVAILABLE", label: "Reset available" },
];
export default async function Budget({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    autoMode?: string;
    autoCategory?: string;
  }>;
}) {
  const q = await searchParams;
  let selected = q.month;
  try {
    if (selected) budgetMonth(selected);
  } catch {
    selected = undefined;
  }
  const s = await financePage(selected);
  const user = await requireUser();
  const attention = await getAttention(user.userId, s.budget.id);
  const p = s.projection;
  const active = s.categories.filter((c) => !c.archived);
  const groups = s.groups.filter((g) => !g.system);
  const overAssigned = p.readyToAssign < 0n;
  const autoMode = AUTO_ASSIGN_MODES.find((mode) => mode === q.autoMode);
  const autoCategory = active.find((category) => category.id === q.autoCategory);
  const autoPreview = autoMode && (!q.autoCategory || autoCategory)
    ? await getAutoAssignPreview(
        user.userId,
        s.budget.id,
        s.month,
        autoMode,
        autoCategory?.id,
      )
    : null;
  return (
    <main
      id="main"
      className="mx-auto w-full max-w-canvas px-gutter pb-space-xl pt-space-lg outline-none lg:px-space-lg"
      tabIndex={-1}
    >
      <div className="flex flex-col justify-between gap-space-lg lg:flex-row lg:items-end">
        <div className="flex max-w-2xl flex-col">
          <div className="flex items-center gap-2">
            <span className="font-label-caps text-label-caps uppercase tracking-widest text-secondary">
              Budget
            </span>
            <span className="text-text-tertiary" aria-hidden>
              /
            </span>
            <span className="font-label-caps text-label-caps uppercase text-text-tertiary">
              Envelopes &amp; allocations
            </span>
          </div>
          <h1 className="mt-space-xs font-headline-hero-mobile text-headline-hero-mobile leading-none text-text-primary lg:font-headline-hero lg:text-headline-hero">
            Give your money a purpose.
          </h1>
          <p className="mt-space-sm font-body-lg text-body-lg leading-relaxed text-text-secondary">
            Assign money you have. Cover cash overspending before the next month
            begins.
          </p>
        </div>
        <nav
          className="flex flex-wrap items-center gap-1.5 self-start rounded-lg bg-surface-container-low p-1.5 lg:self-end"
          aria-label="Budget month"
        >
          {s.month > "1900-01" && (
            <Link
              className={MONTH_BUTTON}
              href={`/budget?month=${nextMonth(s.month, -1)}`}
            >
              ← Previous
            </Link>
          )}
          <h2 className="flex items-center gap-2 rounded-md bg-surface-card px-3 py-1.5">
            <CalendarDays size={16} className="text-secondary" aria-hidden />
            <span className="font-headline-sm text-headline-sm text-text-primary">
              {new Intl.DateTimeFormat("en-US", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(`${s.month}-01T00:00:00Z`))}
            </span>
          </h2>
          {s.month < nextMonth(s.today.slice(0, 7), 24) && (
            <Link
              className={MONTH_BUTTON}
              href={`/budget?month=${nextMonth(s.month)}`}
            >
              Next →
            </Link>
          )}
          <Link
            className="rounded-md bg-surface-container-high px-2.5 py-1.5 font-label-sm text-label-sm text-text-primary transition-colors hover:bg-surface-container-highest"
            href="/budget"
          >
            Today
          </Link>
        </nav>
      </div>
      <section
        className="mt-space-lg grid grid-cols-1 gap-space-md md:grid-cols-12"
        aria-label="Budget totals"
      >
        <article
          className={`flex flex-col justify-between overflow-hidden rounded-lg p-space-lg md:col-span-12 lg:col-span-5 ${
            overAssigned
              ? "border border-status-negative-border bg-status-negative-bg"
              : "bg-linear-to-br from-hero-from via-hero-via to-hero-to text-hero-text"
          }`}
        >
          <div className="flex items-start justify-between gap-space-sm">
            <span
              className={`font-label-caps text-label-caps uppercase tracking-widest ${overAssigned ? "text-status-negative-text" : "text-hero-muted"}`}
            >
              Ready to Assign
            </span>
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${overAssigned ? "bg-surface-card text-status-negative-text" : "bg-white/10 text-hero-text"}`}
            >
              {overAssigned ? (
                <AlertTriangle size={20} aria-hidden />
              ) : (
                <PiggyBank size={20} aria-hidden />
              )}
            </span>
          </div>
          <strong
            className={`mt-space-sm block font-headline-hero-mobile text-headline-hero-mobile font-normal ${overAssigned ? "text-status-negative-text" : "text-hero-text"}`}
            data-numeric
          >
            {usd(p.readyToAssign)}
          </strong>
          <span
            className={`mt-space-md font-body-sm text-body-sm ${overAssigned ? "text-status-negative-text" : "text-hero-muted"}`}
          >
            {overAssigned
              ? "More is assigned than the budget holds"
              : "Ready to allocate across envelope categories"}
          </span>
        </article>
        <Metric
          className="md:col-span-6 lg:col-span-4"
          label="Cash & positive card balances"
          value={usd(p.resources)}
          note="On-budget money backing your envelopes"
          Icon={Landmark}
        />
        <Metric
          className="md:col-span-6 lg:col-span-3"
          label="Reserved for future months"
          value={usd(p.futureReservations)}
          note="Assigned ahead, not available now"
          Icon={Clock}
        />
      </section>
      {attention.length > 0 && (
        <section
          className={`mt-space-md ${CARD} p-space-md`}
          aria-labelledby="attention-heading"
        >
          <h2
            id="attention-heading"
            className="font-headline-sm text-headline-sm text-text-primary"
          >
            Needs attention
          </h2>
          <ul className="mt-space-xs divide-y divide-border-warm">
            {attention.map((item) => (
              <li
                className="flex flex-wrap items-center justify-between gap-space-sm py-space-sm"
                key={item.key}
              >
                <span
                  className={`flex items-start gap-space-xs font-body-sm text-body-sm ${item.level === "act" ? "text-status-warning-text" : "text-text-primary"}`}
                >
                  {item.level === "act" && (
                    <AlertTriangle
                      size={16}
                      className="mt-0.5 shrink-0"
                      aria-hidden
                    />
                  )}
                  {item.text}
                </span>
                <Link className="secondary-button" href={item.href}>
                  {item.action}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {overAssigned && (
        <aside
          className={`mt-space-md flex flex-col gap-space-xs rounded-lg border border-status-negative-border bg-status-negative-bg p-space-md`}
        >
          <strong className="font-headline-sm text-headline-sm text-status-negative-text">
            You have assigned more than you have
          </strong>
          <p className="font-body-sm text-body-sm leading-relaxed text-text-secondary">
            Ready to Assign is {usd(p.readyToAssign)}. Nothing is broken and no
            money was invented: categories are simply holding more than the
            budget contains. Move money out of a category, or reduce an
            assignment, until this reaches zero.
          </p>
        </aside>
      )}
      {(p.cashDeficit > 0n || p.creditDeficit > 0n) && (
        <aside className="mt-space-md flex flex-col gap-space-xs rounded-lg border border-status-warning-border bg-status-warning-bg p-space-md">
          <strong className="font-headline-sm text-headline-sm text-status-warning-text">
            Cover overspending
          </strong>
          <p className="font-body-sm text-body-sm leading-relaxed text-text-secondary">
            Cash / payment funding deficit: {usd(p.cashDeficit)}. Unfunded card
            spending: {usd(p.creditDeficit)}. Cash deficits reduce next month’s
            Ready to Assign; unfunded card spending remains debt.
          </p>
        </aside>
      )}
      {p.releasedReserves > 0n && (
        <p className={`mt-space-md ${MUTED}`}>
          Excess card payment reserves released this month:{" "}
          {usd(p.releasedReserves)}.
        </p>
      )}
      <div className="mt-space-lg grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
        <div className="flex flex-col gap-space-lg xl:col-span-8">
          {active.length > 0 && (
            <section className={`finance-panel ${CARD} p-space-lg`} aria-label="Auto-Assign">
              <h2 className={PANEL_H2}>Auto-Assign</h2>
              <p className={`mt-space-xs ${MUTED}`}>
                Preview assignments from your history or reset this month before applying.
                A preview changes no money.
              </p>
              <form action={appPath("/budget")} method="get" className="mt-space-md flex flex-wrap items-end gap-space-sm">
                <input type="hidden" name="month" value={s.month} />
                <label className="flex min-w-44 flex-col gap-1 font-body-sm text-body-sm text-text-secondary">
                  Method
                  <select name="autoMode" defaultValue={autoMode ?? "LAST_ASSIGNED"}>
                    {AUTO_OPTIONS.map((option) => (
                      <option value={option.mode} key={option.mode}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-44 flex-col gap-1 font-body-sm text-body-sm text-text-secondary">
                  Categories
                  <select name="autoCategory" defaultValue={autoCategory?.id ?? ""}>
                    <option value="">All categories</option>
                    {active.filter((category) => !category.system || category.paymentAccountId).map((category) => (
                      <option value={category.id} key={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <button className="secondary-button" type="submit">Preview</button>
              </form>
              {autoPreview && (
                <div className="mt-space-md border-t border-border-warm pt-space-md">
                  <p className={MUTED}>
                    {autoPreview.changes.length} categor{autoPreview.changes.length === 1 ? "y" : "ies"} change.
                    Ready to Assign: {usd(autoPreview.readyBefore)} → {usd(autoPreview.readyAfter)}.
                  </p>
                  {autoPreview.changes.length > 0 && (
                    <>
                      <ul className="mt-space-sm max-h-48 overflow-y-auto font-body-sm text-body-sm text-text-secondary">
                        {autoPreview.changes.map((change) => (
                          <li className="flex justify-between gap-space-sm border-b border-border-warm py-1" key={change.categoryId}>
                            <span>{active.find((category) => category.id === change.categoryId)?.name}</span>
                            <span data-numeric>{usd(change.amount)}</span>
                          </li>
                        ))}
                      </ul>
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{
                          type: "auto.assign",
                          month: s.month,
                          mode: autoPreview.mode,
                          ...(autoCategory ? { categoryId: autoCategory.id } : {}),
                          expected: autoPreview.expected,
                        }}
                        label="Apply preview"
                      />
                    </>
                  )}
                </div>
              )}
            </section>
          )}
          {s.underfunded > 0n && (
            <section className={`finance-panel ${CARD} p-space-lg`}>
              <h2 className={PANEL_H2}>
                Targets need {usd(s.underfunded)} this month
              </h2>
              <p className={`mt-space-sm ${MUTED}`}>
                Assigning fills every target below. If that is more than you
                have, it still fills them and tells you by how much, leaving
                Ready to Assign negative for you to resolve.
              </p>
              <FinanceForm
                budgetId={s.budget.id}
                command={{ type: "target.fund", month: s.month }}
                label="Assign what targets need"
              />
            </section>
          )}
          {!active.length && (
            <section className={`finance-panel ${CARD} p-space-lg`}>
              <h2 className={PANEL_H2}>Your first spending plan</h2>
              <p className="mt-space-sm font-body-md text-body-md leading-relaxed text-text-secondary">
                <Link
                  className="font-semibold text-secondary underline underline-offset-2"
                  href="/accounts"
                >
                  Add an account
                </Link>
                , then give your money jobs. Every dollar gets assigned, but
                assigning is labelling, not spending: money set aside for
                savings is still assigned. Ready to Assign reaching zero means
                nothing is unaccounted for.
              </p>
              <p className={`mt-space-sm ${MUTED}`}>
                Start from a suggested structure of {STARTER_CATEGORY_COUNT}{" "}
                categories you can rename, delete or add to, or build your own
                below. It creates categories only and never assigns money.
              </p>
              <ul className="mt-space-md flex flex-col gap-space-md">
                {STARTER_GROUPS.map((group) => (
                  <li
                    className="border-l-2 border-border-warm pl-space-md"
                    key={group.name}
                  >
                    <strong className="block font-label-sm text-label-sm font-semibold text-text-primary">
                      {group.name}
                    </strong>
                    <span className="mt-0.5 block font-body-sm text-body-sm text-text-secondary">
                      {group.categories.join(" · ")}
                    </span>
                    <small className="mt-0.5 block font-body-sm text-body-sm text-text-tertiary">
                      {group.note}
                    </small>
                  </li>
                ))}
              </ul>
              <FinanceForm
                budgetId={s.budget.id}
                command={{ type: "starter.apply" }}
                label="Use these categories"
              />
            </section>
          )}
          {active.length > 0 && (
            <section
              className={`finance-panel overflow-hidden ${CARD}`}
              aria-label="Category ledger"
            >
              <div className="flex items-center justify-between gap-space-md border-b border-border-warm px-space-lg py-space-md">
                <h2 className={PANEL_H2}>Envelopes</h2>
                <span className="font-body-sm text-body-sm text-text-tertiary">
                  {active.length} categories
                </span>
              </div>
              {/*
               * One table per group, with the group name in a bar above it
               * rather than in a spanning row: a row there would be matched by
               * the suite's getByRole("row") filters and collide with the
               * category of the same name. table-fixed plus a shared colgroup
               * keeps every group's columns on the same vertical lines.
               */}
              {s.groups.map((g) => {
                const cats = active.filter((c) => c.groupId === g.id);
                if (!cats.length) return null;
                return (
                  <div key={g.id}>
                    <div className="border-y border-border-warm bg-surface-container-low px-space-lg py-space-sm">
                      <h3 className="font-label-caps text-label-caps uppercase tracking-widest text-text-secondary">
                        {g.name}
                      </h3>
                    </div>
                    <div
                      className="overflow-x-auto"
                      tabIndex={0}
                      role="region"
                      aria-label={`${g.name} categories`}
                    >
                      <table className="w-full min-w-[42rem] table-fixed border-collapse">
                        <caption className="sr-only">
                          {g.name} budget for {s.month}
                        </caption>
                        <colgroup>
                          {LEDGER_COLUMNS.map(({ head, width }) => (
                            <col key={head} style={{ width }} />
                          ))}
                        </colgroup>
                        <thead>
                          <tr className="border-b border-border-warm">
                            {LEDGER_COLUMNS.map(({ head }) => (
                              <th
                                className="px-space-sm py-space-xs text-left font-label-caps text-label-caps uppercase text-text-tertiary first:pl-space-lg last:pr-space-lg"
                                key={head}
                              >
                                {head}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {cats.map((c) => {
                            const r = p.categories.find((r) => r.id === c.id)!;
                            const t = s.targets.find(
                              (x) => x.categoryId === c.id,
                            );
                            return (
                              <tr
                                className="border-b border-border-warm transition-colors last:border-b-0 hover:bg-row-hover"
                                key={c.id}
                              >
                                <th
                                  className="py-space-sm pl-space-lg pr-space-sm text-left align-middle font-body-md text-body-md font-medium text-text-primary"
                                  scope="row"
                                >
                                  {c.name}
                                  {(!c.system || c.paymentAccountId) && (
                                    <Link
                                      className="ml-space-xs font-label-sm text-label-sm font-normal text-secondary underline underline-offset-2"
                                      href={`/budget?month=${s.month}&autoMode=LAST_ASSIGNED&autoCategory=${c.id}`}
                                    >
                                      Auto-Assign
                                    </Link>
                                  )}
                                  {c.paymentAccountId && (
                                    <small className="block font-body-sm text-body-sm font-normal text-text-tertiary">
                                      Payment reserve
                                    </small>
                                  )}
                                </th>
                                <td className="px-space-sm py-space-sm align-middle font-data-mono text-data-mono text-text-primary">
                                  {usd(r.assigned)}
                                </td>
                                <td className="px-space-sm py-space-sm align-middle font-data-mono text-data-mono text-text-secondary">
                                  {usd(r.activity)}
                                </td>
                                <td className="px-space-sm py-space-sm align-middle">
                                  <AvailableChip amount={r.available} />
                                </td>
                                <td className="px-space-sm py-space-sm align-middle">
                                  {!t ? (
                                    <span className="font-body-sm text-body-sm text-text-tertiary">
                                      No target
                                    </span>
                                  ) : (
                                    <TargetState
                                      state={t.progress.state}
                                      detail={
                                        t.progress.contribution > 0n
                                          ? `Needs ${usd(t.progress.contribution)} this month`
                                          : `${usd(t.amount)} target`
                                      }
                                    />
                                  )}
                                </td>
                                <td className="py-space-sm pl-space-sm pr-space-md align-middle">
                                  <FinanceForm
                                    budgetId={s.budget.id}
                                    command={{
                                      type: "assign",
                                      categoryId: c.id,
                                      month: s.month,
                                    }}
                                    label="Assign"
                                    inline
                                    reset
                                  >
                                    <label>
                                      <span className="sr-only">
                                        Change {c.name} assignment
                                      </span>
                                      <input
                                        name="amount"
                                        required
                                        inputMode="decimal"
                                        placeholder="25.00"
                                        aria-label={`Change ${c.name} assignment`}
                                      />
                                    </label>
                                  </FinanceForm>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              <p
                className={`border-t border-border-warm px-space-lg py-space-md ${MUTED}`}
              >
                Enter an amount to add to Assigned, or a negative amount to
                return available money. Assignments never move money between
                accounts.
              </p>
            </section>
          )}
        </div>
        <div className="flex flex-col gap-space-lg xl:col-span-4">
          <section className={`finance-panel ${CARD} p-space-lg`}>
            <h2 className={PANEL_H2}>Move money</h2>
            <FinanceForm
              budgetId={s.budget.id}
              command={{ type: "move", month: s.month }}
              label="Move money"
              reset
            >
              <div className="field-grid">
                <label>
                  From category
                  <select
                    name="from"
                    required
                    aria-label="Move money from category"
                  >
                    {active.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  To category
                  <select
                    name="to"
                    required
                    aria-label="Move money to category"
                  >
                    {active.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount (USD)
                  <input name="amount" required inputMode="decimal" />
                </label>
              </div>
            </FinanceForm>
          </section>
          <section className={`finance-panel ${CARD} p-space-lg`}>
            <h2 className={PANEL_H2}>Targets</h2>
            <p className={`mt-space-sm ${MUTED}`}>
              Targets live on{" "}
              <Link
                className="font-semibold text-secondary underline underline-offset-2"
                href="/goals"
              >
                Goals
              </Link>
              , where each one shows what it still needs, when it is expected to
              be met, and can be changed or removed. The Target column above is
              the same reading, shortened.
            </p>
          </section>
          <section className={`finance-panel ${CARD} p-space-lg`}>
            <h2 className={PANEL_H2}>Add a category group</h2>
            <FinanceForm
              budgetId={s.budget.id}
              command={{ type: "group.create" }}
              label="Create group"
              reset
            >
              <label>
                Group name
                <input name="name" required maxLength={120} />
              </label>
            </FinanceForm>
            <h2 className={`mt-space-lg ${PANEL_H2}`}>Add a category</h2>
            <FinanceForm
              budgetId={s.budget.id}
              command={{ type: "category.create" }}
              label="Create category"
              reset
            >
              <label>
                Category name
                <input name="name" required maxLength={120} />
              </label>
              <label>
                Group
                <select name="groupId" required aria-label="Group">
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            </FinanceForm>
          </section>
        </div>
      </div>
      <details className={`finance-panel mt-space-lg ${CARD} p-space-lg`}>
        <summary className={`cursor-pointer ${PANEL_H2}`}>
          Manage categories and groups
        </summary>
        <div className="mt-space-md space-y-space-lg">
          <section aria-label="Group management">
            <h3 className="mb-space-sm font-label-sm text-label-sm font-semibold text-text-secondary">
              Groups
            </h3>
            <div className="grid items-start gap-space-sm sm:grid-cols-2 xl:grid-cols-3">
              {groups.map((g) => (
                <div
                  className="rounded-md border border-border-warm p-space-sm"
                  key={g.id}
                >
                  <FinanceForm
                    budgetId={s.budget.id}
                    command={{ type: "group.rename", id: g.id }}
                    label="Rename group"
                    inline
                  >
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Group name</span>
                      <input
                        className="w-full!"
                        name="name"
                        required
                        defaultValue={g.name}
                      />
                    </label>
                  </FinanceForm>
                </div>
              ))}
            </div>
          </section>
          <section aria-label="Category management">
            <h3 className="mb-space-sm font-label-sm text-label-sm font-semibold text-text-secondary">
              Categories
            </h3>
            <div className="grid items-start gap-space-sm sm:grid-cols-2 xl:grid-cols-3">
              {s.categories
                .filter((c) => !c.paymentAccountId)
                .map((c) => (
                  <details
                    className="rounded-md border border-border-warm p-space-md"
                    key={c.id}
                  >
                    <summary className="cursor-pointer font-label-sm text-label-sm font-semibold text-text-primary">
                      {c.name}
                      {c.archived ? " · Archived" : ""}
                    </summary>
                    <FinanceForm
                      budgetId={s.budget.id}
                      command={{ type: "category.update", id: c.id }}
                    >
                      <label>
                        Name
                        <input name="name" required defaultValue={c.name} />
                      </label>
                      <label>
                        Group
                        <select
                          name="groupId"
                          defaultValue={c.groupId}
                          aria-label={`Group for ${c.name}`}
                        >
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="check-field">
                        <input
                          type="checkbox"
                          name="archived"
                          defaultChecked={c.archived}
                        />
                        Archive category (history is retained)
                      </label>
                    </FinanceForm>
                  </details>
                ))}
            </div>
          </section>
        </div>
      </details>
    </main>
  );
}
function Metric({
  className,
  label,
  value,
  note,
  Icon,
}: {
  className: string;
  label: string;
  value: string;
  note: string;
  Icon: typeof Landmark;
}) {
  return (
    <article
      className={`flex flex-col justify-between rounded-lg border border-border-warm bg-surface-card p-space-lg ${className}`}
    >
      <div className="flex items-start justify-between gap-space-sm">
        <span className="font-label-caps text-label-caps uppercase tracking-wider text-text-tertiary">
          {label}
        </span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface-container-low text-text-secondary">
          <Icon size={18} aria-hidden />
        </span>
      </div>
      <strong
        className="mt-space-md block font-data-lg text-data-lg text-text-primary"
        data-numeric
      >
        {value}
      </strong>
      <span className="mt-space-sm font-body-sm text-body-sm text-text-secondary">
        {note}
      </span>
    </article>
  );
}
/** Pill capsule in the Available column: funded, zero, or overspent. */
function AvailableChip({ amount }: { amount: bigint }) {
  const tone =
    amount < 0n
      ? "bg-status-negative-bg text-status-negative-text"
      : amount === 0n
        ? "bg-surface-container-low text-text-tertiary"
        : "bg-status-ready-bg text-status-ready-text";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-data-mono text-data-mono ${tone}`}
      data-numeric
    >
      {amount < 0n && <AlertTriangle size={12} aria-hidden />}
      {usd(amount)}
    </span>
  );
}
function TargetState({ state, detail }: { state: string; detail: string }) {
  const behind = ["BEHIND", "OVERDUE", "EXCEEDED"].includes(state);
  const met = ["MET", "ON_TRACK"].includes(state);
  return (
    <span className="flex flex-col">
      <span
        className={`font-label-sm text-label-sm font-semibold ${
          behind
            ? "text-status-negative-text"
            : met
              ? "text-status-ready-text"
              : "text-text-primary"
        }`}
      >
        {TARGET_STATE[state as keyof typeof TARGET_STATE]}
      </span>
      <small className="mt-0.5 font-body-sm text-body-sm text-text-tertiary">
        {detail}
      </small>
    </span>
  );
}
