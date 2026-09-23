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
  /** Reach an amount by a month, spreading the remaining need evenly. */
  | "BALANCE_BY_DATE"
  /** Assign an amount every month, measured against this month's assignments. */
  | "MONTHLY"
  /** Stay under an amount, measured against this month's net spending. */
  | "SPENDING_LIMIT"
  /** A recurring bill: fund by its due month, then roll to the next occurrence. */
  | "PERIODIC"
  /** Hold an amount indefinitely. Never completes, unlike BALANCE. */
  | "MAINTAIN";

export interface Target {
  type: TargetType;
  /** Always positive minor units. A target for nothing is meaningless. */
  amount: bigint;
  /** Required by BALANCE_BY_DATE and PERIODIC. */
  dueMonth?: string;
  /** Months between PERIODIC occurrences. 12 is an annual bill. */
  cadenceMonths?: number;
}

/** What the budget projection already knows about the category this month. */
export interface CategoryPosition {
  available: bigint;
  assigned: bigint;
  /** Net activity: negative is spending. */
  activity: bigint;
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

export function evaluateTarget(
  target: Target,
  position: CategoryPosition,
  month: string,
): TargetProgress {
  budgetMonth(month);
  if (target.amount <= 0n) throw new Error("A target amount must be positive");
  if (
    (target.type === "BALANCE_BY_DATE" || target.type === "PERIODIC") &&
    !target.dueMonth
  )
    throw new Error("This target type requires a due month");

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

  // Monthly funding asks what was assigned this month, not what survived it.
  if (target.type === "MONTHLY") {
    const funded = positive(position.assigned);
    const needed = positive(target.amount - funded);
    return {
      funded,
      needed,
      contribution: needed,
      progress: ratio(funded, target.amount),
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
  const contribution = ceilDivide(needed, months);
  return {
    funded,
    needed,
    contribution,
    progress: ratio(funded, target.amount),
    state: position.assigned >= contribution ? "ON_TRACK" : "BEHIND",
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
