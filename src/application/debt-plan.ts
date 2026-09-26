import type { DebtTerms } from "@/generated/prisma/client";
import { minimumDue, monthlyInterest, type Debt, type Strategy } from "@/domain/debt";
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
