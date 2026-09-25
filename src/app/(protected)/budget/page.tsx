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
import { AUTO_ASSIGN_MODES, type AutoAssignMode } from "@/domain/auto-assign";
import { PRESET_VIEWS, focusedCategoryIds } from "@/domain/focused-views";
import { FocusedViewTabs } from "@/components/focused-view-tabs";
import { budgetMonth } from "@/domain/dates";
import { STARTER_GROUPS, STARTER_CATEGORY_COUNT } from "@/domain/starter";
import { TARGET_STATE } from "@/components/targets";
import { appPath } from "@/infrastructure/app-path";
import { Amount, MaybeAmount } from "@/components/amount";
import { DismissSetup } from "@/components/dismiss-setup";
import { setupSteps, type SetupStep } from "@/domain/setup";
import { cookies } from "next/headers";
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
const SETUP: Record<SetupStep, { label: string; href: string }> = {
  categories: {
    label: "Make the categories your own: start from the template or add your own",
    href: "/guide#categories",
  },
  accounts: {
    label: "Add your accounts with today's balances, or connect a bank",
    href: "/accounts",
  },
  assign: {
    label: "Assign until Ready to Assign reaches zero",
    href: "/guide#ready-to-assign",
  },
  target: {
    label: "Set a target for an expense that does not come every month",
    href: "/goals",
  },
  record: {
    label: "Record or import your first transaction",
    href: "/accounts",
  },
};
export default async function Budget({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    autoMode?: string;
    autoCategory?: string;
    view?: string;
    moves?: string;
    inspect?: string;
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
  const active = s.categories.filter(
    (c) =>
      !c.archived &&
      !c.hidden &&
      !s.groups.find((group) => group.id === c.groupId)?.hidden,
  );
  const customView = s.views.find((item) => item.id === q.view);
  const preset = PRESET_VIEWS.find((item) => item === q.view);
  const selectedView = customView?.id ?? preset ?? "ALL";
  const shownIds = new Set(focusedCategoryIds(s.focusedRows, customView ? { categoryIds: customView.categoryIds } : (preset ?? "ALL")));
  const visible = active.filter((category) => shownIds.has(category.id));
  // The bulk button funds only what the selected view shows.
  const viewUnderfunded =
    selectedView === "ALL"
      ? s.underfunded
      : s.focusedRows
          .filter((row) => shownIds.has(row.id))
          .reduce((sum, row) => sum + row.targetNeed, 0n);
  const viewOptions = [
    { id: "ALL", label: "All" },
    { id: "UNDERFUNDED", label: "Underfunded" },
    { id: "OVERFUNDED", label: "Overfunded" },
    { id: "SNOOZED", label: "Snoozed" },
    { id: "OVERSPENT", label: "Overspent" },
    { id: "MONEY_AVAILABLE", label: "Money Available" },
    ...s.views.map((item) => ({ id: item.id, label: item.name })),
  ];
  const categoryName = new Map(s.categories.map((c) => [c.id, c.name]));
  // The category inspector: one category's month in detail.
  const inspected = s.categories.find((c) => c.id === q.inspect && !c.archived);
  const inspectRow = inspected
    ? p.categories.find((row) => row.id === inspected.id)
    : undefined;
  const inspectTarget = inspected
    ? s.targets.find((t) => t.categoryId === inspected.id)
    : undefined;
  const cardAccounts = new Set(
    s.accounts
      .filter((a) => a.type === "CREDIT_CARD" || a.type === "LINE_OF_CREDIT")
      .map((a) => a.id),
  );
  const inspectSpending = { cash: 0n, credit: 0n };
  const inspectRecent: { id: string; date: string; payee: string; amount: bigint }[] = [];
  if (inspected) {
    const byId = new Map(s.transactions.map((t) => [t.id, t]));
    for (const split of s.splits) {
      if (split.categoryId !== inspected.id) continue;
      const t = byId.get(split.transactionId);
      if (!t || t.voidedAt) continue;
      const date = t.date.toISOString().slice(0, 10);
      if (date.slice(0, 7) !== s.month) continue;
      if (cardAccounts.has(t.accountId)) inspectSpending.credit += split.amount;
      else inspectSpending.cash += split.amount;
      inspectRecent.push({ id: t.id, date, payee: t.payee, amount: split.amount });
    }
    inspectRecent.sort((a, b) => b.date.localeCompare(a.date));
  }
  const monthLast = new Date(
    Date.UTC(Number(s.month.slice(0, 4)), Number(s.month.slice(5)), 0),
  )
    .toISOString()
    .slice(0, 10);
  // Categories with money to spare, for covering an overspent one.
  const coverFrom = (exclude: string) =>
    active.filter(
      (c) =>
        c.id !== exclude &&
        !c.paymentAccountId &&
        (p.categories.find((row) => row.id === c.id)?.available ?? 0n) > 0n,
    );
  const steps = setupSteps({
    categories: s.categories.filter((c) => !c.system && !c.archived).length,
    accounts: s.accounts.filter((a) => !a.closed).length,
    transactions: s.transactions.filter(
      (t) => !t.voidedAt && t.kind !== "OPENING",
    ).length,
    targets: s.targets.length,
    assignments: s.assignments.length,
    readyToAssign: p.readyToAssign,
  });
  const setupHidden =
    (await cookies()).get("mynab-setup-hidden")?.value === s.budget.id;
  const showSetup = !setupHidden && steps.some((step) => !step.done);
  const movesCategory = s.categories.find((c) => c.id === q.moves);
  const moves = movesCategory
    ? s.moves.filter(
        (move) =>
          move.from.some((e) => e.categoryId === movesCategory.id) ||
          move.to.some((e) => e.categoryId === movesCategory.id),
      )
    : s.moves;
  const moveTime = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: s.budget.timezone,
  });
  const hiddenCategories = s.categories.filter(
    (c) =>
      !c.archived &&
      (c.hidden || s.groups.find((group) => group.id === c.groupId)?.hidden),
  );
  const hiddenAvailable = hiddenCategories.reduce(
    (sum, category) =>
      sum +
      (s.projection.categories.find((row) => row.id === category.id)
        ?.available ?? 0n),
    0n,
  );
  const groups = s.groups.filter((g) => !g.system);
  const overAssigned = p.readyToAssign < 0n;
  const autoMode = AUTO_ASSIGN_MODES.find((mode) => mode === q.autoMode);
  const autoCategory = active.find(
    (category) => category.id === q.autoCategory,
  );
  const autoPreview =
    autoMode && (!q.autoCategory || autoCategory)
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
            <Amount>{usd(p.readyToAssign)}</Amount>
          </strong>
          <span
            className={`mt-space-md font-body-sm text-body-sm ${overAssigned ? "text-status-negative-text" : "text-hero-muted"}`}
          >
            {overAssigned
              ? "More is assigned than the budget holds"
              : "Ready to allocate across envelope categories"}
          </span>
          <Link
            className={`mt-space-xs self-start font-body-sm text-body-sm underline underline-offset-2 ${overAssigned ? "text-status-negative-text" : "text-hero-text"}`}
            href="/guide#ready-to-assign"
          >
            What is Ready to Assign?
          </Link>
          <span
            className={`mt-space-xs font-body-sm text-body-sm ${overAssigned ? "text-status-negative-text" : "text-hero-muted"}`}
          >
            Age of Money:{" "}
            {s.ageOfMoney.days === null
              ? `not enough history (${s.ageOfMoney.sampleCount}/10 cash outflows)`
              : `${s.ageOfMoney.days} days`}
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
      {hiddenCategories.length > 0 && (
        <p className={`mt-space-sm ${MUTED}`}>
          {hiddenCategories.length} hidden categor
          {hiddenCategories.length === 1 ? "y" : "ies"}
          {" · "}
          <Amount>{usd(hiddenAvailable)}</Amount> available. Open Manage categories and groups
          below to review or unhide them.
        </p>
      )}
      {showSetup && (
        <section
          className={`mt-space-md ${CARD} p-space-md`}
          aria-labelledby="setup-heading"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-space-sm">
            <h2
              id="setup-heading"
              className="font-headline-sm text-headline-sm text-text-primary"
            >
              Getting started · {steps.filter((x) => x.done).length} of{" "}
              {steps.length} done
            </h2>
            <DismissSetup budgetId={s.budget.id} />
          </div>
          <ol className="setup-steps mt-space-sm space-y-space-xs">
            {steps.map(({ step, done }) => (
              <li
                key={step}
                className={`font-body-sm text-body-sm ${done ? "text-text-tertiary line-through" : "text-text-primary"}`}
              >
                <span className="sr-only">{done ? "Done: " : "To do: "}</span>
                <Link className="underline-offset-2 hover:underline" href={SETUP[step].href}>
                  {SETUP[step].label}
                </Link>
              </li>
            ))}
          </ol>
          <p className={`mt-space-sm ${MUTED}`}>
            Take these in any order and come back any time. The{" "}
            <Link className="font-semibold text-secondary underline underline-offset-2" href="/guide">
              guide
            </Link>{" "}
            explains each one.
          </p>
        </section>
      )}
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
            Ready to Assign is <Amount>{usd(p.readyToAssign)}</Amount>. Nothing is broken and no
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
            Cash / payment funding deficit: <Amount>{usd(p.cashDeficit)}</Amount>. Unfunded card
            spending: <Amount>{usd(p.creditDeficit)}</Amount>. Cash deficits reduce next month’s
            Ready to Assign; unfunded card spending remains debt.
          </p>
        </aside>
      )}
      {p.releasedReserves > 0n && (
        <p className={`mt-space-md ${MUTED}`}>
          Excess card payment reserves released this month:{" "}
          <Amount>{usd(p.releasedReserves)}</Amount>.
        </p>
      )}
      <FocusedViewTabs budgetId={s.budget.id} month={s.month} selected={selectedView} explicit={Boolean(q.view)} views={viewOptions} />
      {selectedView !== "ALL" && <p className={`mt-space-xs ${MUTED}`}>
        Showing {visible.length} of {active.length} visible categories. Ready to Assign and totals still cover the entire budget.
      </p>}
      <div className="mt-space-lg grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
        <div className="flex flex-col gap-space-lg xl:col-span-8">
          {active.length > 0 && (
            <section
              className={`finance-panel ${CARD} p-space-lg`}
              aria-label="Auto-Assign"
            >
              <h2 className={PANEL_H2}>Auto-Assign</h2>
              <p className={`mt-space-xs ${MUTED}`}>
                Preview assignments from your history or reset this month before
                applying. A preview changes no money.
              </p>
              <form
                action={appPath("/budget")}
                method="get"
                className="mt-space-md flex flex-wrap items-end gap-space-sm"
              >
                <input type="hidden" name="month" value={s.month} />
                <label className="flex min-w-44 flex-col gap-1 font-body-sm text-body-sm text-text-secondary">
                  Method
                  <select
                    name="autoMode"
                    defaultValue={autoMode ?? "LAST_ASSIGNED"}
                  >
                    {AUTO_OPTIONS.map((option) => (
                      <option value={option.mode} key={option.mode}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-44 flex-col gap-1 font-body-sm text-body-sm text-text-secondary">
                  Categories
                  <select
                    name="autoCategory"
                    defaultValue={autoCategory?.id ?? ""}
                  >
                    <option value="">All categories</option>
                    {active
                      .filter(
                        (category) =>
                          !category.system || category.paymentAccountId,
                      )
                      .map((category) => (
                        <option value={category.id} key={category.id}>
                          {category.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button className="secondary-button" type="submit">
                  Preview
                </button>
              </form>
              {autoPreview && (
                <div className="mt-space-md border-t border-border-warm pt-space-md">
                  <p className={MUTED}>
                    {autoPreview.changes.length} categor
                    {autoPreview.changes.length === 1 ? "y" : "ies"} change.
                    Ready to Assign: <Amount>{usd(autoPreview.readyBefore)}</Amount> →{" "}
                    <Amount>{usd(autoPreview.readyAfter)}</Amount>.
                  </p>
                  {autoPreview.changes.length > 0 && (
                    <>
                      <ul className="mt-space-sm max-h-48 overflow-y-auto font-body-sm text-body-sm text-text-secondary">
                        {autoPreview.changes.map((change) => (
                          <li
                            className="flex justify-between gap-space-sm border-b border-border-warm py-1"
                            key={change.categoryId}
                          >
                            <span>
                              {
                                active.find(
                                  (category) =>
                                    category.id === change.categoryId,
                                )?.name
                              }
                            </span>
                            <span data-numeric><Amount>{usd(change.amount)}</Amount></span>
                          </li>
                        ))}
                      </ul>
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{
                          type: "auto.assign",
                          month: s.month,
                          mode: autoPreview.mode,
                          ...(autoCategory
                            ? { categoryId: autoCategory.id }
                            : {}),
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
          {viewUnderfunded > 0n && (
            <section className={`finance-panel ${CARD} p-space-lg`}>
              <h2 className={PANEL_H2}>
                Targets {selectedView === "ALL" ? "" : "in this view "}need{" "}
                <Amount>{usd(viewUnderfunded)}</Amount> this month
              </h2>
              <p className={`mt-space-sm ${MUTED}`}>
                Assigning fills every target below. If that is more than you
                have, it still fills them and tells you by how much, leaving
                Ready to Assign negative for you to resolve.
              </p>
              <FinanceForm
                budgetId={s.budget.id}
                command={{
                  type: "target.fund",
                  month: s.month,
                  ...(selectedView === "ALL" ? {} : { view: selectedView }),
                }}
                label="Assign what targets need"
              />
            </section>
          )}
          {!active.length && !hiddenCategories.length && (
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
          {!active.length && hiddenCategories.length > 0 && (
            <section className={`finance-panel ${CARD} p-space-lg`}>
              <h2 className={PANEL_H2}>All categories are hidden</h2>
              <p className={`mt-space-sm ${MUTED}`}>
                Your money is still assigned. Open Manage categories and groups
                below to show categories again.
              </p>
            </section>
          )}
          {active.length > 0 && visible.length === 0 && (
            <section className={`finance-panel ${CARD} p-space-lg`}>
              <h2 className={PANEL_H2}>No categories in this view</h2>
              <p className={`mt-space-sm ${MUTED}`}>
                Choose All to see the full plan. Your assignments and balances have not changed.
              </p>
            </section>
          )}
          {visible.length > 0 && (
            <section
              className={`finance-panel overflow-hidden ${CARD}`}
              aria-label="Category ledger"
            >
              <div className="flex items-center justify-between gap-space-md border-b border-border-warm px-space-lg py-space-md">
                <h2 className={PANEL_H2}>Envelopes</h2>
                <span className="font-body-sm text-body-sm text-text-tertiary">
                  {visible.length} categories
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
                const cats = visible.filter((c) => c.groupId === g.id);
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
                                  <Link
                                    className="underline-offset-2 hover:underline"
                                    href={`/budget?month=${s.month}&inspect=${c.id}${q.view ? `&view=${encodeURIComponent(q.view)}` : ""}`}
                                    aria-current={inspected?.id === c.id ? "true" : undefined}
                                  >
                                    {c.name}
                                  </Link>
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
                                  <Amount>{usd(r.assigned)}</Amount>
                                </td>
                                <td className="px-space-sm py-space-sm align-middle font-data-mono text-data-mono text-text-secondary">
                                  <Link
                                    className="underline-offset-2 hover:underline"
                                    href={`/accounts/register?category=${c.id}&from=${s.month}-01&through=${monthLast}`}
                                    aria-label={`${c.name} activity this month`}
                                  >
                                    <Amount>{usd(r.activity)}</Amount>
                                  </Link>
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
                                      state={
                                        t.snoozed ? "SNOOZED" : t.progress.state
                                      }
                                      detail={
                                        t.snoozed
                                          ? "Snoozed this month"
                                          : t.progress.contribution > 0n
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
                                  {r.available < 0n && coverFrom(c.id).length > 0 && (
                                    <div className="cover-overspending mt-space-xs">
                                      <FinanceForm
                                        budgetId={s.budget.id}
                                        command={{
                                          type: "move",
                                          to: c.id,
                                          month: s.month,
                                          amount: `${-r.available / 100n}.${String(-r.available % 100n).padStart(2, "0")}`,
                                        }}
                                        label="Cover"
                                        inline
                                      >
                                        <label>
                                          <span className="sr-only">
                                            Cover {c.name} overspending from
                                          </span>
                                          <select
                                            name="from"
                                            aria-label={`Cover ${c.name} overspending from`}
                                          >
                                            {coverFrom(c.id).map((o) => (
                                              <option key={o.id} value={o.id}>
                                                {o.name}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                      </FinanceForm>
                                    </div>
                                  )}
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
          {inspected && inspectRow && (
            <section
              className={`finance-panel ${CARD} p-space-lg`}
              aria-labelledby="inspector-heading"
            >
              <div className="flex items-baseline justify-between gap-space-sm">
                <h2 id="inspector-heading" className={PANEL_H2}>
                  {inspected.name}
                </h2>
                <Link
                  className="font-body-sm text-body-sm text-secondary underline underline-offset-2"
                  href={`/budget?month=${s.month}${q.view ? `&view=${encodeURIComponent(q.view)}` : ""}`}
                >
                  Close
                </Link>
              </div>
              <dl className="category-inspector mt-space-md space-y-space-xs font-body-sm text-body-sm">
                {[
                  ["Left over from last month", inspectRow.carry],
                  ["Assigned this month", inspectRow.assigned],
                  ["Cash spending", inspectSpending.cash],
                  ["Credit spending", inspectSpending.credit],
                  ["Available", inspectRow.available],
                ].map(([label, amount]) => (
                  <div
                    key={label as string}
                    className={`flex justify-between gap-space-sm ${label === "Available" ? "border-t border-border-warm pt-space-xs font-semibold text-text-primary" : "text-text-secondary"}`}
                  >
                    <dt>{label as string}</dt>
                    <dd className="tabular-nums">
                      <Amount>{usd(amount as bigint)}</Amount>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className={`mt-space-md ${MUTED}`}>
                {inspectTarget
                  ? inspectTarget.snoozed
                    ? "Target snoozed this month."
                    : inspectTarget.progress.contribution > 0n
                      ? `Target needs ${usd(inspectTarget.progress.contribution)} more this month.`
                      : "Target is funded for this month."
                  : "No target."}{" "}
                <Link className="font-semibold text-secondary underline underline-offset-2" href="/goals">
                  {inspectTarget ? "Change it on Goals" : "Set one on Goals"}
                </Link>
              </p>
              {inspected.note && (
                <p className={`mt-space-sm whitespace-pre-line ${MUTED}`}>
                  {inspected.note}
                </p>
              )}
              <h3 className="mt-space-md font-label-sm text-label-sm font-semibold text-text-primary">
                This month&apos;s transactions
              </h3>
              {inspectRecent.length ? (
                <ul className="mt-space-xs divide-y divide-border-warm">
                  {inspectRecent.slice(0, 5).map((t) => (
                    <li key={t.id} className="flex justify-between gap-space-sm py-space-xs font-body-sm text-body-sm">
                      <span className="min-w-0 truncate text-text-primary">
                        {t.date.slice(5)} · {t.payee || "No payee"}
                      </span>
                      <span className="tabular-nums text-text-secondary">
                        <Amount>{usd(t.amount)}</Amount>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={`mt-space-xs ${MUTED}`}>None yet.</p>
              )}
              <p className={`mt-space-md flex flex-wrap gap-space-md ${MUTED}`}>
                <Link
                  className="font-semibold text-secondary underline underline-offset-2"
                  href={`/accounts/register?category=${inspected.id}&from=${s.month}-01&through=${monthLast}`}
                >
                  All transactions
                </Link>
                <Link
                  className="font-semibold text-secondary underline underline-offset-2"
                  href={`/budget?month=${s.month}&moves=${inspected.id}`}
                >
                  Money moves
                </Link>
                {(!inspected.system || inspected.paymentAccountId) && (
                  <Link
                    className="font-semibold text-secondary underline underline-offset-2"
                    href={`/budget?month=${s.month}&autoMode=LAST_ASSIGNED&autoCategory=${inspected.id}`}
                  >
                    Auto-Assign
                  </Link>
                )}
              </p>
            </section>
          )}
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
          <section
            className={`finance-panel ${CARD} p-space-lg`}
            aria-label="Money moves"
          >
            <h2 className={PANEL_H2}>Money moves</h2>
            <p className={`mt-space-xs ${MUTED}`}>
              Every assignment and move this month, newest first.
            </p>
            <form
              action={appPath("/budget")}
              method="get"
              className="mt-space-md flex flex-wrap items-end gap-space-sm"
            >
              <input type="hidden" name="month" value={s.month} />
              {q.view && <input type="hidden" name="view" value={q.view} />}
              <label className="flex min-w-44 flex-1 flex-col gap-1 font-body-sm text-body-sm text-text-secondary">
                Category
                <select name="moves" defaultValue={movesCategory?.id ?? ""}>
                  <option value="">All categories</option>
                  {s.categories
                    .filter((c) => !c.archived)
                    .map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <button className="secondary-button" type="submit">
                Show moves
              </button>
            </form>
            {moves.length === 0 ? (
              <p className={`mt-space-md ${MUTED}`}>
                No money has moved{movesCategory ? ` in ${movesCategory.name}` : ""} this month.
              </p>
            ) : (
              <ol className="mt-space-md divide-y divide-border-warm">
                {moves.slice(0, 30).map((move) => {
                  const names = (list: { categoryId: string; amount: bigint }[]) =>
                    list
                      .map((e) =>
                        list.length > 1
                          ? `${categoryName.get(e.categoryId) ?? "Removed category"} ${usd(e.amount)}`
                          : (categoryName.get(e.categoryId) ?? "Removed category"),
                      )
                      .join(", ");
                  const amount =
                    move.readyToAssign === 0n
                      ? move.to.reduce((sum, e) => sum + e.amount, 0n)
                      : move.readyToAssign < 0n
                        ? -move.readyToAssign
                        : move.readyToAssign;
                  const label =
                    move.kind === "UNDO"
                      ? "Undid a move"
                      : move.kind === "AUTO_ASSIGN"
                      ? `Auto-Assign: ${AUTO_OPTIONS.find((o) => o.mode === move.mode)?.label ?? "history"}`
                      : move.kind === "TARGET_FUND"
                        ? "Assigned what targets need"
                        : move.kind === "MOVE"
                          ? "Moved"
                          : move.readyToAssign <= 0n
                            ? "Assigned"
                            : "Returned";
                  const source = move.from.length ? names(move.from) : "Ready to Assign";
                  const destination = move.to.length ? names(move.to) : "Ready to Assign";
                  return (
                    <li className="money-move py-space-sm" key={move.id}>
                      <div className="flex items-baseline justify-between gap-space-sm">
                        <span className="font-body-sm text-body-sm font-semibold text-text-primary">
                          {label}
                        </span>
                        <span className="font-body-sm text-body-sm tabular-nums text-text-primary">
                          <Amount>{usd(amount)}</Amount>
                        </span>
                      </div>
                      <p className="font-body-sm text-body-sm text-text-secondary">
                        From {source} to {destination}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-space-sm">
                        <p className="font-label-sm text-label-sm text-text-tertiary">
                          {moveTime.format(move.createdAt)}
                          {move.actor ? ` · ${move.actor}` : ""}
                          {move.undone ? " · Undone" : ""}
                        </p>
                        {!move.undone && move.kind !== "UNDO" && (
                          <FinanceForm
                            budgetId={s.budget.id}
                            command={{ type: "move.undo", id: move.id }}
                            label="Undo"
                            inline
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {moves.length > 30 && (
              <p className={`mt-space-sm ${MUTED}`}>
                Showing the 30 most recent of {moves.length}. Choose a category to narrow the list.
              </p>
            )}
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
        <summary className={`cursor-pointer ${PANEL_H2}`}>Manage focused views</summary>
        <p className={`mt-space-sm ${MUTED}`}>
          Save up to 12 category selections. Views filter the plan on this page; they never move or hide money.
        </p>
        {s.views.length < 12 && <div className="mt-space-md">
          <h3 className="font-label-sm text-label-sm font-semibold text-text-primary">New view</h3>
          <FinanceForm budgetId={s.budget.id} command={{ type: "view.save" }} label="Create view">
            <label>Name<input name="name" required maxLength={80} /></label>
            <fieldset className="mt-space-sm">
              <legend className="font-label-sm text-label-sm">Categories</legend>
              <div className="grid gap-space-xs sm:grid-cols-2 lg:grid-cols-3">
                {active.filter((item) => !item.system || item.paymentAccountId).map((item) =>
                  <label className="check-field" key={item.id}><input type="checkbox" name="categoryId" value={item.id} />{item.name}</label>
                )}
              </div>
            </fieldset>
          </FinanceForm>
        </div>}
        {s.views.length > 0 && <div className="mt-space-md space-y-space-xs">
          {s.views.map((view, index) => <details className="rounded-md border border-border-warm px-space-md py-space-sm" key={view.id}>
            <summary className="cursor-pointer font-body-sm text-body-sm font-semibold text-text-primary">{view.name} · {view.categoryIds.length} categories</summary>
            <div className="mt-space-sm">
              <FinanceForm budgetId={s.budget.id} command={{ type: "view.save", id: view.id }} label="Save view">
                <label>Name<input name="name" required maxLength={80} defaultValue={view.name} /></label>
                <fieldset className="mt-space-sm"><legend className="font-label-sm text-label-sm">Categories</legend>
                  <div className="grid gap-space-xs sm:grid-cols-2 lg:grid-cols-3">
                    {active.filter((item) => !item.system || item.paymentAccountId).map((item) =>
                      <label className="check-field" key={item.id}><input type="checkbox" name="categoryId" value={item.id} defaultChecked={view.categoryIds.includes(item.id)} />{item.name}</label>
                    )}
                  </div>
                </fieldset>
              </FinanceForm>
              <div className="mt-space-sm flex flex-wrap gap-space-xs">
                {index > 0 && <FinanceForm budgetId={s.budget.id} command={{ type: "view.reorder", id: view.id, direction: "UP" }} label="Move up" inline />}
                {index < s.views.length - 1 && <FinanceForm budgetId={s.budget.id} command={{ type: "view.reorder", id: view.id, direction: "DOWN" }} label="Move down" inline />}
                <FinanceForm budgetId={s.budget.id} command={{ type: "view.delete", id: view.id }} label="Delete view" inline />
              </div>
            </div>
          </details>)}
        </div>}
      </details>
      <details className={`finance-panel mt-space-lg ${CARD} p-space-lg`}>
        <summary className={`cursor-pointer ${PANEL_H2}`}>
          Manage categories and groups
        </summary>
        <div className="mt-space-md space-y-space-lg">
          <section aria-label="Group management">
            <h3 className="mb-space-sm font-label-sm text-label-sm font-semibold text-text-secondary">
              Groups
            </h3>
            <div className="space-y-space-xs">
              {groups.map((g, index) => (
                <details
                  className="rounded-md border border-border-warm px-space-md py-space-sm"
                  key={g.id}
                >
                  <summary className="cursor-pointer font-body-sm text-body-sm font-semibold text-text-primary">
                    {g.name}
                    {g.hidden ? " · Hidden" : ""}
                  </summary>
                  <div className="mt-space-sm flex flex-wrap items-end gap-space-sm">
                    <FinanceForm
                      budgetId={s.budget.id}
                      command={{ type: "group.rename", id: g.id }}
                      label="Rename"
                      inline
                    >
                      <label>
                        <span className="sr-only">Group name for {g.name}</span>
                        <input
                          className="min-w-40!"
                          name="name"
                          required
                          defaultValue={g.name}
                        />
                      </label>
                    </FinanceForm>
                    {index > 0 && (
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{
                          type: "group.reorder",
                          id: g.id,
                          direction: "UP",
                        }}
                        label="Move up"
                        inline
                      />
                    )}
                    {index < groups.length - 1 && (
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{
                          type: "group.reorder",
                          id: g.id,
                          direction: "DOWN",
                        }}
                        label="Move down"
                        inline
                      />
                    )}
                    <FinanceForm
                      budgetId={s.budget.id}
                      command={{
                        type: "group.hide",
                        id: g.id,
                        hidden: !g.hidden,
                      }}
                      label={g.hidden ? "Unhide group" : "Hide group"}
                      inline
                    />
                  </div>
                </details>
              ))}
            </div>
          </section>
          <section aria-label="Category management">
            <h3 className="mb-space-sm font-label-sm text-label-sm font-semibold text-text-secondary">
              Categories
            </h3>
            <div className="grid items-start gap-space-sm sm:grid-cols-2 xl:grid-cols-3">
              {s.categories
                .filter((c) => !c.system || c.paymentAccountId)
                .map((c) => (
                  <details
                    className="rounded-md border border-border-warm p-space-md"
                    key={c.id}
                  >
                    <summary className="cursor-pointer font-label-sm text-label-sm font-semibold text-text-primary">
                      {c.name}
                      {c.archived ? " · Archived" : ""}
                      {c.hidden ? " · Hidden" : ""}
                    </summary>
                    {!c.paymentAccountId && (
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
                        <label>
                          Note
                          <textarea
                            name="note"
                            maxLength={1000}
                            rows={2}
                            defaultValue={c.note}
                          />
                        </label>
                      </FinanceForm>
                    )}
                    {!c.archived && (
                      <div className="mt-space-sm flex flex-wrap gap-space-xs">
                        {s.categories
                          .filter(
                            (item) =>
                              item.groupId === c.groupId && !item.archived,
                          )
                          .findIndex((item) => item.id === c.id) > 0 && (
                          <FinanceForm
                            budgetId={s.budget.id}
                            command={{
                              type: "category.reorder",
                              id: c.id,
                              direction: "UP",
                            }}
                            label="Move up"
                            inline
                          />
                        )}
                        {s.categories
                          .filter(
                            (item) =>
                              item.groupId === c.groupId && !item.archived,
                          )
                          .findIndex((item) => item.id === c.id) <
                          s.categories.filter(
                            (item) =>
                              item.groupId === c.groupId && !item.archived,
                          ).length -
                            1 && (
                          <FinanceForm
                            budgetId={s.budget.id}
                            command={{
                              type: "category.reorder",
                              id: c.id,
                              direction: "DOWN",
                            }}
                            label="Move down"
                            inline
                          />
                        )}
                        <FinanceForm
                          budgetId={s.budget.id}
                          command={{
                            type: "category.hide",
                            id: c.id,
                            hidden: !c.hidden,
                          }}
                          label={c.hidden ? "Unhide category" : "Hide category"}
                          inline
                        />
                      </div>
                    )}
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
        <MaybeAmount value={value} />
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
      <Amount>{usd(amount)}</Amount>
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
