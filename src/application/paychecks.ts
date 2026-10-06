import { getDb } from "@/infrastructure/db";
import { nextMonth } from "@/domain/budget";
import {
  billsByPeriod,
  dueDates,
  mergeBills,
  payPeriods,
  paydays,
  type Bill,
} from "@/domain/paychecks";
import { flows, isLiability, monthEnd } from "@/domain/reports";
import { occurrences, type Recurrence } from "@/domain/schedules";
import { versionFor } from "@/domain/versions";
import { authorize, getFinance } from "./finance";
import { loadReportInput } from "./reports";

const DAY = 86_400_000;
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10);
/** Paydays are read this far beyond a range, so its first and last periods have both ends. */
const MARGIN_DAYS = 45;
const TOP_CATEGORIES = 5;

/**
 * The Paychecks report (owner decision 2026-10-05): the bills each paycheck
 * covers from now to the end of next month, and what was spent in each pay
 * period of the chosen months. Read-only; nothing is stored.
 */
export async function getPaychecks(
  userId: string,
  budgetId: string,
  query: { from: string; through: string; pay?: string },
) {
  // Targets as the Budget page reads them this month, card plans included.
  const s = await getFinance(userId, budgetId);
  const snapshot = await getDb().$transaction(
    async (tx) => {
      await authorize(tx, userId, budgetId);
      const [schedules, splits, terms, report] = await Promise.all([
        tx.schedule.findMany({
          where: { budgetId, archived: false, replacedById: null },
        }),
        tx.scheduleSplit.findMany({ where: { budgetId } }),
        tx.debtTerms.findMany({ where: { budgetId } }),
        loadReportInput(tx, budgetId),
      ]);
      return { schedules, splits, terms, input: report.input };
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
  const today = s.today;
  const current = today.slice(0, 7);
  const accounts = new Map(s.accounts.map((a) => [a.id, a]));
  const onBudget = (id: string | null | undefined) =>
    Boolean(id && accounts.get(id)?.participation === "BUDGET");
  const recurrence = (x: (typeof snapshot.schedules)[number]): Recurrence => ({
    id: x.id,
    startDate: x.startDate.toISOString().slice(0, 10),
    endDate: x.endDate?.toISOString().slice(0, 10),
    timezone: x.timezone,
    cadence: x.cadence as Recurrence["cadence"],
    interval: x.interval,
  });

  // The paycheck: income into the budget. With several, the most frequent
  // over the next two months, then the largest; `pay` picks another.
  const incomes = snapshot.schedules
    .filter((x) => x.kind === "INCOME" && onBudget(x.accountId) && x.amount > 0n)
    .map((x) => ({
      schedule: x,
      upcoming: occurrences(recurrence(x), today, addDays(today, 62)).length,
    }))
    .sort(
      (a, b) =>
        b.upcoming - a.upcoming ||
        Number(b.schedule.amount - a.schedule.amount),
    );
  const chosen =
    incomes.find((i) => i.schedule.id === query.pay) ?? incomes[0];
  if (!chosen) return { noPaycheck: true as const };
  const pay = chosen.schedule;
  const days = (from: string, through: string) =>
    paydays(recurrence(pay), addDays(from, -MARGIN_DAYS), addDays(through, MARGIN_DAYS));
  const received = (start: string, end: string) =>
    flows(snapshot.input, { from: start, through: end < today ? end : today })
      .budgetIncome;

  // Bills: from today to the end of next month, whole periods.
  const ahead = payPeriods(
    days(today, monthEnd(nextMonth(current))),
    today,
    monthEnd(nextMonth(current)),
  );
  let bills: ReturnType<typeof billsByPeriod> = [];
  if (ahead.length) {
    const start = ahead[0].start,
      end = ahead.at(-1)!.end;
    const paymentCategory = new Map(
      s.categories
        .filter((c) => c.paymentAccountId)
        .map((c) => [c.paymentAccountId!, c]),
    );
    const scheduled: Bill[] = [];
    for (const x of snapshot.schedules) {
      if (x.amount >= 0n || !onBudget(x.accountId)) continue;
      // A transfer is a bill when it pays a card or loan, or leaves the budget.
      const target = x.transferAccountId
        ? accounts.get(x.transferAccountId)
        : undefined;
      if (
        x.kind === "TRANSFER" &&
        !(target && (isLiability(target) || target.participation !== "BUDGET"))
      )
        continue;
      if (x.kind !== "EXPENSE" && x.kind !== "TRANSFER") continue;
      const own = snapshot.splits.filter((sp) => sp.scheduleId === x.id);
      const parts =
        x.kind === "EXPENSE" && own.length
          ? own.map((sp) => ({ categoryId: sp.categoryId, amount: -sp.amount }))
          : [
              {
                categoryId:
                  (x.transferAccountId &&
                    paymentCategory.get(x.transferAccountId)?.id) ||
                  null,
                amount: -x.amount,
              },
            ];
      for (const o of occurrences(recurrence(x), start, end))
        for (const part of parts)
          if (part.amount > 0n)
            scheduled.push({
              date: o.date,
              amount: part.amount,
              name: x.name,
              categoryId: part.categoryId,
              source: "schedule",
            });
    }
    const targeted: Bill[] = [];
    for (const c of s.categories) {
      if (c.archived || c.hidden) continue;
      const target = s.targets.find((t) => t.categoryId === c.id && !t.hidden);
      const terms = c.paymentAccountId
        ? versionFor(
            snapshot.terms.filter((t) => t.accountId === c.paymentAccountId),
            current,
          )
        : null;
      const card = terms
        ? { dueDay: terms.dueDay ?? undefined, minimum: terms.minimumPayment }
        : undefined;
      for (const due of dueDates(target, card, start, end))
        targeted.push({
          ...due,
          name: c.name,
          categoryId: c.id,
          source: target?.dueDay || target?.type === "PERIODIC" ? "target" : "card",
        });
    }
    bills = billsByPeriod(ahead, mergeBills(scheduled, targeted));
  }

  // Spending: each pay period of the chosen months, up to today.
  const until = monthEnd(query.through) < today ? monthEnd(query.through) : today;
  const names = new Map(s.categories.map((c) => [c.id, c.name]));
  const spending = payPeriods(days(`${query.from}-01`, until), `${query.from}-01`, until)
    .filter((p) => p.start <= today)
    .map((p) => {
      const f = flows(snapshot.input, {
        from: p.start,
        through: p.end < today ? p.end : today,
      });
      const budgetLines = f.byCategory.filter((c) => !c.key.startsWith("account:"));
      return {
        ...p,
        partial: p.end > today,
        income: f.budgetIncome,
        spent: budgetLines.reduce((n, c) => n + c.amount, 0n),
        top: budgetLines
          .filter((c) => c.amount > 0n)
          .sort((a, b) => Number(b.amount - a.amount))
          .slice(0, TOP_CATEGORIES)
          .map((c) => ({ ...c, name: names.get(c.key) ?? c.name })),
      };
    })
    .reverse();

  return {
    noPaycheck: false as const,
    today,
    pay: { id: pay.id, name: pay.name, amount: pay.amount },
    choices: incomes.map((i) => ({
      id: i.schedule.id,
      name: i.schedule.name,
      amount: i.schedule.amount,
    })),
    bills: bills.map((p) => {
      const got = p.start <= today ? received(p.start, p.end) : 0n;
      // Before the deposit arrives, the schedule says what it will be.
      return { ...p, income: got > 0n ? got : pay.amount, expected: got <= 0n };
    }),
    spending,
  };
}
