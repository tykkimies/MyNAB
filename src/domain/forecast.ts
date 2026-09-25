/**
 * Cash forecasts, per PROJECT_SPEC section 9: 1, 3, 6 or 12 months ahead from
 * scheduled income and bills, assumed everyday spending and loan payments.
 *
 * A forecast is hypothetical. It never assigns money, never creates a
 * transaction, and its assumptions come from the request, not storage.
 *
 * Double counting is avoided by construction: scheduled items are counted
 * from the schedules only, and the spending average covers only categories no
 * active schedule pays. Averaged income is used only when nothing is scheduled.
 *
 * Domain module: no persistence, framework or provider imports.
 */
import { nextMonth } from "./budget";
import { budgetMonth, financialDate } from "./dates";

export interface ForecastOccurrence {
  date: string;
  kind: "INCOME" | "EXPENSE" | "TRANSFER";
  /** Signed change to the on-budget position; zero for internal transfers. */
  effect: bigint;
}
export interface ForecastInput {
  today: string;
  months: number;
  /** On-budget accounts, card balances included (so card debt counts). */
  startPosition: bigint;
  scheduled: ForecastOccurrence[];
  /** Recent average earned income, used only if no income is scheduled. */
  averageIncome: bigint;
  /** Recent average spending in categories no schedule pays. */
  averageSpending: bigint;
  /** Monthly minimums on tracking loans that no schedule already pays. */
  loanPayments: bigint;
  /** Scenario: change everyday spending by this percentage. */
  spendingChangePercent?: number;
  /** Scenario: extra monthly income. */
  extraIncome?: bigint;
}
export interface ForecastRow {
  month: string;
  /** From today to month end: scheduled items only, no averages. */
  partial: boolean;
  income: bigint;
  bills: bigint;
  spending: bigint;
  loans: bigint;
  net: bigint;
  ending: bigint;
}
export interface Forecast {
  rows: ForecastRow[];
  incomeSource: "scheduled" | "average" | "none";
  lowest: { month: string; ending: bigint };
  /** The first month whose ending position is below zero, if any. */
  shortfallMonth: string | null;
}

export function forecast(input: ForecastInput): Forecast {
  financialDate(input.today);
  if (![1, 3, 6, 12].includes(input.months))
    throw new Error("Forecast 1, 3, 6 or 12 months");
  const pct = input.spendingChangePercent ?? 0;
  if (!Number.isInteger(pct) || pct < -100 || pct > 200)
    throw new Error("Spending change must be between -100% and +200%");
  const extra = input.extraIncome ?? 0n;
  if (extra < 0n) throw new Error("Extra income cannot be negative");
  const current = input.today.slice(0, 7);
  budgetMonth(current);
  const scheduledIncome = input.scheduled.some((o) => o.kind === "INCOME");
  const incomeSource = scheduledIncome
    ? "scheduled"
    : input.averageIncome > 0n
      ? "average"
      : "none";
  const spending = (input.averageSpending * BigInt(100 + pct) + 50n) / 100n;

  const rows: ForecastRow[] = [];
  let position = input.startPosition;
  const months = [current];
  for (let i = 0; i < input.months; i++)
    months.push(nextMonth(months[months.length - 1]));
  for (const month of months) {
    const partial = month === current;
    const due = input.scheduled.filter(
      (o) =>
        o.date.slice(0, 7) === month && (!partial || o.date >= input.today),
    );
    const sum = (kinds: ForecastOccurrence["kind"][]) =>
      due
        .filter((o) => kinds.includes(o.kind))
        .reduce((n, o) => n + o.effect, 0n);
    const income =
      sum(["INCOME"]) +
      (partial
        ? 0n
        : (incomeSource === "average" ? input.averageIncome : 0n) + extra);
    const bills = sum(["EXPENSE", "TRANSFER"]);
    const everyday = partial ? 0n : -spending;
    const loans = partial ? 0n : -input.loanPayments;
    const net = income + bills + everyday + loans;
    position += net;
    rows.push({
      month,
      partial,
      income,
      bills,
      spending: everyday,
      loans,
      net,
      ending: position,
    });
  }
  const lowest = rows.reduce(
    (low, r) =>
      r.ending < low.ending ? { month: r.month, ending: r.ending } : low,
    { month: rows[0].month, ending: rows[0].ending },
  );
  return {
    rows,
    incomeSource,
    lowest,
    shortfallMonth: rows.find((r) => r.ending < 0n)?.month ?? null,
  };
}
