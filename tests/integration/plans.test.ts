import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/infrastructure/db";
import { createOwner, listBudgets } from "@/application/auth";
import { randomUUID } from "node:crypto";
import {
  executeFinance,
  getFinance,
  type FinanceCommand,
} from "@/application/finance";
import { freshStart } from "@/application/fresh-start";
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

  it("starts fresh from today's balances and keeps the old plan intact", async () => {
    const run = (command: FinanceCommand) =>
      executeFinance(userId, firstId, randomUUID(), command);
    const cash = (await run({ type: "account.create", name: "Checking", accountType: "CHECKING", participation: "BUDGET", opening: "1000", date: "2026-01-01" })).id;
    const card = (await run({ type: "account.create", name: "Visa", accountType: "CREDIT_CARD", participation: "BUDGET", opening: "-200", date: "2026-01-01" })).id;
    const closed = (await run({ type: "account.create", name: "Old", accountType: "SAVINGS", participation: "BUDGET", opening: "0", date: "2026-01-01" })).id;
    await db.financialAccount.update({ where: { id: closed }, data: { closed: true } });
    const groupId = (await run({ type: "group.create", name: "Everyday" })).id;
    const food = (await run({ type: "category.create", name: "Food", groupId })).id;
    const gifts = (await run({ type: "category.create", name: "Gifts", groupId })).id;
    await run({ type: "category.update", id: gifts, name: "Gifts", groupId, archived: false, note: "Birthdays" });
    await run({ type: "category.hide", id: gifts, hidden: true });
    await run({ type: "transaction.create", accountId: card, kind: "EXPENSE", date: "2026-02-01", amount: "-12.34", splits: [{ categoryId: food, amount: "-12.34" }] });
    await run({ type: "assign", categoryId: food, month: "2026-02", amount: "50" });
    await run({ type: "target.set", categoryId: food, targetType: "MONTHLY", amount: "400", effectiveFrom: "2026-01" });
    await run({ type: "debt.terms.set", accountId: card, apr: "0", minimumPayment: "25" });
    await run({ type: "schedule.create", name: "Rent", accountId: cash, kind: "EXPENSE", amount: "-900", payee: "Landlord", startDate: "2026-01-03", cadence: "MONTHLY", splits: [{ categoryId: food, amount: "-900" }] });
    await run({ type: "view.save", name: "Just food", categoryIds: [food] });
    const before = await getFinance(userId, firstId);

    const result = await freshStart(userId, firstId);
    expect(result.warnings).toEqual([]);
    const old = await db.budget.findUniqueOrThrow({ where: { id: firstId } });
    const plan = await db.budget.findUniqueOrThrow({ where: { id: result.id } });
    expect(old.name).toMatch(/ \(Archived \d{4}-\d{2}-\d{2}\)$/);
    expect(plan.name).toBe(before.budget.name);
    // The archived plan's ledger is untouched.
    const after = await getFinance(userId, firstId);
    expect(after.transactions.length).toBe(before.transactions.length);
    expect(after.projection.readyToAssign).toBe(before.projection.readyToAssign);

    const fresh = await getFinance(userId, result.id);
    expect(fresh.accounts.map((a) => a.name).sort()).toEqual(["Checking", "Visa"]);
    const balance = (s: typeof fresh, name: string) =>
      s.projection.accounts.find((a) => s.accounts.find((x) => x.id === a.id)?.name === name)?.balance;
    expect(balance(fresh, "Checking")).toBe(100000n);
    expect(balance(fresh, "Visa")).toBe(-21234n);
    expect(fresh.transactions.every((t) => t.kind === "OPENING")).toBe(true);
    const newGifts = fresh.categories.find((c) => c.name === "Gifts")!;
    expect(newGifts).toMatchObject({ hidden: true, note: "Birthdays" });
    const newFood = fresh.categories.find((c) => c.name === "Food")!;
    expect(fresh.targets.find((t) => t.categoryId === newFood.id)).toBeTruthy();
    expect(fresh.views.map((v) => [v.name, v.categoryIds])).toEqual([["Just food", [newFood.id]]]);
    expect(await db.debtTerms.count({ where: { budgetId: result.id } })).toBe(1);
    const schedules = await db.schedule.findMany({ where: { budgetId: result.id } });
    expect(schedules.map((s) => [s.name, s.amount])).toEqual([["Rent", -90000n]]);
    // Assignments do not carry: every dollar starts in Ready to Assign.
    expect(await db.budgetAssignment.count({ where: { budgetId: result.id } })).toBe(0);
    await expect(freshStart(randomUUID(), firstId)).rejects.toThrow("Plan unavailable");
  });
});
