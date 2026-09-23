import "server-only";
import { requireUser } from "./session";
import { listBudgets } from "./auth";
import { getFinance } from "./finance";
import type { Strategy } from "@/domain/debt";
export async function financePage(month?: string) {
  const user = await requireUser();
  const budget = (await listBudgets(user.userId))[0];
  if (!budget) throw new Error("Budget unavailable");
  return getFinance(user.userId, budget.id, month);
}
export async function connectionsPage() {
  const user = await requireUser();
  const budget = (await listBudgets(user.userId))[0];
  if (!budget) throw new Error("Budget unavailable");
  const { getConnections } = await import("./ingestion");
  return { budget, ...(await getConnections(user.userId, budget.id)) };
}

/**
 * Everything the Goals page needs.
 *
 * Progress is the same reading the Budget page uses: it comes from
 * `getFinance`, which derives it from the projection, so the two pages can
 * never disagree about what a target needs. Nothing here writes anything.
 */
export async function goalsPage(month?: string) {
  const state = await financePage(month);
  const { projectCompletion, summarizeTargets } =
    await import("@/domain/goals");
  const targets = state.targets.map((target) => {
    const category = state.categories.find((c) => c.id === target.categoryId);
    const row = state.projection.categories.find(
      (r) => r.id === target.categoryId,
    );
    // The pace is what this category actually received this month, which is an
    // assumption about the future rather than a measurement of it. Assigning
    // nothing projects nothing, instead of quietly borrowing the required
    // contribution and always answering "on time".
    const pace = row?.assigned ?? 0n;
    return {
      ...target,
      name: category?.name ?? "Category",
      group:
        state.groups.find((g) => g.id === category?.groupId)?.name ??
        "Ungrouped",
      archived: category?.archived ?? false,
      pace,
      completion: projectCompletion(target, target.progress, state.month, pace),
    };
  });
  return {
    ...state,
    targets,
    summary: summarizeTargets(state.targets),
    // Owner categories that could take a target but have none. Payment reserves
    // are excluded: the budget engine computes what a card needs, so a target
    // on top of it would be a second, competing answer.
    withoutTarget: state.categories.filter(
      (c) =>
        !c.archived &&
        !c.system &&
        !c.paymentAccountId &&
        !state.targets.some((t) => t.categoryId === c.id),
    ),
  };
}

/**
 * Everything the debt page needs. Balances come from the ledger projection;
 * the scenario comes from the request and is never stored, so running one
 * cannot change a budget.
 */
export async function debtPage(scenario: {
  strategy?: string;
  extra?: string;
  lump?: string;
  lumpMonth?: string;
}) {
  const user = await requireUser();
  const budget = (await listBudgets(user.userId))[0];
  if (!budget) throw new Error("Budget unavailable");
  const state = await getFinance(user.userId, budget.id);
  const { getDebtTerms } = await import("./finance");
  const terms = await getDebtTerms(user.userId, budget.id);
  const { DEBT_TYPES } = await import("./finance");
  const { simulatePayoff, comparePlans } = await import("@/domain/debt");
  const { parseUSD } = await import("@/domain/money");

  const owed = state.projection.accounts
    .filter(
      (a) =>
        DEBT_TYPES.includes(a.type) &&
        a.participation !== undefined &&
        a.balance < 0n,
    )
    .map((a) => {
      const t = terms.find((x) => x.accountId === a.id);
      return {
        accountId: a.id,
        name: a.name,
        balance: -a.balance,
        aprBasisPoints: t?.aprBasisPoints ?? 0,
        minimumPayment: t?.minimumPayment ?? 0n,
        hasTerms: Boolean(t),
        dueDay: t?.dueDay ?? null,
      };
    });

  const strategy: Strategy =
    scenario.strategy === "SNOWBALL" || scenario.strategy === "CUSTOM"
      ? scenario.strategy
      : "AVALANCHE";
  const safeMoney = (value?: string) => {
    if (!value) return 0n;
    try {
      const parsed = parseUSD(value);
      return parsed > 0n ? parsed : 0n;
    } catch {
      return 0n;
    }
  };
  const extraMonthly = safeMoney(scenario.extra);
  const lumpAmount = safeMoney(scenario.lump);
  const month = state.month;
  const lumpSums =
    lumpAmount > 0n && scenario.lumpMonth
      ? [{ month: scenario.lumpMonth, amount: lumpAmount }]
      : [];

  // Only simulate once every debt has terms; a missing APR would silently
  // model an interest-free loan, which is the most flattering possible lie.
  const ready = owed.length > 0 && owed.every((d) => d.hasTerms);
  const request = { debts: owed, startMonth: month, strategy, maxMonths: 360 };
  const plan = ready
    ? simulatePayoff({ ...request, extraMonthly, lumpSums })
    : null;
  // The comparison is against paying minimums only, which is what happens if
  // the owner does nothing.
  const baseline = ready ? simulatePayoff(request) : null;
  return {
    budget,
    month,
    accounts: state.accounts,
    debts: owed,
    terms,
    strategy,
    extraMonthly,
    lumpAmount,
    lumpMonth: scenario.lumpMonth ?? "",
    plan,
    comparison: plan && baseline ? comparePlans(baseline, plan) : null,
    ready,
  };
}
