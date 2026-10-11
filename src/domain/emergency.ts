/**
 * Emergency fund, sized from how the household actually lives: a number of
 * months of ordinary spending, kept current as spending changes. YNAB leaves
 * this to arithmetic over its Income v Expense report; here it is the target.
 *
 * Owner decisions (2026-10-11): full lifestyle spending, each category's
 * average over the last twelve complete months, the goal rounded up to $100,
 * and changed only when the estimate moves more than 5%.
 *
 * Amounts are integer cents. Domain module: no persistence, framework or
 * provider imports.
 */
import { nextMonth } from "./budget";
import { isLiability, monthEnd, type ReportInput } from "./reports";

export const COVER_MONTHS = [3, 6] as const;
export type CoverMonths = (typeof COVER_MONTHS)[number];
/** Months of history the average looks back over. */
export const AVERAGE_MONTHS = 12;
/** Target kinds that put money aside rather than spend it. */
const SAVINGS = new Set(["BALANCE", "BALANCE_BY_DATE", "MAINTAIN"]);

/**
 * Ordinary monthly spending: each category's spending over the complete
 * months up to and including `through`, averaged over those months.
 *
 * Counted: purchases on budget accounts (net of refunds), and payments to a
 * loan or other debt that carry a budget category. Left out: categories with
 * a savings target (an emergency fund included), card payment and system
 * categories, spending on tracking accounts, investment contributions, and
 * purchases the owner marked unplanned. A shorter history is averaged over
 * the months it covers, at least one.
 */
export function monthlyCostOfLiving(
  input: {
    accounts: ReportInput["accounts"];
    categories: { id: string; paymentAccountId?: string | null; system?: boolean }[];
    transactions: Omit<ReportInput["transactions"][number], "payee">[];
  },
  through: string,
  targets: readonly { categoryId: string; type: string }[],
  reviews: ReadonlyMap<string, string> = new Map(),
) {
  const from = nextMonth(through, -(AVERAGE_MONTHS - 1));
  const start = `${from}-01`;
  const end = monthEnd(through);
  const accounts = new Map(input.accounts.map((a) => [a.id, a]));
  const excluded = new Set([
    ...input.categories
      .filter((c) => c.paymentAccountId || c.system)
      .map((c) => c.id),
    ...targets.filter((t) => SAVINGS.has(t.type)).map((t) => t.categoryId),
  ]);
  const byCategory = new Map<string, bigint>();
  let earliest: string | null = null;
  for (const t of input.transactions) {
    if (t.date > end) continue;
    if (!earliest || t.date < earliest) earliest = t.date;
    if (t.date < start || reviews.get(t.id) === "UNPLANNED") continue;
    const account = accounts.get(t.accountId);
    if (account?.participation !== "BUDGET") continue;
    const counts =
      t.kind === "EXPENSE" ||
      t.kind === "REFUND" ||
      (t.kind === "TRANSFER" &&
        Boolean(t.transferAccountId) &&
        (() => {
          const other = accounts.get(t.transferAccountId!);
          return other?.participation === "TRACKING" && isLiability(other);
        })());
    if (!counts) continue;
    for (const s of t.splits)
      if (!excluded.has(s.categoryId))
        byCategory.set(s.categoryId, (byCategory.get(s.categoryId) ?? 0n) - s.amount);
  }
  const firstMonth = earliest && earliest > start ? earliest.slice(0, 7) : from;
  let months = 0;
  for (let m = firstMonth; m <= through && months < AVERAGE_MONTHS; m = nextMonth(m)) months++;
  months = Math.max(1, months);
  const categories = [...byCategory]
    .filter(([, amount]) => amount > 0n)
    .map(([categoryId, amount]) => ({ categoryId, monthly: amount / BigInt(months) }))
    .sort((a, b) => (b.monthly > a.monthly ? 1 : b.monthly < a.monthly ? -1 : 0));
  return {
    monthly: categories.reduce((n, c) => n + c.monthly, 0n),
    monthsOfHistory: months,
    categories,
  };
}

/** The fund's goal: months of spending, rounded up to the next $100. */
export function coverGoal(monthly: bigint, months: number) {
  const raw = monthly * BigInt(months);
  const step = 10_000n;
  return raw <= 0n ? 0n : ((raw + step - 1n) / step) * step;
}

/** Change the goal only when the estimate has moved more than 5%. */
export function shouldAdjust(current: bigint | null, proposed: bigint) {
  if (current === null || current <= 0n) return proposed > 0n;
  const diff = proposed > current ? proposed - current : current - proposed;
  return diff * 100n > current * 5n;
}

/** How many months of spending the fund holds now, to one decimal. */
export function monthsCovered(available: bigint, monthly: bigint) {
  if (monthly <= 0n || available <= 0n) return 0;
  return Number((available * 10n) / monthly) / 10;
}
