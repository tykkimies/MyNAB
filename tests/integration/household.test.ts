import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/infrastructure/db";
import { createOwner, listBudgets, login } from "@/application/auth";
import { executeFinance, getFinance } from "@/application/finance";
import { renamePlan } from "@/application/plans";
import {
  addPerson,
  changeOwnPassphrase,
  HOUSEHOLD_LIMIT,
  resetPersonPassphrase,
  sharePlan,
  unsharePlan,
} from "@/application/household";

const db = getDb();
let ownerId: string, budgetId: string;
const pass = "synthetic-finance-passphrase";
async function clear() {
  await db.$executeRawUnsafe(
    'TRUNCATE "Budget", "User", "Installation", "LoginThrottle", "Session" CASCADE',
  );
}
beforeEach(async () => {
  await clear();
  ({ userId: ownerId, budgetId } = await createOwner("owner", pass));
});
afterAll(async () => {
  await clear();
  await db.$disconnect();
});

describe("household sharing", () => {
  it("adds people with their own plan and shares a plan with them", async () => {
    const partner = await addPerson(ownerId, "Partner", "partner-passphrase-123");
    expect(partner.username).toBe("partner");
    expect((await listBudgets(partner.id)).map((b) => b.name)).toEqual(["partner's plan"]);
    await expect(addPerson(partner.id, "kid", "kid-passphrase-12345")).rejects.toThrow("Only the person who set up");
    await expect(addPerson(ownerId, "partner", "partner-passphrase-123")).rejects.toThrow("taken");

    await expect(executeFinance(partner.id, budgetId, randomUUID(), { type: "group.create", name: "Nope" })).rejects.toThrow("Budget unavailable");
    await sharePlan(ownerId, budgetId, partner.id);
    expect((await listBudgets(partner.id)).map((b) => b.id)).toContain(budgetId);
    // A member budgets fully, and each change records who made it.
    const group = await executeFinance(partner.id, budgetId, randomUUID(), { type: "group.create", name: "Shared" });
    const category = await executeFinance(partner.id, budgetId, randomUUID(), { type: "category.create", name: "Groceries", groupId: group.id });
    await executeFinance(partner.id, budgetId, randomUUID(), { type: "assign", categoryId: category.id, month: "2026-01", amount: "5" });
    expect((await getFinance(ownerId, budgetId, "2026-01")).moves[0].actor).toBe("partner");
    // Owning the plan stays with its owner.
    await expect(renamePlan(partner.id, budgetId, "Mine")).rejects.toThrow("Only an owner");
    await expect(sharePlan(partner.id, budgetId, partner.id)).rejects.toThrow("Only a plan's owner");
    await expect(unsharePlan(ownerId, budgetId, ownerId)).rejects.toThrow("yourself");

    await unsharePlan(ownerId, budgetId, partner.id);
    await expect(getFinance(partner.id, budgetId)).rejects.toThrow("Budget unavailable");
    expect(await db.auditEvent.count({ where: { action: "MEMBERSHIP_CHANGED" } })).toBe(2);
  });

  it("changes and resets passphrases, signing people out", async () => {
    const partner = await addPerson(ownerId, "partner", "partner-passphrase-123");
    await login("partner", "partner-passphrase-123");
    await expect(changeOwnPassphrase(partner.id, "wrong-passphrase-0000", "new-partner-passphrase")).rejects.toThrow("not right");
    await changeOwnPassphrase(partner.id, "partner-passphrase-123", "new-partner-passphrase");
    expect(await db.session.count({ where: { userId: partner.id } })).toBe(0);
    await expect(login("partner", "partner-passphrase-123")).rejects.toThrow();
    await login("partner", "new-partner-passphrase");
    await resetPersonPassphrase(ownerId, partner.id, "owner-chosen-passphrase");
    await login("partner", "owner-chosen-passphrase");
    await expect(resetPersonPassphrase(partner.id, ownerId, "hijacked-passphrase-1")).rejects.toThrow("Only the person who set up");
  });

  it("holds at most six people", async () => {
    for (let i = 1; i < HOUSEHOLD_LIMIT; i++)
      await addPerson(ownerId, `person${i}`, "someone-passphrase-123");
    await expect(addPerson(ownerId, "person9", "someone-passphrase-123")).rejects.toThrow(`up to ${HOUSEHOLD_LIMIT}`);
  });
});
