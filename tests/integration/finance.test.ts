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
    // These take effect in the month this synthetic ledger lives in. Without a
    // month they would take effect today and January would have no target.
    await run({
      type: "target.set",
      categoryId,
      targetType: "MONTHLY",
      amount: "500",
      effectiveFrom: "2026-01",
    });
    await run({
      type: "target.set",
      categoryId: fun.id,
      targetType: "MONTHLY",
      amount: "1000",
      effectiveFrom: "2026-01",
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
    const stored = await db.categoryTarget.findFirstOrThrow({
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
      (await db.categoryTarget.findFirstOrThrow({ where: { categoryId } }))
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

  it("stores a weekly refill target and scales it to the month", async () => {
    const { categoryId } = await setup();
    await run({
      type: "target.set",
      categoryId,
      targetType: "WEEKLY",
      amount: "150",
      dayOfWeek: 3,
      refill: true,
      effectiveFrom: "2026-01",
    });
    const stored = await db.categoryTarget.findFirstOrThrow({
      where: { categoryId },
    });
    expect(stored).toMatchObject({
      type: "WEEKLY",
      amount: 15000n,
      dayOfWeek: 3,
      refill: true,
    });
    // January 2026 holds four Wednesdays, and 400 is already assigned, so a
    // refill asks for the remaining 200 rather than the whole 600.
    const state = await getFinance(userId, budgetId, "2026-01");
    const target = state.targets.find((x) => x.categoryId === categoryId);
    expect(target?.progress.contribution).toBe(20000n);
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
    // A weekday belongs to a weekly target and nothing else.
    await expect(
      run({
        type: "target.set",
        categoryId,
        targetType: "WEEKLY",
        amount: "150",
      }),
    ).rejects.toThrow("weekday a weekly target");
    await expect(
      run({
        type: "target.set",
        categoryId,
        targetType: "MONTHLY",
        amount: "150",
        dayOfWeek: 3,
      }),
    ).rejects.toThrow("Only a weekly target has a weekday");
    // Refilling only means something where an amount recurs.
    await expect(
      run({
        type: "target.set",
        categoryId,
        targetType: "BALANCE",
        amount: "150",
        refill: true,
      }),
    ).rejects.toThrow("recurring target can refill");
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

describe("effective-dated targets and terms on PostgreSQL", () => {
  it("keeps what earlier months were asked to do when a target changes", async () => {
    const { categoryId } = await setup();
    await run({
      type: "target.set",
      categoryId,
      targetType: "MONTHLY",
      amount: "500",
      effectiveFrom: "2026-01",
    });
    await run({
      type: "target.set",
      categoryId,
      targetType: "MONTHLY",
      amount: "800",
      effectiveFrom: "2026-03",
    });
    // Two versions, not an overwrite.
    expect(await db.categoryTarget.count({ where: { categoryId } })).toBe(2);
    const amountIn = async (month: string) =>
      (await getFinance(userId, budgetId, month)).targets.find(
        (t) => t.categoryId === categoryId,
      )?.amount;
    expect(await amountIn("2026-01")).toBe(50000n);
    // February still reads January's decision, which is the whole point.
    expect(await amountIn("2026-02")).toBe(50000n);
    expect(await amountIn("2026-03")).toBe(80000n);
    expect(await amountIn("2026-04")).toBe(80000n);
    // Before the first version the target did not exist, and is not invented.
    expect(await amountIn("2025-12")).toBeUndefined();
  });

  it("records what an earlier month met without storing a flag", async () => {
    const { categoryId } = await setup();
    const { getTargetHistory } = await import("@/application/finance");
    const current = (await getFinance(userId, budgetId)).month;
    await run({
      type: "target.set",
      categoryId,
      targetType: "MONTHLY",
      amount: "400",
      effectiveFrom: "2026-01",
    });
    const history = await getTargetHistory(userId, budgetId, 24);
    const january = history.find((h) => h.month === "2026-01");
    // Setup assigned exactly 400 in January, so the target was met then.
    expect(january?.entries).toEqual([
      expect.objectContaining({ categoryId, met: true, shortfall: 0n }),
    ]);
    // February assigned nothing, so the same target went short.
    expect(
      history.find((h) => h.month === "2026-02")?.entries[0],
    ).toMatchObject({ met: false, shortfall: 40000n });
    // History is the past only; this month is what the page already shows.
    expect(history.some((h) => h.month >= current)).toBe(false);
  });

  it("pays a card off by a date, from what the ledger says is owed", async () => {
    const { card, categoryId } = await setup();
    // Food holds 400. Spending 600 on the card reserves the 400 that was
    // backed and leaves 200 of card debt with nothing behind it.
    await run({
      type: "transaction.create",
      accountId: card,
      kind: "EXPENSE",
      date: "2026-01-05",
      amount: "-600",
      payee: "Shop",
      splits: [{ categoryId, amount: "-600" }],
    });
    const payment = await db.category.findFirstOrThrow({
      where: { paymentAccountId: { not: null } },
    });
    await run({
      type: "target.set",
      categoryId: payment.id,
      targetType: "DEBT_PAYOFF_BY_DATE",
      dueMonth: "2026-04",
      effectiveFrom: "2026-01",
    });
    const target = (await getFinance(userId, budgetId, "2026-01")).targets.find(
      (t) => t.categoryId === payment.id,
    )!;
    // No amount is stored; 600 owed against 400 reserved is a 200 gap, spread
    // over January to April.
    expect(target.amount).toBe(0n);
    expect(target.progress.needed).toBe(20000n);
    expect(target.progress.contribution).toBe(5000n);

    // Funding the month fills a payoff target like any other, and a second
    // run has nothing left to do because the share is already assigned.
    await run({ type: "target.fund", month: "2026-01" });
    const after = await getFinance(userId, budgetId, "2026-01");
    expect(
      after.projection.categories.find((c) => c.id === payment.id)?.available,
    ).toBe(45000n);
    expect(
      after.targets.find((t) => t.categoryId === payment.id)?.progress.state,
    ).toBe("ON_TRACK");
    await expect(
      run({ type: "target.fund", month: "2026-01" }),
    ).rejects.toThrow("already funded");

    // Clearing the whole balance is what "met" means, and it comes from the
    // ledger rather than from anything stored on the target.
    await run({
      type: "assign",
      categoryId: payment.id,
      month: "2026-01",
      amount: "150",
    });
    expect(
      (await getFinance(userId, budgetId, "2026-01")).targets.find(
        (t) => t.categoryId === payment.id,
      )?.progress.state,
    ).toBe("MET");
  });

  it("refuses a payoff target off a card, and an ordinary target on one", async () => {
    const { categoryId } = await setup();
    const payment = await db.category.findFirstOrThrow({
      where: { paymentAccountId: { not: null } },
    });
    await expect(
      run({
        type: "target.set",
        categoryId,
        targetType: "DEBT_PAYOFF",
        amount: "100",
      }),
    ).rejects.toThrow("belongs on a credit card");
    await expect(
      run({
        type: "target.set",
        categoryId: payment.id,
        targetType: "MONTHLY",
        amount: "100",
      }),
    ).rejects.toThrow("managed by the application");
    // What a card owes comes from the ledger, so an amount would be a second
    // answer that could disagree with it.
    await expect(
      run({
        type: "target.set",
        categoryId: payment.id,
        targetType: "DEBT_PAYOFF_BY_DATE",
        amount: "100",
        dueMonth: "2026-06",
      }),
    ).rejects.toThrow("takes no amount");
  });

  it("versions debt terms so a promotional rate can end", async () => {
    const { card } = await setup();
    await run({
      type: "debt.terms.set",
      accountId: card,
      apr: "0",
      minimumPayment: "25",
      effectiveFrom: "2026-01",
    });
    await run({
      type: "debt.terms.set",
      accountId: card,
      apr: "24.99",
      minimumPayment: "25",
      effectiveFrom: "2026-07",
    });
    const { getDebtTerms } = await import("@/application/finance");
    expect(await getDebtTerms(userId, budgetId)).toHaveLength(2);
    // Removing one version leaves the other in place.
    await run({
      type: "debt.terms.clear",
      accountId: card,
      effectiveFrom: "2026-07",
    });
    const left = await getDebtTerms(userId, budgetId);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({
      effectiveFrom: "2026-01",
      aprBasisPoints: 0,
    });
    // Without a month, every version goes.
    await run({ type: "debt.terms.clear", accountId: card });
    expect(await getDebtTerms(userId, budgetId)).toHaveLength(0);
  });
});

describe("starter categories on PostgreSQL", () => {
  it("is still offered after a credit card has been added", async () => {
    // Adding a card creates its payment category, which is the application's
    // own bookkeeping. Counting it as the owner's structure locked the starter
    // set away from anyone who added an account before their categories.
    await run({
      type: "account.create",
      name: "Card",
      accountType: "CREDIT_CARD",
      participation: "BUDGET",
      opening: "0",
      date: "2026-01-01",
    });
    await run({ type: "starter.apply" });
    const state = await getFinance(userId, budgetId);
    expect(
      state.categories.filter((c) => !c.system && !c.paymentAccountId),
    ).toHaveLength(STARTER_CATEGORY_COUNT);
    // Still offered only once: a second application would duplicate everything.
    await expect(run({ type: "starter.apply" })).rejects.toThrow(
      "already has categories",
    );
  });
});

describe("schedule approval integrity", () => {
  async function scheduled() {
    const { cash, categoryId } = await setup();
    const result = await run({
      type: "schedule.create",
      name: "Groceries",
      accountId: cash,
      kind: "EXPENSE",
      amount: "-25",
      startDate: "2026-02-28",
      cadence: "MONTHLY",
      splits: [{ categoryId, amount: "-25" }],
    });
    return { id: result.id, cash, categoryId };
  }
  it("plans without ledger effects, then approves exactly once under concurrent requests", async () => {
    const before = await db.financialTransaction.count();
    const { id } = await scheduled();
    const count = await db.financialTransaction.count();
    expect(count).toBeGreaterThan(before); // account setup only
    const journals = await db.journal.count();
    const [a, b] = await Promise.all([
      run({ type: "schedule.approve", id, date: "2026-02-28" }),
      run({ type: "schedule.approve", id, date: "2026-02-28" }),
    ]);
    expect(a.id).toBe(b.id);
    expect(await db.financialTransaction.count()).toBe(count + 1);
    expect(await db.journal.count()).toBe(journals + 1);
    expect(await db.scheduleOccurrence.count()).toBe(1);
    expect(
      (await db.financialTransaction.findUniqueOrThrow({ where: { id: a.id } }))
        .amount,
    ).toBe(-2500n);
  });
  it("rejects foreign owners, invalid occurrences and future approvals; skip consumes no ledger entry", async () => {
    const { id } = await scheduled();
    await expect(
      executeFinance(randomUUID(), budgetId, randomUUID(), {
        type: "schedule.approve",
        id,
        date: "2026-02-28",
      }),
    ).rejects.toThrow("Budget unavailable");
    await expect(
      run({ type: "schedule.approve", id, date: "2026-03-01" }),
    ).rejects.toThrow("not an occurrence");
    await expect(
      run({ type: "schedule.approve", id, date: "2199-02-28" }),
    ).rejects.toThrow("Approve on or after");
    const count = await db.financialTransaction.count();
    await run({ type: "schedule.skip", id, date: "2026-02-28" });
    await run({ type: "schedule.approve", id, date: "2026-02-28" });
    expect(await db.financialTransaction.count()).toBe(count);
  });
  it("refuses invalid splits and archived schedules without partial financial writes", async () => {
    const { id, cash, categoryId } = await scheduled();
    await expect(
      run({
        type: "schedule.create",
        name: "Bad",
        accountId: cash,
        kind: "EXPENSE",
        amount: "-50",
        startDate: "2026-01-31",
        cadence: "MONTHLY",
        splits: [{ categoryId, amount: "-40" }],
      }),
    ).rejects.toThrow("splits must equal");
    expect(await db.schedule.count()).toBe(1);
    await run({ type: "schedule.archive", id, archived: true });
    await expect(
      run({ type: "schedule.approve", id, date: "2026-02-28" }),
    ).rejects.toThrow("Schedule unavailable");
  });
});

describe("schedule revisions and matching", () => {
  async function template() {
    const { cash, categoryId } = await setup();
    const command = {
      type: "schedule.create" as const,
      name: "Subscription",
      accountId: cash,
      kind: "EXPENSE" as const,
      amount: "-25",
      payee: "Example",
      startDate: "2026-02-28",
      cadence: "MONTHLY" as const,
      splits: [{ categoryId, amount: "-25" }],
    };
    return { command, id: (await run(command)).id, cash, categoryId };
  }
  it("matches an existing entry without changing its categories or ledger and prevents reuse", async () => {
    const { command, id, cash, categoryId } = await template();
    const transaction = await run({
      type: "transaction.create",
      accountId: cash,
      kind: "EXPENSE",
      date: "2026-02-26",
      amount: "-25",
      payee: "Owner choice",
      splits: [{ categoryId, amount: "-25" }],
    });
    const journals = await db.journal.count();
    await run({
      type: "schedule.match",
      id,
      date: "2026-02-28",
      transactionId: transaction.id,
    });
    expect(await db.journal.count()).toBe(journals);
    expect(
      (
        await db.financialTransaction.findUniqueOrThrow({
          where: { id: transaction.id },
        })
      ).payee,
    ).toBe("Owner choice");
    expect((await db.scheduleOccurrence.findFirstOrThrow()).matched).toBe(true);
    const second = await run(command);
    await expect(
      run({
        type: "schedule.match",
        id: second.id,
        date: "2026-02-28",
        transactionId: transaction.id,
      }),
    ).rejects.toThrow("already handles");
    expect(await db.scheduleOccurrence.count()).toBe(1);
    await run({ type: "schedule.archive", id, archived: true });
    const { getSchedules } = await import("@/application/schedules");
    const result = await getSchedules(
      userId,
      budgetId,
      "2026-02-01",
      "2026-03-01",
    );
    expect(
      result.upcoming.find((o) => o.schedule.id === id)?.handled?.transactionId,
    ).toBe(transaction.id);
  });
  it("rejects mismatched or voided entries and does not consume the occurrence", async () => {
    const { id, cash, categoryId } = await template();
    const transaction = await run({
      type: "transaction.create",
      accountId: cash,
      kind: "EXPENSE",
      date: "2026-02-26",
      amount: "-26",
      splits: [{ categoryId, amount: "-26" }],
    });
    await expect(
      run({
        type: "schedule.match",
        id,
        date: "2026-02-28",
        transactionId: transaction.id,
      }),
    ).rejects.toThrow("same account");
    await run({
      type: "transaction.void",
      id: transaction.id,
      reason: "Synthetic correction",
    });
    await expect(
      run({
        type: "schedule.match",
        id,
        date: "2026-02-28",
        transactionId: transaction.id,
      }),
    ).rejects.toThrow("unvoided");
    expect(await db.scheduleOccurrence.count()).toBe(0);
  });
  it("edits only future occurrences with retained history and rejects stale edits atomically", async () => {
    const { command, id } = await template();
    await run({ type: "schedule.approve", id, date: "2026-02-28" });
    const changed = {
      ...command,
      type: "schedule.replace" as const,
      id,
      revision: 1,
      startDate: "2198-01-01",
      amount: "-30",
      splits: command.splits.map((s) => ({ ...s, amount: "-30" })),
    };
    const replacement = await run(changed);
    const previous = await db.schedule.findUniqueOrThrow({ where: { id } });
    expect(previous.endDate?.toISOString().slice(0, 10)).toBe("2197-12-31");
    expect(previous.amount).toBe(-2500n);
    expect(previous.replacedById).toBe(replacement.id);
    expect(
      (await db.schedule.findUniqueOrThrow({ where: { id: replacement.id } }))
        .amount,
    ).toBe(-3000n);
    expect(await db.scheduleOccurrence.count()).toBe(1);
    await expect(run(changed)).rejects.toThrow("changed");
    expect(await db.schedule.count()).toBe(2);
    await expect(
      run({ type: "schedule.archive", id, archived: false }),
    ).rejects.toThrow("latest version");
  });
  it("refuses moving a handled future occurrence into another version", async () => {
    const { command, id } = await template();
    await run({ type: "schedule.skip", id, date: "2199-02-28" });
    await expect(
      run({
        ...command,
        type: "schedule.replace",
        id,
        revision: 1,
        startDate: "2199-01-01",
      }),
    ).rejects.toThrow("already handled");
    expect(await db.schedule.count()).toBe(1);
  });
});
