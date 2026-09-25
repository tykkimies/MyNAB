import "server-only";
import { requireUser } from "./session";
import { cookies } from "next/headers";
import { activeBudget, PLAN_COOKIE } from "./plans";
import { getFinance } from "./finance";
import type { Strategy } from "@/domain/debt";
export async function financePage(month?: string) {
  const user = await requireUser();
  const budget = await openBudget(user.userId);
  if (!budget) throw new Error("Budget unavailable");
  return getFinance(user.userId, budget.id, month);
}
export async function connectionsPage() {
  const user = await requireUser();
  const budget = await openBudget(user.userId);
  if (!budget) throw new Error("Budget unavailable");
  const { getConnections } = await import("./ingestion");
  const { workerStatus } = await import("./jobs");
  return {
    budget,
    ...(await getConnections(user.userId, budget.id)),
    worker: await workerStatus(),
  };
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
  const { getTargetHistory } = await import("./finance");
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
      paymentAccountId: category?.paymentAccountId ?? null,
      pace,
      completion: projectCompletion(target, target.progress, state.month, pace),
    };
  });
  // Completion is derived per month rather than stored, so a target met in an
  // earlier month stays visible without a flag that could drift.
  const history = await getTargetHistory(
    (await requireUser()).userId,
    state.budget.id,
  );
  return {
    ...state,
    targets,
    history,
    summary: summarizeTargets(
      state.targets.map((target) => ({
        ...target,
        progress:
          target.snoozed || target.hidden
            ? { ...target.progress, contribution: 0n }
            : target.progress,
      })),
    ),
    // Owner categories that could take a target but have none. A card payment
    // category is left out: what it needs for new spending is already computed
    // by the budget engine, and only a payoff target belongs on top of that.
    withoutTarget: state.categories.filter(
      (c) =>
        !c.archived &&
        !c.system &&
        !c.paymentAccountId &&
        !state.targets.some((t) => t.categoryId === c.id),
    ),
    // Cards, which take the two payoff target types and nothing else.
    cards: state.categories.filter((c) => !c.archived && c.paymentAccountId),
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
  budget?: string;
  lump?: string;
  lumpMonth?: string;
  payoffBy?: string;
}) {
  const user = await requireUser();
  const budget = await openBudget(user.userId);
  if (!budget) throw new Error("Budget unavailable");
  const state = await getFinance(user.userId, budget.id);
  const { getDebtTerms } = await import("./finance");
  const versions = await getDebtTerms(user.userId, budget.id);
  const { DEBT_TYPES } = await import("./finance");
  const { simulatePayoff, monthlyBudgetForPayoffDate, comparePlans } =
    await import("@/domain/debt");
  const { parseUSD } = await import("@/domain/money");
  const { versionFor, versionHistory, versionsFrom } =
    await import("@/domain/versions");

  // Terms are versioned, so what is shown is what is in force this month, and
  // what the simulation charges is whatever is in force in each month it walks
  // through. A promotional rate ending is simply a later version.
  const inForce = (accountId: string) =>
    versionFor(
      versions.filter((v) => v.accountId === accountId),
      state.month,
    );

  const owed = state.projection.accounts
    .filter(
      (a) =>
        DEBT_TYPES.includes(a.type) &&
        a.participation !== undefined &&
        a.balance < 0n,
    )
    .map((a) => {
      const t = inForce(a.id);
      return {
        accountId: a.id,
        name: a.name,
        balance: -a.balance,
        aprBasisPoints: t?.aprBasisPoints ?? 0,
        minimumPayment: t?.minimumPayment ?? 0n,
        percentBasisPoints: t?.minimumPercentBasisPoints ?? 0,
        includeInterest: t?.minimumIncludesInterest ?? false,
        minimums: versionsFrom(
          versions.filter((v) => v.accountId === a.id),
          state.month,
        ).map((v) => ({
          effectiveFrom: v.effectiveFrom,
          minimumPayment: v.minimumPayment,
          percentBasisPoints: v.minimumPercentBasisPoints,
          includeInterest: v.minimumIncludesInterest,
        })),
        rates: versionsFrom(
          versions.filter((v) => v.accountId === a.id),
          state.month,
        ).map((v) => ({
          effectiveFrom: v.effectiveFrom,
          aprBasisPoints: v.aprBasisPoints,
        })),
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
  // A total budget replaces the extra amount rather than adding to it.
  const budgetValue = safeMoney(scenario.budget);
  const monthlyBudget = budgetValue > 0n ? budgetValue : undefined;
  const extraMonthly =
    monthlyBudget === undefined ? safeMoney(scenario.extra) : 0n;
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
  let payoffError: string | null = null;
  let requiredMonthlyBudget: bigint | null = null;
  let plan = ready
    ? simulatePayoff({ ...request, extraMonthly, monthlyBudget, lumpSums })
    : null;
  if (ready && scenario.payoffBy) {
    try {
      const solved = monthlyBudgetForPayoffDate(
        { ...request, lumpSums },
        scenario.payoffBy,
      );
      requiredMonthlyBudget = solved.monthlyBudget;
      plan = solved.plan;
    } catch (error) {
      payoffError =
        error instanceof Error ? error.message : "Invalid payoff month";
    }
  }
  // The comparison is against paying minimums only, which is what happens if
  // the owner does nothing.
  const baseline = ready
    ? simulatePayoff({ ...request, minimumsOnly: true })
    : null;
  return {
    budget,
    month,
    accounts: state.accounts,
    debts: owed,
    // What is in force this month, per account, for the terms table.
    terms: state.accounts.flatMap((a) => {
      const t = inForce(a.id);
      return t ? [t] : [];
    }),
    // Every version, newest first, so a rate change is visible rather than
    // silently replacing what a past month was planned against.
    termHistory: versionHistory(versions),
    strategy,
    extraMonthly,
    monthlyBudget,
    lumpAmount,
    lumpMonth: scenario.lumpMonth ?? "",
    payoffBy: scenario.payoffBy ?? "",
    payoffError,
    requiredMonthlyBudget,
    plan,
    comparison: plan && baseline ? comparePlans(baseline, plan) : null,
    ready,
  };
}

/** Everything the Reports page needs, from one authorized read. */
export async function reportsPage(query: import("./reports").ReportQuery) {
  const user = await requireUser();
  const budget = await openBudget(user.userId);
  if (!budget) throw new Error("Budget unavailable");
  const { getReports } = await import("./reports");
  return { budget, ...(await getReports(user.userId, budget.id, query)) };
}

/** The plan this browser has open. */
export async function openBudget(userId: string) {
  return activeBudget(userId, (await cookies()).get(PLAN_COOKIE)?.value);
}

/**
 * YNAB's Loan Planner for one debt account: what paying extra each month, or
 * once, does to its payoff date and interest. It reuses the Debt page's
 * versioned terms, so the two can never disagree. Nothing is stored.
 */
export async function loanPlan(
  accountId: string,
  scenario: { extra?: string; lump?: string; lumpMonth?: string },
) {
  const page = await debtPage({});
  const debt = page.debts.find((d) => d.accountId === accountId);
  if (!debt || !debt.hasTerms) return null;
  const { simulatePayoff } = await import("@/domain/debt");
  const { parseUSD } = await import("@/domain/money");
  const safe = (value?: string) => {
    if (!value) return 0n;
    try {
      const parsed = parseUSD(value);
      return parsed > 0n ? parsed : 0n;
    } catch {
      return 0n;
    }
  };
  const extra = safe(scenario.extra);
  const lump = safe(scenario.lump);
  const lumpMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(scenario.lumpMonth ?? "")
    ? scenario.lumpMonth!
    : page.month;
  const request = {
    debts: [debt],
    startMonth: page.month,
    strategy: "AVALANCHE" as const,
    maxMonths: 600,
  };
  const baseline = simulatePayoff({ ...request, minimumsOnly: true });
  const planned = simulatePayoff({
    ...request,
    extraMonthly: extra,
    lumpSums: lump > 0n ? [{ month: lumpMonth, amount: lump }] : [],
  });
  const index = (m: string | null) =>
    m ? Number(m.slice(0, 4)) * 12 + Number(m.slice(5)) : null;
  const a = index(baseline.payoffMonth);
  const b = index(planned.payoffMonth);
  return {
    debt,
    extra,
    lump,
    lumpMonth,
    baseline,
    planned,
    monthsSaved: a !== null && b !== null ? a - b : null,
    interestSaved: baseline.totalInterest - planned.totalInterest,
  };
}

/** What an account is linked to, if anything, for its settings panel. */
export async function accountLink(accountId: string) {
  const user = await requireUser();
  const budget = await openBudget(user.userId);
  if (!budget) return null;
  const { getDb } = await import("@/infrastructure/db");
  const link = await getDb().providerAccount.findFirst({
    where: { budgetId: budget.id, accountId },
  });
  if (!link) return null;
  const connection = await getDb().providerConnection.findFirst({
    where: { id: link.connectionId, budgetId: budget.id },
  });
  return {
    bank: connection?.provider !== "FILE",
    institution: connection?.institutionName ?? "your bank",
    name: link.name,
    mask: link.mask,
  };
}
