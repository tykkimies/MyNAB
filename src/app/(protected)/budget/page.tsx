import Link from "next/link";
import type { ReactNode } from "react";
import { Check, Plus } from "lucide-react";
import { financePage } from "@/application/finance-page";
import {
  getAutoAssignPreview,
  getDebtPlan,
  getDebtTerms,
} from "@/application/finance";
import { categorySchedules } from "@/application/schedules";
import { versionFor } from "@/domain/versions";
import { getAttention } from "@/application/attention";
import { requireUser } from "@/application/session";
import { FinanceForm } from "@/components/finance-form";
import { Drawer, DrawerSection } from "@/components/drawer";
import { formatUSD, money } from "@/domain/money";
import { AUTO_ASSIGN_MODES, type AutoAssignMode } from "@/domain/auto-assign";
import { PRESET_VIEWS, focusedCategoryIds } from "@/domain/focused-views";
import { FocusedViewTabs } from "@/components/focused-view-tabs";
import { budgetMonth } from "@/domain/dates";
import { STARTER_GROUPS } from "@/domain/starter";
import { TARGET_STATE } from "@/components/targets";
import { Amount } from "@/components/amount";
import { DismissSetup, ShowSetup } from "@/components/dismiss-setup";
import { TargetEditor } from "@/components/target-editor";
import { setupSteps, type SetupStep } from "@/domain/setup";
import { cookies } from "next/headers";
import { formatDate } from "@/domain/dates";
import Form from "next/form";
import { PageHeader } from "@/components/ui/page-header";
import { MonthSwitcher } from "@/components/ui/month-switcher";
import { SummaryStrip, Stat } from "@/components/ui/summary-strip";
import { Notice, NoticeList } from "@/components/ui/notice";
import { Popover } from "@/components/ui/popover";
import { GroupToggle } from "@/components/group-toggle";
import {
  BudgetDnd,
  DndGroup,
  DndRow,
  DragHandle,
} from "@/components/budget-dnd";
import { AmountPill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { Help } from "@/components/ui/help";
import { TargetBar, TargetDetail } from "@/components/budget-target";
import { isPhone } from "@/infrastructure/view";
import { PhoneBudget } from "./phone";

const usd = (n: bigint) => formatUSD(money(n));
const MUTED = "text-table text-ink-2";
const LINK = "link";
// table-fixed, so these percentages are the real column widths. Assigned holds
// the amount, the delta field and its confirm button side by side.
/** A bar of its own for the Uncategorized row; not a real group. */
const UNCATEGORIZED_GROUP = "uncategorized";
const LEDGER_COLUMNS = [
  { head: "Category", width: "30%", hide: undefined },
  { head: "Assigned", width: "22%", hide: undefined },
  { head: "Activity", width: "13%", hide: "sm" },
  { head: "Available", width: "14%", hide: undefined },
  { head: "Target", width: "21%", hide: "sm" },
] as const;
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
    sheet?: string;
  }>;
}) {
  const q = await searchParams;
  let selected = q.month;
  try {
    if (selected) budgetMonth(selected);
  } catch {
    selected = undefined;
  }
  // No month means the current one, and the shell already read that ledger.
  const s = selected ? await financePage(selected) : await financePage();
  const user = await requireUser();
  const attention = await getAttention(user.userId, s.budget.id);
  // An adopted payoff plan asks, once a month, to set that month's payments.
  const debtPlan = await getDebtPlan(user.userId, s.budget.id);
  const planDue =
    debtPlan !== null && debtPlan.appliedMonth !== s.today.slice(0, 7);
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
  const viewQuery = q.view ? `&view=${encodeURIComponent(q.view)}` : "";
  const here = `/budget?month=${s.month}${viewQuery}`;
  const rowOf = (id: string) => p.categories.find((r) => r.id === id)!;
  const isUncategorized = (c: { system: boolean; paymentAccountId: string | null }) =>
    c.system && !c.paymentAccountId;
  const uncategorizedCategory = visible.find(isUncategorized);
  const uncategorizedRow = uncategorizedCategory
    ? rowOf(uncategorizedCategory.id)
    : null;
  const uncategorized =
    uncategorizedCategory &&
    uncategorizedRow &&
    (uncategorizedRow.assigned || uncategorizedRow.activity || uncategorizedRow.available)
      ? uncategorizedCategory
      : null;
  const ledgerGroups = [
    ...(uncategorized
      ? [{ id: UNCATEGORIZED_GROUP, name: "Needs a category", system: true, hidden: false }]
      : []),
    ...s.groups,
  ];
  const catsOf = (g: (typeof ledgerGroups)[number]) =>
    g.id === UNCATEGORIZED_GROUP
      ? uncategorized
        ? [uncategorized]
        : []
      : visible.filter((c) => c.groupId === g.id && !isUncategorized(c));
  // An empty group still shows in the full plan, so its first category can
  // be added right here.
  const shownGroups = ledgerGroups.filter(
    (g) =>
      catsOf(g).length > 0 || (selectedView === "ALL" && !g.hidden && !g.system),
  );
  if (await isPhone())
    return (
      <PhoneBudget
        s={s}
        view={selectedView}
        sheet={q.sheet}
        groups={shownGroups
          .map((g) => ({ id: g.id, name: g.name, categories: catsOf(g) }))
          .filter((g) => g.categories.length > 0)}
        inspected={inspected}
        recent={inspectRecent}
        coverFrom={inspected ? coverFrom(inspected.id) : []}
      />
    );
  const notices = [
    viewUnderfunded > 0n,
    overAssigned,
    p.cashDeficit > 0n || p.creditDeficit > 0n,
    planDue,
    attention.length > 0,
    p.releasedReserves > 0n,
    hiddenCategories.length > 0,
    setupHidden && steps.some((step) => !step.done),
  ].some(Boolean);
  return (
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        title="Budget"
        actions={
          <>
            <MonthSwitcher
              month={s.month}
              today={s.today}
              path="/budget"
              query={viewQuery}
              label="Budget month"
            />
            {active.length > 0 && (
              <Popover
                summary={
                  <h2 className="text-[0.8125rem] font-medium">Auto-Assign</h2>
                }
                className="auto-assign"
                align="right"
                open={Boolean(autoMode) || undefined}
                panelClassName="w-[min(26rem,calc(100vw-2rem))]"
                id="auto-assign"
              >
                <section aria-label="Auto-Assign options">
                  <p className={MUTED}>
                    Preview assignments from your history, or reset this
                    month, before applying. A preview changes no money.
                  </p>
                  <Form
                    action="/budget"
                    scroll={false}
                    className="finance-form mt-3"
                  >
                    <input type="hidden" name="month" value={s.month} />
                    {q.view && (
                      <input type="hidden" name="view" value={q.view} />
                    )}
                    <div className="field-grid" data-cols="2">
                      <label>
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
                      <label>
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
                    </div>
                    <div className="form-actions">
                      <button className="btn btn-secondary" type="submit">
                        Preview
                      </button>
                    </div>
                  </Form>
                  {autoPreview && (
                    <div className="mt-3 border-t border-hairline pt-3">
                      <p className={MUTED}>
                        {autoPreview.changes.length} categor
                        {autoPreview.changes.length === 1 ? "y" : "ies"}{" "}
                        change. Ready to Assign:{" "}
                        <Amount>{usd(autoPreview.readyBefore)}</Amount> →{" "}
                        <Amount>{usd(autoPreview.readyAfter)}</Amount>.
                      </p>
                      {autoPreview.changes.length > 0 && (
                        <>
                          <ul className="mt-2 max-h-48 overflow-y-auto text-table text-ink-2">
                            {autoPreview.changes.map((change) => (
                              <li
                                className="flex justify-between gap-2 border-b border-hairline py-1 last:border-b-0"
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
                          <div className="mt-3">
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
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </section>
              </Popover>
            )}
            <Popover
              summary="Move money"
              className="move-money"
              align="right"
              panelClassName="w-[min(24rem,calc(100vw-2rem))]"
            >
              <FinanceForm
                budgetId={s.budget.id}
                command={{ type: "move", month: s.month }}
                label="Move money"
                reset
              >
                <label>
                  From category
                  <select
                    name="from"
                    required
                    aria-label="Move money from category"
                  >
                    <option value="READY_TO_ASSIGN">Ready to Assign</option>
                    {active.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  To category
                  <select name="to" required aria-label="Move money to category">
                    <option value="READY_TO_ASSIGN">Ready to Assign</option>
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
              </FinanceForm>
            </Popover>
            <Popover
              summary={
                <>
                  Money moves
                  <span className="text-ink-3">({moves.length})</span>
                </>
              }
              className="money-moves"
              id="money-moves"
              role="region"
              ariaLabel="Money moves"
              align="right"
              open={q.moves !== undefined || undefined}
              panelClassName="w-[min(26rem,calc(100vw-2rem))]"
            >
              <p className={MUTED}>
                Every assignment and move this month, newest first.
              </p>
              <Form
                action="/budget"
                scroll={false}
                className="finance-form finance-form-inline mt-2"
              >
                <input type="hidden" name="month" value={s.month} />
                {q.view && <input type="hidden" name="view" value={q.view} />}
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Category</span>
                  <select
                    name="moves"
                    defaultValue={movesCategory?.id ?? ""}
                    aria-label="Category"
                    className="w-full!"
                  >
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
                <button className="btn btn-secondary" type="submit">
                  Show moves
                </button>
              </Form>
              {moves.length === 0 ? (
                <p className={`mt-3 ${MUTED}`}>
                  No money has moved
                  {movesCategory ? ` in ${movesCategory.name}` : ""} this month.
                </p>
              ) : (
                <ol className="mt-2 divide-y divide-hairline">
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
                      <li className="money-move py-2" key={move.id}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-table font-medium text-ink">
                            {label}
                          </span>
                          <span className="text-num text-ink" data-numeric>
                            <Amount>{usd(amount)}</Amount>
                          </span>
                        </div>
                        <p className={MUTED}>
                          From {source} to {destination}
                        </p>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-meta text-ink-3">
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
                <p className={`mt-2 ${MUTED}`}>
                  Showing the 30 most recent of {moves.length}. Choose a
                  category to narrow the list.
                </p>
              )}
            </Popover>
          </>
        }
      />
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        <SummaryStrip ariaLabel="Budget totals">
          <Stat
            as="article"
            lead
            labelTag="h2"
            label="Ready to Assign"
            value={usd(p.readyToAssign)}
            tone={
              overAssigned
                ? "negative"
                : p.readyToAssign > 0n
                  ? "positive"
                  : "neutral"
            }
            note={
              <>
                {overAssigned
                  ? "More is assigned than the budget holds"
                  : p.readyToAssign === 0n
                    ? "Every dollar has a job"
                    : "Waiting to be assigned"}
                {" · "}
                <Link className={LINK} href="/guide#ready-to-assign">
                  What is Ready to Assign?
                </Link>
              </>
            }
          />
          <Stat
            label="Cash & positive card balances"
            value={usd(p.resources)}
            note="On-budget money backing your envelopes"
          />
          <Stat
            label="Reserved for future months"
            value={usd(p.futureReservations)}
            note="Assigned ahead, not available now"
          />
          <Stat
            label="Age of Money"
            value={
              s.ageOfMoney.days === null
                ? "—"
                : `${s.ageOfMoney.days} days`
            }
            note={
              s.ageOfMoney.days === null ? (
                <>
                  <span className="sr-only">Age of Money: </span>not enough
                  history ({s.ageOfMoney.sampleCount}/10 cash outflows)
                </>
              ) : (
                "Average age of the cash you spend"
              )
            }
          />
        </SummaryStrip>
        {notices && (
          <div className="mt-3">
            <NoticeList>
              {viewUnderfunded > 0n && (
                <Notice
                  tone="warning"
                  action={
                    <>
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{
                          type: "target.fund",
                          month: s.month,
                          ...(selectedView === "ALL"
                            ? {}
                            : { view: selectedView }),
                        }}
                        label="Assign what targets need"
                        inline
                      />
                      <Help label="About funding targets" align="right">
                        Assigning fills every target below. If that is more
                        than you have, it still fills them and tells you by
                        how much, leaving Ready to Assign negative for you to
                        resolve.
                      </Help>
                    </>
                  }
                >
                  <strong>
                    Targets {selectedView === "ALL" ? "" : "in this view "}need{" "}
                    <Amount>{usd(viewUnderfunded)}</Amount> this month.
                  </strong>
                </Notice>
              )}
              {overAssigned && (
                <Notice as="aside" tone="negative">
                  <strong>You have assigned more than you have</strong>. Ready
                  to Assign is <Amount>{usd(p.readyToAssign)}</Amount>. Nothing
                  is broken and no money was invented: categories are holding
                  more than the budget contains. Move money out of a category,
                  or reduce an assignment, until this reaches zero.
                </Notice>
              )}
              {(p.cashDeficit > 0n || p.creditDeficit > 0n) && (
                <Notice tone="warning">
                  <strong>Cover overspending.</strong> Cash / payment funding
                  deficit: <Amount>{usd(p.cashDeficit)}</Amount>. Unfunded card
                  spending: <Amount>{usd(p.creditDeficit)}</Amount>. Cash
                  deficits reduce next month’s Ready to Assign; unfunded card
                  spending remains debt.
                </Notice>
              )}
              {planDue && (
                <section
                  className="debt-plan-due"
                  aria-labelledby="debt-plan-due-heading"
                >
                  <Notice
                    tone="accent"
                    action={
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{ type: "debt.plan.apply" }}
                        label="Apply this month's payments"
                        inline
                      />
                    }
                  >
                    <h2
                      id="debt-plan-due-heading"
                      className="inline font-semibold"
                    >
                      Your payoff plan has this month&apos;s payments.
                    </h2>{" "}
                    They are applied automatically within a day, or apply them
                    now to set each card&apos;s payment target from
                    today&apos;s balances. Any change to make at your bank will
                    appear on the Debt page.{" "}
                    <Link className={LINK} href="/debt">
                      Review the plan
                    </Link>
                  </Notice>
                </section>
              )}
              {attention.map((item) => (
                <Notice
                  key={item.key}
                  tone={item.level === "act" ? "warning" : "info"}
                  action={
                    <Link className="btn btn-secondary btn-sm" href={item.href}>
                      {item.action}
                    </Link>
                  }
                >
                  {item.text}
                </Notice>
              ))}
              {p.releasedReserves > 0n && (
                <Notice>
                  Excess card payment reserves released this month:{" "}
                  <Amount>{usd(p.releasedReserves)}</Amount>.
                </Notice>
              )}
              {hiddenCategories.length > 0 && (
                <Notice>
                  <p className="inline">
                    {hiddenCategories.length} hidden categor
                    {hiddenCategories.length === 1 ? "y" : "ies"}
                    {" · "}
                    <Amount>{usd(hiddenAvailable)}</Amount> available. Open
                    Hidden and archived at the foot of the ledger to review or
                    unhide them.
                  </p>
                </Notice>
              )}
              {setupHidden && steps.some((step) => !step.done) && (
                <Notice>
                  {steps.filter((x) => x.done).length} of {steps.length} setup
                  steps done · <ShowSetup />
                </Notice>
              )}
            </NoticeList>
          </div>
        )}
        {showSetup && (
          <section
            className="surface mt-3 p-4"
            aria-labelledby="setup-heading"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="setup-heading" className="section-title">
                Getting started · {steps.filter((x) => x.done).length} of{" "}
                {steps.length} done
              </h2>
              <DismissSetup budgetId={s.budget.id} />
            </div>
            <ol className="setup-steps mt-2 grid gap-1 sm:grid-cols-2">
              {steps.map(({ step, done }) => (
                <li
                  key={step}
                  className={`flex items-start gap-2 text-table ${done ? "text-ink-3" : "text-ink"}`}
                >
                  <span
                    className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${done ? "border-positive bg-positive text-on-accent" : "border-hairline-strong"}`}
                    aria-hidden
                  >
                    {done && <Check size={11} />}
                  </span>
                  <span className="sr-only">{done ? "Done: " : "To do: "}</span>
                  <Link
                    className={`underline-offset-2 hover:underline ${done ? "line-through" : ""}`}
                    href={SETUP[step].href}
                  >
                    {SETUP[step].label}
                  </Link>
                </li>
              ))}
            </ol>
            <p className={`mt-2 ${MUTED}`}>
              Take these in any order and come back any time. The{" "}
              <Link className={LINK} href="/guide">
                guide
              </Link>{" "}
              explains each one.
            </p>
          </section>
        )}
        {/* The ledger keeps the full width; the category inspector opens as a
            drawer over it instead of taking a column beside it. */}
        <section className="surface mt-4" aria-label="Category ledger">
          <datalist id="stock-category-names">
            {stockNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-2 lg:px-4">
            <FocusedViewTabs
              budgetId={s.budget.id}
              month={s.month}
              selected={selectedView}
              explicit={Boolean(q.view)}
              views={viewOptions}
            />
            <div className="ml-auto flex items-center gap-2 py-1">
              <span className="text-meta text-ink-3">
                {visible.length} categories
              </span>
              <Popover
                summary={
                  <>
                    <Plus size={14} aria-hidden />
                    Add group
                  </>
                }
                className="add-group"
                summaryClassName="btn btn-ghost btn-sm"
                align="right"
                chevron={false}
                panelClassName="w-[min(36rem,calc(100vw-2rem))]"
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
                  <div className="suggested-categories mt-3 border-t border-hairline pt-2">
                    <h3 className="text-caps uppercase text-ink-3">
                      Or start from a stock group
                    </h3>
                    <p className={`mt-1 ${MUTED}`}>
                      Add a whole group, or only the categories you need.
                      Nothing is assigned until you assign it.
                    </p>
                    <div className="mt-2 space-y-3">
                      {stockOffers.map(({ suggestion, group, missing }) => (
                        <section
                          className="border-t border-hairline pt-2 first:border-0 first:pt-0"
                          key={suggestion.name}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h4 className="text-label text-ink">
                                {suggestion.name}
                              </h4>
                              <p className={`mt-0.5 ${MUTED}`}>
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
                          <ul className="mt-1 flex flex-wrap gap-1">
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
                                    category ? `Restore ${name}` : `Add ${name}`
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
              </Popover>
            </div>
          </div>
          {selectedView !== "ALL" && (
            <p className={`border-b border-hairline px-4 py-1.5 ${MUTED} lg:px-6`}>
              Showing {visible.length} of {active.length} visible categories.
              Ready to Assign and totals still cover the entire budget.
            </p>
          )}
          {!active.length && !hiddenCategories.length && (
            <EmptyState title="Your first spending plan">
              <Link className={LINK} href="/accounts">
                Add an account
              </Link>
              , then give your money jobs. Every dollar gets assigned, but
              assigning is labelling, not spending: money set aside for
              savings is still assigned. Use Add group above to name your own
              group or start from a stock group, then Add category under any
              group. Adding one never assigns money.
            </EmptyState>
          )}
          {!active.length && hiddenCategories.length > 0 && (
            <EmptyState title="All categories are hidden">
              Your money is still assigned. Open Hidden and archived below to
              show categories again.
            </EmptyState>
          )}
          {active.length > 0 && visible.length === 0 && (
            <EmptyState title="No categories in this view">
              Choose All to see the full plan. Your assignments and balances
              have not changed.
            </EmptyState>
          )}
          {/*
           * One table per group, with the group name in a bar above it rather
           * than in a spanning row: a row there would be matched by the suite's
           * getByRole("row") filters and collide with the category of the same
           * name. table-fixed plus a shared colgroup keeps every group's
           * columns on the same vertical lines; one visible header table sits
           * above all of them, each table keeps its own for assistive
           * technology. Uncategorized is a system category that lives in the
           * card-payments group in the data; here it gets a bar of its own,
           * and only while something is in it.
           */}
          {(visible.length > 0 || selectedView === "ALL") && (
            <table className="ledger ledger-head table-fixed" aria-hidden>
              <colgroup>
                {LEDGER_COLUMNS.map(({ head, width, hide }) => (
                  <col key={head} style={{ width }} data-hide={hide} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {LEDGER_COLUMNS.map(({ head, hide }) => (
                    <th
                      className={
                        head === "Category"
                          ? ""
                          : head === "Assigned"
                            ? "num assigned-head"
                            : "num"
                      }
                      data-hide={hide}
                      key={head}
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
            </table>
          )}
          {(visible.length > 0 || selectedView === "ALL") && (
            <BudgetDnd
              budgetId={s.budget.id}
              enabled={selectedView === "ALL"}
              groups={shownGroups
                .filter((g) => !g.system)
                .map((g) => g.id)}
              categories={Object.fromEntries(
                shownGroups
                  .filter((g) => g.id !== UNCATEGORIZED_GROUP)
                  .map((g) => [g.id, catsOf(g).map((c) => c.id)]),
              )}
            >
            {shownGroups.map((g) => {
              const cats = catsOf(g);
              const groupIndex = groups.findIndex((x) => x.id === g.id);
              const totals = cats.reduce(
                (sum, c) => {
                  const r = rowOf(c.id);
                  return {
                    assigned: sum.assigned + r.assigned,
                    activity: sum.activity + r.activity,
                    available: sum.available + r.available,
                  };
                },
                { assigned: 0n, activity: 0n, available: 0n },
              );
              const offer = stock.find((item) => item.group?.id === g.id);
              return (
                <DndGroupBlock
                  key={g.id}
                  id={g.id}
                  name={g.name}
                  system={g.system}
                  pseudo={g.id === UNCATEGORIZED_GROUP}
                >
                  <div className="ledger-group">
                    {g.id !== UNCATEGORIZED_GROUP && <DragHandle />}
                    {cats.length > 0 && <GroupToggle id={g.id} name={g.name} />}
                    {g.system ? (
                      <h3>{g.name}</h3>
                    ) : (
                      <Popover
                        className="group-settings"
                        label={`Edit group ${g.name}`}
                        summaryClassName="btn btn-ghost btn-sm -ml-2 px-2"
                        panelClassName="w-72"
                        summary={<h3>{g.name}</h3>}
                        chevron={false}
                      >
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
                        <div className="mt-2 flex flex-wrap gap-1">
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
                        <details className="delete-group mt-3 border-t border-hairline pt-2">
                          <summary className="cursor-pointer text-label text-negative">
                            Delete group…
                          </summary>
                          <p className={`mt-1 ${MUTED}`}>
                            Deletes {g.name} and its categories. Any category
                            holding money must be emptied first; one with past
                            transactions is archived instead, so your history
                            still adds up.
                          </p>
                          <div className="mt-2">
                            <FinanceForm
                              budgetId={s.budget.id}
                              command={{ type: "group.delete", id: g.id }}
                              label={`Delete ${g.name}`}
                              inline
                              closeDetailsOnSave
                            />
                          </div>
                        </details>
                      </Popover>
                    )}
                    {cats.length > 0 && (
                      <span
                        className="hidden items-center gap-4 text-meta text-ink-3 sm:ml-auto sm:flex"
                        data-numeric
                      >
                        <span>
                          Assigned{" "}
                          <span className="text-ink-2">
                            <Amount>{usd(totals.assigned)}</Amount>
                          </span>
                        </span>
                        <span>
                          Activity{" "}
                          <span className="text-ink-2">
                            <Amount>{usd(totals.activity)}</Amount>
                          </span>
                        </span>
                        <span>
                          Available{" "}
                          <span
                            className={
                              totals.available < 0n
                                ? "text-negative"
                                : "text-ink-2"
                            }
                          >
                            <Amount>{usd(totals.available)}</Amount>
                          </span>
                        </span>
                      </span>
                    )}
                    {!g.system && (
                      <Popover
                        className={`add-category ${cats.length > 0 ? "" : "sm:ml-auto"}`}
                        summary={
                          <>
                            <Plus size={14} aria-hidden />
                            Add category
                          </>
                        }
                        summaryClassName="btn btn-ghost btn-sm -mr-2"
                        align="right"
                        chevron={false}
                        panelClassName="w-80"
                      >
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
                        {offer && offer.missing.length > 0 && (
                          <div className="stock-chips mt-2">
                            <p className={MUTED}>Suggested for {g.name}</p>
                            <ul className="mt-1 flex flex-wrap gap-1">
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
                                    inspectCreatedCategoryMonth={s.month}
                                  />
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </Popover>
                    )}
                  </div>
                  {!cats.length && (
                    <p className={`px-4 py-2 ${MUTED} lg:px-6`}>
                      No categories yet. Use Add category above.
                    </p>
                  )}
                  {cats.length > 0 && (
                    <div
                      className="ledger-body max-sm:overflow-x-auto"
                      tabIndex={0}
                      role="region"
                      aria-label={`${g.name} categories`}
                    >
                      <table className="ledger table-fixed">
                        <caption className="sr-only">
                          {g.name} budget for {s.month}
                        </caption>
                        <colgroup>
                          {LEDGER_COLUMNS.map(({ head, width, hide }) => (
                            <col
                              key={head}
                              style={{ width }}
                              data-hide={hide}
                            />
                          ))}
                        </colgroup>
                        <thead>
                          <tr className="sr-only">
                            {LEDGER_COLUMNS.map(({ head, hide }) => (
                              <th
                                className={head === "Category" ? "" : "num"}
                                data-hide={hide}
                                key={head}
                                scope="col"
                              >
                                {head}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {cats.map((c) => {
                            const r = rowOf(c.id);
                            const t = s.targets.find(
                              (x) => x.categoryId === c.id,
                            );
                            const covers =
                              r.available < 0n ? coverFrom(c.id) : [];
                            return (
                              <DndRow
                                key={c.id}
                                categoryId={c.id}
                                name={c.name}
                                groupId={g.id}
                                payment={Boolean(c.paymentAccountId)}
                                movable={g.id !== UNCATEGORIZED_GROUP}
                                data-selected={
                                  inspected?.id === c.id ? "" : undefined
                                }
                              >
                                <th scope="row">
                                  {g.id !== UNCATEGORIZED_GROUP && (
                                    <DragHandle />
                                  )}
                                  <Link
                                    className="underline-offset-2 hover:underline"
                                    href={`/budget?month=${s.month}&inspect=${c.id}${viewQuery}#inspector-heading`}
                                    aria-current={
                                      inspected?.id === c.id
                                        ? "true"
                                        : undefined
                                    }
                                  >
                                    {c.name}
                                  </Link>
                                  {c.paymentAccountId && (
                                    <span className="ledger-sub">
                                      Payment reserve
                                    </span>
                                  )}
                                  {t && <TargetBar target={t} />}
                                  <span className="ledger-sub sm:hidden">
                                    Assigned <Amount>{usd(r.assigned)}</Amount>
                                    {" · "}
                                    <Link
                                      className="underline-offset-2 hover:underline"
                                      href={`/accounts/register?category=${c.id}&from=${s.month}-01&through=${monthLast}`}
                                      aria-label={`${c.name} activity this month`}
                                    >
                                      Activity <Amount>{usd(r.activity)}</Amount>
                                    </Link>
                                  </span>
                                  {t && (
                                    <span className="ledger-sub sm:hidden">
                                      {t.snoozed ? (
                                        "Target snoozed"
                                      ) : t.progress.contribution > 0n ||
                                        t.progress.needed > 0n ? (
                                        <TargetDetail
                                          target={t}
                                          budgetId={s.budget.id}
                                          month={s.month}
                                          categoryId={c.id}
                                          name={c.name}
                                        />
                                      ) : (
                                        TARGET_STATE[t.progress.state]
                                      )}
                                    </span>
                                  )}
                                </th>
                                {/* Assigning happens in the Assigned column, so
                                    it stays clear of the inspector drawer. */}
                                <td className="assigned-cell num">
                                  <div className="flex items-center justify-end gap-1">
                                    <span className="text-num text-ink max-sm:hidden">
                                      <Amount>{usd(r.assigned)}</Amount>
                                    </span>
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
                                      buttonClassName="btn-sm assign-button"
                                    >
                                      <label className="w-18">
                                        <span className="sr-only">
                                          Change {c.name} assignment
                                        </span>
                                        <input
                                          name="amount"
                                          required
                                          inputMode="decimal"
                                          placeholder="+ / −"
                                          className="assign-input w-full!"
                                          aria-label={`Change ${c.name} assignment`}
                                        />
                                      </label>
                                    </FinanceForm>
                                  </div>
                                </td>
                                <td className="num text-ink-2" data-hide="sm">
                                  <Link
                                    className="underline-offset-2 hover:underline"
                                    href={`/accounts/register?category=${c.id}&from=${s.month}-01&through=${monthLast}`}
                                    aria-label={`${c.name} activity this month`}
                                  >
                                    <Amount>{usd(r.activity)}</Amount>
                                  </Link>
                                </td>
                                <td className="num">
                                  <span className="inline-flex items-center gap-1">
                                    <AmountPill
                                      amount={r.available}
                                      underfunded={Boolean(
                                        t &&
                                          !t.snoozed &&
                                          t.progress.contribution > 0n,
                                      )}
                                    />
                                    {covers.length > 0 && (
                                      <Popover
                                        className="cover-overspending"
                                        summary="Cover"
                                        summaryClassName="btn btn-ghost btn-sm text-negative"
                                        align="right"
                                        panelClassName="w-72 text-left"
                                      >
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
                                              {covers.map((o) => (
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
                                      </Popover>
                                    )}
                                  </span>
                                </td>
                                <td className="num" data-hide="sm">
                                  {!t ? (
                                    <span className="text-meta text-ink-3">
                                      No target
                                    </span>
                                  ) : (
                                    <TargetState
                                      state={
                                        t.snoozed ? "SNOOZED" : t.progress.state
                                      }
                                      detail={
                                        <TargetDetail
                                          target={t}
                                          budgetId={s.budget.id}
                                          month={s.month}
                                          categoryId={c.id}
                                          name={c.name}
                                        />
                                      }
                                    />
                                  )}
                                </td>
                              </DndRow>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </DndGroupBlock>
              );
            })}
            </BudgetDnd>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline px-4 py-1.5 lg:px-6">
            <span className={`flex items-center gap-1 ${MUTED}`}>
              Assigned: enter an amount to add, or a negative amount to return
              money.
              <Help label="About assigning">
                Enter an amount to add to Assigned, or a negative amount to
                return available money to Ready to Assign. Assignments never
                move money between accounts.
              </Help>
            </span>
            <details
              className="ml-auto text-meta"
              aria-label="Hidden and archived"
            >
              <summary className="cursor-pointer py-1 text-label text-ink-2 hover:text-ink">
                Hidden and archived ({hiddenGroups.length + tucked.length})
              </summary>
              {hiddenGroups.length + tucked.length === 0 ? (
                <p className={`py-1 ${MUTED}`}>Nothing is hidden or archived.</p>
              ) : (
                <>
                  <p className={`py-1 ${MUTED}`}>
                    Hidden categories keep their money and history. Bring one
                    back, or open it to change it.
                  </p>
                  <ul className="divide-y divide-hairline">
                    {hiddenGroups.map((g) => (
                      <li
                        key={g.id}
                        className="hidden-item flex flex-wrap items-center justify-between gap-2 py-1"
                      >
                        <span className="text-table text-ink">
                          {g.name}{" "}
                          <span className="text-ink-3">· Hidden group</span>
                        </span>
                        <FinanceForm
                          budgetId={s.budget.id}
                          command={{
                            type: "group.hide",
                            id: g.id,
                            hidden: false,
                          }}
                          label="Unhide group"
                          inline
                        />
                      </li>
                    ))}
                    {tucked.map((c) => (
                      <li
                        key={c.id}
                        className="hidden-item flex flex-wrap items-center justify-between gap-2 py-1"
                      >
                        <span className="text-table text-ink">
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
                          <span className="text-ink-3">
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
                            command={{
                              type: "category.hide",
                              id: c.id,
                              hidden: false,
                            }}
                            label="Unhide category"
                            inline
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </details>
          </div>
        </section>
        <details className="surface mt-4 p-4">
          <summary className="cursor-pointer text-label text-ink-2 hover:text-ink">
            Manage focused views
          </summary>
          <p className={`mt-2 ${MUTED}`}>
            Save up to 12 category selections. Views filter the plan on this
            page; they never move or hide money.
          </p>
          {s.views.length < 12 && (
            <div className="mt-3">
              <h3 className="text-label text-ink">New view</h3>
              <FinanceForm
                budgetId={s.budget.id}
                command={{ type: "view.save" }}
                label="Create view"
              >
                <label>
                  Name
                  <input name="name" required maxLength={80} />
                </label>
                <fieldset className="mt-2">
                  <legend className="text-label text-ink-2">Categories</legend>
                  <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
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
            <div className="mt-3 space-y-1">
              {s.views.map((view, index) => (
                <details
                  className="rounded-md border border-hairline px-3 py-2"
                  key={view.id}
                >
                  <summary className="cursor-pointer text-table font-medium text-ink">
                    {view.name} · {view.categoryIds.length} categories
                  </summary>
                  <div className="mt-2">
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
                      <fieldset className="mt-2">
                        <legend className="text-label text-ink-2">
                          Categories
                        </legend>
                        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
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
                    <div className="mt-2 flex flex-wrap gap-1">
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
      </div>
      {inspected && inspectRow && (
        <Drawer
          key={inspected.id}
          headingId="inspector-heading"
          eyebrow={
            s.groups.find((g) => g.id === inspected.groupId)?.name ??
            "Category"
          }
          title={inspected.name}
          closeHref={here}
          footer={
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-meta">
              <Link
                className={LINK}
                href={`/accounts/register?category=${inspected.id}&from=${s.month}-01&through=${monthLast}`}
              >
                All transactions
              </Link>
              <Link
                className={LINK}
                href={`/budget?month=${s.month}&moves=${inspected.id}#money-moves`}
              >
                Money moves
              </Link>
              {!inspected.system && (
                <Link
                  className={LINK}
                  href={`/accounts/schedules?categoryId=${inspected.id}`}
                >
                  Add recurring schedule
                </Link>
              )}
              {(!inspected.system || inspected.paymentAccountId) && (
                <Link
                  className={LINK}
                  href={`/budget?month=${s.month}&autoMode=LAST_ASSIGNED&autoCategory=${inspected.id}#auto-assign`}
                >
                  Auto-Assign
                </Link>
              )}
            </p>
          }
        >
          <dl className="category-inspector grid grid-cols-2 gap-x-4 gap-y-2 text-table">
            {(
              [
                ["Left over from last month", inspectRow.carry],
                ["Assigned this month", inspectRow.assigned],
                ["Cash spending", inspectSpending.cash],
                ["Credit spending", inspectSpending.credit],
              ] as const
            ).map(([label, amount]) => (
              <div key={label}>
                <dt className="text-meta text-ink-3">{label}</dt>
                <dd className="text-num text-ink" data-numeric>
                  <Amount>{usd(amount)}</Amount>
                </dd>
              </div>
            ))}
            <div className="col-span-2 flex items-baseline justify-between border-t border-hairline pt-2">
              <dt className="text-label text-ink">Available</dt>
              <dd
                className={`text-figure ${inspectRow.available < 0n ? "text-negative" : "text-ink"}`}
                data-numeric
              >
                <Amount>{usd(inspectRow.available)}</Amount>
              </dd>
            </div>
          </dl>
          {(!inspected.system || inspected.paymentAccountId) && (
            <DrawerSection title="Assign">
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
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Assign to {inspected.name}</span>
                  <input
                    name="amount"
                    required
                    inputMode="decimal"
                    className="w-full!"
                    placeholder="Add or subtract, e.g. 25.00"
                    aria-label={`Assign to ${inspected.name}`}
                  />
                </label>
              </FinanceForm>
              {inspectRow.available > 0n && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
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
                </div>
              )}
              <p className={`mt-2 ${MUTED}`}>
                A negative amount returns part of this money, including what
                was left over from last month.
              </p>
            </DrawerSection>
          )}
          {inspectCard && (
            <DrawerSection title="Card">
              {inspectTerms ? (
                <p className={`card-terms ${MUTED}`}>
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
                    className={LINK}
                    href={`/debt?account=${inspectCard.id}#terms`}
                  >
                    Edit terms
                  </Link>
                </p>
              ) : (
                <p className={`card-terms ${MUTED}`}>
                  No terms recorded.{" "}
                  <Link
                    className={LINK}
                    href={`/debt?account=${inspectCard.id}#terms`}
                  >
                    Record the terms
                  </Link>{" "}
                  with a due day to set this envelope&apos;s payment target.
                </p>
              )}
              {inspectTerms?.dueDay && !inspectTarget ? (
                <div className="mt-3">
                  <FinanceForm
                    budgetId={s.budget.id}
                    command={{
                      type: "debt.payment.setup",
                      accountId: inspectCard.id,
                    }}
                    label="Set up payment"
                  >
                    <p className={MUTED}>
                      Set a monthly payment target here, due on day{" "}
                      {inspectTerms.dueDay}, from these terms. Nothing is
                      scheduled; the payment is recorded when you make it.
                    </p>
                    <div className="field-grid" data-cols="2">
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
                </div>
              ) : null}
            </DrawerSection>
          )}
          <DrawerSection
            title="Target"
            action={
              <Help label="Targets and schedules" align="right">
                <span className="target-schedule-help">
                  A <strong>target</strong> is how much this envelope needs. A{" "}
                  <strong>schedule</strong> is the real transaction that will
                  hit an account.
                  {inspectCard
                    ? " Paying the card is a transfer from checking to the card, with no category: the money comes out of this envelope, which also collects what you spend on the card from funded categories."
                    : ""}
                </span>
              </Help>
            }
          >
            <p className={MUTED}>
              {inspectTarget
                ? inspectTarget.snoozed
                  ? "Snoozed this month."
                  : inspectTarget.progress.contribution > 0n
                    ? `Needs ${usd(inspectTarget.progress.contribution)} more this month.`
                    : "Funded for this month."
                : "No target yet. A target says how much this category needs and when."}
              {inspectTarget?.dueDay !== undefined &&
                ` Due on day ${inspectTarget.dueDay}.`}
              {inspectTarget?.planned &&
                " This amount is what your payoff plan pays this month; the plan sets it when the month comes. Setting a target here instead takes this card out of the plan's hands."}
            </p>
            {inspectTarget &&
              !inspectTarget.snoozed &&
              inspectTarget.progress.contribution > 0n && (
                <div className="mt-2">
                  <FinanceForm
                    budgetId={s.budget.id}
                    command={{
                      type: "target.fund",
                      month: s.month,
                      categoryId: inspected.id,
                    }}
                    label={
                      <>
                        Assign{" "}
                        <Amount>
                          {usd(inspectTarget.progress.contribution)}
                        </Amount>
                      </>
                    }
                    buttonLabel={`Assign ${usd(inspectTarget.progress.contribution)} to ${inspected.name}`}
                    inline
                  />
                </div>
              )}
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
          </DrawerSection>
          {(!inspected.system || inspected.paymentAccountId) && (
            <DrawerSection title="Upcoming">
              {inspectSchedules.length ? (
                <ul className="category-schedules divide-y divide-hairline text-table">
                  {inspectSchedules.map((item) => (
                    <li
                      className="flex flex-wrap items-baseline justify-between gap-1 py-1.5"
                      key={item.id}
                    >
                      <span className="min-w-0 text-ink">
                        {item.name}
                        <span className="ledger-sub">
                          {item.next
                            ? `Next ${formatDate(item.next, s.budget.dateFormat)}`
                            : "No more occurrences"}
                          {item.transferAccountId
                            ? ` · from ${s.accounts.find((a) => a.id === item.accountId)?.name ?? "account"}`
                            : ""}
                          {item.managed
                            ? " · kept in step with the card's terms"
                            : ""}
                        </span>
                      </span>
                      <span className="flex items-baseline gap-2">
                        <span className="text-num text-ink" data-numeric>
                          <Amount>
                            {usd(item.amount < 0n ? -item.amount : item.amount)}
                          </Amount>
                        </span>
                        <Link
                          className={LINK}
                          href={`/accounts/schedules?schedule=${item.id}`}
                          aria-label={`Edit schedule ${item.name}`}
                        >
                          Edit
                        </Link>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={MUTED}>
                  {inspectCard
                    ? "No payment scheduled."
                    : "Nothing scheduled from this envelope."}
                </p>
              )}
            </DrawerSection>
          )}
          <DrawerSection title="This month's transactions">
            {inspectRecent.length ? (
              <ul className="divide-y divide-hairline">
                {inspectRecent.slice(0, 5).map((t) => (
                  <li
                    key={t.id}
                    className="flex justify-between gap-2 py-1 text-table"
                  >
                    <span className="min-w-0 truncate text-ink">
                      <span className="text-ink-3">
                        {formatDate(t.date, s.budget.dateFormat)}
                      </span>{" "}
                      {t.payee || "No payee"}
                    </span>
                    <span className="text-num text-ink-2" data-numeric>
                      <Amount>{usd(t.amount)}</Amount>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={MUTED}>None yet.</p>
            )}
          </DrawerSection>
          {!inspected.system && (
            <>
              <DrawerSection title="Notes">
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
              </DrawerSection>
              <details className="category-settings mt-5">
                <summary className="flex cursor-pointer items-center justify-between gap-2 border-b border-hairline pb-1">
                  <span className="text-caps uppercase text-ink-3">
                    Rename, move or hide
                  </span>
                  <span className="text-meta text-ink-3">▾</span>
                </summary>
                <div className="mt-2">
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
                  <div className="mt-2 flex flex-wrap gap-1">
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
                  <details className="delete-category mt-3 border-t border-hairline pt-2">
                    <summary className="cursor-pointer text-label text-negative">
                      Delete category…
                    </summary>
                    <p className={`mt-1 ${MUTED}`}>
                      {inspectRow.available !== 0n ? (
                        <>
                          It holds <Amount>{usd(inspectRow.available)}</Amount>.
                          Move that to another category, or assign a negative
                          amount above to return it to Ready to Assign, before
                          deleting.
                        </>
                      ) : (
                        "A category you never used is deleted outright. One with past transactions is archived instead, so your history still adds up; restore it from Hidden and archived."
                      )}
                    </p>
                    <div className="mt-2">
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{ type: "category.delete", id: inspected.id }}
                        label={`Delete ${inspected.name}`}
                        inline
                      />
                    </div>
                  </details>
                </div>
              </details>
            </>
          )}
        </Drawer>
      )}
    </main>
  );
}
/** A group's block: draggable, except the "Needs a category" stand-in. */
function DndGroupBlock({
  id,
  name,
  system,
  pseudo,
  children,
}: {
  id: string;
  name: string;
  system: boolean;
  pseudo: boolean;
  children: ReactNode;
}) {
  return pseudo ? (
    <div id={`group-${id}`} className="ledger-block">
      {children}
    </div>
  ) : (
    <DndGroup
      groupId={id}
      id={`group-${id}`}
      name={name}
      system={system}
      className="ledger-block"
    >
      {children}
    </DndGroup>
  );
}

function TargetState({
  state,
  detail,
}: {
  state: string;
  detail: ReactNode;
}) {
  // As in YNAB: yellow for a target still short this month, red only when
  // spending went past a limit (or, on the Available pill, past the money).
  const behind = ["BEHIND", "OVERDUE"].includes(state);
  const over = state === "EXCEEDED";
  const met = ["MET", "ON_TRACK"].includes(state);
  return (
    <span className="flex flex-col items-end">
      <span
        className={`text-label ${
          over
            ? "text-negative"
            : behind
              ? "text-warning"
              : met
                ? "text-positive"
                : "text-ink"
        }`}
      >
        {TARGET_STATE[state as keyof typeof TARGET_STATE]}
      </span>
      <span className="text-meta text-ink-3">{detail}</span>
    </span>
  );
}
