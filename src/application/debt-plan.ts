import type { DebtTerms } from "@/generated/prisma/client";
import {
  minimumDue,
  monthlyInterest,
  simulatePayoff,
  type Debt,
  type FixedPayment,
  type Strategy,
} from "@/domain/debt";
import { versionFor, versionsFrom } from "@/domain/versions";

/** What an owed account contributes to a payoff plan, before any scenario. */
export interface OwedAccount {
  id: string;
  name: string;
  /** Owed, positive. */
  owed: bigint;
}

export type PlannedDebt = Debt & {
  hasTerms: boolean;
  dueDay: number | null;
  currentMinimum: bigint | null;
};

/**
 * The debts a payoff plan works on, from the ledger's balances and the
 * recorded term versions. Shared by the Debt page, which simulates scenarios,
 * and the adopted plan, which applies one month of it to targets and
 * schedules, so both always plan from the same facts.
 */
export function plannedDebts(
  accounts: OwedAccount[],
  versions: DebtTerms[],
  month: string,
  todayDate: string,
  ranks: Record<string, number | undefined> = {},
): PlannedDebt[] {
  return accounts.map((a) => {
    const own = versions.filter((v) => v.accountId === a.id);
    // Terms are versioned: what is shown is what is in force this month, and
    // the simulation charges whatever is in force in each month it reaches.
    const t = versionFor(own, month);
    const later = versionsFrom(own, month);
    return {
      accountId: a.id,
      name: a.name,
      balance: a.owed,
      aprBasisPoints: t?.aprBasisPoints ?? 0,
      minimumPayment: t?.minimumPayment ?? 0n,
      percentBasisPoints: t?.minimumPercentBasisPoints ?? 0,
      includeInterest: t?.minimumIncludesInterest ?? false,
      minimums: later.map((v) => ({
        effectiveFrom: v.effectiveFrom,
        minimumPayment: v.minimumPayment,
        percentBasisPoints: v.minimumPercentBasisPoints,
        includeInterest: v.minimumIncludesInterest,
      })),
      rates: later.map((v) => ({
        effectiveFrom: v.effectiveFrom,
        aprBasisPoints: v.aprBasisPoints,
      })),
      hasTerms: Boolean(t),
      dueDay: t?.dueDay ?? null,
      // A deferred-interest promotion ends where the next version begins.
      deferred: (() => {
        if (!t?.deferredInterest) return undefined;
        const after = own
          .filter((v) => v.effectiveFrom > t.effectiveFrom)
          .sort((x, y) => x.effectiveFrom.localeCompare(y.effectiveFrom))[0];
        return after
          ? {
              endsMonth: after.effectiveFrom,
              ...(t.promoEndsOn
                ? { deadline: t.promoEndsOn.toISOString().slice(0, 10) }
                : {}),
              aprBasisPoints: after.aprBasisPoints,
              accrued: t.deferredAccrued ?? 0n,
            }
          : undefined;
      })(),
      // Custom order; unranked debts go last.
      priority: ranks[a.id],
      // Due later this month (or unknown): today's balance is paid before any
      // new interest. Once the due day has passed, the next payment follows
      // another month's interest.
      firstPaymentBeforeInterest:
        !t?.dueDay || Number(todayDate.slice(8, 10)) <= t.dueDay,
      // What the recorded rule demands at today's balance, so a percentage
      // rule can be checked against the statement.
      currentMinimum: t
        ? minimumDue(
            {
              minimumPayment: t.minimumPayment,
              percentBasisPoints: t.minimumPercentBasisPoints,
              includeInterest: t.minimumIncludesInterest,
            },
            a.owed,
            monthlyInterest(a.owed, t.aprBasisPoints),
          )
        : null,
    };
  });
}

/** An adopted plan's settings: a scenario kept, never its projection. */
export interface PlanSettings {
  strategy: Strategy;
  monthlyBudget: bigint | null;
  extraMonthly: bigint;
  ranks: Record<string, number>;
  clearDeferredFirst: boolean;
  /** Payments the owner fixed: card id -> { month: cents }. */
  pins?: unknown;
}

/**
 * The fixed payments still ahead, from a plan's stored pins. Past months are
 * history and dropped; anything malformed is ignored rather than trusted.
 */
export function fixedPayments(pins: unknown, fromMonth: string): FixedPayment[] {
  if (!pins || typeof pins !== "object") return [];
  const out: FixedPayment[] = [];
  for (const [accountId, months] of Object.entries(pins as Record<string, unknown>)) {
    if (!months || typeof months !== "object") continue;
    for (const [month, cents] of Object.entries(months as Record<string, unknown>))
      if (
        /^\d{4}-\d{2}$/.test(month) &&
        month >= fromMonth &&
        typeof cents === "string" &&
        /^\d{1,12}$/.test(cents)
      )
        out.push({ accountId, month, amount: BigInt(cents) });
  }
  return out;
}

/**
 * An adopted plan worked out from today's balances: the whole schedule, so
 * the month being applied and the months the Budget page looks ahead to come
 * from one simulation. `paymentFor` is what the plan pays a card in a month,
 * or null once the card is cleared (it has no row after its payoff month).
 * Nothing here is stored; the plan keeps its settings only.
 */
export function planProjection(
  settings: PlanSettings,
  accounts: OwedAccount[],
  versions: DebtTerms[],
  currentMonth: string,
  todayDate: string,
) {
  const debts = plannedDebts(
    accounts,
    versions,
    currentMonth,
    todayDate,
    settings.ranks,
  );
  const missingTerms = debts.filter((d) => !d.hasTerms);
  const result =
    debts.length && !missingTerms.length
      ? simulatePayoff({
          debts,
          startMonth: currentMonth,
          strategy: settings.strategy,
          maxMonths: 360,
          clearDeferredFirst: settings.clearDeferredFirst,
          fixedPayments: fixedPayments(settings.pins, currentMonth),
          ...(settings.monthlyBudget
            ? { monthlyBudget: settings.monthlyBudget }
            : { extraMonthly: settings.extraMonthly }),
        })
      : null;
  const payments = new Map<string, bigint>();
  for (const row of result?.rows ?? [])
    payments.set(`${row.accountId}:${row.month}`, row.payment);
  return {
    debts,
    missingTerms,
    result,
    paymentFor: (accountId: string, month: string): bigint | null =>
      result ? (payments.get(`${accountId}:${month}`) ?? null) : null,
  };
}

/** Ranks from a scenario's rank_<accountId> fields; anything else is dropped. */
export function ranksFrom(values: Record<string, unknown>) {
  const ranks: Record<string, number> = {};
  for (const [key, value] of Object.entries(values)) {
    const match = /^rank_([0-9a-f-]{36})$/.exec(key);
    const rank = Number(value);
    if (match && Number.isInteger(rank) && rank > 0 && rank < 100)
      ranks[match[1]] = rank;
  }
  return ranks;
}
