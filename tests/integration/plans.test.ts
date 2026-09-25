import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/infrastructure/db";
import { createOwner, listBudgets } from "@/application/auth";
import { getFinance } from "@/application/finance";
import {
  activeBudget,
  createPlan,
  renamePlan,
  selectPlan,
} from "@/application/plans";

const db = getDb();
let userId: string, firstId: string;
async function clear() {
  await db.$executeRawUnsafe(
    'TRUNCATE "Budget", "User", "Installation", "LoginThrottle" CASCADE',
  );
}
beforeEach(async () => {
  await clear();
  userId = (await createOwner("owner", "synthetic-finance-passphrase")).userId;
  firstId = (await db.budget.findFirstOrThrow()).id;
});
afterAll(async () => {
  await clear();
  await db.$disconnect();
});

describe("multiple plans", () => {
  it("creates, renames and opens plans only for their members", async () => {
    const second = await createPlan(userId, "  Side plan  ", firstId);
    expect(second.name).toBe("Side plan");
    expect((await listBudgets(userId)).map((b) => b.id)).toEqual([firstId, second.id]);
    // The browser's choice wins when valid; anything else falls back.
    expect((await activeBudget(userId, second.id))?.id).toBe(second.id);
    expect((await activeBudget(userId, "not-a-plan"))?.id).toBe(firstId);
    expect((await activeBudget(userId))?.id).toBe(firstId);
    const fresh = await getFinance(userId, second.id);
    expect(fresh.categories).toEqual([]);
    expect(fresh.projection.readyToAssign).toBe(0n);
    await renamePlan(userId, second.id, "Holiday");
    expect((await db.budget.findUniqueOrThrow({ where: { id: second.id } })).name).toBe("Holiday");
    await expect(renamePlan(userId, second.id, "   ")).rejects.toThrow("Name the plan");
    const stranger = await db.user.create({ data: { username: "stranger", passwordHash: "x" } });
    await expect(selectPlan(stranger.id, second.id)).rejects.toThrow("Plan unavailable");
    await expect(renamePlan(stranger.id, second.id, "Mine")).rejects.toThrow("Plan unavailable");
    expect(await selectPlan(userId, second.id)).toBe(second.id);
    expect(
      await db.auditEvent.count({ where: { budgetId: second.id, action: "FINANCE_COMMAND" } }),
    ).toBe(2);
  });
});
