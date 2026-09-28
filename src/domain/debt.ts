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
import { versionFor, type Versioned } from "./versions";

export type Strategy = "AVALANCHE" | "SNOWBALL" | "CUSTOM";

/** A rate that takes effect in a month, such as a promotional period ending. */
export interface RatePeriod extends Versioned {
  aprBasisPoints: number;
}

/**
 * How an institution sets the minimum: at least `minimumPayment`, or, when a
 * percentage is given, that share of the balance (plus the month's interest
 * when `includeInterest`) if it is larger. A plain fixed minimum has neither.
 */
export interface MinimumRule {
  minimumPayment: bigint;
  /** Share of the balance before interest, in basis points: 100 is 1%. */
  percentBasisPoints?: number;
  includeInterest?: boolean;
}

/** A minimum rule that takes effect in a month, such as a promotion ending. */
export interface MinimumPeriod extends Versioned, MinimumRule {}

export interface Debt extends MinimumRule {
  accountId: string;
  name: string;
  /** Owed now, positive. Taken from the ledger, never from a scenario. */
  balance: bigint;
  /** Annual rate in basis points: 1999 is 19.99%. */
  aprBasisPoints: number;
  /**
   * Rates that take effect later, newest applying from its own month. A 0%
   * promotional card is the intro rate here and the go-to rate from the month
   * it ends; nothing has to describe a promotion as such.
   */
  rates?: RatePeriod[];
  /** What the institution demands each month, before anything extra. */
  minimumPayment: bigint;
  /** Later minimum rules, each from its own month, like `rates`. */
  minimums?: MinimumPeriod[];
  /** Lower sorts earlier. Only consulted by the CUSTOM strategy. */
  priority?: number;
  /**
   * Where this month's payment stands. True: it is still to come, and today's
   * balance already includes the last statement's interest, so it is made
   * before any new interest. False: this month's due day has passed and its
   * payment is already made, so nothing more is paid this month and the next
   * payment, next month, comes before new interest. Unknown: interest, then
   * payment, from the first month. Plan months are the months payments fall
   * due, so a budget month funds exactly the payment due in it.
   */
  firstPaymentBeforeInterest?: boolean;
  /** Day of the month the payment is due. Unknown: paid at the month's end. */
  dueDay?: number | null;
  /**
   * A deferred-interest promotion: nothing is charged before `endsMonth`, but
   * interest builds up in the background at `aprBasisPoints` (starting from
   * `accrued`, as the statement shows it). If anything is still owed when
   * `endsMonth` arrives, all of it is charged at once; paid in time, none is.
   */
  deferred?: DeferredInterest;
}

export interface DeferredInterest {
  /** The month the regular rate takes over. */
  endsMonth: string;
  /**
   * The promotion's last day, YYYY-MM-DD. Only payments due before it count
   * toward clearing the balance. Unknown: the last day of the month before
   * `endsMonth`, which is never later than the real one.
   */
  deadline?: string;
  aprBasisPoints: number;
  /** Built up before the plan starts; zero when unknown. */
  accrued?: bigint;
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
  /**
   * The most that can go to debt each month, minimums included. Replaces
   * `extraMonthly`; a month whose minimums exceed it is a shortfall.
   */
  monthlyBudget?: bigint;
  /**
   * Pay exactly each month's minimums and nothing more: no extra, and nothing
   * released when a debt clears. The honest "do nothing" baseline.
   */
  minimumsOnly?: boolean;
  lumpSums?: LumpSum[];
  strategy: Strategy;
  /** Stops a schedule that would otherwise never end. */
  maxMonths?: number;
  /**
   * Before the strategy gets anything above the minimums, give each
   * deferred-interest debt just enough to clear it the month before its
   * promotion ends, spread evenly over the months left.
   */
  clearDeferredFirst?: boolean;
  /**
   * Payments the owner has fixed: in that month the debt pays exactly this
   * (never more than it owes) in place of its minimum and gets nothing from
   * the strategy, so the amount comes out of the same monthly total and the
   * other debts are planned around it. Used when a bank payment is already
   * set and can no longer be changed.
   */
  fixedPayments?: FixedPayment[];
}

export interface FixedPayment {
  accountId: string;
  month: string;
  amount: bigint;
}

export interface PayoffRow {
  month: string;
  accountId: string;
  interest: bigint;
  principal: bigint;
  payment: bigint;
  /** Owed after this month's payment. */
  balance: bigint;
  /** The owner fixed this payment; the plan did not choose it. */
  fixed?: boolean;
}

export interface DebtOutcome {
  accountId: string;
  name: string;
  /** Null when this debt never clears inside the horizon. */
  payoffMonth: string | null;
  totalInterest: bigint;
  totalPaid: bigint;
  /** For a deferred-interest debt: whether it beat the deadline, and if not what was charged. */
  deferred?: {
    endsMonth: string;
    deadline: string;
    clearedInTime: boolean;
    charged: bigint;
  };
}

export interface PayoffPlan {
  rows: PayoffRow[];
  debts: DebtOutcome[];
  payoffMonth: string | null;
  totalInterest: bigint;
  totalPaid: bigint;
  /** True when minimums exceed the budget, or a debt can never clear. */
  infeasible: boolean;
  /** Months whose required minimums exceed `monthlyBudget`. */
  shortfallMonths: string[];
  /** Debts whose interest exceeds their payment, so they grow regardless. */
  negativelyAmortising: string[];
  /** True when the horizon ran out before everything cleared. */
  truncated: boolean;
}

const DEFAULT_HORIZON = 600;

/**
 * The rate this debt is charged in a month. Without a schedule it is the one
 * rate given; with one it is whichever period was in force, so a promotional
 * rate ending raises the interest from exactly that month and not before.
 */
export function rateFor(debt: Debt, month: string): number {
  if (!debt.rates?.length) return debt.aprBasisPoints;
  return versionFor(debt.rates, month)?.aprBasisPoints ?? debt.aprBasisPoints;
}

/** The minimum rule in force in a month: the latest version, else the base. */
export function minimumRuleFor(debt: Debt, month: string): MinimumRule {
  if (!debt.minimums?.length) return debt;
  return versionFor(debt.minimums, month) ?? debt;
}

/**
 * What a rule demands, before capping at what is owed. The percentage share is
 * rounded half-up to cents, like interest.
 */
export function minimumDue(
  rule: MinimumRule,
  balance: bigint,
  interest: bigint,
): bigint {
  const bp = BigInt(Math.round(rule.percentBasisPoints ?? 0));
  const share =
    bp > 0n && balance > 0n ? (balance * bp * 2n + 10000n) / 20000n : 0n;
  const percentage =
    bp > 0n ? share + (rule.includeInterest ? interest : 0n) : 0n;
  return percentage > rule.minimumPayment ? percentage : rule.minimumPayment;
}

function validateRule(rule: MinimumRule) {
  if (rule.minimumPayment < 0n)
    throw new Error("A minimum payment cannot be negative");
  const bp = rule.percentBasisPoints ?? 0;
  if (!Number.isInteger(bp) || bp < 0 || bp > 10000)
    throw new Error("A minimum percentage must be between 0% and 100%");
}

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

/** Whole months from one YYYY-MM to a later one. */
function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function dayOf(month: string, day: number) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/** The date a plan month's payment is due: plan months are due months. */
export function paymentDueDate(
  debt: Pick<Debt, "dueDay">,
  month: string,
) {
  return dayOf(month, debt.dueDay || 31);
}

/**
 * The first month a debt still has a payment to make: next month when this
 * month's payment is already made (its due day has passed).
 */
export function firstPaymentMonth(
  debt: Pick<Debt, "firstPaymentBeforeInterest">,
  startMonth: string,
) {
  return debt.firstPaymentBeforeInterest === false
    ? nextMonth(startMonth)
    : startMonth;
}

/** A deferred promotion's last day, never later than the real one. */
export function deferredDeadline(deferred: DeferredInterest) {
  return deferred.deadline ?? dayOf(nextMonth(deferred.endsMonth, -1), 31);
}

/**
 * The first plan month whose payment is due on or after the promotion's last
 * day. Only earlier payments count toward clearing it (a payment due on the
 * last day can post too late); from this month, whatever is still owed brings
 * all of the held-back interest with it.
 */
export function deferredChargeMonth(
  debt: Pick<Debt, "dueDay" | "firstPaymentBeforeInterest">,
  deferred: DeferredInterest,
  startMonth: string,
  horizon = DEFAULT_HORIZON,
) {
  const deadline = deferredDeadline(deferred);
  let month = firstPaymentMonth(debt, startMonth);
  for (let i = 0; i < horizon; i++) {
    const due = paymentDueDate(debt, month);
    // With the exact last day known, a payment due on it does not count. A
    // month-only promotion already ends the day before its month, so a payment
    // due that day still counts, as it always has.
    if (deferred.deadline ? due >= deadline : due > deadline) return month;
    month = nextMonth(month);
  }
  return month;
}

/**
 * Simulate month by month. Interest accrues, minimums are paid on every debt,
 * and whatever is left over goes to the first debt in strategy order.
 *
 * The monthly total is the commitment made in the first month (its minimums
 * plus the extra), or `monthlyBudget` when given. Keeping it constant is what
 * makes a debt that clears, or a minimum that shrinks with its balance, release
 * money to the next debt, which is the whole point of both strategies. A month
 * whose minimums exceed the total still pays them: they are not optional.
 */
export function simulatePayoff(request: PayoffRequest): PayoffPlan {
  budgetMonth(request.startMonth);
  for (const debt of request.debts) {
    if (debt.balance < 0n) throw new Error("A debt balance cannot be negative");
    validateRule(debt);
    for (const period of debt.minimums ?? []) {
      budgetMonth(period.effectiveFrom);
      validateRule(period);
    }
    if (debt.aprBasisPoints < 0 || debt.aprBasisPoints > 100000)
      throw new Error("APR is outside any plausible range");
    for (const period of debt.rates ?? []) {
      budgetMonth(period.effectiveFrom);
      if (period.aprBasisPoints < 0 || period.aprBasisPoints > 100000)
        throw new Error("APR is outside any plausible range");
    }
  }
  if (request.monthlyBudget !== undefined && request.extraMonthly)
    throw new Error(
      "Give either an extra amount or a monthly budget, not both",
    );
  if (request.monthlyBudget !== undefined && request.monthlyBudget < 0n)
    throw new Error("A monthly budget cannot be negative");
  const horizon = request.maxMonths ?? DEFAULT_HORIZON;
  let ordered = orderDebts(
    request.debts.filter((d) => d.balance > 0n),
    request.strategy,
  );
  const balances = new Map(ordered.map((d) => [d.accountId, d.balance]));
  const interestPaid = new Map(ordered.map((d) => [d.accountId, 0n]));
  const totalPaidPer = new Map(ordered.map((d) => [d.accountId, 0n]));
  const clearedIn = new Map<string, string>();
  // The plan month each deferred promotion is settled in: its first payment
  // due on or after the promotion's last day.
  const chargeMonth = new Map(
    ordered
      .filter((d) => d.deferred)
      .map((d) => [
        d.accountId,
        deferredChargeMonth(d, d.deferred!, request.startMonth, horizon + 1),
      ]),
  );
  // Interest a deferred promotion is holding back, and what it finally charged.
  const shadow = new Map(
    ordered
      .filter((d) => d.deferred && request.startMonth < chargeMonth.get(d.accountId)!)
      .map((d) => [d.accountId, positive(d.deferred!.accrued ?? 0n)]),
  );
  const deferredCharged = new Map<string, bigint>();
  const rows: PayoffRow[] = [];

  const startDue = (d: Debt) => {
    const interest = monthlyInterest(d.balance, rateFor(d, request.startMonth));
    return {
      interest,
      due: minimumDue(
        minimumRuleFor(d, request.startMonth),
        d.balance,
        interest,
      ),
    };
  };
  // A debt whose interest outruns its minimum can never clear on this plan.
  const drowning = new Set(
    ordered
      .filter((d) => {
        const { interest, due } = startDue(d);
        return due <= interest;
      })
      .map((d) => d.accountId),
  );

  const extra = positive(request.extraMonthly ?? 0n);
  const commitment =
    request.monthlyBudget ??
    ordered.reduce((sum, d) => sum + startDue(d).due, extra);
  const shortfallMonths: string[] = [];
  const lumps = new Map<string, bigint>();
  for (const lump of request.lumpSums ?? []) {
    budgetMonth(lump.month);
    lumps.set(
      lump.month,
      (lumps.get(lump.month) ?? 0n) + positive(lump.amount),
    );
  }

  const fixed = new Map<string, bigint>();
  for (const pin of request.fixedPayments ?? []) {
    budgetMonth(pin.month);
    fixed.set(`${pin.accountId}:${pin.month}`, positive(pin.amount));
  }

  let month = request.startMonth;
  let truncated = false;
  for (let step = 0; step < horizon; step++) {
    if ([...balances.values()].every((b) => b <= 0n)) break;
    // Re-evaluate the strategy using this month's rates and remaining balances.
    ordered = orderDebts(
      ordered.map((debt) => ({
        ...debt,
        balance: balances.get(debt.accountId)!,
        aprBasisPoints: rateFor(debt, month),
      })),
      request.strategy,
    );
    const charged = new Map<string, bigint>();
    const required = new Map<string, bigint>();
    // This month's payment already made: nothing more this month.
    const idle = (debt: Debt) =>
      step === 0 && debt.firstPaymentBeforeInterest === false;
    // The first payment still to come pays a statement already in the
    // balance, so it is made before any new interest.
    const beforeInterest = (debt: Debt) =>
      (step === 0 && debt.firstPaymentBeforeInterest === true) ||
      (step === 1 && debt.firstPaymentBeforeInterest === false);
    for (const debt of ordered) {
      if (idle(debt)) continue;
      const balance = balances.get(debt.accountId)!;
      const held = shadow.get(debt.accountId);
      if (held !== undefined && debt.deferred) {
        if (month === chargeMonth.get(debt.accountId)) {
          // The deadline: anything still owed brings the held interest with it.
          shadow.delete(debt.accountId);
          if (balance > 0n) deferredCharged.set(debt.accountId, held);
        } else if (balance > 0n && !beforeInterest(debt))
          shadow.set(
            debt.accountId,
            held + monthlyInterest(balance, debt.deferred.aprBasisPoints),
          );
      }
      if (balance <= 0n) continue;
      const accrued = monthlyInterest(balance, rateFor(debt, month));
      // The minimum still counts a month's interest, as the statement did.
      const interest =
        (beforeInterest(debt) ? 0n : accrued) +
        (debt.deferred && month === chargeMonth.get(debt.accountId)
          ? (deferredCharged.get(debt.accountId) ?? 0n)
          : 0n);
      const due =
        fixed.get(`${debt.accountId}:${month}`) ??
        minimumDue(minimumRuleFor(debt, month), balance, accrued);
      // Never pay more than is owed, so a final payment is exact.
      required.set(
        debt.accountId,
        due < balance + interest ? due : balance + interest,
      );
      charged.set(debt.accountId, interest);
      balances.set(debt.accountId, balance + interest);
      interestPaid.set(
        debt.accountId,
        interestPaid.get(debt.accountId)! + interest,
      );
    }
    const minimums = [...required.values()].reduce((a, b) => a + b, 0n);
    if (request.monthlyBudget !== undefined && minimums > request.monthlyBudget)
      shortfallMonths.push(month);
    // Anything a cleared debt or a shrinking minimum no longer needs is
    // available to the next debt in strategy order.
    let pool =
      (!request.minimumsOnly && commitment > minimums
        ? commitment - minimums
        : 0n) + (lumps.get(month) ?? 0n);
    const payments = new Map<string, bigint>();
    for (const debt of ordered) {
      const minimum = required.get(debt.accountId);
      if (minimum === undefined) continue;
      payments.set(debt.accountId, minimum);
      balances.set(debt.accountId, balances.get(debt.accountId)! - minimum);
    }
    const isFixed = (debt: Debt) => fixed.has(`${debt.accountId}:${month}`);
    if (request.clearDeferredFirst)
      for (const debt of ordered) {
        if (pool <= 0n) break;
        if (isFixed(debt) || !required.has(debt.accountId)) continue;
        const settles = chargeMonth.get(debt.accountId);
        if (!debt.deferred || !settles || month >= settles) continue;
        const owed = balances.get(debt.accountId)!;
        if (owed <= 0n) continue;
        // Paid off by the last payment due before the promotion's last day.
        const left = BigInt(monthsBetween(month, settles));
        const need = (owed + left - 1n) / left;
        const applied = need < pool ? need : pool;
        pool -= applied;
        payments.set(
          debt.accountId,
          (payments.get(debt.accountId) ?? 0n) + applied,
        );
        balances.set(debt.accountId, owed - applied);
      }
    for (const debt of ordered) {
      if (pool <= 0n) break;
      if (isFixed(debt) || !required.has(debt.accountId)) continue;
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
      // A rate that rises later can overtake a payment that used to cover it,
      // so this is checked every month rather than only at the start.
      if (payment <= interest) drowning.add(debt.accountId);
      const balance = balances.get(debt.accountId)!;
      rows.push({
        month,
        accountId: debt.accountId,
        interest,
        principal: payment - interest,
        payment,
        balance,
        ...(isFixed(debt) ? { fixed: true } : {}),
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

  // Only a debt that never clears is reported as never clearing. A month where
  // interest outran the payment is not fatal on its own: a cleared debt
  // releases its minimum to the next one, which often turns it around later.
  const negativelyAmortising = ordered
    .map((d) => d.accountId)
    .filter((id) => drowning.has(id) && !clearedIn.has(id));

  const outcomes: DebtOutcome[] = ordered.map((debt) => ({
    accountId: debt.accountId,
    name: debt.name,
    payoffMonth: clearedIn.get(debt.accountId) ?? null,
    totalInterest: interestPaid.get(debt.accountId)!,
    totalPaid: totalPaidPer.get(debt.accountId)!,
    ...(debt.deferred && request.startMonth < chargeMonth.get(debt.accountId)!
      ? {
          deferred: {
            endsMonth: debt.deferred.endsMonth,
            deadline: deferredDeadline(debt.deferred),
            clearedInTime: !deferredCharged.has(debt.accountId),
            charged: deferredCharged.get(debt.accountId) ?? 0n,
          },
        }
      : {}),
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
    infeasible: negativelyAmortising.length > 0 || shortfallMonths.length > 0,
    shortfallMonths,
    negativelyAmortising,
    truncated,
  };
}

/**
 * Find the least whole-cent monthly debt budget that clears every selected
 * balance by the chosen month, under the same dated APR/minimum rules as the
 * forward simulator. Binary search is monotone because paying more earlier
 * cannot add principal or interest. This is an estimate, never an assignment.
 */
export function monthlyBudgetForPayoffDate(
  request: Omit<PayoffRequest, "monthlyBudget" | "extraMonthly" | "minimumsOnly" | "maxMonths">,
  targetMonth: string,
) {
  budgetMonth(targetMonth);
  budgetMonth(request.startMonth);
  const [startYear, startIndex] = request.startMonth.split("-").map(Number);
  const [endYear, endIndex] = targetMonth.split("-").map(Number);
  const horizon = (endYear - startYear) * 12 + endIndex - startIndex + 1;
  if (horizon < 1 || horizon > 360)
    throw new Error("Choose a payoff month within the next 30 years");
  const simulate = (monthlyBudget: bigint) =>
    simulatePayoff({ ...request, monthlyBudget, maxMonths: horizon });
  if (!request.debts.some((debt) => debt.balance > 0n))
    return { targetMonth, monthlyBudget: 0n, plan: simulate(0n) };

  // Paying all known principal and the first month's accrued interest at once
  // is always a finite upper bound; later rate changes then never occur.
  let upper = request.debts.reduce(
    (sum, debt) =>
      sum + debt.balance + monthlyInterest(debt.balance, rateFor(debt, request.startMonth)),
    0n,
  );
  const clears = (budget: bigint) => {
    const plan = simulate(budget);
    return plan.payoffMonth !== null && plan.payoffMonth <= targetMonth &&
      plan.shortfallMonths.length === 0;
  };
  if (!clears(upper))
    throw new Error("No monthly payment can meet that payoff date");
  let lower = 0n;
  while (lower < upper) {
    const middle = (lower + upper) / 2n;
    if (clears(middle)) upper = middle;
    else lower = middle + 1n;
  }
  return { targetMonth, monthlyBudget: lower, plan: simulate(lower) };
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
