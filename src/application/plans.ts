import { z } from "zod";
import { getDb } from "@/infrastructure/db";
import { listBudgets } from "./auth";
import { FinanceError } from "./finance";

/** The cookie that remembers which plan this browser has open. */
export const PLAN_COOKIE = "mynab-plan";
const planName = z.string().trim().min(1).max(120);

/**
 * The plan to show: the one this browser chose, if the user still belongs to
 * it, otherwise their oldest plan. The cookie is only a preference; every
 * command still authorizes membership itself.
 */
export async function activeBudget(userId: string, preferred?: string) {
  const budgets = await listBudgets(userId);
  return budgets.find((b) => b.id === preferred) ?? budgets[0];
}

async function memberBudget(userId: string, budgetId: string) {
  const member = await getDb().budgetMember.findUnique({
    where: { budgetId_userId: { budgetId, userId } },
  });
  if (!member) throw new FinanceError("Plan unavailable.");
  return member;
}

/** A new, empty plan in the same timezone as the one it was created from. */
export async function createPlan(userId: string, name: string, from?: string) {
  const parsed = planName.safeParse(name);
  if (!parsed.success) throw new FinanceError("Name the plan (up to 120 characters).");
  const source = await activeBudget(userId, from);
  return getDb().$transaction(async (tx) => {
    if ((await tx.budgetMember.count({ where: { userId } })) >= 50)
      throw new FinanceError("You can keep up to 50 plans.");
    const budget = await tx.budget.create({
      data: {
        name: parsed.data,
        timezone: source?.timezone ?? "America/New_York",
        members: { create: { userId, role: "owner" } },
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: userId,
        budgetId: budget.id,
        action: "FINANCE_COMMAND",
        entityId: budget.id,
        details: { type: "plan.create" },
      },
    });
    return budget;
  });
}

export async function renamePlan(userId: string, budgetId: string, name: string) {
  const parsed = planName.safeParse(name);
  if (!parsed.success) throw new FinanceError("Name the plan (up to 120 characters).");
  const member = await memberBudget(userId, budgetId);
  if (member.role !== "owner") throw new FinanceError("Only an owner can rename a plan.");
  await getDb().$transaction([
    getDb().budget.update({ where: { id: budgetId }, data: { name: parsed.data } }),
    getDb().auditEvent.create({
      data: {
        actorId: userId,
        budgetId,
        action: "FINANCE_COMMAND",
        entityId: budgetId,
        details: { type: "plan.rename" },
      },
    }),
  ]);
}

/** Confirms the user may open the plan before the browser remembers it. */
export async function selectPlan(userId: string, budgetId: string) {
  await memberBudget(userId, budgetId);
  return budgetId;
}
