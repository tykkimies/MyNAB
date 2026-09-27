import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/infrastructure/db";
import { getConfig, plaidConfigured } from "@/infrastructure/config";
import { attentionItems } from "@/domain/attention";
import { authorize } from "./finance";
import { getSchedules } from "./schedules";
import { workerStatus } from "./jobs";

/**
 * Everything waiting on the owner outside the budget itself, gathered for the
 * Budget page. Overspending is left out: the page already reports it from the
 * same projection. Read-only.
 */
export async function getAttention(userId: string, budgetId: string) {
  const counts = await getDb().$transaction(
    async (tx) => {
      await authorize(tx, userId, budgetId);
      const [connections, unapproved, bankChanges, affected, reminders] =
        await Promise.all([
          tx.providerConnection.findMany({
            where: {
              budgetId,
              provider: "PLAID",
              status: { not: "DISCONNECTED" },
            },
            select: { status: true, errorCode: true },
          }),
          tx.ingestedEntry.count({
            where: {
              budgetId,
              removed: false,
              approved: false,
              status: "POSTED",
              review: { equals: Prisma.DbNull },
            },
          }),
          tx.ingestedEntry.count({
            where: {
              budgetId,
              removed: false,
              review: { not: Prisma.DbNull },
            },
          }),
          // Only each account's latest statement: reconciling again settles it.
          tx.reconciliation.findMany({
            where: { budgetId },
            orderBy: [{ accountId: "asc" }, { createdAt: "desc" }],
            distinct: ["accountId"],
            select: { affectedAt: true },
          }),
          tx.debtReminder.groupBy({
            by: ["level"],
            where: { budgetId, doneAt: null, supersededAt: null },
            _count: true,
          }),
        ]);
      return { connections, unapproved, bankChanges, affected, reminders };
    },
    { isolationLevel: "RepeatableRead" },
  );
  const [overdue, worker] = await Promise.all([
    getSchedules(userId, budgetId).then((s) => s.overdue.count),
    workerStatus(),
  ]);
  return attentionItems({
    reauth: counts.connections.filter((c) => c.errorCode === "REAUTH_REQUIRED")
      .length,
    connectionErrors: counts.connections.filter(
      (c) => c.status === "ERROR" && c.errorCode !== "REAUTH_REQUIRED",
    ).length,
    workerDown:
      plaidConfigured(getConfig()) &&
      counts.connections.length > 0 &&
      !worker.running,
    bankChanges: counts.bankChanges,
    unapproved: counts.unapproved,
    overdue,
    affectedReconciliations: counts.affected.filter((r) => r.affectedAt).length,
    debtActions:
      counts.reminders.find((r) => r.level === "act")?._count ?? 0,
    debtReviews:
      counts.reminders.find((r) => r.level === "review")?._count ?? 0,
  });
}
