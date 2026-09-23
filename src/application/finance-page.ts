import "server-only";
import { requireUser } from "./session";
import { listBudgets } from "./auth";
import { getFinance } from "./finance";
export async function financePage(month?: string) {
  const user = await requireUser();
  const budget = (await listBudgets(user.userId))[0];
  if (!budget) throw new Error("Budget unavailable");
  return getFinance(user.userId, budget.id, month);
}
