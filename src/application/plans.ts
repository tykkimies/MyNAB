import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/infrastructure/db";
import { listBudgets } from "./auth";
import { FinanceError } from "./finance";

/** The cookie that remembers which plan this browser has open. */
export const PLAN_COOKIE = "mynab-plan";
const planName = z.string().trim().min(1).max(120);
export const ARCHIVE_RECOVERY_MS = 30 * 24 * 60 * 60 * 1000;

async function hasBudgetData(tx: Prisma.TransactionClient, budgetId: string) {
  const tables = await tx.$queryRaw<{ tableName: string }[]>`
    SELECT DISTINCT c.table_name AS "tableName"
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.column_name = 'budgetId'
      AND c.table_name NOT IN ('Budget', 'BudgetMember', 'AuditEvent', 'Job')
  `;
  if (!tables.length) return false;
  const checks = tables.map(({ tableName }) => {
    const quotedTable = `"${tableName.replaceAll('"', '""')}"`;
    return `EXISTS (SELECT 1 FROM public.${quotedTable} WHERE "budgetId" = $1::uuid)`;
  });
  const [result] = await tx.$queryRawUnsafe<{ hasData: boolean }[]>(
    `SELECT (${checks.join(" OR ")}) AS "hasData"`,
    budgetId,
  );
  return result?.hasData ?? false;
}

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
    include: { budget: { select: { archivedAt: true } } },
  });
  if (!member || member.budget.archivedAt)
    throw new FinanceError("Plan unavailable.");
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

/** Plan settings an owner can change. Dates are display only. */
export async function updatePlanSettings(
  userId: string,
  budgetId: string,
  dateFormat: string,
) {
  if (!["ISO", "US", "EU"].includes(dateFormat))
    throw new FinanceError("Choose a date format.");
  const member = await memberBudget(userId, budgetId);
  if (member.role !== "owner")
    throw new FinanceError("Only an owner can change plan settings.");
  await getDb().$transaction([
    getDb().budget.update({ where: { id: budgetId }, data: { dateFormat } }),
    getDb().auditEvent.create({
      data: {
        actorId: userId,
        budgetId,
        action: "FINANCE_COMMAND",
        entityId: budgetId,
        details: { type: "plan.settings", dateFormat },
      },
    }),
  ]);
}

export async function listArchivedPlans(userId: string) {
  const now = new Date();
  return getDb().$transaction(async (tx) => {
    const plans = await tx.budget.findMany({
      where: {
        archivedAt: { not: null },
        members: { some: { userId, role: "owner" } },
      },
      select: { id: true, name: true, archivedAt: true, purgeAfter: true },
      orderBy: { archivedAt: "desc" },
    });
    return Promise.all(
      plans.map(async (plan) => {
        const hasData = await hasBudgetData(tx, plan.id);
        return {
        ...plan,
        canRestore: !!plan.purgeAfter && now < plan.purgeAfter,
        canPurge: !!plan.purgeAfter && now >= plan.purgeAfter && !hasData,
        hasData,
        };
      }),
    );
  });
}

export async function archivePlan(userId: string, budgetId: string, now = new Date()) {
  return getDb().$transaction(async (tx) => {
    const member = await tx.budgetMember.findUnique({
      where: { budgetId_userId: { budgetId, userId } },
    });
    if (!member) throw new FinanceError("Plan unavailable.");
    if (member.role !== "owner")
      throw new FinanceError("Only an owner can archive a plan.");
    const budget = await tx.budget.findUnique({ where: { id: budgetId } });
    if (!budget || budget.archivedAt)
      throw new FinanceError("Plan unavailable.");
    const purgeAfter = new Date(now.getTime() + ARCHIVE_RECOVERY_MS);
    await tx.budget.update({ where: { id: budgetId }, data: { archivedAt: now, purgeAfter } });
    await tx.job.updateMany({
      where: { budgetId, status: { in: ["QUEUED", "RUNNING"] } },
      data: {
        status: "FAILED",
        leaseToken: null,
        leasedUntil: null,
        lastError: "Budget archived",
        finishedAt: now,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: userId,
        budgetId,
        action: "FINANCE_COMMAND",
        entityId: budgetId,
        details: { type: "plan.archive", purgeAfter: purgeAfter.toISOString() },
      },
    });
    return { archivedAt: now, purgeAfter };
  });
}

export async function restorePlan(userId: string, budgetId: string, now = new Date()) {
  return getDb().$transaction(async (tx) => {
    const member = await tx.budgetMember.findUnique({
      where: { budgetId_userId: { budgetId, userId } },
    });
    if (!member) throw new FinanceError("Plan unavailable.");
    if (member.role !== "owner")
      throw new FinanceError("Only an owner can restore a plan.");
    const budget = await tx.budget.findUnique({ where: { id: budgetId } });
    if (!budget?.archivedAt || !budget.purgeAfter)
      throw new FinanceError("Plan unavailable.");
    if (now >= budget.purgeAfter)
      throw new FinanceError("This plan's recovery period has ended.");
    await tx.budget.update({
      where: { id: budgetId },
      data: { archivedAt: null, purgeAfter: null },
    });
    await tx.auditEvent.create({
      data: {
        actorId: userId,
        budgetId,
        action: "FINANCE_COMMAND",
        entityId: budgetId,
        details: { type: "plan.restore" },
      },
    });
    return budgetId;
  });
}

export async function purgeEmptyPlan(userId: string, budgetId: string, now = new Date()) {
  return getDb().$transaction(async (tx) => {
    const member = await tx.budgetMember.findUnique({
      where: { budgetId_userId: { budgetId, userId } },
    });
    if (!member) throw new FinanceError("Plan unavailable.");
    if (member.role !== "owner")
      throw new FinanceError("Only an owner can delete a plan.");
    const budget = await tx.budget.findUnique({ where: { id: budgetId } });
    if (!budget?.archivedAt || !budget.purgeAfter)
      throw new FinanceError("Plan unavailable.");
    if (now < budget.purgeAfter)
      throw new FinanceError("Wait until the plan's 30-day recovery period ends.");

    if (await hasBudgetData(tx, budgetId))
      throw new FinanceError("Plans with budget data must remain archived.");

    await tx.auditEvent.updateMany({ where: { budgetId }, data: { budgetId: null } });
    await tx.job.deleteMany({ where: { budgetId } });
    await tx.budgetMember.deleteMany({ where: { budgetId } });
    await tx.budget.delete({ where: { id: budgetId } });
    await tx.auditEvent.create({
      data: {
        actorId: userId,
        action: "FINANCE_COMMAND",
        entityId: budgetId,
        details: { type: "plan.purge" },
      },
    });
    return budgetId;
  });
}
