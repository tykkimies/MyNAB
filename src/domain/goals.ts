/**
 * Pure target arithmetic, per PROJECT_SPEC section 7.
 *
 * A target only ever describes money that already exists or is still needed. It
 * never assigns anything, never creates money, and never writes to the ledger:
 * callers present the result and the owner decides. Domain module, so no
 * framework, persistence or provider imports.
 */
import { budgetMonth } from "./dates";
import { nextMonth, positive } from "./budget";

export type TargetType =
  /** Reach an amount and keep it. Completion is possible. */
  | "BALANCE"
  /** An amount per week, counted by how often that weekday falls in the month. */
  | "WEEKLY"
  /** Reach an amount by a month, spreading the remaining need evenly. */
  | "BALANCE_BY_DATE"
  /** Assign an amount every month, measured against this month's assignments. */
  | "MONTHLY"
  /** Stay under an amount, measured against this month's net spending. */
  | "SPENDING_LIMIT"
  /** A recurring bill: fund by its due month, then roll to the next occurrence. */
  | "PERIODIC"
  /** Hold an amount indefinitely. Never completes, unlike BALANCE. */
  | "MAINTAIN"
  /** Put an amount toward a card every month, capped by what is still owed. */
  | "DEBT_PAYOFF"
  /** Clear what a card owes by a month. The amount comes from the ledger. */
  | "DEBT_PAYOFF_BY_DATE";

export interface Target {
  type: TargetType;
  /** Always positive minor units. A target for nothing is meaningless. */
  amount: bigint;
  /** Required by BALANCE_BY_DATE and PERIODIC. */
  dueMonth?: string;
  /** Months between PERIODIC occurrences. 12 is an annual bill. */
  cadenceMonths?: number;
  /**
   * YNAB's refill/set-aside distinction, for MONTHLY and WEEKLY.
   *
   * Refill tops the category back up to the amount, counting what survived last
   * month. Set aside adds the amount again regardless of what is already there.
   * Groceries are usually a refill; saving for something is usually set aside.
   */
  refill?: boolean;
  /** 0 Sunday to 6 Saturday. Which weekday a WEEKLY target recurs on. */
  dayOfWeek?: number;
}

/** What the budget projection already knows about the category this month. */
export interface CategoryPosition {
  available: bigint;
  assigned: bigint;
  /** Net activity: negative is spending. */
  activity: bigint;
}

/**
 * What a debt payoff target needs beyond the category itself: the balance the
 * linked account owes, positive, read from the ledger at evaluation time.
 * Nothing about a debt target stores a balance, because a stored one could
 * disagree with the ledger and there would be no way to tell which was right.
 */
export interface DebtContext {
  owed: bigint;
}

export type TargetState =
  "MET" | "ON_TRACK" | "BEHIND" | "OVERDUE" | "EXCEEDED";

export interface TargetProgress {
  /** What counts toward this target right now. */
  funded: bigint;
  /** Still needed to satisfy the target overall. */
  needed: bigint;
  /** Still needed **this month** to stay on pace. Never negative. */
  contribution: bigint;
  /** 0 to 1, clamped. A spending limit reports the share of the limit used. */
  progress: number;
  state: TargetState;
  /** The occurrence being funded, for targets that have one. */
  dueMonth: string | null;
  /** Months counted for the contribution, inclusive of this one. */
  monthsRemaining: number | null;
}

/** How many times a weekday falls in a month: four or five, never assumed. */
export function weekdayOccurrences(month: string, dayOfWeek: number): number {
  budgetMonth(month);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)
    throw new Error("A weekday must be 0 (Sunday) through 6 (Saturday)");
  const [year, index] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, index, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= days; day++)
    if (new Date(Date.UTC(year, index - 1, day)).getUTCDay() === dayOfWeek)
      count++;
  return count;
}

function monthsInclusive(from: string, to: string): number {
  budgetMonth(from);
  budgetMonth(to);
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return ty * 12 + tm - (fy * 12 + fm) + 1;
}

/** Contributions round up, so a target is never quietly underfunded by a cent. */
function ceilDivide(total: bigint, parts: number): bigint {
  const divisor = BigInt(parts);
  return (total + divisor - 1n) / divisor;
}

function ratio(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 1;
  if (part <= 0n) return 0;
  if (part >= whole) return 1;
  return Number((part * 10000n) / whole) / 10000;
}

/**
 * Advance a periodic target to the occurrence being funded now. A bill whose
 * month has passed rolls forward rather than reporting an impossible deadline.
 */
export function occurrenceFor(target: Target, month: string): string {
  if (target.type !== "PERIODIC" || !target.dueMonth)
    return target.dueMonth ?? month;
  const cadence = target.cadenceMonths ?? 12;
  if (cadence < 1)
    throw new Error("Periodic cadence must be at least one month");
  let due = target.dueMonth;
  while (due < month) due = nextMonth(due, cadence);
  return due;
}

/**
 * What was in the category before this month's assignments. A month's required
 * share is worked out from this, so assigning the share leaves nothing further
 * owed this month; computing it from `available` instead would count the
 * assignment, shrink the remainder and ask for a share of it all over again.
 */
function baselineOf(position: CategoryPosition): bigint {
  return positive(position.available - positive(position.assigned));
}

export function evaluateTarget(
  target: Target,
  position: CategoryPosition,
  month: string,
  debt?: DebtContext,
): TargetProgress {
  budgetMonth(month);
  // Clearing a card by a date asks for whatever is owed, so it carries no
  // amount of its own. Every other type is meaningless without one.
  if (target.type === "DEBT_PAYOFF_BY_DATE") {
    if (target.amount !== 0n)
      throw new Error("A payoff-by-date target stores no amount");
  } else if (target.amount <= 0n)
    throw new Error("A target amount must be positive");
  if (
    (target.type === "BALANCE_BY_DATE" ||
      target.type === "PERIODIC" ||
      target.type === "DEBT_PAYOFF_BY_DATE") &&
    !target.dueMonth
  )
    throw new Error("This target type requires a due month");

  if (target.type === "DEBT_PAYOFF" || target.type === "DEBT_PAYOFF_BY_DATE") {
    if (!debt) throw new Error("A debt payoff target needs the balance owed");
    if (debt.owed < 0n) throw new Error("A balance owed cannot be negative");
    // Money already sitting in the payment category will clear part of the
    // balance, so only the rest is still to be found.
    const gap = positive(debt.owed - positive(position.available));
    const funded = positive(position.available);
    if (target.type === "DEBT_PAYOFF") {
      // Never ask for more than is left to pay, however large the standing
      // monthly amount is: over-reserving against a cleared card is not saving.
      const wanted = target.amount < gap ? target.amount : gap;
      const needed = positive(wanted - positive(position.assigned));
      return {
        funded,
        needed: gap,
        contribution: needed,
        progress: gap === 0n ? 1 : ratio(funded, debt.owed),
        state: needed === 0n ? "MET" : "BEHIND",
        dueMonth: null,
        monthsRemaining: null,
      };
    }
    const due = target.dueMonth!;
    const months = monthsInclusive(month, due);
    if (gap === 0n)
      return {
        funded,
        needed: 0n,
        contribution: 0n,
        progress: 1,
        state: "MET",
        dueMonth: due,
        monthsRemaining: Math.max(months, 0),
      };
    if (months <= 0)
      return {
        funded,
        needed: gap,
        contribution: gap,
        progress: ratio(funded, debt.owed),
        state: "OVERDUE",
        dueMonth: due,
        monthsRemaining: 0,
      };
    const share = ceilDivide(
      positive(debt.owed - baselineOf(position)),
      months,
    );
    const contribution = positive(share - positive(position.assigned));
    return {
      funded,
      needed: gap,
      contribution,
      progress: ratio(funded, debt.owed),
      state: contribution === 0n ? "ON_TRACK" : "BEHIND",
      dueMonth: due,
      monthsRemaining: months,
    };
  }

  // A spending limit measures what left the envelope, not what sits in it.
  if (target.type === "SPENDING_LIMIT") {
    const spent = positive(-position.activity);
    const remaining = positive(target.amount - spent);
    return {
      funded: spent,
      needed: remaining,
      contribution: 0n,
      progress: ratio(spent, target.amount),
      state: spent > target.amount ? "EXCEEDED" : "ON_TRACK",
      dueMonth: null,
      monthsRemaining: null,
    };
  }

  if (target.type === "MONTHLY" || target.type === "WEEKLY") {
    // A weekly target is the same arithmetic over a month that holds four or
    // five of that weekday, rather than a nominal four.
    const wanted =
      target.type === "WEEKLY"
        ? target.amount *
          BigInt(weekdayOccurrences(month, target.dayOfWeek ?? 1))
        : target.amount;
    // Refill counts what survived last month; set aside asks for it again.
    const funded = positive(
      target.refill ? position.available : position.assigned,
    );
    const needed = positive(wanted - funded);
    return {
      funded,
      needed,
      contribution: needed,
      progress: ratio(funded, wanted),
      state: needed === 0n ? "MET" : "BEHIND",
      dueMonth: null,
      monthsRemaining: null,
    };
  }

  // Everything else measures backing that is actually available.
  const funded = positive(position.available);
  const needed = positive(target.amount - funded);

  if (target.type === "BALANCE" || target.type === "MAINTAIN") {
    return {
      funded,
      needed,
      contribution: needed,
      progress: ratio(funded, target.amount),
      // MAINTAIN is a standing requirement, so it reports being held, not finished.
      state: needed === 0n ? "MET" : "BEHIND",
      dueMonth: null,
      monthsRemaining: null,
    };
  }

  const due = occurrenceFor(target, month);
  const months = monthsInclusive(month, due);
  if (needed === 0n)
    return {
      funded,
      needed,
      contribution: 0n,
      progress: 1,
      state: "MET",
      dueMonth: due,
      monthsRemaining: Math.max(months, 0),
    };
  // A passed deadline asks for the whole remainder now rather than dividing by zero.
  if (months <= 0)
    return {
      funded,
      needed,
      contribution: needed,
      progress: ratio(funded, target.amount),
      state: "OVERDUE",
      dueMonth: due,
      monthsRemaining: 0,
    };
  const share = ceilDivide(
    positive(target.amount - baselineOf(position)),
    months,
  );
  const contribution = positive(share - positive(position.assigned));
  return {
    funded,
    needed,
    contribution,
    progress: ratio(funded, target.amount),
    state: contribution === 0n ? "ON_TRACK" : "BEHIND",
    dueMonth: due,
    monthsRemaining: months,
  };
}

/** One category's claim on this month's money, in the order it will be funded. */
export interface FundingNeed {
  categoryId: string;
  contribution: bigint;
}

export interface FundingPlan {
  assignments: { categoryId: string; amount: bigint }[];
  /** Total this plan assigns. */
  total: bigint;
  /** What the targets asked for and this plan did not assign. */
  shortfall: bigint;
  /** How far past the available money this plan goes. Zero when capped. */
  overAssigned: bigint;
}

/**
 * Decide what to assign toward targets.
 *
 * "full" matches YNAB: targets are filled even when that drives Ready to Assign
 * negative, because the owner is trusted to see the red number and fix it.
 * "capped" hands out only money that already exists. Either way the result says
 * plainly what it did, so over-assignment is always visible rather than implied.
 */
export function planFunding(
  needs: FundingNeed[],
  available: bigint,
  mode: "capped" | "full" = "capped",
): FundingPlan {
  let remaining = positive(available);
  const assignments: { categoryId: string; amount: bigint }[] = [];
  let asked = 0n;
  for (const need of needs) {
    const wanted = positive(need.contribution);
    if (wanted === 0n) continue;
    asked += wanted;
    if (mode === "full") {
      assignments.push({ categoryId: need.categoryId, amount: wanted });
      continue;
    }
    if (remaining === 0n) continue;
    const amount = wanted < remaining ? wanted : remaining;
    remaining -= amount;
    assignments.push({ categoryId: need.categoryId, amount });
  }
  const total = assignments.reduce((sum, a) => sum + a.amount, 0n);
  return {
    assignments,
    total,
    shortfall: asked - total,
    overAssigned: positive(total - positive(available)),
  };
}

/** When a target is expected to be satisfied, and how many months that takes. */
export interface CompletionProjection {
  /** The month the target is expected to be met, inclusive of funding it. */
  month: string;
  /** Months of funding still required, counting this one. Zero when already met. */
  months: number;
}

/** Beyond this the answer stops meaning anything, so none is offered. */
const PROJECTION_HORIZON = 600;

/**
 * Project when a target completes, at a stated monthly pace.
 *
 * Only targets that accumulate toward an amount can complete: a spending limit
 * measures what left, a maintained balance is a standing requirement, and a
 * monthly or weekly target renews every month rather than finishing. Those
 * return null instead of an invented date.
 *
 * The pace is supplied by the caller and is an assumption, not a measurement.
 * A pace of nothing projects nothing, rather than dividing by zero or quietly
 * substituting the required contribution and always answering "on time".
 */
export function projectCompletion(
  target: Target,
  progress: TargetProgress,
  month: string,
  pace: bigint,
): CompletionProjection | null {
  budgetMonth(month);
  if (
    target.type !== "BALANCE" &&
    target.type !== "BALANCE_BY_DATE" &&
    target.type !== "PERIODIC" &&
    target.type !== "DEBT_PAYOFF" &&
    target.type !== "DEBT_PAYOFF_BY_DATE"
  )
    return null;
  if (progress.needed <= 0n) return { month, months: 0 };
  if (pace <= 0n) return null;
  const months = Number((progress.needed + pace - 1n) / pace);
  if (months > PROJECTION_HORIZON) return null;
  return { month: nextMonth(month, months - 1), months };
}

export interface TargetSummary {
  count: number;
  met: number;
  onTrack: number;
  behind: number;
  overdue: number;
  exceeded: number;
  /** What every target asks for this month, together. */
  neededThisMonth: bigint;
  /**
   * What is still missing overall. A spending limit is left out: its "needed"
   * is allowance left to spend, not money the owner has to find.
   */
  stillNeeded: bigint;
}

export function summarizeTargets(
  entries: { type: TargetType; progress: TargetProgress }[],
): TargetSummary {
  const summary: TargetSummary = {
    count: entries.length,
    met: 0,
    onTrack: 0,
    behind: 0,
    overdue: 0,
    exceeded: 0,
    neededThisMonth: 0n,
    stillNeeded: 0n,
  };
  for (const entry of entries) {
    if (entry.progress.state === "MET") summary.met++;
    else if (entry.progress.state === "ON_TRACK") summary.onTrack++;
    else if (entry.progress.state === "BEHIND") summary.behind++;
    else if (entry.progress.state === "OVERDUE") summary.overdue++;
    else if (entry.progress.state === "EXCEEDED") summary.exceeded++;
    summary.neededThisMonth += entry.progress.contribution;
    if (entry.type !== "SPENDING_LIMIT")
      summary.stillNeeded += entry.progress.needed;
  }
  return summary;
}
