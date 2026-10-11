import type { Tx } from "./finance";
import { loadReportInput } from "./reports";
import { nextMonth } from "@/domain/budget";
import { monthlyCostOfLiving } from "@/domain/emergency";

/**
 * Ordinary monthly spending for an emergency fund, from the complete months
 * before `month`, read inside the caller's transaction. Each category's
 * current target decides whether it is saving (left out) or spending.
 */
export async function costOfLiving(tx: Tx, budgetId: string, month: string) {
  const [{ input }, targets, unplanned] = await Promise.all([
    loadReportInput(tx, budgetId),
    tx.categoryTarget.findMany({
      where: { budgetId, effectiveFrom: { lte: month } },
      orderBy: { effectiveFrom: "desc" },
      select: { categoryId: true, type: true },
    }),
    tx.transactionPreference.findMany({
      where: { budgetId, spendingReview: "UNPLANNED" },
      select: { transactionId: true },
    }),
  ]);
  // The newest version at or before the month is the category's target.
  const current = new Map<string, string>();
  for (const t of targets) if (!current.has(t.categoryId)) current.set(t.categoryId, t.type);
  return monthlyCostOfLiving(
    input,
    nextMonth(month, -1),
    [...current].map(([categoryId, type]) => ({ categoryId, type })),
    new Map(unplanned.map((u) => [u.transactionId, "UNPLANNED"])),
  );
}
