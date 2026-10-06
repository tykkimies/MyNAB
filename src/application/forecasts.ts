import { z } from "zod";
import { getDb } from "@/infrastructure/db";
import { parseUSD } from "@/domain/money";
import { nextMonth } from "@/domain/budget";
import { balancesAt, flows, isLiability, monthEnd } from "@/domain/reports";
import { forecast, type ForecastOccurrence } from "@/domain/forecast";
import { minimumDue, minimumRuleFor, monthlyInterest } from "@/domain/debt";
import { versionFor } from "@/domain/versions";
import { authorize, fail, today } from "./finance";
import { getSchedules } from "./schedules";
import { incomeSchedules, loadCashPlan, upcomingBills } from "./paychecks";
import { cashProjection, type CashEvent } from "@/domain/cash-projection";
import { occurrences } from "@/domain/schedules";
import { loadReportInput } from "./reports";

export const forecastQuery = z.object({
  months: z.coerce.number().int().default(3),
  spending: z.coerce.number().int().min(-100).max(200).default(0),
  extra: z.string().max(20).optional(),
  /** Daily cash: everyday spending from targets, or what was actually spent. */
  basis: z.enum(["plan", "actual"]).default("plan"),
  /** Daily cash: warn below this balance, in dollars. */
  cushion: z.string().max(20).optional(),
});
export type ForecastQuery = z.input<typeof forecastQuery>;

const TRACKED_DEBT = ["LOAN", "MORTGAGE", "OTHER_LIABILITY"];
const HISTORY_MONTHS = 3;
const DEFAULT_CUSHION = 50000n;
/** Daily cash: how far back "what I actually spent" looks. */
const ACTUAL_DAYS = 90;

/**
 * Everything the forecast needs, read once and never written. The assumptions
 * are shown back to the owner so every number can be checked.
 */
export async function getForecast(
  userId: string,
  budgetId: string,
  raw: ForecastQuery,
) {
  const parsed = forecastQuery.safeParse(raw);
  if (!parsed.success || ![1, 3, 6, 12].includes(parsed.data.months))
    fail("Choose a forecast of 1, 3, 6 or 12 months.");
  const query = parsed.data;
  let extraIncome = 0n;
  if (query.extra) {
    try {
      extraIncome = parseUSD(query.extra.trim());
    } catch {
      fail("Enter extra income such as 250 or 250.00.");
    }
    if (extraIncome < 0n) fail("Extra income cannot be negative.");
  }
  let cushion = DEFAULT_CUSHION;
  if (query.cushion?.trim()) {
    try {
      cushion = parseUSD(query.cushion.trim());
    } catch {
      fail("Enter a cushion such as 500 or 500.00.");
    }
    if (cushion < 0n) fail("The cushion cannot be negative.");
  }

  const snapshot = await getDb().$transaction(
    async (tx) => {
      const budget = await authorize(tx, userId, budgetId);
      const { input, accounts } = await loadReportInput(tx, budgetId);
      const [splits, terms] = await Promise.all([
        tx.scheduleSplit.findMany({ where: { budgetId } }),
        tx.debtTerms.findMany({ where: { budgetId } }),
      ]);
      return { budget, input, accounts, splits, terms };
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
  const now = today(snapshot.budget.timezone);
  const current = now.slice(0, 7);
  const end = monthEnd(nextMonth(current, query.months));
  // Schedules are read in windows the schedule query accepts (one year).
  const windows: Awaited<ReturnType<typeof getSchedules>>[] = [];
  for (let from = now; from <= end;) {
    const stop = new Date(`${from}T00:00:00Z`);
    stop.setUTCDate(stop.getUTCDate() + 300);
    const through =
      stop.toISOString().slice(0, 10) < end
        ? stop.toISOString().slice(0, 10)
        : end;
    windows.push(await getSchedules(userId, budgetId, from, through));
    stop.setUTCDate(stop.getUTCDate() + 1);
    from = stop.toISOString().slice(0, 10);
  }
  const schedules = {
    schedules: windows[0].schedules,
    upcoming: windows.flatMap((w) => w.upcoming),
  };

  const accounts = new Map(snapshot.accounts.map((a) => [a.id, a]));
  const onBudget = (id: string | null | undefined) =>
    Boolean(id && accounts.get(id)?.participation === "BUDGET");
  const balances = balancesAt(snapshot.input, now);
  const startPosition = snapshot.accounts
    .filter((a) => a.participation === "BUDGET" && !a.closed)
    .reduce((n, a) => n + (balances.get(a.id) ?? 0n), 0n);

  const active = schedules.schedules.filter(
    (s) => !s.archived && !s.replacedById,
  );
  const scheduled: ForecastOccurrence[] = schedules.upcoming
    .filter((o) => !o.handled && !o.schedule.archived)
    .map((o) => ({
      date: o.date,
      kind: o.schedule.kind as ForecastOccurrence["kind"],
      // Internal transfers move money between budget accounts: no effect.
      effect:
        (onBudget(o.schedule.accountId) ? o.schedule.amount : 0n) -
        (onBudget(o.schedule.transferAccountId) ? o.schedule.amount : 0n),
    }));

  // Recent history, over whole months only.
  const historyFrom = nextMonth(current, -HISTORY_MONTHS);
  const history = flows(snapshot.input, {
    from: `${historyFrom}-01`,
    through: monthEnd(nextMonth(current, -1)),
  });
  const scheduledCategories = new Set(
    snapshot.splits
      .filter((sp) => active.some((s) => s.id === sp.scheduleId))
      .map((sp) => sp.categoryId),
  );
  const everyday = history.byCategory.filter(
    (c) => !c.key.startsWith("account:") && !scheduledCategories.has(c.key),
  );
  const averageSpending =
    everyday.reduce((n, c) => n + c.amount, 0n) / BigInt(HISTORY_MONTHS);
  const averageIncome = history.budgetIncome / BigInt(HISTORY_MONTHS);

  // Loan minimums not already paid by a schedule into that loan.
  const paidBySchedule = new Set(
    active.flatMap((s) => [s.accountId, s.transferAccountId ?? ""]),
  );
  const loans = snapshot.accounts
    .filter(
      (a) =>
        TRACKED_DEBT.includes(a.type) &&
        a.participation !== "BUDGET" &&
        !a.closed &&
        (balances.get(a.id) ?? 0n) < 0n &&
        !paidBySchedule.has(a.id),
    )
    .map((a) => {
      const versions = snapshot.terms.filter((t) => t.accountId === a.id);
      const t = versionFor(versions, current);
      if (!t) return { id: a.id, name: a.name, minimum: null };
      const owed = -(balances.get(a.id) ?? 0n);
      const rule = minimumRuleFor(
        {
          accountId: a.id,
          name: a.name,
          balance: owed,
          aprBasisPoints: t.aprBasisPoints,
          minimumPayment: t.minimumPayment,
          percentBasisPoints: t.minimumPercentBasisPoints,
          includeInterest: t.minimumIncludesInterest,
        },
        current,
      );
      const due = minimumDue(
        rule,
        owed,
        monthlyInterest(owed, t.aprBasisPoints),
      );
      return { id: a.id, name: a.name, minimum: due < owed ? due : owed };
    });
  const loanPayments = loans.reduce((n, l) => n + (l.minimum ?? 0n), 0n);

  const result = forecast({
    today: now,
    months: query.months,
    startPosition,
    scheduled,
    averageIncome,
    averageSpending,
    loanPayments,
    spendingChangePercent: query.spending,
    extraIncome,
  });
  return {
    ...result,
    daily: await dailyCash(userId, budgetId, query.basis, cushion, end, query.spending),
    query: { ...query, extraIncome, cushion },
    today: now,
    startPosition,
    assumptions: {
      historyFrom,
      historyThrough: nextMonth(current, -1),
      averageIncome,
      averageSpending,
      excludedCategories: scheduledCategories.size,
      scheduledCount: scheduled.length,
      loans,
    },
  };
}

/**
 * Daily cash (owner decision 2026-10-05): checking and savings from today,
 * plus paychecks, less bills on their due days (the same list as Paychecks),
 * less an even share of everyday spending. Savings buckets are left out:
 * their money stays in the account. Cards are not cash; spending on a card
 * reaches cash when the card is paid, which is a bill here.
 */
async function dailyCash(
  userId: string,
  budgetId: string,
  basis: "plan" | "actual",
  cushion: bigint,
  through: string,
  /** The forecast's everyday spending change, in percent. */
  change = 0,
) {
  const plan = await loadCashPlan(userId, budgetId);
  const { s, snapshot, today, recurrence } = plan;
  const isCash = (id: string | null | undefined) => {
    const a = id ? plan.accounts.get(id) : undefined;
    return Boolean(a && a.participation === "BUDGET" && !a.closed && !isLiability(a));
  };
  const balances = balancesAt(snapshot.input, today);
  const cash = snapshot.input.accounts.filter((a) => isCash(a.id));
  const start = cash.reduce((n, a) => n + (balances.get(a.id) ?? 0n), 0n);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);

  const events: CashEvent[] = [];
  for (const { schedule } of incomeSchedules(plan))
    if (isCash(schedule.accountId))
      for (const o of occurrences(recurrence(schedule), tomorrow, through))
        events.push({ date: o.date, name: schedule.name, amount: schedule.amount });
  const bills = upcomingBills(plan, tomorrow, through);
  for (const b of bills)
    // A bill charged to a card reaches cash when the card is paid.
    if (!b.accountId || isCash(b.accountId))
      events.push({ date: b.date, name: b.name, amount: -b.amount });

  // Everyday spending: categories with no due date that money actually
  // leaves. A refill target is spending; a set-aside target is saving unless
  // the category was spent from lately. Savings buckets never count.
  const billed = new Set(bills.map((b) => b.categoryId).filter(Boolean));
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - ACTUAL_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const outflows = new Map<string, bigint>();
  let earliest = today;
  for (const t of snapshot.input.transactions) {
    if (!isCash(t.accountId) || t.date > today) continue;
    if (t.date < earliest) earliest = t.date;
    if (t.date < from) continue;
    for (const sp of t.splits)
      if (sp.amount < 0n)
        outflows.set(sp.categoryId, (outflows.get(sp.categoryId) ?? 0n) - sp.amount);
  }
  const everyday = s.categories.filter((c) => {
    if (c.archived || c.paymentAccountId || billed.has(c.id)) return false;
    const t = s.targets.find((x) => x.categoryId === c.id);
    if (!t) return outflows.has(c.id);
    if (t.dueDay) return false;
    if (t.type === "WEEKLY" || t.type === "SPENDING_LIMIT") return true;
    if (t.type === "MONTHLY") return t.refill || outflows.has(c.id);
    return false;
  });
  const monthlyPlan = everyday.reduce((n, c) => {
    const t = s.targets.find((x) => x.categoryId === c.id);
    if (!t) return n;
    return n + (t.type === "WEEKLY" ? (t.amount * 52n) / 12n : t.amount);
  }, 0n);
  const covered = Math.max(
    1,
    Math.round(
      (Date.parse(`${today}T00:00:00Z`) -
        Date.parse(`${earliest > from ? earliest : from}T00:00:00Z`)) /
        86_400_000,
    ) + 1,
  );
  const spent = everyday.reduce((n, c) => n + (outflows.get(c.id) ?? 0n), 0n);
  // A month is 365/12 days on average.
  const monthlyActual = (spent * 365n) / (BigInt(covered) * 12n);
  const monthlySpending =
    ((basis === "actual" ? monthlyActual : monthlyPlan) * BigInt(100 + change) + 50n) / 100n;
  const projection = cashProjection({
    today,
    through,
    start,
    events,
    monthlySpending,
    cushion,
  });
  return {
    ...projection,
    start,
    cushion,
    basis,
    accounts: cash.map((a) => a.name),
    monthlyPlan,
    monthlyActual,
    /** What the projection spends per month, the change applied. */
    monthlySpending,
    /** Days of history behind the actual rate. */
    actualDays: covered,
    everyday: everyday.map((c) => c.name),
  };
}
