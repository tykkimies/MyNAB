import { randomUUID } from "node:crypto";
import { beforeEach, afterAll, describe, it, expect } from "vitest";
import { getDb } from "@/infrastructure/db";
import { createOwner } from "@/application/auth";
import {
  executeFinance,
  getFinance,
  type FinanceCommand,
} from "@/application/finance";
const db = getDb();
let userId: string, budgetId: string;
const run = (command: FinanceCommand, key = randomUUID()) =>
  executeFinance(userId, budgetId, key, command);
async function clear() {
  await db.$executeRawUnsafe(
    'TRUNCATE "Budget", "User", "Installation", "LoginThrottle" CASCADE',
  );
}
beforeEach(async () => {
  await clear();
  const owner = await createOwner("owner", "synthetic-finance-passphrase");
  userId = owner.userId;
  budgetId = (await db.budget.findFirstOrThrow()).id;
});
afterAll(async () => {
  await clear();
  await db.$disconnect();
});
async function setup() {
  const cash = (
    await run({
      type: "account.create",
      name: "Checking",
      accountType: "CHECKING",
      participation: "BUDGET",
      opening: "1000",
      date: "2026-01-01",
    })
  ).id;
  const card = (
    await run({
      type: "account.create",
      name: "Card",
      accountType: "CREDIT_CARD",
      participation: "BUDGET",
      opening: "0",
      date: "2026-01-01",
    })
  ).id;
  const groupId = (await run({ type: "group.create", name: "Everyday" })).id;
  const categoryId = (
    await run({ type: "category.create", name: "Food", groupId })
  ).id;
  await run({ type: "assign", categoryId, month: "2026-01", amount: "400" });
  return { cash, card, categoryId, groupId };
}
describe("financial commands on PostgreSQL", () => {
  it("records purchases, transfers, splits and exact balances with audit and retry safety", async () => {
    const { cash, card, categoryId } = await setup();
    const key = randomUUID();
    const purchase = {
      type: "transaction.create",
      accountId: card,
      kind: "EXPENSE",
      date: "2026-01-03",
      amount: "-100",
      splits: [{ categoryId, amount: "-100" }],
    } as const;
    const p = await run({ ...purchase, splits: [...purchase.splits] }, key);
    expect(
      await run({ ...purchase, splits: [...purchase.splits] }, key),
    ).toEqual(p);
    expect(await db.financialTransaction.count()).toBe(2);
    let state = await getFinance(userId, budgetId, "2026-01");
    expect(state.projection.readyToAssign).toBe(60000n);
    expect(
      state.projection.categories.find((c) => c.paymentAccountId === card)
        ?.available,
    ).toBe(10000n);
    await run({
      type: "transaction.create",
      accountId: cash,
      transferAccountId: card,
      kind: "TRANSFER",
      date: "2026-01-04",
      amount: "-100",
    });
    state = await getFinance(userId, budgetId, "2026-01");
    expect(state.projection.cash).toBe(90000n);
    expect(
      state.projection.categories.find((c) => c.paymentAccountId === card)
        ?.available,
    ).toBe(0n);
    const ledger = await db.posting.groupBy({
      by: ["accountId"],
      where: { budgetId, accountId: { not: null } },
      _sum: { amount: true },
    });
    for (const a of state.projection.accounts)
      expect(ledger.find((l) => l.accountId === a.id)?._sum.amount ?? 0n).toBe(
        a.balance,
      );
    expect(
      await db.auditEvent.count({ where: { action: "FINANCE_COMMAND" } }),
    ).toBe(7);
    await expect(
      run({ type: "group.create", name: "Different" }, key),
    ).rejects.toThrow("different change");
  });
  it("rejects cross-budget mutations and SQL ownership violations", async () => {
    const { cash, categoryId } = await setup();
    const other = await db.budget.create({ data: { name: "Other" } });
    await expect(
      executeFinance(userId, other.id, randomUUID(), {
        type: "group.create",
        name: "Forbidden",
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      run({
        type: "transaction.create",
        accountId: cash,
        kind: "EXPENSE",
        date: "2026-01-03",
        amount: "-10",
        splits: [{ categoryId: randomUUID(), amount: "-10" }],
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      db.budgetAssignment.create({
        data: {
          budgetId: other.id,
          categoryId,
          month: "2026-01",
          amount: 100n,
        },
      }),
    ).rejects.toThrow();
  });
  it("enforces balanced immutable journals and split totals at the database boundary", async () => {
    const { cash, categoryId } = await setup();
    await expect(
      db.$transaction(async (tx) => {
        const j = await tx.journal.create({
          data: { budgetId, date: new Date("2026-01-01") },
        });
        await tx.posting.create({
          data: { budgetId, journalId: j.id, accountId: cash, amount: 100n },
        });
      }),
    ).rejects.toThrow();
    const posting = await db.posting.findFirstOrThrow();
    await expect(
      db.posting.update({ where: { id: posting.id }, data: { amount: 2n } }),
    ).rejects.toThrow();
    await expect(
      run({
        type: "transaction.create",
        accountId: cash,
        kind: "EXPENSE",
        date: "2026-01-03",
        amount: "-100",
        splits: [{ categoryId, amount: "-99" }],
      }),
    ).rejects.toThrow("exactly match");
    expect(await db.journal.count()).toBe(1);
  });
  it("serializes concurrent assignments so existing money is not assigned twice", async () => {
    const { categoryId } = await setup();
    const results = await Promise.allSettled([
      run({ type: "assign", categoryId, month: "2026-01", amount: "500" }),
      run({ type: "assign", categoryId, month: "2026-01", amount: "500" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await getFinance(userId, budgetId, "2026-01")).projection.readyToAssign,
    ).toBe(10000n);
  });
  it("reconciles cleared legs, reverses corrections, and preserves affected statement snapshots", async () => {
    const { cash, categoryId } = await setup();
    const p = await run({
      type: "transaction.create",
      accountId: cash,
      kind: "EXPENSE",
      date: "2026-01-03",
      amount: "-100",
      cleared: true,
      splits: [{ categoryId, amount: "-100" }],
    });
    const reconciliation = await run({
      type: "reconcile",
      accountId: cash,
      date: "2026-01-31",
      observed: "900",
    });
    await expect(
      run({ type: "transaction.void", id: p.id, reason: "Wrong entry" }),
    ).rejects.toThrow("Acknowledge");
    await run({
      type: "transaction.create",
      accountId: cash,
      kind: "EXPENSE",
      date: "2026-01-03",
      amount: "-90",
      splits: [{ categoryId, amount: "-90" }],
      replacesId: p.id,
      reason: "Correct amount",
      acknowledgeReconciled: true,
    });
    const original = await db.financialTransaction.findUniqueOrThrow({
      where: { id: p.id },
    });
    expect(original.voidedAt).not.toBeNull();
    expect(
      await db.journal.count({ where: { reversesId: original.journalId } }),
    ).toBe(1);
    const r = await db.reconciliation.findUniqueOrThrow({
      where: { id: reconciliation.id },
    });
    expect(r.observed).toBe(90000n);
    expect(r.affectedAt).not.toBeNull();
    const s = await getFinance(userId, budgetId, "2026-01");
    expect(s.projection.cash).toBe(91000n);
    expect(
      s.projection.categories.find((c) => c.id === categoryId)?.available,
    ).toBe(31000n);
  });
  it("requires explicit adjustments and preserves closed accounts and archived categories", async () => {
    const { cash, categoryId, groupId } = await setup();
    await expect(
      run({
        type: "reconcile",
        accountId: cash,
        date: "2026-01-31",
        observed: "0",
      }),
    ).rejects.toThrow("differs");
    await run({
      type: "reconcile",
      accountId: cash,
      date: "2026-01-31",
      observed: "0",
      adjustmentReason: "Synthetic correction",
    });
    await run({
      type: "account.update",
      id: cash,
      name: "Closed checking",
      closed: true,
      version: 1,
    });
    await expect(
      run({
        type: "transaction.create",
        accountId: cash,
        kind: "INCOME",
        date: "2026-02-01",
        amount: "10",
      }),
    ).rejects.toThrow("Reopen");
    await expect(
      run({
        type: "category.update",
        id: categoryId,
        name: "Food",
        groupId,
        archived: true,
      }),
    ).rejects.toThrow("balance");
    await run({ type: "assign", categoryId, month: "2026-01", amount: "-400" });
    await run({
      type: "category.update",
      id: categoryId,
      name: "Food",
      groupId,
      archived: true,
    });
    expect(await db.category.count()).toBe(2);
  });
  it("rejects future actuals, reserves future assignments and never counts tracking assets", async () => {
    const { categoryId } = await setup();
    await run({
      type: "account.create",
      name: "Investment",
      accountType: "INVESTMENT",
      participation: "TRACKING",
      opening: "999999",
      date: "2026-01-01",
    });
    expect(
      (await getFinance(userId, budgetId, "2026-01")).projection.resources,
    ).toBe(100000n);
    await expect(
      run({
        type: "account.create",
        name: "Future",
        accountType: "CASH",
        participation: "BUDGET",
        opening: "1000",
        date: "2199-01-01",
      }),
    ).rejects.toThrow("Future");
    await expect(
      run({ type: "assign", categoryId, month: "2199-01", amount: "100" }),
    ).rejects.toThrow("24 months");
  });
});
