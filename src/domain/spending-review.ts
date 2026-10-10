/**
 * Spending review: money that may have been wasted, and could be recovered
 * next time. Four views over the same report lines the other reports use, so
 * a figure here always agrees with Spending Breakdown:
 * - Unplanned: purchases the owner marked as impulse buys.
 * - Misfits: a purchase that does not look like its category's usual spending,
 *   as when an impulse buy is filed wherever money was left.
 * - Covered overspending: spending beyond a category's plan that was paid for
 *   by moving money out of other categories.
 * - Subscriptions: repeating charges, by what they cost a year.
 *
 * Amounts are integer cents; spending is positive.
 *
 * Domain module: no persistence, framework or provider imports.
 */
import type { MoneyMove } from "./money-moves";
import type { ReportLine } from "./reports";
import { detectRecurring, type RecurringRecord } from "./recurring";

export type Review = "UNPLANNED" | "PLANNED";

const spending = (lines: readonly ReportLine[]) =>
  lines.filter((l) => l.flow === "consumption");

/** Marked unplanned, within the lines given (already narrowed to a period). */
export function unplannedSummary(
  lines: readonly ReportLine[],
  reviews: ReadonlyMap<string, Review>,
) {
  const marked = spending(lines).filter(
    (l) => reviews.get(l.transactionId) === "UNPLANNED",
  );
  const byCategory = new Map<string, { amount: bigint; ids: Set<string> }>();
  const byMonth = new Map<string, bigint>();
  const byTransaction = new Map<
    string,
    { transactionId: string; date: string; payee: string; amount: bigint; keys: string[] }
  >();
  for (const l of marked) {
    const c = byCategory.get(l.key) ?? { amount: 0n, ids: new Set<string>() };
    c.amount += l.amount;
    c.ids.add(l.transactionId);
    byCategory.set(l.key, c);
    const month = l.date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0n) + l.amount);
    const t = byTransaction.get(l.transactionId) ?? {
      transactionId: l.transactionId,
      date: l.date,
      payee: l.payee,
      amount: 0n,
      keys: [],
    };
    t.amount += l.amount;
    if (!t.keys.includes(l.key)) t.keys.push(l.key);
    byTransaction.set(l.transactionId, t);
  }
  return {
    total: marked.reduce((n, l) => n + l.amount, 0n),
    count: byTransaction.size,
    byCategory: [...byCategory]
      .map(([key, c]) => ({ key, amount: c.amount, count: c.ids.size }))
      .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0)),
    byMonth: [...byMonth]
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    transactions: [...byTransaction.values()].sort(
      (a, b) => b.date.localeCompare(a.date) || a.transactionId.localeCompare(b.transactionId),
    ),
  };
}

const payeeKey = (p: string) => p.normalize("NFKC").trim().toLowerCase();

function monthsBefore(date: string, months: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

function median(values: bigint[]) {
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Purchases that do not fit their category: the payee has not been seen in
 * that category in the previous `months`, and the amount is at least `factor`
 * times the category's usual (median) purchase and at least `minimum`. A
 * category needs three earlier purchases to have a usual. Split purchases and
 * anything the owner already reviewed are left out.
 *
 * `history` must reach back `months` before `from` for the comparison.
 */
export function misfits(
  history: readonly ReportLine[],
  from: string,
  through: string,
  reviews: ReadonlyMap<string, Review>,
  { months = 6, factor = 2n, minimum = 2000n } = {},
) {
  const lines = spending(history);
  const perTransaction = new Map<string, number>();
  for (const l of lines)
    perTransaction.set(l.transactionId, (perTransaction.get(l.transactionId) ?? 0) + 1);
  const byKey = new Map<string, ReportLine[]>();
  for (const l of lines) byKey.set(l.key, [...(byKey.get(l.key) ?? []), l]);
  const out: (ReportLine & { usual: bigint })[] = [];
  for (const l of lines) {
    if (l.date < from || l.date > through) continue;
    if (l.amount <= 0n || perTransaction.get(l.transactionId) !== 1) continue;
    if (reviews.has(l.transactionId)) continue;
    const since = monthsBefore(l.date, months);
    const prior = (byKey.get(l.key) ?? []).filter(
      (p) =>
        p.transactionId !== l.transactionId &&
        p.amount > 0n &&
        p.date >= since &&
        (p.date < l.date ||
          (p.date === l.date && p.transactionId < l.transactionId)),
    );
    if (prior.length < 3) continue;
    if (prior.some((p) => payeeKey(p.payee) === payeeKey(l.payee))) continue;
    const usual = median(prior.map((p) => p.amount));
    if (l.amount < minimum || l.amount < usual * factor) continue;
    out.push({ ...l, usual });
  }
  return out.sort(
    (a, b) => b.date.localeCompare(a.date) || a.transactionId.localeCompare(b.transactionId),
  );
}

/** One category in one month, as the budget projection reports it. */
export interface CategoryMonth {
  categoryId: string;
  month: string;
  /** Available at the start of the month (carried over). */
  start: bigint;
  /** Net assigned this month, moves included. */
  assigned: bigint;
  /** Net activity this month; spending is negative. */
  activity: bigint;
}

/**
 * Spending beyond a category's plan that was covered by moving money in from
 * other categories: the "category raid". The plan is what the category had
 * (carried over plus assigned, not counting moves); whatever spending went
 * past it and was met by money moved in is reported, with where it came from.
 */
export function coveredOverspending(
  rows: readonly CategoryMonth[],
  moves: readonly MoneyMove[],
) {
  const live = moves.filter((m) => m.kind === "MOVE" && !m.undone);
  const out: {
    categoryId: string;
    month: string;
    planned: bigint;
    spent: bigint;
    covered: bigint;
    from: { categoryId: string; amount: bigint }[];
  }[] = [];
  for (const r of rows) {
    const spent = r.activity < 0n ? -r.activity : 0n;
    if (!spent) continue;
    let movedIn = 0n,
      movedOut = 0n;
    const sources = new Map<string, bigint>();
    for (const m of live) {
      if (m.month !== r.month) continue;
      const into = m.to
        .filter((t) => t.categoryId === r.categoryId)
        .reduce((n, t) => n + t.amount, 0n);
      const outOf = m.from
        .filter((f) => f.categoryId === r.categoryId)
        .reduce((n, f) => n + f.amount, 0n);
      movedIn += into;
      movedOut += outOf;
      // Credit the money moved in to the categories it left, in order.
      let left = into;
      for (const f of m.from) {
        if (left <= 0n || f.categoryId === r.categoryId) continue;
        const part = f.amount < left ? f.amount : left;
        sources.set(f.categoryId, (sources.get(f.categoryId) ?? 0n) + part);
        left -= part;
      }
    }
    if (!movedIn) continue;
    const planned =
      (r.start > 0n ? r.start : 0n) + r.assigned - movedIn + movedOut;
    const over = spent - (planned > 0n ? planned : 0n);
    if (over <= 0n) continue;
    const covered = over < movedIn ? over : movedIn;
    out.push({
      categoryId: r.categoryId,
      month: r.month,
      planned: planned > 0n ? planned : 0n,
      spent,
      covered,
      from: [...sources]
        .map(([categoryId, amount]) => ({ categoryId, amount }))
        .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0)),
    });
  }
  return out.sort(
    (a, b) =>
      b.month.localeCompare(a.month) ||
      (b.covered > a.covered ? 1 : b.covered < a.covered ? -1 : 0),
  );
}

const PER_YEAR: Record<string, bigint> = {
  DAILY: 365n,
  WEEKLY: 52n,
  MONTHLY: 12n,
  YEARLY: 1n,
};
const CYCLE_DAYS: Record<string, number> = {
  DAILY: 1,
  WEEKLY: 7,
  MONTHLY: 30,
  YEARLY: 365,
};

/**
 * Repeating charges still being made, by what they cost a year. A pattern is
 * still active when its next charge is not more than half a cycle overdue.
 * `scheduled` says whether a live schedule already plans for it (same account
 * and amount, or same payee).
 */
export function subscriptions(
  records: readonly RecurringRecord[],
  today: string,
  schedules: readonly { accountId: string; amount: bigint; payee: string }[] = [],
) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const day = 86_400_000;
  return detectRecurring(records.filter((r) => r.kind === "EXPENSE"))
    .filter((s) => s.amount < 0n)
    .flatMap((s) => {
      const cycle = (CYCLE_DAYS[s.cadence] ?? 30) * s.interval;
      const overdue =
        (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${s.nextDate}T00:00:00Z`)) / day;
      if (overdue > cycle / 2) return [];
      const charges = s.transactionIds
        .map((id) => byId.get(id)!)
        .sort((a, b) => a.date.localeCompare(b.date));
      const amount = -s.amount;
      return [
        {
          key: s.key,
          accountId: s.accountId,
          payee: s.payee,
          cadence: s.cadence,
          interval: s.interval,
          amount,
          yearly: (amount * (PER_YEAR[s.cadence] ?? 12n)) / BigInt(s.interval),
          firstAmount: -charges[0].amount,
          lastDate: charges.at(-1)!.date,
          nextDate: s.nextDate,
          count: charges.length,
          transactionIds: s.transactionIds,
          scheduled: schedules.some(
            (x) =>
              x.accountId === s.accountId &&
              (x.amount === s.amount || payeeKey(x.payee) === payeeKey(s.payee)),
          ),
        },
      ];
    })
    .sort((a, b) =>
      b.yearly > a.yearly ? 1 : b.yearly < a.yearly ? -1 : a.payee.localeCompare(b.payee),
    );
}
