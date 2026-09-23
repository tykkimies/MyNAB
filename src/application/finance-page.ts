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
export async function connectionsPage() {
  const user = await requireUser();
  const budget = (await listBudgets(user.userId))[0];
  if (!budget) throw new Error("Budget unavailable");
  const { getConnections } = await import("./ingestion");
  return { budget, ...(await getConnections(user.userId, budget.id)) };
}
