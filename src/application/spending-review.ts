import { getDb } from "@/infrastructure/db";
import { authorize, load, today, type Tx } from "./finance";
import { loadReportInput } from "./reports";
import { nextMonth, projectBudget } from "@/domain/budget";
import { moneyMoves } from "@/domain/money-moves";
import {
  filtered,
  monthEnd,
  reportLines,
  type ReportFilter,
  type ReportInput,
} from "@/domain/reports";
import {
  coveredOverspending,
  misfits,
  subscriptions,
  unplannedSummary,
  type CategoryMonth,
} from "@/domain/spending-review";

/** Months a misfit is compared against, and subscriptions are looked for in. */
const HISTORY_MONTHS = 6;
const SUBSCRIPTION_MONTHS = 13;
/** Projecting the budget once per month is the costly part; cap the range. */
const MAX_PROJECTED_MONTHS = 24;

/** "Kept" subscriptions share RecurringDismissal with Schedules' suggestions. */
export const KEEP_PREFIX = "review:";

/**
 * Spending review for a range of months, read inside the caller's
 * transaction. Nothing here writes.
 */
export async function spendingReviewIn(
  tx: Tx,
  budgetId: string,
  input: ReportInput,
  from: string,
  through: string,
  todayDate: string,
  filter: ReportFilter = {},
) {
  const data = await load(tx, budgetId);
  const historyFrom = nextMonth(from, -HISTORY_MONTHS);
  const lines = filtered(
    reportLines(input, { from: `${historyFrom}-01`, through: monthEnd(through) }),
    filter,
  );
  const inPeriod = lines.filter((l) => l.date >= `${from}-01`);

  const months: string[] = [];
  for (let m = from; m <= through && months.length < MAX_PROJECTED_MONTHS; m = nextMonth(m))
    months.push(m);
  const rows: CategoryMonth[] = months.flatMap((month) =>
    projectBudget(data.input, month)
      .categories.filter(
        (c) =>
          !c.paymentAccountId &&
          (!filter.categoryIds || filter.categoryIds.has(c.id)),
      )
      .map((c) => ({
        categoryId: c.id,
        month,
        start: c.carry,
        assigned: c.assigned,
        activity: c.activity,
      })),
  );

  const since = nextMonth(todayDate.slice(0, 7), -SUBSCRIPTION_MONTHS);
  const [schedules, kept] = await Promise.all([
    tx.schedule.findMany({
      where: { budgetId, archived: false, replacedById: null },
      select: { accountId: true, amount: true, payee: true },
    }),
    tx.recurringDismissal.findMany({
      where: { budgetId, key: { startsWith: KEEP_PREFIX } },
      select: { key: true },
    }),
  ]);
  const keptKeys = new Set(kept.map((k) => k.key.slice(KEEP_PREFIX.length)));
  const repeats = subscriptions(
    input.transactions
      .filter(
        (t) =>
          t.date >= `${since}-01` &&
          (!filter.accountIds || filter.accountIds.has(t.accountId)),
      )
      .map((t) => ({
        id: t.id,
        accountId: t.accountId,
        payee: t.payee,
        date: t.date,
        amount: t.amount,
        kind: t.kind as "EXPENSE",
      })),
    todayDate,
    schedules,
  );

  return {
    unplanned: unplannedSummary(inPeriod, data.reviews),
    misfits: misfits(lines, `${from}-01`, monthEnd(through), data.reviews),
    covered: coveredOverspending(rows, moneyMoves(data.assignments)),
    coveredMonthsCapped: months.at(-1) !== through,
    categoryNames: new Map(input.categories.map((c) => [c.id, c.name])),
    subscriptions: repeats.filter((s) => !keptKeys.has(s.key)),
    kept: repeats.filter((s) => keptKeys.has(s.key)),
  };
}

/** This month's headline figures, for the Budget page card. */
export async function spendingReviewSummary(userId: string, budgetId: string) {
  return getDb().$transaction(
    async (tx) => {
      const budget = await authorize(tx, userId, budgetId);
      const todayDate = today(budget.timezone);
      const month = todayDate.slice(0, 7);
      const { input } = await loadReportInput(tx, budgetId);
      const r = await spendingReviewIn(tx, budgetId, input, month, month, todayDate);
      return {
        month,
        unplanned: r.unplanned.total,
        toReview: r.misfits.length,
        covered: r.covered.reduce((n, c) => n + c.covered, 0n),
        yearlyRepeats: r.subscriptions.reduce((n, s) => n + s.yearly, 0n),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
}
