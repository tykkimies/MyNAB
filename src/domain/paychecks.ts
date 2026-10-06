/**
 * Paycheck periods: which bills each paycheck has to cover, so due dates can be
 * spread across paydays. Not a YNAB feature (owner decision 2026-10-05).
 *
 * Read-only: nothing here assigns money or moves a due date. Due dates come
 * from what the owner already recorded: schedules, the optional due day of a
 * target, and a card's terms.
 *
 * Domain module: no persistence, framework or provider imports.
 */
import { nextMonth } from "./budget";
import { financialDate } from "./dates";
import { occurrenceFor, type TargetType } from "./goals";
import { occurrences, type Recurrence } from "./schedules";

export interface DueTarget {
  type: TargetType;
  amount: bigint;
  dueMonth?: string;
  cadenceMonths?: number;
  dueDay?: number;
}

export interface PayPeriod {
  /** The payday that opens the period. */
  start: string;
  /** The day before the next payday. */
  end: string;
}

export interface Bill {
  date: string;
  /** Positive: what leaves the budget. */
  amount: bigint;
  name: string;
  categoryId: string | null;
  source: "schedule" | "target" | "card";
  /** The account a scheduled bill is paid from; unknown for a target's. */
  accountId?: string;
}

const DAY = 86_400_000;
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10);
const lastDay = (month: string) =>
  new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  ).getUTCDate();
/** A due day in a month, clamped to its end (a bill due on the 31st in June is due the 30th). */
const onDay = (month: string, day: number) =>
  `${month}-${String(Math.min(day, lastDay(month))).padStart(2, "0")}`;

const MONTH_BASED = new Set(["MONTHLY", "TWICE_MONTHLY", "YEARLY"]);

/**
 * Paydays from an income schedule. A schedule started recently still says
 * when earlier paychecks fell, so the pattern is carried back before its start
 * for the spending view (whole years for month-based cadences, so a day such
 * as the 31st keeps its phase).
 */
export function paydays(schedule: Recurrence, from: string, through: string) {
  financialDate(from);
  financialDate(through);
  let start = schedule.startDate;
  if (from < start) {
    if (MONTH_BASED.has(schedule.cadence)) {
      const years = Number(start.slice(0, 4)) - Number(from.slice(0, 4)) + 1;
      const back = `${Number(start.slice(0, 4)) - years}${start.slice(4)}`;
      // Feb 29 has no earlier twin in most years; leave it at its start.
      if (new Date(`${back}T00:00:00Z`).toISOString().slice(0, 10) === back)
        start = back;
    } else if (schedule.cadence === "WEEKLY" || schedule.cadence === "DAILY") {
      const step = (schedule.cadence === "WEEKLY" ? 7 : 1) * (schedule.interval ?? 1);
      const behind = Math.ceil(
        (Date.parse(`${start}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
          (step * DAY),
      );
      start = addDays(start, -behind * step);
    }
  }
  return occurrences({ ...schedule, startDate: start }, from, through).map(
    (o) => o.date,
  );
}

/**
 * Periods that overlap [from, through], each from one payday to the day
 * before the next. `days` must reach one payday past `through`, so the last
 * period has an end; a period without a following payday is left out.
 */
export function payPeriods(days: string[], from: string, through: string) {
  const sorted = [...new Set(days)].sort();
  const periods: PayPeriod[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const period = { start: sorted[i], end: addDays(sorted[i + 1], -1) };
    if (period.end >= from && period.start <= through) periods.push(period);
  }
  return periods;
}

/** The month's day a target or a card is due, if the owner recorded one. */
function dueDayOf(target: DueTarget | undefined, cardDueDay?: number) {
  return target?.dueDay ?? cardDueDay;
}

/**
 * Every date in [from, through] a target's bill is due, with its amount.
 * Monthly bills and card payments repeat on their day; a periodic bill only
 * in the months it falls due (a yearly bill once a year). Saving toward a
 * date, spending limits and weekly targets are not bills.
 */
export function dueDates(
  target: DueTarget | undefined,
  card: { dueDay?: number; minimum?: bigint } | undefined,
  from: string,
  through: string,
): { date: string; amount: bigint }[] {
  financialDate(from);
  financialDate(through);
  const months: string[] = [];
  for (let m = from.slice(0, 7); m <= through.slice(0, 7); m = nextMonth(m))
    months.push(m);
  const within = (date: string) => date >= from && date <= through;
  if (target?.type === "PERIODIC" && target.dueMonth) {
    const cadence = target.cadenceMonths ?? 12;
    const result: { date: string; amount: bigint }[] = [];
    for (
      let m = occurrenceFor(target, months[0]);
      m <= months.at(-1)!;
      m = nextMonth(m, cadence)
    ) {
      const date = onDay(m, target.dueDay ?? 1);
      if (within(date)) result.push({ date, amount: target.amount });
    }
    return result;
  }
  const day = dueDayOf(target, card?.dueDay);
  if (!day) return [];
  let amount: bigint | undefined;
  if (!target) amount = card?.minimum;
  else if (target.type === "MONTHLY" || target.type === "DEBT_PAYOFF")
    amount = target.amount;
  else if (target.type === "DEBT_PAYOFF_BY_DATE") amount = card?.minimum;
  if (!amount || amount <= 0n) return [];
  return months
    .map((m) => ({ date: onDay(m, day), amount: amount! }))
    .filter((d) => within(d.date));
}

/**
 * Bills placed in their pay periods. A category an active schedule pays is
 * counted from the schedule (its exact date and amount), never again from
 * its target, as the forecast avoids double counting.
 */
export function billsByPeriod(periods: PayPeriod[], bills: Bill[]) {
  return periods.map((period) => {
    const inside = bills
      .filter((b) => b.date >= period.start && b.date <= period.end)
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    return {
      ...period,
      bills: inside,
      due: inside.reduce((n, b) => n + b.amount, 0n),
    };
  });
}

/** Scheduled bills first; targets only for categories no schedule pays. */
export function mergeBills(scheduled: Bill[], targeted: Bill[]) {
  const covered = new Set(
    scheduled.map((b) => b.categoryId).filter((id): id is string => !!id),
  );
  return [
    ...scheduled,
    ...targeted.filter((b) => !b.categoryId || !covered.has(b.categoryId)),
  ];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1];
export function ordinal(day: number) {
  const teen = day % 100 >= 11 && day % 100 <= 13;
  return `${day}${(!teen && ["th", "st", "nd", "rd"][day % 10]) || "th"}`;
}

/**
 * The Budget page's Due column, as of a budget month: "14th" for a monthly
 * bill or card, "Apr 28" for a periodic bill this year ("Apr 2027" for a later
 * year), "by Apr 2027" when saving toward a date. Empty when nothing is due.
 */
export function dueLabel(
  target: DueTarget | undefined,
  cardDueDay: number | undefined,
  month: string,
): string {
  if (target?.type === "BALANCE_BY_DATE" && target.dueMonth)
    return `by ${short(target.dueMonth)} ${target.dueMonth.slice(0, 4)}`;
  if (target?.type === "PERIODIC" && target.dueMonth) {
    const due = occurrenceFor(target, month);
    if (due.slice(0, 4) !== month.slice(0, 4))
      return `${short(due)} ${due.slice(0, 4)}`;
    return target.dueDay
      ? `${short(due)} ${Math.min(target.dueDay, lastDay(due))}`
      : short(due);
  }
  const monthly =
    !target ||
    target.type === "MONTHLY" ||
    target.type === "DEBT_PAYOFF" ||
    target.type === "DEBT_PAYOFF_BY_DATE";
  const day = monthly ? dueDayOf(target, cardDueDay) : undefined;
  return day ? ordinal(day) : "";
}
