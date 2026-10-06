/**
 * A day-by-day projection of cash (owner decision 2026-10-05): what is in the
 * bank today, plus each paycheck on its day, less each bill on its due day,
 * less an even amount of everyday spending every day. It finds the lowest
 * point between paychecks, which a month-end forecast cannot see.
 *
 * Hypothetical and never stored. Savings buckets are not in it: money set
 * aside for a goal stays in the account until it is spent.
 *
 * Domain module: no persistence, framework or provider imports.
 */
import { financialDate } from "./dates";

export interface CashEvent {
  date: string;
  name: string;
  /** Signed: positive arrives, negative leaves. */
  amount: bigint;
}

export interface CashDay {
  date: string;
  /** Balance at the end of the day. */
  balance: bigint;
  /** Paydays and bills on this day; everyday spending is not listed. */
  events: CashEvent[];
  spending: bigint;
}

export interface CashProjection {
  days: CashDay[];
  lowest: { date: string; balance: bigint };
  firstBelowCushion: string | null;
  firstNegative: string | null;
  /** Total everyday spending over the projection, to the cent. */
  spending: bigint;
}

const DAY = 86_400_000;
const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + DAY).toISOString().slice(0, 10);

/**
 * Walk from today through `through`. Today's balance is where the bank is
 * now: events dated today are assumed already in it, and so is today's
 * spending. Everyday spending is a monthly amount spread over each month's
 * own days, carrying the leftover cents, so a whole month sums exactly.
 */
export function cashProjection(input: {
  today: string;
  through: string;
  start: bigint;
  events: CashEvent[];
  /** Everyday spending per month, positive. */
  monthlySpending: bigint;
  cushion: bigint;
}): CashProjection {
  financialDate(input.today);
  financialDate(input.through);
  if (input.through < input.today) throw new Error("Projection ends before it starts");
  if (input.monthlySpending < 0n) throw new Error("Spending is a positive amount");
  const byDate = new Map<string, CashEvent[]>();
  for (const e of input.events) {
    financialDate(e.date);
    if (e.date <= input.today || e.date > input.through) continue;
    byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  }
  const days: CashDay[] = [
    { date: input.today, balance: input.start, events: [], spending: 0n },
  ];
  let balance = input.start,
    spending = 0n;
  for (let date = nextDay(input.today); date <= input.through; date = nextDay(date)) {
    const [y, m, d] = date.split("-").map(Number);
    const inMonth = BigInt(new Date(Date.UTC(y, m, 0)).getUTCDate());
    // Spent through day d is monthly × d / days: each month sums exactly.
    const through = (day: number) => (input.monthlySpending * BigInt(day)) / inMonth;
    const today = through(d) - through(d - 1);
    const events = (byDate.get(date) ?? []).sort((a, b) => Number(b.amount - a.amount));
    balance += events.reduce((n, e) => n + e.amount, 0n) - today;
    spending += today;
    days.push({ date, balance, events, spending: today });
  }
  const lowest = days.reduce(
    (low, d) => (d.balance < low.balance ? { date: d.date, balance: d.balance } : low),
    { date: days[0].date, balance: days[0].balance },
  );
  return {
    days,
    lowest,
    firstBelowCushion: days.find((d) => d.balance < input.cushion)?.date ?? null,
    firstNegative: days.find((d) => d.balance < 0n)?.date ?? null,
    spending,
  };
}
