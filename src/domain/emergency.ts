/**
 * Emergency fund, sized from how the household actually lives: a number of
 * months of ordinary spending, kept current as spending changes. YNAB leaves
 * this to arithmetic over its Income v Expense report; here it is the target.
 *
 * Owner decisions (2026-10-11): full lifestyle spending, each category's
 * average over the last twelve months, the goal rounded up to $100, and
 * changed only when the estimate moves more than 5%. Actual spending only;
 * the current month counts as far as it has gone.
 *
 * Amounts are integer cents. Domain module: no persistence, framework or
 * provider imports.
 */
import { isLiability, type ReportInput } from "./reports";

export const COVER_MONTHS = [3, 6] as const;
export type CoverMonths = (typeof COVER_MONTHS)[number];
/** Months of history the average looks back over. */
export const AVERAGE_MONTHS = 12;
/** Target kinds that put money aside rather than spend it. */
const SAVINGS = new Set(["BALANCE", "BALANCE_BY_DATE", "MAINTAIN"]);

export interface CoverTarget {
  categoryId: string;
  type: string;
}

const DAY = 86_400_000;

/**
 * Ordinary monthly spending, from what was actually spent: each category's
 * spending over the last twelve months through `today` (or since the ledger
 * began, if sooner), averaged over the months that span covers. Partial
 * months count. Less than a month of history counts as one month, so a few
 * weeks of use are neither stretched nor shrunk.
 *
 * Counted: purchases on budget accounts net of refunds, and categorised
 * payments to a loan or other debt. Left out: categories with a savings
 * target (an emergency fund included), card payment and system categories,
 * spending on tracking accounts, investment contributions, and purchases
 * marked unplanned.
 */
export function monthlyCostOfLiving(
  input: {
    accounts: ReportInput["accounts"];
    categories: { id: string; paymentAccountId?: string | null; system?: boolean }[];
    transactions: Omit<ReportInput["transactions"][number], "payee">[];
  },
  today: string,
  targets: readonly CoverTarget[],
  reviews: ReadonlyMap<string, string> = new Map(),
) {
  const yearAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 364 * DAY)
    .toISOString()
    .slice(0, 10);
  const accounts = new Map(input.accounts.map((a) => [a.id, a]));
  const excluded = new Set([
    ...input.categories
      .filter((c) => c.paymentAccountId || c.system)
      .map((c) => c.id),
    ...targets.filter((t) => SAVINGS.has(t.type)).map((t) => t.categoryId),
  ]);
  const byCategory = new Map<string, bigint>();
  // History starts with the first real activity; an opening balance or a
  // reconciliation adjustment says nothing about spending.
  let earliest: string | null = null;
  for (const t of input.transactions) {
    if (t.date > today) continue;
    if (t.kind !== "OPENING" && t.kind !== "ADJUSTMENT" && (!earliest || t.date < earliest))
      earliest = t.date;
    if (t.date < yearAgo || reviews.get(t.id) === "UNPLANNED") continue;
    const account = accounts.get(t.accountId);
    if (account?.participation !== "BUDGET") continue;
    const other = t.transferAccountId ? accounts.get(t.transferAccountId) : undefined;
    const counts =
      t.kind === "EXPENSE" ||
      t.kind === "REFUND" ||
      (t.kind === "TRANSFER" &&
        other?.participation === "TRACKING" &&
        isLiability(other));
    if (!counts) continue;
    for (const s of t.splits)
      if (!excluded.has(s.categoryId))
        byCategory.set(s.categoryId, (byCategory.get(s.categoryId) ?? 0n) - s.amount);
  }
  const from = earliest && earliest > yearAgo ? earliest : yearAgo;
  const days = BigInt(
    Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1,
  );
  // A month is 365/12 days; anything shorter counts as one month.
  const perMonth = (total: bigint) =>
    days * 12n < 365n ? total : (total * 365n) / (12n * days);
  const categories = [...byCategory]
    .map(([categoryId, total]) => ({ categoryId, monthly: perMonth(total) }))
    .filter((c) => c.monthly > 0n)
    .sort((a, b) => (b.monthly > a.monthly ? 1 : b.monthly < a.monthly ? -1 : 0));
  return {
    monthly: categories.reduce((n, c) => n + c.monthly, 0n),
    /** Months of history behind the figure, 1 to 12. */
    monthsOfHistory: Math.max(
      1,
      Math.min(AVERAGE_MONTHS, Math.round((Number(days) * 12) / 365)),
    ),
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
