import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  PiggyBank,
  Landmark,
  Clock,
} from "lucide-react";
import { financePage } from "@/application/finance-page";
import {
  DEBT_TYPES,
  getAutoAssignPreview,
  getDebtTerms,
} from "@/application/finance";
import { categorySchedules } from "@/application/schedules";
import { versionFor } from "@/domain/versions";
import { getAttention } from "@/application/attention";
import { requireUser } from "@/application/session";
import { FinanceForm } from "@/components/finance-form";
import { formatUSD, money } from "@/domain/money";
import { nextMonth } from "@/domain/budget";
import { AUTO_ASSIGN_MODES, type AutoAssignMode } from "@/domain/auto-assign";
import { PRESET_VIEWS, focusedCategoryIds } from "@/domain/focused-views";
import { FocusedViewTabs } from "@/components/focused-view-tabs";
import { budgetMonth } from "@/domain/dates";
import { STARTER_GROUPS } from "@/domain/starter";
import { TARGET_STATE } from "@/components/targets";
import { Amount, MaybeAmount } from "@/components/amount";
import { DismissSetup, ShowSetup } from "@/components/dismiss-setup";
import { TargetEditor } from "@/components/target-editor";
import { setupSteps, type SetupStep } from "@/domain/setup";
import { cookies } from "next/headers";
import { formatDate } from "@/domain/dates";
import Form from "next/form";
const usd = (n: bigint) => formatUSD(money(n));
const CARD = "rounded-lg border border-border-warm bg-surface-card";
const PANEL_H2 = "font-headline-md text-headline-md text-text-primary";
const MUTED = "font-body-sm text-body-sm leading-relaxed text-text-secondary";
// Compact text-style triggers and the small panel they open, for editing the
// plan in place rather than in a separate management section.
const INLINE_ADD =
  "cursor-pointer list-none rounded-md px-space-xs py-1 font-label-sm text-label-sm font-semibold text-secondary hover:bg-row-hover [&::-webkit-details-marker]:hidden";
const POPOVER =
  "absolute right-0 z-20 mt-space-xs w-72 max-w-[80vw] rounded-lg border border-border-warm bg-surface-card p-space-md shadow-level2";
const INSPECT_H3 =
  "mt-space-md font-label-sm text-label-sm font-semibold text-text-primary";
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
    label:
      "Make the categories your own: start from the template or add your own",
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
    href: "/targets",
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
  const shownIds = new Set(
    focusedCategoryIds(
      s.focusedRows,
      customView ? { categoryIds: customView.categoryIds } : (preset ?? "ALL"),
    ),
  );
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
  const inspectSiblings = inspected
    ? s.categories.filter((c) => c.groupId === inspected.groupId && !c.archived)
    : [];
  const inspectIndex = inspectSiblings.findIndex((c) => c.id === inspected?.id);
  const inspectRow = inspected
    ? p.categories.find((row) => row.id === inspected.id)
    : undefined;
  const inspectTarget = inspected
    ? s.targets.find((t) => t.categoryId === inspected.id)
    : undefined;
  // Stock groups and categories, matched to the plan by name. What is already
  // in the plan shows in the plan; only what is missing is offered.
  const stock = STARTER_GROUPS.map((suggestion) => {
    const group = s.groups.find(
      (item) =>
        !item.system &&
        item.name.toLocaleLowerCase() === suggestion.name.toLocaleLowerCase(),
    );
    const missing = suggestion.categories
      .map((name) => ({
        name,
        category: s.categories.find(
          (item) =>
            item.groupId === group?.id &&
            item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        ),
      }))
      .filter(
        ({ category }) => !category || category.archived || category.hidden,
      );
    return { suggestion, group, missing };
  });
  const stockOffers = stock.filter(
    ({ group, missing }) => !group || group.hidden || missing.length > 0,
  );
  const stockNames = [
    ...new Set(
      STARTER_GROUPS.flatMap((g) => g.categories).filter(
        (name) =>
          !s.categories.some(
            (c) =>
              !c.archived &&
              c.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
          ),
      ),
    ),
  ];
  // What pays out of this envelope, and for a card the terms behind it, so
  // target, schedule and terms are read together in one place.
  const inspectSchedules = inspected
    ? await categorySchedules(user.userId, s.budget.id, inspected.id)
    : [];
  const inspectCard = inspected?.paymentAccountId
    ? s.accounts.find((a) => a.id === inspected.paymentAccountId)
    : undefined;
  const inspectTerms = inspectCard
    ? versionFor(
        (await getDebtTerms(user.userId, s.budget.id)).filter(
          (t) => t.accountId === inspectCard.id,
        ),
        s.month,
      )
    : null;
  const cardAccounts = new Set(
    s.accounts
      .filter((a) => a.type === "CREDIT_CARD" || a.type === "LINE_OF_CREDIT")
      .map((a) => a.id),
  );
  const inspectSpending = { cash: 0n, credit: 0n };
  const inspectRecent: {
    id: string;
    date: string;
    payee: string;
    amount: bigint;
  }[] = [];
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
      inspectRecent.push({
        id: t.id,
        date,
        payee: t.payee,
        amount: split.amount,
      });
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
  // Everything tucked away, for the Hidden and archived section.
  const hiddenGroups = s.groups.filter((g) => g.hidden && !g.system);
  const tucked = s.categories.filter(
    (c) => (c.hidden || c.archived) && (!c.system || c.paymentAccountId),
  );
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
              scroll={false}
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
              scroll={false}
            >
              Next →
            </Link>
          )}
          <Link
            className="rounded-md bg-surface-container-high px-2.5 py-1.5 font-label-sm text-label-sm text-text-primary transition-colors hover:bg-surface-container-highest"
            href="/budget"
            scroll={false}
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
          <Amount>{usd(hiddenAvailable)}</Amount> available. Open Hidden and
          archived below to review or unhide them.
        </p>
      )}
      {setupHidden && steps.some((step) => !step.done) && (
        <p className={`mt-space-sm ${MUTED}`}>
          {steps.filter((x) => x.done).length} of {steps.length} setup steps
          done · <ShowSetup />
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
                <Link
                  className="underline-offset-2 hover:underline"
                  href={SETUP[step].href}
                >
                  {SETUP[step].label}
                </Link>
              </li>
            ))}
          </ol>
          <p className={`mt-space-sm ${MUTED}`}>
            Take these in any order and come back any time. The{" "}
            <Link
              className="font-semibold text-secondary underline underline-offset-2"
              href="/guide"
            >
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
            Ready to Assign is <Amount>{usd(p.readyToAssign)}</Amount>. Nothing
            is broken and no money was invented: categories are simply holding
            more than the budget contains. Move money out of a category, or
            reduce an assignment, until this reaches zero.
          </p>
        </aside>
      )}
      {(p.cashDeficit > 0n || p.creditDeficit > 0n) && (
        <aside className="mt-space-md flex flex-col gap-space-xs rounded-lg border border-status-warning-border bg-status-warning-bg p-space-md">
          <strong className="font-headline-sm text-headline-sm text-status-warning-text">
            Cover overspending
          </strong>
          <p className="font-body-sm text-body-sm leading-relaxed text-text-secondary">
            Cash / payment funding deficit:{" "}
            <Amount>{usd(p.cashDeficit)}</Amount>. Unfunded card spending:{" "}
            <Amount>{usd(p.creditDeficit)}</Amount>. Cash deficits reduce next
            month’s Ready to Assign; unfunded card spending remains debt.
          </p>
        </aside>
      )}
      {p.releasedReserves > 0n && (
        <p className={`mt-space-md ${MUTED}`}>
          Excess card payment reserves released this month:{" "}
          <Amount>{usd(p.releasedReserves)}</Amount>.
        </p>
      )}
      <FocusedViewTabs
        budgetId={s.budget.id}
        month={s.month}
        selected={selectedView}
        explicit={Boolean(q.view)}
        views={viewOptions}
      />
      {selectedView !== "ALL" && (
        <p className={`mt-space-xs ${MUTED}`}>
          Showing {visible.length} of {active.length} visible categories. Ready
          to Assign and totals still cover the entire budget.
        </p>
      )}
      <div className="mt-space-lg grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
        <div className="flex flex-col gap-space-lg xl:col-span-8">
          {active.length > 0 && (
            <section
              id="auto-assign"
              className={`finance-panel scroll-mt-space-lg ${CARD} p-space-lg`}
              aria-label="Auto-Assign"
            >
              <h2 className={PANEL_H2}>Auto-Assign</h2>
              <p className={`mt-space-xs ${MUTED}`}>
                Preview assignments from your history or reset this month before
                applying. A preview changes no money.
              </p>
              <Form
                action="/budget"
                scroll={false}
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
              </Form>
              {autoPreview && (
                <div className="mt-space-md border-t border-border-warm pt-space-md">
                  <p className={MUTED}>
                    {autoPreview.changes.length} categor
                    {autoPreview.changes.length === 1 ? "y" : "ies"} change.
                    Ready to Assign:{" "}
                    <Amount>{usd(autoPreview.readyBefore)}</Amount> →{" "}
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
                            <span data-numeric>
                              <Amount>{usd(change.amount)}</Amount>
                            </span>
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
                Use + Add group in Envelopes to name your own group or start
                from a stock group, then + Add category under any group.
                Unused suggestions stay out of your plan; adding one never
                assigns money.
              </p>
            </section>
          )}
          {!active.length && hiddenCategories.length > 0 && (
            <section className={`finance-panel ${CARD} p-space-lg`}>
              <h2 className={PANEL_H2}>All categories are hidden</h2>
              <p className={`mt-space-sm ${MUTED}`}>
                Your money is still assigned. Open Hidden and archived below to
                show categories again.
              </p>
            </section>
          )}
          {active.length > 0 && visible.length === 0 && (
            <section className={`finance-panel ${CARD} p-space-lg`}>
              <h2 className={PANEL_H2}>No categories in this view</h2>
              <p className={`mt-space-sm ${MUTED}`}>
                Choose All to see the full plan. Your assignments and balances
                have not changed.
              </p>
            </section>
          )}
          {(visible.length > 0 || selectedView === "ALL") && (
            <section
              className={`finance-panel ${CARD}`}
              aria-label="Category ledger"
            >
              <datalist id="stock-category-names">
                {stockNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <div className="flex flex-wrap items-center justify-between gap-space-md border-b border-border-warm px-space-lg py-space-md">
                <h2 className={PANEL_H2}>Envelopes</h2>
                <div className="flex flex-wrap items-center gap-space-md">
                  <span className="font-body-sm text-body-sm text-text-tertiary">
                    {visible.length} categories
                  </span>
                  <details className="add-group relative">
                    <summary className={INLINE_ADD}>+ Add group</summary>
                    <div
                      className={`${POPOVER} w-[min(38rem,85vw)]! max-h-[70vh] overflow-y-auto`}
                    >
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{ type: "group.create" }}
                        label="Create group"
                        reset
                        inline
                        closeDetailsOnSave
                      >
                        <label>
                          <span className="sr-only">New group name</span>
                          <input
                            name="name"
                            required
                            maxLength={120}
                            placeholder="Your own group, e.g. Kids"
                            aria-label="New group name"
                          />
                        </label>
                      </FinanceForm>
                      {stockOffers.length > 0 && (
                        <div className="suggested-categories mt-space-md border-t border-border-warm pt-space-sm">
                          <h3 className="font-label-caps text-label-caps uppercase tracking-widest text-text-secondary">
                            Or start from a stock group
                          </h3>
                          <p className={`mt-1 ${MUTED}`}>
                            Add a whole group, or only the categories you
                            need. Nothing is assigned until you assign it.
                          </p>
                          <div className="mt-space-sm space-y-space-md">
                            {stockOffers.map(({ suggestion, group, missing }) => (
                              <section
                                className="border-t border-border-warm pt-space-sm first:border-0 first:pt-0"
                                key={suggestion.name}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-space-sm">
                                  <div>
                                    <h4 className="font-label-sm text-label-sm font-semibold text-text-primary">
                                      {suggestion.name}
                                    </h4>
                                    <p className={`mt-1 ${MUTED}`}>
                                      {suggestion.note}
                                    </p>
                                  </div>
                                  <FinanceForm
                                    budgetId={s.budget.id}
                                    command={{
                                      type: "starter.group.add",
                                      groupName: suggestion.name,
                                    }}
                                    label={
                                      group?.hidden
                                        ? `Restore ${suggestion.name} group`
                                        : group
                                          ? `Add missing ${suggestion.name} categories`
                                          : `Add ${suggestion.name} group`
                                    }
                                    inline
                                    closeDetailsOnSave
                                  />
                                </div>
                                <ul className="mt-space-xs flex flex-wrap gap-space-xs">
                                  {missing.map(({ name, category }) => (
                                    <li key={name}>
                                      <FinanceForm
                                        budgetId={s.budget.id}
                                        command={{
                                          type: "starter.add",
                                          groupName: suggestion.name,
                                          categoryName: name,
                                        }}
                                        label={
                                          category
                                            ? `Restore ${name}`
                                            : `Add ${name}`
                                        }
                                        inline
                                        inspectCreatedCategoryMonth={s.month}
                                      />
                                    </li>
                                  ))}
                                </ul>
                              </section>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                </div>
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
                // An empty group still shows in the full plan, so its first
                // category can be added right here.
                if (
                  !cats.length &&
                  (selectedView !== "ALL" || g.hidden || g.system)
                )
                  return null;
                const groupIndex = groups.findIndex((x) => x.id === g.id);
                return (
                  <div key={g.id}>
                    <div className="flex flex-wrap items-center justify-between gap-space-sm border-y border-border-warm bg-surface-container-low px-space-lg py-space-sm">
                      {g.system && (
                        <h3 className="font-label-caps text-label-caps uppercase tracking-widest text-text-secondary">
                          {g.name}
                        </h3>
                      )}
                      {!g.system && (
                        <div className="flex w-full flex-wrap items-center justify-between gap-space-md">
                          <details className="add-category relative">
                            <summary className={INLINE_ADD}>
                              + Add category
                            </summary>
                            <div className={POPOVER}>
                              <FinanceForm
                                budgetId={s.budget.id}
                                command={{
                                  type: "category.create",
                                  groupId: g.id,
                                }}
                                label="Add"
                                reset
                                inline
                                closeDetailsOnSave
                                inspectCreatedCategoryMonth={s.month}
                              >
                                <label>
                                  <span className="sr-only">
                                    New category in {g.name}
                                  </span>
                                  <input
                                    name="name"
                                    required
                                    maxLength={120}
                                    placeholder="e.g. Car Insurance"
                                    aria-label={`New category in ${g.name}`}
                                    list="stock-category-names"
                                  />
                                </label>
                              </FinanceForm>
                              {(() => {
                                const offer = stock.find(
                                  (item) => item.group?.id === g.id,
                                );
                                if (!offer?.missing.length) return null;
                                return (
                                  <div className="stock-chips mt-space-sm">
                                    <p className={MUTED}>
                                      Suggested for {g.name}
                                    </p>
                                    <ul className="mt-space-xs flex flex-wrap gap-space-xs">
                                      {offer.missing.map(({ name, category }) => (
                                        <li key={name}>
                                          <FinanceForm
                                            budgetId={s.budget.id}
                                            command={{
                                              type: "starter.add",
                                              groupName: offer.suggestion.name,
                                              categoryName: name,
                                            }}
                                            label={
                                              category
                                                ? `Restore ${name}`
                                                : `Add ${name}`
                                            }
                                            inline
                                            inspectCreatedCategoryMonth={
                                              s.month
                                            }
                                          />
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                );
                              })()}
                            </div>
                          </details>
                          <details className="group-settings relative order-first">
                            <summary
                              className={INLINE_ADD}
                              aria-label={`Edit group ${g.name}`}
                            >
                              <h3 className="font-label-caps text-label-caps uppercase tracking-widest text-text-secondary">
                                {g.name}
                              </h3>
                            </summary>
                            <div className={`${POPOVER} left-0! right-auto!`}>
                              <FinanceForm
                                budgetId={s.budget.id}
                                command={{ type: "group.rename", id: g.id }}
                                label="Rename"
                                inline
                                closeDetailsOnSave
                              >
                                <label>
                                  <span className="sr-only">
                                    Group name for {g.name}
                                  </span>
                                  <input
                                    name="name"
                                    required
                                    maxLength={120}
                                    defaultValue={g.name}
                                    aria-label={`Group name for ${g.name}`}
                                  />
                                </label>
                              </FinanceForm>
                              <div className="mt-space-xs flex flex-wrap gap-space-xs">
                                {groupIndex > 0 && (
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
                                {groupIndex >= 0 &&
                                  groupIndex < groups.length - 1 && (
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
                                    hidden: true,
                                  }}
                                  label="Hide group"
                                  inline
                                />
                              </div>
                              <details className="delete-group mt-space-sm">
                                <summary className="cursor-pointer font-label-sm text-label-sm font-semibold text-status-negative-text">
                                  Delete group…
                                </summary>
                                <p className={`mt-space-xs ${MUTED}`}>
                                  Deletes {g.name} and its categories. Any
                                  category holding money must be emptied
                                  first; one with past transactions is
                                  archived instead, so your history still adds
                                  up.
                                </p>
                                <FinanceForm
                                  budgetId={s.budget.id}
                                  command={{ type: "group.delete", id: g.id }}
                                  label={`Delete ${g.name}`}
                                  inline
                                  closeDetailsOnSave
                                />
                              </details>
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                    {!cats.length && (
                      <p className={`px-space-lg py-space-sm ${MUTED}`}>
                        No categories yet. Use + Add category above.
                      </p>
                    )}
                    {cats.length > 0 && (
                      <>
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
                                const r = p.categories.find(
                                  (r) => r.id === c.id,
                                )!;
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
                                        href={`/budget?month=${s.month}&inspect=${c.id}${q.view ? `&view=${encodeURIComponent(q.view)}` : ""}#inspector-heading`}
                                        aria-current={
                                          inspected?.id === c.id
                                            ? "true"
                                            : undefined
                                        }
                                      >
                                        {c.name}
                                      </Link>
                                      {(!c.system || c.paymentAccountId) && (
                                        <Link
                                          className="ml-space-xs font-label-sm text-label-sm font-normal text-secondary underline underline-offset-2"
                                          href={`/budget?month=${s.month}&autoMode=LAST_ASSIGNED&autoCategory=${c.id}#auto-assign`}
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
                                            t.snoozed
                                              ? "SNOOZED"
                                              : t.progress.state
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
                                      {r.available < 0n &&
                                        coverFrom(c.id).length > 0 && (
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
                                                  Cover {c.name} overspending
                                                  from
                                                </span>
                                                <select
                                                  name="from"
                                                  aria-label={`Cover ${c.name} overspending from`}
                                                >
                                                  {coverFrom(c.id).map((o) => (
                                                    <option
                                                      key={o.id}
                                                      value={o.id}
                                                    >
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
                      </>
                    )}
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
        {/* On wide screens this column scrolls on its own, so the category
            panel stays in view beside a long list. */}
        <div className="flex flex-col gap-space-lg xl:sticky xl:top-20 xl:col-span-4 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pb-space-md">
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
                  scroll={false}
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
              {(!inspected.system || inspected.paymentAccountId) && (
                <div className="mt-space-md">
                  <FinanceForm
                    budgetId={s.budget.id}
                    command={{
                      type: "assign",
                      categoryId: inspected.id,
                      month: s.month,
                    }}
                    label="Assign"
                    inline
                    reset
                  >
                    <label>
                      <span className="sr-only">
                        Assign to {inspected.name}
                      </span>
                      <input
                        name="amount"
                        required
                        inputMode="decimal"
                        placeholder="Add or subtract, e.g. 25.00"
                        aria-label={`Assign to ${inspected.name}`}
                      />
                    </label>
                  </FinanceForm>
                  {inspectRow.available > 0n && (
                    <div className="mt-space-sm flex flex-wrap items-center gap-space-sm">
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{
                          type: "assign",
                          categoryId: inspected.id,
                          month: s.month,
                          amount: `-${inspectRow.available / 100n}.${String(inspectRow.available % 100n).padStart(2, "0")}`,
                        }}
                        label="Return available to Ready to Assign"
                        inline
                      />
                      <span className={MUTED}>
                        <Amount>{usd(inspectRow.available)}</Amount> available
                      </span>
                    </div>
                  )}
                  <p className={`mt-space-xs ${MUTED}`}>
                    To return only part of this money, enter a negative amount
                    in Assign. This also works for money left over from last
                    month.
                  </p>
                </div>
              )}
              {inspectCard && (
                <>
                  <h3 className={INSPECT_H3}>Card terms</h3>
                  {inspectTerms ? (
                    <p className={`card-terms mt-space-xs ${MUTED}`}>
                      {(inspectTerms.aprBasisPoints / 100).toFixed(2)}% APR ·
                      minimum{" "}
                      {inspectTerms.minimumPercentBasisPoints > 0
                        ? `${(inspectTerms.minimumPercentBasisPoints / 100).toFixed(2)}% of the balance${inspectTerms.minimumIncludesInterest ? " + interest" : ""}`
                        : null}
                      {inspectTerms.minimumPercentBasisPoints > 0 &&
                        inspectTerms.minimumPayment > 0n &&
                        ", at least "}
                      {inspectTerms.minimumPayment > 0n && (
                        <Amount>{usd(inspectTerms.minimumPayment)}</Amount>
                      )}
                      {inspectTerms.dueDay
                        ? ` · due on day ${inspectTerms.dueDay}`
                        : " · no due day yet"}
                      .{" "}
                      <Link
                        className="font-semibold text-secondary underline underline-offset-2"
                        href={`/debt?account=${inspectCard.id}#terms`}
                      >
                        Edit terms
                      </Link>
                    </p>
                  ) : null}
                  {inspectTerms?.dueDay &&
                  !inspectSchedules.some((item) => item.managed) ? (
                    <FinanceForm
                      budgetId={s.budget.id}
                      command={{
                        type: "debt.payment.setup",
                        accountId: inspectCard.id,
                      }}
                      label="Set up payment"
                    >
                      <p className={MUTED}>
                        Set a monthly target here and schedule the transfer on
                        day {inspectTerms.dueDay}, from these terms.
                      </p>
                      <div className="field-grid">
                        <label>
                          Pay from
                          <select
                            name="payFromAccountId"
                            required
                            aria-label="Pay from"
                          >
                            {s.accounts
                              .filter(
                                (a) =>
                                  !DEBT_TYPES.includes(a.type) &&
                                  !a.closed &&
                                  a.participation === "BUDGET",
                              )
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Monthly payment (USD)
                          <input
                            name="monthlyPayment"
                            inputMode="decimal"
                            placeholder="Today's minimum"
                            aria-label="Monthly payment (USD)"
                          />
                        </label>
                      </div>
                    </FinanceForm>
                  ) : null}
                  {inspectTerms ? null : (
                    <p className={`card-terms mt-space-xs ${MUTED}`}>
                      No terms recorded.{" "}
                      <Link
                        className="font-semibold text-secondary underline underline-offset-2"
                        href={`/debt?account=${inspectCard.id}#terms`}
                      >
                        Record the terms
                      </Link>{" "}
                      with a due day and a Pay from account, and this
                      envelope&apos;s target and payment schedule are set up
                      for you.
                    </p>
                  )}
                </>
              )}
              <p className={`target-schedule-help mt-space-md ${MUTED}`}>
                A <strong>target</strong> is how much this envelope needs. A{" "}
                <strong>schedule</strong> is the real transaction that will hit
                an account.
                {inspectCard
                  ? " Paying the card is a transfer from checking to the card, with no category: the money comes out of this envelope, which also collects what you spend on the card from funded categories."
                  : ""}
              </p>
              <h3 className={INSPECT_H3}>Target</h3>
              <p className={`mt-space-xs ${MUTED}`}>
                {inspectTarget
                  ? inspectTarget.snoozed
                    ? "Snoozed this month."
                    : inspectTarget.progress.contribution > 0n
                      ? `Needs ${usd(inspectTarget.progress.contribution)} more this month.`
                      : "Funded for this month."
                  : "No target yet. A target says how much this category needs and when."}
                {inspectTarget?.dueDay !== undefined &&
                  ` Due on day ${inspectTarget.dueDay}.`}
              </p>
              {(!inspected.system || inspected.paymentAccountId) && (
                <TargetEditor
                  key={`${inspected.id}-${inspectTarget?.type ?? "none"}-${inspectTarget?.amount ?? ""}`}
                  budgetId={s.budget.id}
                  categoryId={inspected.id}
                  categoryName={inspected.name}
                  month={s.month}
                  currentMonth={s.today.slice(0, 7)}
                  card={Boolean(inspected.paymentAccountId)}
                  current={
                    inspectTarget
                      ? {
                          type: inspectTarget.type,
                          amount: `${inspectTarget.amount / 100n}.${String(inspectTarget.amount % 100n).padStart(2, "0")}`,
                          dueMonth: inspectTarget.dueMonth,
                          cadenceMonths: inspectTarget.cadenceMonths,
                          refill: inspectTarget.refill,
                          dayOfWeek: inspectTarget.dayOfWeek,
                          dueDay: inspectTarget.dueDay,
                          snoozed: inspectTarget.snoozed,
                        }
                      : null
                  }
                />
              )}
              {(!inspected.system || inspected.paymentAccountId) && (
                <>
                  <h3 className={INSPECT_H3}>Upcoming</h3>
                  {inspectSchedules.length ? (
                    <ul className="category-schedules mt-space-xs space-y-space-xs font-body-sm text-body-sm">
                      {inspectSchedules.map((item) => (
                        <li
                          className="flex flex-wrap items-baseline justify-between gap-space-xs"
                          key={item.id}
                        >
                          <span className="text-text-primary">
                            {item.name}
                            <small className="block text-text-tertiary">
                              {item.next
                                ? `Next ${formatDate(item.next, s.budget.dateFormat)}`
                                : "No more occurrences"}
                              {item.transferAccountId
                                ? ` · from ${s.accounts.find((a) => a.id === item.accountId)?.name ?? "account"}`
                                : ""}
                              {item.managed ? " · kept in step with the card's terms" : ""}
                            </small>
                          </span>
                          <span className="flex items-baseline gap-space-sm">
                            <span className="font-data-mono text-data-mono text-text-primary">
                              <Amount>{usd(item.amount < 0n ? -item.amount : item.amount)}</Amount>
                            </span>
                            <Link
                              className="font-semibold text-secondary underline underline-offset-2"
                              href={`/accounts/schedules#schedule-${item.id}`}
                              aria-label={`Edit schedule ${item.name}`}
                            >
                              Edit
                            </Link>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={`mt-space-xs ${MUTED}`}>
                      {inspectCard
                        ? "No payment scheduled."
                        : "Nothing scheduled from this envelope."}
                    </p>
                  )}
                </>
              )}
              {!inspected.system && (
                <>
                  <h3 className={INSPECT_H3}>Notes</h3>
                  <FinanceForm
                    budgetId={s.budget.id}
                    command={{
                      type: "category.update",
                      id: inspected.id,
                      name: inspected.name,
                      groupId: inspected.groupId,
                      archived: false,
                    }}
                    label="Save note"
                  >
                    <input type="hidden" name="noteSet" value="1" />
                    <label>
                      <span className="sr-only">Note for {inspected.name}</span>
                      <textarea
                        name="note"
                        maxLength={1000}
                        rows={2}
                        defaultValue={inspected.note}
                        aria-label={`Note for ${inspected.name}`}
                      />
                    </label>
                  </FinanceForm>
                  <details className="category-settings mt-space-md">
                    <summary className={`cursor-pointer ${INSPECT_H3} mt-0`}>
                      Rename, move or hide
                    </summary>
                    <FinanceForm
                      budgetId={s.budget.id}
                      command={{
                        type: "category.update",
                        id: inspected.id,
                        note: inspected.note,
                        archived: false,
                      }}
                      label="Save category"
                    >
                      <label>
                        Name
                        <input
                          name="name"
                          required
                          maxLength={120}
                          defaultValue={inspected.name}
                        />
                      </label>
                      <label>
                        Group
                        <select
                          name="groupId"
                          defaultValue={inspected.groupId}
                          aria-label={`Group for ${inspected.name}`}
                        >
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </FinanceForm>
                    <div className="mt-space-sm flex flex-wrap gap-space-xs">
                      {inspectIndex > 0 && (
                        <FinanceForm
                          budgetId={s.budget.id}
                          command={{
                            type: "category.reorder",
                            id: inspected.id,
                            direction: "UP",
                          }}
                          label="Move up"
                          inline
                        />
                      )}
                      {inspectIndex >= 0 &&
                        inspectIndex < inspectSiblings.length - 1 && (
                          <FinanceForm
                            budgetId={s.budget.id}
                            command={{
                              type: "category.reorder",
                              id: inspected.id,
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
                          id: inspected.id,
                          hidden: !inspected.hidden,
                        }}
                        label={
                          inspected.hidden ? "Unhide category" : "Hide category"
                        }
                        inline
                      />
                    </div>
                    <details className="delete-category mt-space-md">
                      <summary className="cursor-pointer font-label-sm text-label-sm font-semibold text-status-negative-text">
                        Delete category…
                      </summary>
                      <p className={`mt-space-xs ${MUTED}`}>
                        {inspectRow.available !== 0n ? (
                          <>
                            It holds{" "}
                            <Amount>{usd(inspectRow.available)}</Amount>. Move
                            that to another category, or assign a negative
                            amount above to return it to Ready to Assign,
                            before deleting.
                          </>
                        ) : (
                          "A category you never used is deleted outright. One with past transactions is archived instead, so your history still adds up; restore it from Hidden and archived."
                        )}
                      </p>
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{ type: "category.delete", id: inspected.id }}
                        label={`Delete ${inspected.name}`}
                        inline
                      />
                    </details>
                  </details>
                </>
              )}
              <h3 className={INSPECT_H3}>This month&apos;s transactions</h3>
              {inspectRecent.length ? (
                <ul className="mt-space-xs divide-y divide-border-warm">
                  {inspectRecent.slice(0, 5).map((t) => (
                    <li
                      key={t.id}
                      className="flex justify-between gap-space-sm py-space-xs font-body-sm text-body-sm"
                    >
                      <span className="min-w-0 truncate text-text-primary">
                        {formatDate(t.date, s.budget.dateFormat)} ·{" "}
                        {t.payee || "No payee"}
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
                  href={`/budget?month=${s.month}&moves=${inspected.id}#money-moves`}
                >
                  Money moves
                </Link>
                {!inspected.system && (
                  <Link
                    className="font-semibold text-secondary underline underline-offset-2"
                    href={`/accounts/schedules?categoryId=${inspected.id}`}
                  >
                    Add recurring schedule
                  </Link>
                )}
                {(!inspected.system || inspected.paymentAccountId) && (
                  <Link
                    className="font-semibold text-secondary underline underline-offset-2"
                    href={`/budget?month=${s.month}&autoMode=LAST_ASSIGNED&autoCategory=${inspected.id}#auto-assign`}
                  >
                    Auto-Assign
                  </Link>
                )}
              </p>
            </section>
          )}
          <details className={`finance-panel ${CARD} p-space-lg`}>
            <summary className={`cursor-pointer ${PANEL_H2}`}>
              Move money
            </summary>
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
          </details>
          <details
            id="money-moves"
            className={`finance-panel scroll-mt-space-lg ${CARD} p-space-lg`}
            role="region"
            aria-label="Money moves"
            open={q.moves !== undefined}
          >
            <summary className={`cursor-pointer ${PANEL_H2}`}>
              Money moves{" "}
              <span className="font-body-sm text-body-sm font-normal text-text-tertiary">
                ({moves.length})
              </span>
            </summary>
            <p className={`mt-space-xs ${MUTED}`}>
              Every assignment and move this month, newest first.
            </p>
            <Form
              action="/budget"
              scroll={false}
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
            </Form>
            {moves.length === 0 ? (
              <p className={`mt-space-md ${MUTED}`}>
                No money has moved
                {movesCategory ? ` in ${movesCategory.name}` : ""} this month.
              </p>
            ) : (
              <ol className="mt-space-md divide-y divide-border-warm">
                {moves.slice(0, 30).map((move) => {
                  const names = (
                    list: { categoryId: string; amount: bigint }[],
                  ) =>
                    list
                      .map((e) =>
                        list.length > 1
                          ? `${categoryName.get(e.categoryId) ?? "Removed category"} ${usd(e.amount)}`
                          : (categoryName.get(e.categoryId) ??
                            "Removed category"),
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
                  const source = move.from.length
                    ? names(move.from)
                    : "Ready to Assign";
                  const destination = move.to.length
                    ? names(move.to)
                    : "Ready to Assign";
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
                Showing the 30 most recent of {moves.length}. Choose a category
                to narrow the list.
              </p>
            )}
          </details>
        </div>
      </div>
      <details className={`finance-panel mt-space-lg ${CARD} p-space-lg`}>
        <summary className={`cursor-pointer ${PANEL_H2}`}>
          Manage focused views
        </summary>
        <p className={`mt-space-sm ${MUTED}`}>
          Save up to 12 category selections. Views filter the plan on this page;
          they never move or hide money.
        </p>
        {s.views.length < 12 && (
          <div className="mt-space-md">
            <h3 className="font-label-sm text-label-sm font-semibold text-text-primary">
              New view
            </h3>
            <FinanceForm
              budgetId={s.budget.id}
              command={{ type: "view.save" }}
              label="Create view"
            >
              <label>
                Name
                <input name="name" required maxLength={80} />
              </label>
              <fieldset className="mt-space-sm">
                <legend className="font-label-sm text-label-sm">
                  Categories
                </legend>
                <div className="grid gap-space-xs sm:grid-cols-2 lg:grid-cols-3">
                  {active
                    .filter((item) => !item.system || item.paymentAccountId)
                    .map((item) => (
                      <label className="check-field" key={item.id}>
                        <input
                          type="checkbox"
                          name="categoryId"
                          value={item.id}
                        />
                        {item.name}
                      </label>
                    ))}
                </div>
              </fieldset>
            </FinanceForm>
          </div>
        )}
        {s.views.length > 0 && (
          <div className="mt-space-md space-y-space-xs">
            {s.views.map((view, index) => (
              <details
                className="rounded-md border border-border-warm px-space-md py-space-sm"
                key={view.id}
              >
                <summary className="cursor-pointer font-body-sm text-body-sm font-semibold text-text-primary">
                  {view.name} · {view.categoryIds.length} categories
                </summary>
                <div className="mt-space-sm">
                  <FinanceForm
                    budgetId={s.budget.id}
                    command={{ type: "view.save", id: view.id }}
                    label="Save view"
                  >
                    <label>
                      Name
                      <input
                        name="name"
                        required
                        maxLength={80}
                        defaultValue={view.name}
                      />
                    </label>
                    <fieldset className="mt-space-sm">
                      <legend className="font-label-sm text-label-sm">
                        Categories
                      </legend>
                      <div className="grid gap-space-xs sm:grid-cols-2 lg:grid-cols-3">
                        {active
                          .filter(
                            (item) => !item.system || item.paymentAccountId,
                          )
                          .map((item) => (
                            <label className="check-field" key={item.id}>
                              <input
                                type="checkbox"
                                name="categoryId"
                                value={item.id}
                                defaultChecked={view.categoryIds.includes(
                                  item.id,
                                )}
                              />
                              {item.name}
                            </label>
                          ))}
                      </div>
                    </fieldset>
                  </FinanceForm>
                  <div className="mt-space-sm flex flex-wrap gap-space-xs">
                    {index > 0 && (
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{
                          type: "view.reorder",
                          id: view.id,
                          direction: "UP",
                        }}
                        label="Move up"
                        inline
                      />
                    )}
                    {index < s.views.length - 1 && (
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{
                          type: "view.reorder",
                          id: view.id,
                          direction: "DOWN",
                        }}
                        label="Move down"
                        inline
                      />
                    )}
                    <FinanceForm
                      budgetId={s.budget.id}
                      command={{ type: "view.delete", id: view.id }}
                      label="Delete view"
                      inline
                    />
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </details>
      {(hiddenGroups.length > 0 || tucked.length > 0) && (
        <details
          className={`finance-panel mt-space-lg ${CARD} p-space-lg`}
          aria-label="Hidden and archived"
        >
          <summary className={`cursor-pointer ${PANEL_H2}`}>
            Hidden and archived ({hiddenGroups.length + tucked.length})
          </summary>
          <p className={`mt-space-sm ${MUTED}`}>
            Hidden categories keep their money and history. Bring one back, or
            open it to change it.
          </p>
          <ul className="mt-space-md divide-y divide-border-warm">
            {hiddenGroups.map((g) => (
              <li
                key={g.id}
                className="hidden-item flex flex-wrap items-center justify-between gap-space-sm py-space-xs"
              >
                <span className="font-body-sm text-body-sm text-text-primary">
                  {g.name}{" "}
                  <span className="text-text-tertiary">· Hidden group</span>
                </span>
                <FinanceForm
                  budgetId={s.budget.id}
                  command={{ type: "group.hide", id: g.id, hidden: false }}
                  label="Unhide group"
                  inline
                />
              </li>
            ))}
            {tucked.map((c) => (
              <li
                key={c.id}
                className="hidden-item flex flex-wrap items-center justify-between gap-space-sm py-space-xs"
              >
                <span className="font-body-sm text-body-sm text-text-primary">
                  {c.archived ? (
                    c.name
                  ) : (
                    <Link
                      className="underline-offset-2 hover:underline"
                      href={`/budget?month=${s.month}&inspect=${c.id}#inspector-heading`}
                    >
                      {c.name}
                    </Link>
                  )}{" "}
                  <span className="text-text-tertiary">
                    · {c.archived ? "Archived" : "Hidden"}
                  </span>
                </span>
                {c.archived ? (
                  !c.paymentAccountId && (
                    <FinanceForm
                      budgetId={s.budget.id}
                      command={{
                        type: "category.update",
                        id: c.id,
                        name: c.name,
                        groupId: c.groupId,
                        archived: false,
                        note: c.note,
                      }}
                      label="Restore"
                      inline
                    />
                  )
                ) : (
                  <FinanceForm
                    budgetId={s.budget.id}
                    command={{ type: "category.hide", id: c.id, hidden: false }}
                    label="Unhide category"
                    inline
                  />
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
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
