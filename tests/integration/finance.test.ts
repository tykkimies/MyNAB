import { randomUUID } from "node:crypto";
import { beforeEach, afterAll, describe, it, expect } from "vitest";
import { getDb } from "@/infrastructure/db";
import { createOwner } from "@/application/auth";
import {
  executeFinance,
  getFinance,
  type FinanceCommand,
} from "@/application/finance";
import { STARTER_GROUPS, STARTER_CATEGORY_COUNT } from "@/domain/starter";
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
  it("fills every target even when that goes past the money held", async () => {
    const { categoryId } = await setup();
    const groupId = (
      await db.categoryGroup.findFirstOrThrow({ where: { system: false } })
    ).id;
    const fun = await run({ type: "category.create", name: "Fun", groupId });
    // Setup assigns 400 of 1000, leaving 600 available.
    await run({
      type: "target.set",
      categoryId,
      targetType: "MONTHLY",
      amount: "500",
    });
    await run({
      type: "target.set",
      categoryId: fun.id,
      targetType: "MONTHLY",
      amount: "1000",
    });
    const funded = await run({ type: "target.fund", month: "2026-01" });
    // Food needed 100 and Fun needed 1000: both filled, matching YNAB.
    const state = await getFinance(userId, budgetId, "2026-01");
    expect(
      state.projection.categories.find((c) => c.id === categoryId)?.available,
    ).toBe(50000n);
    expect(
      state.projection.categories.find((c) => c.id === fun.id)?.available,
    ).toBe(100000n);
    // The overshoot is stated plainly and left visible as negative RTA.
    expect(funded.message).toContain("more than you have");
    expect(state.projection.readyToAssign).toBe(-50000n);
    // Everything is funded now, so a second run has nothing left to do.
    await expect(
      run({ type: "target.fund", month: "2026-01" }),
    ).rejects.toThrow("already funded");
  });

  it("stores, replaces and clears a target without touching assignments", async () => {
    const { categoryId } = await setup();
    await run({
      type: "target.set",
      categoryId,
      targetType: "BALANCE_BY_DATE",
      amount: "1200",
      dueMonth: "2026-06",
    });
    const stored = await db.categoryTarget.findUniqueOrThrow({
      where: { categoryId },
    });
    expect(stored).toMatchObject({
      type: "BALANCE_BY_DATE",
      amount: 120000n,
      dueMonth: "2026-06",
    });
    // Replacing a target is an update, not a second row.
    await run({
      type: "target.set",
      categoryId,
      targetType: "MONTHLY",
      amount: "300",
    });
    expect(await db.categoryTarget.count()).toBe(1);
    expect(
      (await db.categoryTarget.findUniqueOrThrow({ where: { categoryId } }))
        .dueMonth,
    ).toBeNull();
    // Clearing stops the category asking, and leaves assigned money alone.
    await run({ type: "target.clear", categoryId });
    expect(await db.categoryTarget.count()).toBe(0);
    expect(
      (
        await getFinance(userId, budgetId, "2026-01")
      ).projection.categories.find((c) => c.id === categoryId)?.available,
    ).toBe(40000n);
  });

  it("rejects targets that contradict themselves", async () => {
    const { categoryId } = await setup();
    await expect(
      run({
        type: "target.set",
        categoryId,
        targetType: "BALANCE_BY_DATE",
        amount: "100",
      }),
    ).rejects.toThrow("Choose the month");
    await expect(
      run({
        type: "target.set",
        categoryId,
        targetType: "MONTHLY",
        amount: "100",
        dueMonth: "2026-06",
      }),
    ).rejects.toThrow("no due month");
    await expect(
      run({
        type: "target.set",
        categoryId,
        targetType: "MONTHLY",
        amount: "0",
      }),
    ).rejects.toThrow("greater than zero");
    // A card payment category is application managed and takes no target.
    const payment = await db.category.findFirstOrThrow({
      where: { paymentAccountId: { not: null } },
    });
    await expect(
      run({
        type: "target.set",
        categoryId: payment.id,
        targetType: "MONTHLY",
        amount: "100",
      }),
    ).rejects.toThrow("managed by the application");
  });

  it("offers starter categories once and never over an existing budget", async () => {
    const applied = await run({ type: "starter.apply" });
    expect(applied.id).toBeTruthy();
    const groups = await db.categoryGroup.count({
      where: { budgetId, system: false },
    });
    const categories = await db.category.count({
      where: { budgetId, system: false },
    });
    expect(groups).toBe(STARTER_GROUPS.length);
    expect(categories).toBe(STARTER_CATEGORY_COUNT);
    // Applying it to a budget that already has structure would bury the owner's.
    await expect(run({ type: "starter.apply" })).rejects.toThrow(
      "already has categories",
    );
    expect(
      await db.category.count({ where: { budgetId, system: false } }),
    ).toBe(STARTER_CATEGORY_COUNT);
    // Suggesting categories must never assign money or touch the ledger.
    expect(await db.budgetAssignment.count()).toBe(0);
    expect(await db.financialTransaction.count()).toBe(0);
    expect(
      (await getFinance(userId, budgetId, "2026-01")).projection.readyToAssign,
    ).toBe(0n);
  });

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
  it("serializes concurrent assignments and retries rather than losing one", async () => {
    const { categoryId } = await setup();
    const results = await Promise.allSettled([
      run({ type: "assign", categoryId, month: "2026-01", amount: "500" }),
      run({ type: "assign", categoryId, month: "2026-01", amount: "500" }),
    ]);
    // Both are legitimate now that over-assignment is allowed, so a conflict on
    // the budget lock must be retried, not surfaced as a failure.
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    // 1000 held, 400 + 500 + 500 assigned: the excess is visible, not hidden.
    expect(
      (await getFinance(userId, budgetId, "2026-01")).projection.readyToAssign,
    ).toBe(-40000n);
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
