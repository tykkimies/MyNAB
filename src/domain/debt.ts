/**
 * Debt payoff simulation, per PROJECT_SPEC section 8.
 *
 * Every number here is an estimate. Balances come from the ledger, but the
 * schedule ahead is an approximation of a contract this application has not
 * read: fixed APR, a monthly rate of APR/12, interest rounded half-up to cents
 * and charged before an end-of-month payment. Real statements differ, and the
 * caller is expected to label these as projections.
 *
 * A simulation never writes anything. It cannot post to the ledger, cannot
 * assign money, and does not know how.
 *
 * Domain module: no persistence, framework or provider imports.
 */
import { positive } from "./budget";
import { budgetMonth } from "./dates";
import { nextMonth } from "./budget";

export type Strategy = "AVALANCHE" | "SNOWBALL" | "CUSTOM";

export interface Debt {
  accountId: string;
  name: string;
  /** Owed now, positive. Taken from the ledger, never from a scenario. */
  balance: bigint;
  /** Annual rate in basis points: 1999 is 19.99%. */
  aprBasisPoints: number;
  /** What the institution demands each month, before anything extra. */
  minimumPayment: bigint;
  /** Lower sorts earlier. Only consulted by the CUSTOM strategy. */
  priority?: number;
}

export interface LumpSum {
  month: string;
  amount: bigint;
}

export interface PayoffRequest {
  debts: Debt[];
  startMonth: string;
  /** Paid every month on top of the minimums, shared by the strategy order. */
  extraMonthly?: bigint;
  lumpSums?: LumpSum[];
  strategy: Strategy;
  /** Stops a schedule that would otherwise never end. */
  maxMonths?: number;
}

export interface PayoffRow {
  month: string;
  accountId: string;
  interest: bigint;
  principal: bigint;
  payment: bigint;
  /** Owed after this month's payment. */
  balance: bigint;
}

export interface DebtOutcome {
  accountId: string;
  name: string;
  /** Null when this debt never clears inside the horizon. */
  payoffMonth: string | null;
  totalInterest: bigint;
  totalPaid: bigint;
}

export interface PayoffPlan {
  rows: PayoffRow[];
  debts: DebtOutcome[];
  payoffMonth: string | null;
  totalInterest: bigint;
  totalPaid: bigint;
  /** True when the budget offered cannot even cover every minimum. */
  infeasible: boolean;
  /** Debts whose interest exceeds their payment, so they grow regardless. */
  negativelyAmortising: string[];
  /** True when the horizon ran out before everything cleared. */
  truncated: boolean;
}

const DEFAULT_HORIZON = 600;

/** Interest rounded half-up to whole cents, as the baseline assumes. */
export function monthlyInterest(
  balance: bigint,
  aprBasisPoints: number,
): bigint {
  if (balance <= 0n || aprBasisPoints <= 0) return 0n;
  // balance * apr / 10000 / 12, kept in integers, rounded half up.
  const numerator = balance * BigInt(Math.round(aprBasisPoints));
  const denominator = 120000n;
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/**
 * Order debts for a strategy. Ties break on account ID so that two runs over
 * the same data always produce the same schedule.
 */
export function orderDebts(debts: Debt[], strategy: Strategy): Debt[] {
  return [...debts].sort((a, b) => {
    if (strategy === "AVALANCHE")
      return (
        b.aprBasisPoints - a.aprBasisPoints ||
        (a.balance < b.balance ? -1 : a.balance > b.balance ? 1 : 0) ||
        a.accountId.localeCompare(b.accountId)
      );
    if (strategy === "SNOWBALL")
      return (
        (a.balance < b.balance ? -1 : a.balance > b.balance ? 1 : 0) ||
        b.aprBasisPoints - a.aprBasisPoints ||
        a.accountId.localeCompare(b.accountId)
      );
    return (
      (a.priority ?? Number.MAX_SAFE_INTEGER) -
        (b.priority ?? Number.MAX_SAFE_INTEGER) ||
      a.accountId.localeCompare(b.accountId)
    );
  });
}

/**
 * Simulate month by month. Interest accrues, minimums are paid on every debt,
 * and whatever is left over goes to the first debt in strategy order. A debt
 * that clears releases its minimum to the next one, which is the whole point
 * of both strategies.
 */
export function simulatePayoff(request: PayoffRequest): PayoffPlan {
  budgetMonth(request.startMonth);
  for (const debt of request.debts) {
    if (debt.balance < 0n) throw new Error("A debt balance cannot be negative");
    if (debt.minimumPayment < 0n)
      throw new Error("A minimum payment cannot be negative");
    if (debt.aprBasisPoints < 0 || debt.aprBasisPoints > 100000)
      throw new Error("APR is outside any plausible range");
  }
  const horizon = request.maxMonths ?? DEFAULT_HORIZON;
  const ordered = orderDebts(
    request.debts.filter((d) => d.balance > 0n),
    request.strategy,
  );
  const balances = new Map(ordered.map((d) => [d.accountId, d.balance]));
  const interestPaid = new Map(ordered.map((d) => [d.accountId, 0n]));
  const totalPaidPer = new Map(ordered.map((d) => [d.accountId, 0n]));
  const clearedIn = new Map<string, string>();
  const rows: PayoffRow[] = [];

  // A debt whose interest outruns its minimum can never clear on this plan.
  const negativelyAmortising = ordered
    .filter(
      (d) =>
        d.minimumPayment <= monthlyInterest(d.balance, d.aprBasisPoints) &&
        d.balance > 0n,
    )
    .map((d) => d.accountId);

  const extra = positive(request.extraMonthly ?? 0n);
  const lumps = new Map<string, bigint>();
  for (const lump of request.lumpSums ?? []) {
    budgetMonth(lump.month);
    lumps.set(
      lump.month,
      (lumps.get(lump.month) ?? 0n) + positive(lump.amount),
    );
  }

  let month = request.startMonth;
  let truncated = false;
  for (let step = 0; step < horizon; step++) {
    if ([...balances.values()].every((b) => b <= 0n)) break;
    // Anything a cleared debt no longer needs is available to the next one.
    let pool = extra + (lumps.get(month) ?? 0n);
    const charged = new Map<string, bigint>();
    for (const debt of ordered) {
      const balance = balances.get(debt.accountId)!;
      if (balance <= 0n) {
        pool += debt.minimumPayment;
        continue;
      }
      const interest = monthlyInterest(balance, debt.aprBasisPoints);
      charged.set(debt.accountId, interest);
      balances.set(debt.accountId, balance + interest);
      interestPaid.set(
        debt.accountId,
        interestPaid.get(debt.accountId)! + interest,
      );
    }
    const payments = new Map<string, bigint>();
    for (const debt of ordered) {
      const owed = balances.get(debt.accountId)!;
      if (owed <= 0n) continue;
      // Never pay more than is owed, so a final payment is exact.
      const minimum = debt.minimumPayment < owed ? debt.minimumPayment : owed;
      payments.set(debt.accountId, minimum);
      balances.set(debt.accountId, owed - minimum);
    }
    for (const debt of ordered) {
      if (pool <= 0n) break;
      const owed = balances.get(debt.accountId)!;
      if (owed <= 0n) continue;
      const applied = pool < owed ? pool : owed;
      pool -= applied;
      payments.set(
        debt.accountId,
        (payments.get(debt.accountId) ?? 0n) + applied,
      );
      balances.set(debt.accountId, owed - applied);
    }
    for (const debt of ordered) {
      const payment = payments.get(debt.accountId) ?? 0n;
      const interest = charged.get(debt.accountId) ?? 0n;
      if (payment === 0n && interest === 0n) continue;
      const balance = balances.get(debt.accountId)!;
      rows.push({
        month,
        accountId: debt.accountId,
        interest,
        principal: payment - interest,
        payment,
        balance,
      });
      totalPaidPer.set(
        debt.accountId,
        totalPaidPer.get(debt.accountId)! + payment,
      );
      if (balance <= 0n && !clearedIn.has(debt.accountId))
        clearedIn.set(debt.accountId, month);
    }
    month = nextMonth(month);
    if (step === horizon - 1 && [...balances.values()].some((b) => b > 0n))
      truncated = true;
  }

  const outcomes: DebtOutcome[] = ordered.map((debt) => ({
    accountId: debt.accountId,
    name: debt.name,
    payoffMonth: clearedIn.get(debt.accountId) ?? null,
    totalInterest: interestPaid.get(debt.accountId)!,
    totalPaid: totalPaidPer.get(debt.accountId)!,
  }));
  const months = outcomes.map((o) => o.payoffMonth);
  return {
    rows,
    debts: outcomes,
    payoffMonth: months.some((m) => m === null)
      ? null
      : (months
          .filter((m): m is string => m !== null)
          .sort()
          .at(-1) ?? null),
    totalInterest: outcomes.reduce((sum, o) => sum + o.totalInterest, 0n),
    totalPaid: outcomes.reduce((sum, o) => sum + o.totalPaid, 0n),
    // A plan that cannot cover its minimums is not a plan, and says so.
    infeasible: negativelyAmortising.length > 0,
    negativelyAmortising,
    truncated,
  };
}

/** What choosing one plan over another actually costs or saves. */
export function comparePlans(baseline: PayoffPlan, candidate: PayoffPlan) {
  return {
    interestDelta: candidate.totalInterest - baseline.totalInterest,
    paidDelta: candidate.totalPaid - baseline.totalPaid,
    baselineMonth: baseline.payoffMonth,
    candidateMonth: candidate.payoffMonth,
  };
}
