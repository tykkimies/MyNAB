import { randomUUID } from "node:crypto";
import {
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { getDb } from "@/infrastructure/db";
import { createOwner } from "@/application/auth";
import {
  executeFinance,
  getAutoAssignPreview,
  getFinance,
  type FinanceCommand,
} from "@/application/finance";
import { STARTER_GROUPS, STARTER_CATEGORY_COUNT } from "@/domain/starter";
import { nextMonth } from "@/domain/budget";
import { categorizeTransactions, renamePayees } from "@/application/register";
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
  it("undoes an edit and a delete while retaining reversal history", async () => {
    const { cash, categoryId } = await setup();
    const original = await run({
      type: "transaction.create",
      accountId: cash,
      kind: "EXPENSE",
      date: "2026-02-01",
      amount: "-25.17",
      payee: "Grocer",
      splits: [{ categoryId, amount: "-25.17" }],
    });
    const edited = await run({
      type: "transaction.create",
      accountId: cash,
      kind: "EXPENSE",
      date: "2026-02-01",
      amount: "-26.17",
      payee: "Grocer edited",
      splits: [{ categoryId, amount: "-26.17" }],
      replacesId: original.id,
      reason: "Edited in register",
    });
    const undone = await run({ type: "transaction.undo", id: edited.id });
    const restored = await db.financialTransaction.findUniqueOrThrow({
      where: { id: undone.id },
    });
    expect(restored.amount).toBe(-2517n);
    expect(restored.payee).toBe("Grocer");
    expect(restored.replacesId).toBe(edited.id);
    expect(
      await db.financialTransaction.count({
        where: { budgetId, voidedAt: null, payee: { startsWith: "Grocer" } },
      }),
    ).toBe(1);
    await run({
      type: "transaction.void",
      id: undone.id,
      reason: "Deleted in register",
    });
    const afterDelete = await run({ type: "transaction.undo", id: undone.id });
    expect(
      (
        await db.financialTransaction.findUniqueOrThrow({
          where: { id: afterDelete.id },
        })
      ).amount,
    ).toBe(-2517n);
    expect(await db.journal.count({ where: { budgetId } })).toBeGreaterThan(5);
    await expect(
      run({ type: "transaction.undo", id: undone.id }),
    ).rejects.toThrow("latest version");
  });
  it("edits and restores an opening balance without allowing a second opening", async () => {
    const { cash } = await setup();
    const opening = await db.financialTransaction.findFirstOrThrow({
      where: { budgetId, accountId: cash, kind: "OPENING" },
    });
    await expect(
      run({
        type: "transaction.create",
        accountId: cash,
        kind: "OPENING",
        date: "2026-01-01",
        amount: "2000",
      }),
    ).rejects.toThrow("existing opening balance");
    const edited = await run({
      type: "transaction.create",
      accountId: cash,
      kind: "OPENING",
      date: "2026-01-01",
      amount: "1200",
      payee: "Starting balance",
      replacesId: opening.id,
      reason: "Edited in register",
    });
    expect(
      (
        await db.financialTransaction.findUniqueOrThrow({
          where: { id: edited.id },
        })
      ).amount,
    ).toBe(120000n);
    const undone = await run({ type: "transaction.undo", id: edited.id });
    expect(
      (
        await db.financialTransaction.findUniqueOrThrow({
          where: { id: undone.id },
        })
      ).amount,
    ).toBe(100000n);
    await run({
      type: "transaction.void",
      id: undone.id,
      reason: "Deleted in register",
    });
    const restored = await run({ type: "transaction.undo", id: undone.id });
    expect(
      (
        await db.financialTransaction.findUniqueOrThrow({
          where: { id: restored.id },
        })
      ).kind,
    ).toBe("OPENING");
    expect(
      (await getFinance(userId, budgetId, "2026-01")).projection.cash,
    ).toBe(100000n);
  });
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

  it("previews and applies exact history-based Auto-Assign once", async () => {
    const { categoryId } = await setup();
    await run({ type: "assign", categoryId, month: "2026-02", amount: "25" });
    const preview = await getAutoAssignPreview(
      userId,
      budgetId,
      "2026-02",
      "LAST_ASSIGNED",
      categoryId,
    );
    expect(preview.changes).toMatchObject([
      { categoryId, previousAssigned: 2500n, amount: 37500n },
    ]);
    const command = {
      type: "auto.assign" as const,
      month: "2026-02",
      mode: "LAST_ASSIGNED" as const,
      categoryId,
      expected: preview.expected,
    };
    const key = randomUUID();
    const result = await run(command, key);
    expect(result.message).toContain("Ready to Assign");
    expect(await run(command, key)).toEqual(result);
    const state = await getFinance(userId, budgetId, "2026-02");
    expect(
      state.projection.categories.find((c) => c.id === categoryId)?.assigned,
    ).toBe(40000n);
    expect(state.projection.readyToAssign).toBe(preview.readyAfter);
    await expect(run(command)).rejects.toThrow("Preview it again");
  });

  it("rejects stale and unauthorized Auto-Assign previews", async () => {
    const { categoryId } = await setup();
    const preview = await getAutoAssignPreview(
      userId,
      budgetId,
      "2026-01",
      "RESET_ASSIGNED",
      categoryId,
    );
    await run({ type: "assign", categoryId, month: "2026-01", amount: "1" });
    await expect(
      run({
        type: "auto.assign",
        month: "2026-01",
        mode: "RESET_ASSIGNED",
        categoryId,
        expected: preview.expected,
      }),
    ).rejects.toThrow("Preview it again");
    await expect(
      getAutoAssignPreview(randomUUID(), budgetId, "2026-01", "RESET_ASSIGNED"),
    ).rejects.toThrow("Budget unavailable");
  });

  it("renames and combines payees through journaled edits", async () => {
    const { cash, categoryId } = await setup();
    const spend = (payee: string, amount: string) =>
      run({ type: "transaction.create", accountId: cash, kind: "EXPENSE", date: "2026-01-05", amount, payee, splits: [{ categoryId, amount }] });
    await spend("AMZN Mktp", "-10");
    await spend("amazon.com ", "-20");
    await spend("Grocer", "-5");
    const key = randomUUID();
    const command = { type: "payee.rename", from: ["AMZN Mktp", "Amazon.com"], to: "Amazon", rule: true };
    const result = await renamePayees(userId, budgetId, key, command);
    expect(result.message).toBe("Renamed 2 transactions to Amazon. Future imports will use the new name.");
    await renamePayees(userId, budgetId, key, command);
    const state = await getFinance(userId, budgetId, "2026-01");
    const live = state.transactions.filter((t) => !t.voidedAt && t.kind === "EXPENSE");
    expect(live.map((t) => t.payee).sort()).toEqual(["Amazon", "Amazon", "Grocer"]);
    // Amounts and categories are untouched; only the name changed.
    expect(state.projection.categories.find((c) => c.id === categoryId)?.activity).toBe(-3500n);
    const rules = await db.automationRule.findMany({ where: { budgetId } });
    expect(rules.map((r) => [r.payeeMatch, r.matchMode, r.renamePayee]).sort()).toEqual([
      ["AMZN Mktp", "EXACT", "Amazon"],
      ["Amazon.com", "EXACT", "Amazon"],
    ]);
  });

  it("records a due day on monthly targets only", async () => {
    const { categoryId } = await setup();
    await run({ type: "target.set", categoryId, targetType: "MONTHLY", amount: "100", targetDueDay: 15 });
    const state = await getFinance(userId, budgetId);
    expect(state.targets.find((t) => t.categoryId === categoryId)?.dueDay).toBe(15);
    await expect(
      run({ type: "target.set", categoryId, targetType: "WEEKLY", amount: "10", dayOfWeek: 1, targetDueDay: 3 }),
    ).rejects.toThrow("Only a monthly or repeating target has a due day");
  });

  it("stores a twice-a-month schedule", async () => {
    const { cash, categoryId } = await setup();
    const made = await run({ type: "schedule.create", name: "Paycheck", accountId: cash, kind: "EXPENSE", amount: "-10", startDate: "2026-01-05", cadence: "TWICE_MONTHLY", splits: [{ categoryId, amount: "-10" }] });
    expect((await db.schedule.findUniqueOrThrow({ where: { id: made.id } })).cadence).toBe("TWICE_MONTHLY");
  });

  it("undoes a money move once by appending its reversal", async () => {
    const { categoryId, groupId } = await setup();
    const fun = await run({ type: "category.create", name: "Fun", groupId });
    await run({ type: "move", from: categoryId, to: fun.id, month: "2026-01", amount: "25" });
    let state = await getFinance(userId, budgetId, "2026-01");
    const moved = state.moves.find((m) => m.kind === "MOVE")!;
    const undo = await run({ type: "move.undo", id: moved.id });
    expect(undo.message).toBe("Move undone.");
    state = await getFinance(userId, budgetId, "2026-01");
    const available = (id: string) => state.projection.categories.find((c) => c.id === id)?.available;
    expect(available(categoryId)).toBe(40000n);
    expect(available(fun.id)).toBe(0n);
    expect(state.moves[0]).toMatchObject({ kind: "UNDO", undoOf: moved.id });
    expect(state.moves.find((m) => m.id === moved.id)?.undone).toBe(true);
    await expect(run({ type: "move.undo", id: moved.id })).rejects.toThrow("already been undone");
    await expect(run({ type: "move.undo", id: state.moves[0].id })).rejects.toThrow("unavailable");
    // A single assignment is undone by its row id, returning money to Ready to Assign.
    const assign = state.moves.find((m) => m.kind === "ASSIGN")!;
    const before = state.projection.readyToAssign;
    await run({ type: "move.undo", id: assign.id });
    expect((await getFinance(userId, budgetId, "2026-01")).projection.readyToAssign).toBe(before + 40000n);
  });

  it("returns carried category money to Ready to Assign in the next month", async () => {
    const { categoryId } = await setup();
    const january = await getFinance(userId, budgetId, "2026-01");
    expect(january.projection.categories.find((c) => c.id === categoryId)?.available).toBe(40000n);
    const before = await getFinance(userId, budgetId, "2026-02");
    expect(before.projection.categories.find((c) => c.id === categoryId)?.available).toBe(40000n);
    await run({ type: "assign", categoryId, month: "2026-02", amount: "-400" });
    const after = await getFinance(userId, budgetId, "2026-02");
    expect(after.projection.categories.find((c) => c.id === categoryId)?.available).toBe(0n);
    expect(after.projection.categories.find((c) => c.id === categoryId)?.assigned).toBe(-40000n);
    expect(after.projection.readyToAssign).toBe(before.projection.readyToAssign + 40000n);
    expect((await getFinance(userId, budgetId, "2026-01")).projection.categories.find((c) => c.id === categoryId)?.available).toBe(40000n);
  });

  it("flags transactions across edits and categorizes several at once", async () => {
    const { cash, card, categoryId, groupId } = await setup();
    const fun = await run({ type: "category.create", name: "Fun", groupId });
    const spend = (payee: string, splits = [{ categoryId, amount: "-10" }]) =>
      run({ type: "transaction.create", accountId: cash, kind: "EXPENSE", date: "2026-01-05", amount: "-10", payee, splits });
    const a = await spend("A");
    const b = await spend("B");
    const split = await spend("Split", [{ categoryId, amount: "-4" }, { categoryId: fun.id, amount: "-6" }]);
    const transfer = await run({ type: "transaction.create", accountId: cash, transferAccountId: card, kind: "TRANSFER", date: "2026-01-06", amount: "-5" });
    await run({ type: "transaction.flag", ids: [a.id, b.id], flag: "RED" });
    await run({ type: "flag.rename", color: "RED", name: "Reimbursable" });
    let state = await getFinance(userId, budgetId, "2026-01");
    expect(state.flags.get(a.id)).toBe("RED");
    expect(state.flagNames).toEqual([expect.objectContaining({ color: "RED", name: "Reimbursable" })]);
    await run({ type: "flag.rename", color: "RED" });
    expect((await getFinance(userId, budgetId, "2026-01")).flagNames).toEqual([]);

    const key = randomUUID();
    const bulk = { type: "transaction.categorize", ids: [a.id, b.id, split.id, transfer.id], categoryId: fun.id };
    const result = await categorizeTransactions(userId, budgetId, key, bulk);
    expect(result.message).toBe("Categorized 2 transactions; 2 left unchanged.");
    // Retrying the same request edits nothing twice.
    await categorizeTransactions(userId, budgetId, key, bulk);
    state = await getFinance(userId, budgetId, "2026-01");
    const live = state.transactions.filter((t) => !t.voidedAt && ["A", "B"].includes(t.payee));
    expect(live).toHaveLength(2);
    for (const t of live) {
      expect(state.splits.filter((x) => x.transactionId === t.id).map((x) => x.categoryId)).toEqual([fun.id]);
      // The flag follows the transaction through the edit.
      expect(state.flags.get(t.id)).toBe("RED");
    }
    await run({ type: "transaction.flag", ids: live.map((t) => t.id) });
    const cleared = await getFinance(userId, budgetId, "2026-01");
    expect(live.map((t) => cleared.flags.get(t.id))).toEqual([undefined, undefined]);
    await expect(run({ type: "transaction.flag", ids: [a.id], flag: "BLUE" })).rejects.toThrow("A transaction changed");
    await expect(
      categorizeTransactions(userId, budgetId, randomUUID(), { ...bulk, ids: [transfer.id] }),
    ).rejects.toThrow("None of these can be categorized");
  });

  it("lists money moves with source, destination and who made them", async () => {
    const { categoryId, groupId } = await setup();
    const fun = await run({ type: "category.create", name: "Fun", groupId });
    await run({ type: "move", from: categoryId, to: fun.id, month: "2026-01", amount: "25" });
    await run({ type: "assign", categoryId: fun.id, month: "2026-01", amount: "-5" });
    await run({
      type: "target.set",
      categoryId: fun.id,
      targetType: "MONTHLY",
      amount: "100",
      effectiveFrom: "2026-01",
    });
    await run({ type: "target.fund", month: "2026-01" });
    const state = await getFinance(userId, budgetId, "2026-01");
    const [fund, returned, moved, assigned] = state.moves;
    expect(state.moves).toHaveLength(4);
    expect(fund).toMatchObject({ kind: "TARGET_FUND", readyToAssign: -8000n, to: [{ categoryId: fun.id, amount: 8000n }], actor: "owner" });
    expect(returned).toMatchObject({ kind: "ASSIGN", readyToAssign: 500n, from: [{ categoryId: fun.id, amount: 500n }] });
    expect(moved).toMatchObject({
      kind: "MOVE",
      readyToAssign: 0n,
      from: [{ categoryId, amount: 2500n }],
      to: [{ categoryId: fun.id, amount: 2500n }],
    });
    expect(assigned).toMatchObject({ kind: "ASSIGN", readyToAssign: -40000n });
    // Moves belong to their month; February has none.
    expect((await getFinance(userId, budgetId, "2026-02")).moves).toEqual([]);
  });

  it("saves focused views and funds only the selected view's targets", async () => {
    const { categoryId, groupId } = await setup();
    const fun = await run({ type: "category.create", name: "Fun", groupId });
    for (const [id, amount] of [[categoryId, "500"], [fun.id, "100"]] as const)
      await run({
        type: "target.set",
        categoryId: id,
        targetType: "MONTHLY",
        amount,
        effectiveFrom: "2026-01",
      });
    const view = await run({
      type: "view.save",
      name: "Fun only",
      categoryIds: [fun.id],
    });
    await expect(
      run({ type: "view.save", name: "Twice", categoryIds: [fun.id, fun.id] }),
    ).rejects.toThrow("each category once");
    await run({
      type: "view.save",
      id: view.id,
      name: "Just fun",
      categoryIds: [fun.id],
    });
    const second = await run({
      type: "view.save",
      name: "Food",
      categoryIds: [categoryId],
    });
    await run({ type: "view.reorder", id: second.id, direction: "UP" });
    let state = await getFinance(userId, budgetId, "2026-01");
    expect(state.views.map((v) => v.name)).toEqual(["Food", "Just fun"]);
    const before = state.projection.readyToAssign;
    // Funding the custom view fills Fun and leaves Food's shortfall alone.
    await run({ type: "target.fund", month: "2026-01", view: view.id });
    state = await getFinance(userId, budgetId, "2026-01");
    const available = (id: string) =>
      state.projection.categories.find((c) => c.id === id)?.available;
    expect(available(fun.id)).toBe(10000n);
    expect(available(categoryId)).toBe(40000n);
    expect(state.projection.readyToAssign).toBe(before - 10000n);
    await expect(
      run({ type: "target.fund", month: "2026-01", view: view.id }),
    ).rejects.toThrow("already funded");
    // Hidden categories drop out of every view without losing membership.
    await run({ type: "category.hide", id: fun.id, hidden: true });
    state = await getFinance(userId, budgetId, "2026-01");
    expect(state.views.find((v) => v.id === view.id)?.categoryIds).toEqual([
      fun.id,
    ]);
    await run({ type: "view.delete", id: view.id });
    await expect(
      run({ type: "view.delete", id: view.id }),
    ).rejects.toThrow("View unavailable");
    await expect(
      run({ type: "target.fund", month: "2026-01", view: randomUUID() }),
    ).rejects.toThrow("View unavailable");
  });

  it("snoozes only this month's non-card target without changing its progress", async () => {
    const { card, categoryId } = await setup();
    const { today } = await import("@/application/finance");
    const zone = (
      await db.budget.findUniqueOrThrow({ where: { id: budgetId } })
    ).timezone;
    const current = today(zone).slice(0, 7);
    await run({
      type: "target.set",
      categoryId,
      targetType: "MONTHLY",
      amount: "500",
      effectiveFrom: current,
    });
    const before = await getFinance(userId, budgetId, current);
    const needed = before.targets.find(
      (target) => target.categoryId === categoryId,
    )!.progress.contribution;
    expect(needed).toBeGreaterThan(0n);
    await run({ type: "target.snooze", categoryId, snoozed: true });
    const after = await getFinance(userId, budgetId, current);
    const target = after.targets.find((row) => row.categoryId === categoryId)!;
    expect(target.snoozed).toBe(true);
    expect(target.progress.contribution).toBe(needed);
    expect(after.underfunded).toBe(before.underfunded - needed);
    await expect(run({ type: "target.fund", month: current })).rejects.toThrow(
      "already funded",
    );
    const following = await getFinance(userId, budgetId, nextMonth(current));
    expect(
      following.targets.find((row) => row.categoryId === categoryId)?.snoozed,
    ).toBe(false);
    await run({ type: "target.snooze", categoryId, snoozed: false });
    expect((await getFinance(userId, budgetId, current)).underfunded).toBe(
      before.underfunded,
    );
    const payment = await db.category.findFirstOrThrow({
      where: { budgetId, paymentAccountId: card },
    });
    await run({
      type: "target.set",
      categoryId: payment.id,
      targetType: "DEBT_PAYOFF",
      amount: "10",
      effectiveFrom: current,
    });
    await expect(
      run({ type: "target.snooze", categoryId: payment.id, snoozed: true }),
    ).rejects.toThrow("cannot be snoozed");
    expect(
      await db.auditEvent.count({
        where: { budgetId, entityId: categoryId, action: "FINANCE_COMMAND" },
      }),
    ).toBeGreaterThan(0);
  });

  it("hides funded categories without losing money, and persists notes and manual order", async () => {
    const { categoryId, groupId } = await setup();
    const rent = await run({ type: "category.create", name: "Rent", groupId });
    const second = await run({ type: "group.create", name: "Later" });
    await run({
      type: "category.update",
      id: categoryId,
      name: "Food",
      groupId,
      archived: false,
      note: "Weekly shop and pantry staples",
    });
    expect(
      (await db.category.findUniqueOrThrow({ where: { id: categoryId } })).note,
    ).toBe("Weekly shop and pantry staples");
    await run({ type: "category.reorder", id: rent.id, direction: "UP" });
    let state = await getFinance(userId, budgetId, "2026-01");
    expect(
      state.categories.filter((c) => c.groupId === groupId).map((c) => c.id),
    ).toEqual([rent.id, categoryId]);
    await run({ type: "group.reorder", id: second.id, direction: "UP" });
    state = await getFinance(userId, budgetId, "2026-01");
    expect(state.groups.filter((g) => !g.system)[0].id).toBe(second.id);
    const ready = state.projection.readyToAssign;
    await run({ type: "category.hide", id: categoryId, hidden: true });
    const hidden = await getFinance(userId, budgetId, "2026-01");
    expect(hidden.categories.find((c) => c.id === categoryId)?.hidden).toBe(
      true,
    );
    expect(
      hidden.projection.categories.find((c) => c.id === categoryId)?.available,
    ).toBe(40000n);
    expect(hidden.projection.readyToAssign).toBe(ready);
    await run({ type: "category.hide", id: categoryId, hidden: false });
    await run({ type: "group.hide", id: groupId, hidden: true });
    expect(
      (await getFinance(userId, budgetId, "2026-01")).groups.find(
        (g) => g.id === groupId,
      )?.hidden,
    ).toBe(true);
    await run({ type: "group.hide", id: groupId, hidden: false });
    await expect(
      executeFinance(randomUUID(), budgetId, randomUUID(), {
        type: "category.hide",
        id: categoryId,
        hidden: true,
      }),
    ).rejects.toThrow("Budget unavailable");
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

  it("adds a suggested category on demand to an established plan", async () => {
    const groupId = (await run({ type: "group.create", name: "Bills" })).id;
    await run({ type: "category.create", groupId, name: "Rent / Mortgage" });
    const before = await db.category.count({
      where: { budgetId, system: false },
    });
    const added = await run({
      type: "starter.add",
      groupName: "Bills",
      categoryName: "Electric",
    });
    expect(
      await db.category.count({ where: { budgetId, system: false } }),
    ).toBe(before + 1);
    expect(
      (await db.category.findUniqueOrThrow({ where: { id: added.id } }))
        .groupId,
    ).toBe(groupId);
    expect(
      (
        await run({
          type: "starter.add",
          groupName: "Bills",
          categoryName: "Electric",
        })
      ).id,
    ).toBe(added.id);
    expect(
      await db.category.count({ where: { budgetId, system: false } }),
    ).toBe(before + 1);
    expect(await db.budgetAssignment.count({ where: { budgetId } })).toBe(0);
    expect(await db.financialTransaction.count({ where: { budgetId } })).toBe(
      0,
    );
    await expect(
      run({
        type: "starter.add",
        groupName: "Bills",
        categoryName: "Not a suggestion",
      }),
    ).rejects.toThrow("Suggested category unavailable");
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
    const edited = await run({
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
    await expect(
      run({ type: "transaction.undo", id: edited.id }),
    ).rejects.toThrow("reconciled statement");
    const undone = await run({
      type: "transaction.undo",
      id: edited.id,
      acknowledgeReconciled: true,
    });
    expect(
      (
        await db.financialTransaction.findUniqueOrThrow({
          where: { id: undone.id },
        })
      ).amount,
    ).toBe(-10000n);
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
  it("closes and deletes accounts the way YNAB does", async () => {
    const { cash, categoryId } = await setup();
    // Money left in an account needs a confirmed closing adjustment, nothing more.
    await expect(
      run({ type: "account.update", id: cash, name: "Checking", closed: true, version: 1 }),
    ).rejects.toThrow("still holds $1,000.00");
    // The adjustment is dated today, so read the current month.
    const before = (await getFinance(userId, budgetId)).projection.readyToAssign;
    const closed = await run({ type: "account.update", id: cash, name: "Checking", closed: true, version: 1, zeroBalance: true });
    expect(closed.message).toContain("-$1,000.00");
    let state = await getFinance(userId, budgetId);
    expect(state.projection.accounts.find((a) => a.id === cash)?.balance).toBe(0n);
    expect(state.projection.readyToAssign).toBeLessThan(before);

    // An account whose only history was undone is empty, so it closes without
    // reconciling, or can be deleted outright.
    const empty = (await run({ type: "account.create", name: "PNC Import", accountType: "CHECKING", participation: "BUDGET", opening: "0", date: "2026-01-01" })).id;
    const spent = await run({ type: "transaction.create", accountId: empty, kind: "EXPENSE", date: "2026-01-03", amount: "-5", splits: [{ categoryId, amount: "-5" }] });
    await expect(run({ type: "account.delete", id: empty })).rejects.toThrow("close it instead");
    await run({ type: "transaction.void", id: spent.id, reason: "Undo import" });
    await run({ type: "account.delete", id: empty });
    state = await getFinance(userId, budgetId, "2026-01");
    expect(state.accounts.map((a) => a.id)).not.toContain(empty);

    // A starting balance alone is reversed on the journal when deleting.
    const savings = (await run({ type: "account.create", name: "Old savings", accountType: "SAVINGS", participation: "BUDGET", opening: "50", date: "2026-01-01" })).id;
    const ready = (await getFinance(userId, budgetId, "2026-01")).projection.readyToAssign;
    await run({ type: "account.delete", id: savings });
    expect((await getFinance(userId, budgetId, "2026-01")).projection.readyToAssign).toBe(ready - 5000n);
    expect((await db.financialAccount.findUniqueOrThrow({ where: { id: savings } })).deletedAt).not.toBeNull();
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

  it("stores percentage minimum rules and statement balances, refusing incomplete or implausible ones", async () => {
    const { card } = await setup();
    await run({
      type: "debt.terms.set",
      accountId: card,
      apr: "22.5",
      minimumPayment: "25",
      minimumPercent: "1",
      minimumIncludesInterest: true,
      statementBalance: "812.40",
      statementDate: "2026-01-20",
    });
    const terms = await db.debtTerms.findFirstOrThrow({
      where: { accountId: card },
    });
    expect(terms.minimumPercentBasisPoints).toBe(100);
    expect(terms.minimumIncludesInterest).toBe(true);
    expect(terms.statementBalance).toBe(81240n);
    expect(terms.statementDate?.toISOString().slice(0, 10)).toBe("2026-01-20");
    const base = {
      type: "debt.terms.set" as const,
      accountId: card,
      apr: "22.5",
      minimumPayment: "25",
    };
    await expect(run({ ...base, minimumPercent: "101" })).rejects.toThrow(
      "cannot exceed 100%",
    );
    await expect(run({ ...base, minimumPercent: "1.234" })).rejects.toThrow(
      "percentage such as",
    );
    await expect(run({ ...base, statementBalance: "10" })).rejects.toThrow(
      "together",
    );
    await expect(
      run({ ...base, statementBalance: "10", statementDate: "2199-01-01" }),
    ).rejects.toThrow();
    // A percentage rule needs no fixed floor; with neither, nothing is saved.
    await run({
      type: "debt.terms.set",
      accountId: card,
      apr: "22.5",
      minimumPercent: "2",
      effectiveFrom: "2030-01",
    });
    const percentOnly = await db.debtTerms.findFirstOrThrow({
      where: { accountId: card, effectiveFrom: "2030-01" },
    });
    expect(percentOnly.minimumPayment).toBe(0n);
    expect(percentOnly.minimumPercentBasisPoints).toBe(200);
    await expect(
      run({ type: "debt.terms.set", accountId: card, apr: "22.5" }),
    ).rejects.toThrow("fixed minimum, a percentage, or both");
    await run({
      type: "debt.terms.clear",
      accountId: card,
      effectiveFrom: "2030-01",
    });
    // Interest is only added to a percentage minimum.
    await run({ ...base, minimumIncludesInterest: true });
    expect(
      (await db.debtTerms.findFirstOrThrow({ where: { accountId: card } }))
        .minimumIncludesInterest,
    ).toBe(false);
  });

  it("sets up a card's payment target and schedule from its terms, replacing rather than duplicating", async () => {
    const { cash, card, categoryId } = await setup();
    await run({
      type: "transaction.create",
      accountId: card,
      kind: "EXPENSE",
      date: "2026-01-10",
      amount: "-200",
      payee: "Store",
      splits: [{ categoryId, amount: "-200" }],
    });
    const payment = await db.category.findFirstOrThrow({
      where: { paymentAccountId: card },
    });
    // Needs a due day and a cash account to pay from.
    await expect(
      run({
        type: "debt.terms.set",
        accountId: card,
        apr: "24",
        minimumPercent: "1",
        payFromAccountId: cash,
      }),
    ).rejects.toThrow("due day");
    await expect(
      run({
        type: "debt.terms.set",
        accountId: card,
        apr: "24",
        minimumPercent: "1",
        dueDay: 15,
        payFromAccountId: card,
      }),
    ).rejects.toThrow("cash account");
    // 1% of $200 plus $4 interest is $6, so the $25 floor applies.
    const saved = await run({
      type: "debt.terms.set",
      accountId: card,
      apr: "24",
      minimumPayment: "25",
      minimumPercent: "1",
      minimumIncludesInterest: true,
      dueDay: 15,
      payFromAccountId: cash,
    });
    expect(saved.message).toContain("$25.00");
    const target = await db.categoryTarget.findFirstOrThrow({
      where: { categoryId: payment.id },
    });
    expect(target).toMatchObject({ type: "DEBT_PAYOFF", amount: 2500n, dueDay: 15 });
    const live = () =>
      db.schedule.findMany({
        where: { paymentForAccountId: card, archived: false, replacedById: null },
      });
    const [first] = await live();
    expect(first).toMatchObject({
      accountId: cash,
      transferAccountId: card,
      kind: "TRANSFER",
      amount: -2500n,
      cadence: "MONTHLY",
    });
    expect(first.startDate.getUTCDate()).toBe(15);
    // Saving the same terms again changes nothing.
    await run({
      type: "debt.terms.set",
      accountId: card,
      apr: "24",
      minimumPayment: "25",
      minimumPercent: "1",
      minimumIncludesInterest: true,
      dueDay: 15,
      payFromAccountId: cash,
    });
    expect(await db.schedule.count({ where: { paymentForAccountId: card } })).toBe(1);
    // A chosen payment replaces the schedule and the target amount.
    await run({
      type: "debt.terms.set",
      accountId: card,
      apr: "24",
      minimumPercent: "1",
      dueDay: 20,
      payFromAccountId: cash,
      monthlyPayment: "300",
    });
    const now = await live();
    expect(now).toHaveLength(1);
    expect(now[0].amount).toBe(-30000n);
    expect(now[0].startDate.getUTCDate()).toBe(20);
    expect(
      (await db.categoryTarget.findFirstOrThrow({ where: { categoryId: payment.id } }))
        .amount,
    ).toBe(30000n);
    // Terms without a paying account leave the schedule alone.
    await run({ type: "debt.terms.set", accountId: card, apr: "25", minimumPercent: "1" });
    expect(await live()).toHaveLength(1);
    // Deleting a card takes its managed payment with it rather than refusing.
    const spare = (
      await run({
        type: "account.create",
        name: "Spare card",
        accountType: "CREDIT_CARD",
        participation: "BUDGET",
        opening: "0",
        date: "2026-01-01",
      })
    ).id;
    await expect(
      run({
        type: "debt.terms.set",
        accountId: spare,
        apr: "20",
        minimumPayment: "25",
        dueDay: 1,
        payFromAccountId: cash,
      }),
    ).rejects.toThrow("owes nothing");
    await run({
      type: "debt.terms.set",
      accountId: spare,
      apr: "20",
      minimumPayment: "25",
      dueDay: 1,
      payFromAccountId: cash,
      monthlyPayment: "50",
    });
    await run({ type: "account.delete", id: spare });
    expect(
      await db.schedule.count({
        where: { paymentForAccountId: spare, archived: false },
      }),
    ).toBe(0);
  });

  it("sets up the payment for terms recorded earlier, without re-entering them", async () => {
    const { cash, card, categoryId } = await setup();
    await run({
      type: "transaction.create",
      accountId: card,
      kind: "EXPENSE",
      date: "2026-01-10",
      amount: "-400",
      payee: "Store",
      splits: [{ categoryId, amount: "-400" }],
    });
    await run({ type: "debt.terms.set", accountId: card, apr: "24", minimumPercent: "1" });
    await expect(
      run({ type: "debt.payment.setup", accountId: card, payFromAccountId: cash }),
    ).rejects.toThrow("due day");
    await run({
      type: "debt.terms.set",
      accountId: card,
      apr: "24",
      minimumPayment: "35",
      minimumPercent: "1",
      dueDay: 12,
    });
    expect(await db.schedule.count({ where: { paymentForAccountId: card } })).toBe(0);
    const done = await run({
      type: "debt.payment.setup",
      accountId: card,
      payFromAccountId: cash,
    });
    expect(done.message).toContain("due on day 12");
    const [schedule] = await db.schedule.findMany({
      where: { paymentForAccountId: card },
    });
    expect(schedule.startDate.getUTCDate()).toBe(12);
    expect(schedule.amount < 0n).toBe(true);
  });

  it("records a 0% intro rate and the regular rate after it in one save", async () => {
    const { card } = await setup();
    const { today } = await import("@/application/finance");
    const now = today("America/New_York").slice(0, 7);
    const [y, m] = now.split("-").map(Number);
    const ends = `${m + 6 > 12 ? y + 1 : y}-${String(((m + 5) % 12) + 1).padStart(2, "0")}`;
    await expect(
      run({ type: "debt.terms.set", accountId: card, apr: "24.99", minimumPercent: "1", introApr: "0" }),
    ).rejects.toThrow("together");
    const saved = await run({
      type: "debt.terms.set",
      accountId: card,
      apr: "24.99",
      minimumPayment: "40",
      minimumPercent: "1",
      minimumIncludesInterest: true,
      introApr: "0",
      introEnds: ends,
    });
    expect(saved.message).toContain(`0% until ${ends}, then 24.99%`);
    const versions = await db.debtTerms.findMany({
      where: { accountId: card },
      orderBy: { effectiveFrom: "asc" },
    });
    expect(versions.map((v) => [v.effectiveFrom, v.aprBasisPoints])).toEqual([
      [now, 0],
      [ends, 2499],
    ]);
    // Editing without the intro replaces the later version rather than keeping it.
    await run({
      type: "debt.terms.set",
      accountId: card,
      apr: "24.99",
      minimumPayment: "40",
      effectiveFrom: now,
      replaceFuture: true,
    });
    expect(await db.debtTerms.count({ where: { accountId: card } })).toBe(1);
  });

  it("stores a deferred-interest promotion on its intro version only", async () => {
    const { card } = await setup();
    await expect(
      run({ type: "debt.terms.set", accountId: card, apr: "29.99", minimumPayment: "25", introDeferred: true }),
    ).rejects.toThrow("intro rate and the month it ends");
    await expect(
      run({ type: "debt.terms.set", accountId: card, apr: "29.99", minimumPayment: "25", introApr: "0", introEnds: "2030-06", deferredAccrued: "12" }),
    ).rejects.toThrow("only to a deferred-interest promotion");
    const saved = await run({
      type: "debt.terms.set",
      accountId: card,
      apr: "29.99",
      minimumPayment: "25",
      introApr: "0",
      introEnds: "2030-06",
      introDeferred: true,
      deferredAccrued: "84.10",
    });
    expect(saved.message).toContain("deferred interest until 2030-06");
    const [intro, regular] = await db.debtTerms.findMany({
      where: { accountId: card },
      orderBy: { effectiveFrom: "asc" },
    });
    expect(intro).toMatchObject({ aprBasisPoints: 0, deferredInterest: true, deferredAccrued: 8410n });
    expect(regular).toMatchObject({
      effectiveFrom: "2030-06",
      aprBasisPoints: 2999,
      deferredInterest: false,
      deferredAccrued: null,
    });
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
  it("adds a complete stock group once and allows a category target", async () => {
    await run({ type: "starter.group.add", groupName: "Bills" });
    await run({ type: "starter.group.add", groupName: "Bills" });

    let state = await getFinance(userId, budgetId);
    const bills = state.groups.find((group) => group.name === "Bills");
    expect(bills).toBeDefined();
    expect(
      state.categories.filter((category) => category.groupId === bills!.id),
    ).toHaveLength(8);

    const electric = state.categories.find(
      (category) =>
        category.groupId === bills!.id && category.name === "Electric",
    )!;
    await run({
      type: "target.set",
      categoryId: electric.id,
      targetType: "MONTHLY",
      amount: "125",
      effectiveFrom: "2026-01",
    });
    state = await getFinance(userId, budgetId);
    expect(
      state.targets.find((target) => target.categoryId === electric.id),
    ).toMatchObject({ type: "MONTHLY", amount: 12500n });
  });

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

describe("deleting categories, groups and schedules", () => {
  it("deletes unused categories, archives used ones, and refuses money or live uses", async () => {
    const { cash, categoryId, groupId } = await setup();
    const spare = (await run({ type: "category.create", name: "Spare", groupId })).id;
    await run({ type: "target.set", categoryId: spare, targetType: "MONTHLY", amount: "10" });
    await run({ type: "category.delete", id: spare });
    expect(await db.category.count({ where: { id: spare } })).toBe(0);
    // Food holds $400 from setup.
    await expect(run({ type: "category.delete", id: categoryId })).rejects.toThrow(
      "holds $400.00",
    );
    await run({
      type: "transaction.create",
      accountId: cash,
      kind: "EXPENSE",
      date: "2026-01-05",
      amount: "-400",
      payee: "Grocer",
      splits: [{ categoryId, amount: "-400" }],
    });
    const rule = await run({
      type: "rule.save",
      name: "Grocer rule",
      payeeMatch: "Grocer",
      categoryId,
    });
    await expect(run({ type: "category.delete", id: categoryId })).rejects.toThrow(
      "Grocer rule",
    );
    await db.automationRule.delete({ where: { id: rule.id } });
    const used = await run({ type: "category.delete", id: categoryId });
    expect(used.message).toContain("archived");
    expect((await db.category.findUniqueOrThrow({ where: { id: categoryId } })).archived).toBe(true);
    // The group keeps its archived category, so it is hidden rather than deleted.
    await run({ type: "group.delete", id: groupId });
    expect((await db.categoryGroup.findUniqueOrThrow({ where: { id: groupId } })).hidden).toBe(true);
    const empty = (await run({ type: "group.create", name: "Empty" })).id;
    await run({ type: "category.create", name: "Unused", groupId: empty });
    await run({ type: "group.delete", id: empty });
    expect(await db.categoryGroup.count({ where: { id: empty } })).toBe(0);
  });

  it("deletes a schedule with the entries awaiting approval, keeping approved ones unless asked", async () => {
    const { today } = await import("@/application/finance");
    const { enterDueSchedules } = await import("@/application/schedules");
    const date = today("America/New_York");
    const { cash, categoryId } = await setup();
    const make = (name: string) =>
      run({
        type: "schedule.create",
        name,
        accountId: cash,
        kind: "EXPENSE",
        amount: "-5",
        startDate: date,
        cadence: "MONTHLY",
        splits: [{ categoryId, amount: "-5" }],
      });
    const pending = await make("Pending bill");
    const approved = await make("Approved bill");
    await enterDueSchedules(userId, budgetId);
    await run({ type: "schedule.confirm", id: approved.id, date });
    const live = () =>
      db.financialTransaction.count({ where: { budgetId, voidedAt: null, payee: "" } });
    const before = await live();
    const first = await run({ type: "schedule.delete", id: pending.id });
    expect(first.message).toContain("Removed 1 transaction");
    expect(await db.schedule.count({ where: { id: pending.id } })).toBe(0);
    expect(await live()).toBe(before - 1);
    const second = await run({ type: "schedule.delete", id: approved.id });
    expect(second.message).toContain("1 approved transaction stays");
    expect(await live()).toBe(before - 1);
    expect(await db.schedule.count({ where: { budgetId } })).toBe(0);
    // A category the deleted schedules used can now be deleted in turn.
    await expect(run({ type: "category.delete", id: categoryId })).rejects.toThrow(
      "holds",
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
  it("worker enters today's occurrence once, and owner approval does not post twice", async () => {
    const { today } = await import("@/application/finance");
    const { enterDueSchedules } = await import("@/application/schedules");
    const date = today("America/New_York");
    const { cash, categoryId } = await setup();
    const { id } = await run({
      type: "schedule.create",
      name: "Scheduled groceries",
      accountId: cash,
      kind: "EXPENSE",
      amount: "-25",
      startDate: date,
      cadence: "ONCE",
      splits: [{ categoryId, amount: "-25" }],
    });
    const before = await db.financialTransaction.count();
    expect(await enterDueSchedules(userId, budgetId)).toEqual({
      entered: 1,
      failed: 0,
    });
    expect(await enterDueSchedules(userId, budgetId)).toEqual({
      entered: 0,
      failed: 0,
    });
    const occurrence = await db.scheduleOccurrence.findFirstOrThrow({
      where: { scheduleId: id },
    });
    expect(occurrence.status).toBe("ENTERED");
    expect(await db.financialTransaction.count()).toBe(before + 1);
    const { getSchedules } = await import("@/application/schedules");
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    expect(
      (
        await getSchedules(userId, budgetId, next.toISOString().slice(0, 10))
      ).upcoming.some(
        (item) => item.schedule.id === id && item.handled?.status === "ENTERED",
      ),
    ).toBe(true);
    await run({ type: "schedule.confirm", id, date });
    expect(
      (
        await db.scheduleOccurrence.findFirstOrThrow({
          where: { scheduleId: id },
        })
      ).status,
    ).toBe("APPROVED");
    expect(await db.financialTransaction.count()).toBe(before + 1);
  });
  it("queues and runs a durable scheduled-entry job through the worker", async () => {
    const { today } = await import("@/application/finance");
    const jobs = await import("@/application/jobs");
    const date = today("America/New_York");
    const { cash } = await setup();
    const { id } = await run({
      type: "schedule.create",
      name: "Worker job",
      accountId: cash,
      kind: "INCOME",
      amount: "5",
      startDate: date,
      cadence: "ONCE",
    });
    await db.job.deleteMany();
    await jobs.scheduleDue();
    const queued = await db.job.findFirstOrThrow({
      where: { kind: "schedules.enter", budgetId },
    });
    expect(queued.status).toBe("QUEUED");
    let claimed;
    while ((claimed = await jobs.claim())) await jobs.runJob(claimed);
    expect(
      (
        await db.scheduleOccurrence.findFirstOrThrow({
          where: { scheduleId: id },
        })
      ).status,
    ).toBe("ENTERED");
    expect(
      (await db.job.findUniqueOrThrow({ where: { id: queued.id } })).status,
    ).toBe("DONE");
  });
  it("rejects an entered occurrence with an audited reversal", async () => {
    const { today } = await import("@/application/finance");
    const { enterDueSchedules } = await import("@/application/schedules");
    const date = today("America/New_York");
    const { cash, categoryId } = await setup();
    const { id } = await run({
      type: "schedule.create",
      name: "Reject me",
      accountId: cash,
      kind: "EXPENSE",
      amount: "-25",
      startDate: date,
      cadence: "ONCE",
      splits: [{ categoryId, amount: "-25" }],
    });
    await enterDueSchedules(userId, budgetId);
    const before = await db.journal.count();
    await run({ type: "schedule.reject", id, date });
    const occurrence = await db.scheduleOccurrence.findFirstOrThrow({
      where: { scheduleId: id },
    });
    expect(occurrence.status).toBe("SKIPPED");
    expect(occurrence.transactionId).toBeNull();
    expect(await db.journal.count()).toBe(before + 1);
    expect(await enterDueSchedules(userId, budgetId)).toEqual({
      entered: 0,
      failed: 0,
    });
  });
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

describe("schedule timezones, overdue summary and recurring dismissal", () => {
  // 05:00 UTC on 10 March: 01:00 in New York, still 9 March in Pago Pago.
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T05:00:00Z"));
    await db.budget.update({
      where: { id: budgetId },
      data: { timezone: "America/New_York" },
    });
  });
  afterEach(() => vi.useRealTimers());
  async function daily(timezone: string) {
    const { cash, categoryId } = await setup();
    return (
      await run({
        type: "schedule.create",
        name: `Daily ${timezone}`,
        accountId: cash,
        kind: "EXPENSE",
        amount: "-5",
        startDate: "2026-03-09",
        timezone,
        cadence: "DAILY",
        splits: [{ categoryId, amount: "-5" }],
      })
    ).id;
  }
  it("is due only once the date has arrived in both the schedule's and the budget's zone", async () => {
    const behind = await daily("Pacific/Pago_Pago");
    const ahead = await daily("Pacific/Kiritimati");
    const { getSchedules } = await import("@/application/schedules");
    const view = await getSchedules(
      userId,
      budgetId,
      "2026-03-09",
      "2026-03-11",
    );
    const due = (id: string, date: string) =>
      view.upcoming.find((o) => o.schedule.id === id && o.date === date)?.due;
    expect(due(behind, "2026-03-09")).toBe(true);
    expect(due(behind, "2026-03-10")).toBe(false);
    expect(due(ahead, "2026-03-10")).toBe(true);
    expect(due(ahead, "2026-03-11")).toBe(false);
    await expect(
      run({ type: "schedule.approve", id: behind, date: "2026-03-10" }),
    ).rejects.toThrow("Approve on or after");
    // Already tomorrow in Kiritimati, but a future date for the ledger.
    await expect(
      run({ type: "schedule.approve", id: ahead, date: "2026-03-11" }),
    ).rejects.toThrow("Approve on or after");
    await run({ type: "schedule.approve", id: ahead, date: "2026-03-10" });
  });
  it("summarises unhandled past occurrences whatever window is shown", async () => {
    const { cash, categoryId } = await setup();
    const id = (
      await run({
        type: "schedule.create",
        name: "Rent",
        accountId: cash,
        kind: "EXPENSE",
        amount: "-50",
        startDate: "2026-01-15",
        cadence: "MONTHLY",
        splits: [{ categoryId, amount: "-50" }],
      })
    ).id;
    const { getSchedules } = await import("@/application/schedules");
    expect((await getSchedules(userId, budgetId)).overdue).toEqual({
      count: 2,
      oldest: "2026-01-15",
    });
    await run({ type: "schedule.skip", id, date: "2026-01-15" });
    expect((await getSchedules(userId, budgetId)).overdue).toEqual({
      count: 1,
      oldest: "2026-02-15",
    });
    await run({ type: "schedule.archive", id, archived: true });
    expect((await getSchedules(userId, budgetId)).overdue.count).toBe(0);
  });
  it("dismisses and restores a recurring suggestion without touching the ledger", async () => {
    const key = JSON.stringify(["account", "coffee", "EXPENSE", false]);
    const journals = await db.journal.count();
    const { getSchedules } = await import("@/application/schedules");
    await run({ type: "recurring.dismiss", key });
    await run({ type: "recurring.dismiss", key });
    expect((await getSchedules(userId, budgetId)).dismissed).toEqual([key]);
    await run({ type: "recurring.restore", key });
    expect((await getSchedules(userId, budgetId)).dismissed).toEqual([]);
    expect(await db.journal.count()).toBe(journals);
    await expect(run({ type: "recurring.dismiss", key: "" })).rejects.toThrow();
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

describe("saved automation rules", () => {
  it("saves and previews without changing ledger history, then disables with revision protection", async () => {
    const { cash, categoryId } = await setup();
    const transaction = await run({
      type: "transaction.create",
      accountId: cash,
      kind: "EXPENSE",
      amount: "-25",
      date: "2026-02-01",
      payee: "UTILITY 123",
      splits: [{ categoryId, amount: "-25" }],
    });
    const command = {
      type: "rule.save" as const,
      name: "Utility cleanup",
      payeeMatch: "utility",
      renamePayee: "Utility",
      priority: 1,
    };
    const result = await run(command);
    const { getRules } = await import("@/application/rules");
    const before = await db.journal.count();
    const protectedView = await getRules(userId, budgetId, transaction.id);
    expect(protectedView.preview?.output.payee).toBe("UTILITY 123");
    await run({
      type: "transaction.protect",
      id: transaction.id,
      fingerprint: protectedView.fingerprint,
      locked: [],
    });
    const view = await getRules(userId, budgetId, transaction.id);
    expect(view.preview?.output.payee).toBe("Utility");
    expect(
      (
        await db.financialTransaction.findUniqueOrThrow({
          where: { id: transaction.id },
        })
      ).payee,
    ).toBe("UTILITY 123");
    expect(await db.journal.count()).toBe(before);
    await run({ ...command, id: result.id, revision: 1, enabled: false });
    expect(
      (await getRules(userId, budgetId, transaction.id)).preview?.explanation,
    ).toEqual([]);
    await expect(
      run({ ...command, id: result.id, revision: 1 }),
    ).rejects.toThrow("changed");
  });
  it("guards ownership, exact amount validation, idempotency and audit", async () => {
    const { cash } = await setup();
    const command = {
      type: "rule.save" as const,
      name: "Exact large income",
      accountId: cash,
      minimum: "90071992547409.93",
      maximum: "90071992547409.93",
      renamePayee: "Large income",
    };
    const key = randomUUID();
    const result = await run(command, key);
    expect((await run(command, key)).id).toBe(result.id);
    expect(await db.automationRule.count()).toBe(1);
    expect((await db.automationRule.findFirstOrThrow()).minimum).toBe(
      9007199254740993n,
    );
    expect(await db.auditEvent.count({ where: { entityId: result.id } })).toBe(
      1,
    );
    await expect(
      executeFinance(randomUUID(), budgetId, randomUUID(), command),
    ).rejects.toThrow("Budget unavailable");
    await expect(
      run({ ...command, minimum: "2", maximum: "1" }),
    ).rejects.toThrow("Minimum");
    const other = await db.budget.create({ data: { name: "Other budget" } });
    await expect(
      db.automationRule.create({
        data: {
          budgetId: other.id,
          accountId: cash,
          name: "Invalid ownership",
        },
      }),
    ).rejects.toThrow();
  });
  it("requires a condition and an action rather than accidental blanket edits", async () => {
    await expect(
      run({ type: "rule.save", name: "All", renamePayee: "Oops" }),
    ).rejects.toThrow("condition");
    await expect(
      run({ type: "rule.save", name: "Nothing", payeeMatch: "shop" }),
    ).rejects.toThrow("action");
  });
});

describe("opt-in rule suggestions", () => {
  it("suggests from unanimous non-voided filings and stops once a rule covers the payee", async () => {
    const { cash, categoryId } = await setup();
    const spend = (day: string) =>
      run({
        type: "transaction.create",
        accountId: cash,
        kind: "EXPENSE",
        date: `2026-01-${day}`,
        amount: "-4",
        payee: "Corner Cafe",
        splits: [{ categoryId, amount: "-4" }],
      });
    const { getRules } = await import("@/application/rules");
    await spend("02");
    await spend("03");
    const third = await spend("04");
    expect((await getRules(userId, budgetId)).suggestions).toEqual([
      { payee: "Corner Cafe", categoryId, support: 3 },
    ]);
    await run({
      type: "transaction.void",
      id: third.id,
      reason: "Duplicate",
      acknowledgeReconciled: true,
    });
    expect((await getRules(userId, budgetId)).suggestions).toEqual([]);
    await spend("05");
    const rules = await db.automationRule.count();
    expect((await getRules(userId, budgetId)).suggestions).toHaveLength(1);
    expect(await db.automationRule.count()).toBe(rules);
    await run({
      type: "rule.save",
      name: "Corner Cafe",
      payeeMatch: "Corner Cafe",
      matchMode: "EXACT",
      categoryId,
      enabled: false,
    });
    expect((await getRules(userId, budgetId)).suggestions).toEqual([]);
  });
});

describe("reviewed rule application", () => {
  async function prepared() {
    const { cash, categoryId } = await setup();
    const transaction = await run({
      type: "transaction.create",
      accountId: cash,
      kind: "EXPENSE",
      date: "2026-01-03",
      amount: "-25",
      payee: "RAW UTILITY",
      cleared: true,
      splits: [{ categoryId, amount: "-25" }],
    });
    const rule = await run({
      type: "rule.save",
      name: "Clean utility",
      payeeMatch: "RAW UTILITY",
      renamePayee: "Utility",
      tags: "bill, recurring",
    });
    const { getRules } = await import("@/application/rules");
    const protectedView = await getRules(userId, budgetId, transaction.id);
    expect(protectedView.preview?.output.payee).toBe("RAW UTILITY");
    await run({
      type: "transaction.protect",
      id: transaction.id,
      fingerprint: protectedView.fingerprint,
      locked: ["categoryId", "memo", "transferAccountId"],
    });
    return { cash, categoryId, transaction, rule, getRules };
  }
  it("requires explicit unlocking and records one balanced replacement with tags and cleared state", async () => {
    const { cash, transaction, getRules } = await prepared();
    const view = await getRules(userId, budgetId, transaction.id);
    const before = (
      await getFinance(userId, budgetId, "2026-01")
    ).projection.accounts.find((a) => a.id === cash)!.balance;
    const key = randomUUID(),
      command = {
        type: "rule.apply" as const,
        id: transaction.id,
        fingerprint: view.fingerprint,
      };
    const result = await run(command, key);
    expect((await run(command, key)).id).toBe(result.id);
    const replacement = await db.financialTransaction.findUniqueOrThrow({
      where: { id: result.id },
    });
    expect(replacement.replacesId).toBe(transaction.id);
    expect(replacement.payee).toBe("Utility");
    expect(replacement.amount).toBe(-2500n);
    expect(
      (
        await db.financialTransaction.findUniqueOrThrow({
          where: { id: transaction.id },
        })
      ).voidedAt,
    ).not.toBeNull();
    expect(
      (
        await db.transactionPreference.findUniqueOrThrow({
          where: { transactionId: result.id },
        })
      ).tags,
    ).toEqual(["bill", "recurring"]);
    expect(
      (
        await db.transactionState.findFirstOrThrow({
          where: { transactionId: result.id },
        })
      ).cleared,
    ).toBe(true);
    expect(
      (await getFinance(userId, budgetId, "2026-01")).projection.accounts.find(
        (a) => a.id === cash,
      )!.balance,
    ).toBe(before);
  });
  it("rejects changed previews before any journal mutation", async () => {
    const { transaction, rule, getRules } = await prepared();
    const view = await getRules(userId, budgetId, transaction.id);
    await run({
      type: "rule.save",
      id: rule.id,
      revision: 1,
      name: "Changed",
      payeeMatch: "RAW UTILITY",
      renamePayee: "Different",
    });
    const count = await db.journal.count();
    await expect(
      run({
        type: "rule.apply",
        id: transaction.id,
        fingerprint: view.fingerprint,
      }),
    ).rejects.toThrow("Preview changed");
    expect(await db.journal.count()).toBe(count);
  });
  it("requires reconciliation acknowledgment and preserves tags through later manual corrections", async () => {
    const { cash, categoryId, transaction, getRules } = await prepared();
    await run({
      type: "reconcile",
      accountId: cash,
      date: "2026-01-31",
      observed: "975",
    });
    const view = await getRules(userId, budgetId, transaction.id);
    await expect(
      run({
        type: "rule.apply",
        id: transaction.id,
        fingerprint: view.fingerprint,
      }),
    ).rejects.toThrow("Acknowledge");
    const applied = await run({
      type: "rule.apply",
      id: transaction.id,
      fingerprint: view.fingerprint,
      acknowledgeReconciled: true,
    });
    const corrected = await run({
      type: "transaction.create",
      accountId: cash,
      kind: "EXPENSE",
      date: "2026-01-03",
      amount: "-25",
      payee: "Owner name",
      splits: [{ categoryId, amount: "-25" }],
      replacesId: applied.id,
      reason: "Owner rename",
    });
    const preference = await db.transactionPreference.findUniqueOrThrow({
      where: { transactionId: corrected.id },
    });
    expect(preference.tags).toEqual(["bill", "recurring"]);
    expect(preference.locked).toContain("payee");
  });
});

describe("reports on PostgreSQL", () => {
  it("shows the same Age of Money on Budget and Reports from posted cash outflows", async () => {
    const { cash, card, categoryId } = await setup();
    const { getReports } = await import("@/application/reports");
    for (let day = 2; day <= 10; day++)
      await run({
        type: "transaction.create",
        accountId: cash,
        kind: "EXPENSE",
        date: `2026-01-${String(day).padStart(2, "0")}`,
        amount: "-1",
        splits: [{ categoryId, amount: "-1" }],
      });
    expect(
      (await getFinance(userId, budgetId, "2026-01")).ageOfMoney.days,
    ).toBeNull();
    await run({
      type: "transaction.create",
      accountId: card,
      kind: "EXPENSE",
      date: "2026-01-11",
      amount: "-10",
      splits: [{ categoryId, amount: "-10" }],
    });
    await run({
      type: "transaction.create",
      accountId: cash,
      transferAccountId: card,
      kind: "TRANSFER",
      date: "2026-01-12",
      amount: "-10",
    });
    const budget = await getFinance(userId, budgetId, "2026-01");
    const reports = await getReports(userId, budgetId, {
      from: "2026-01",
      through: "2026-01",
    });
    expect(budget.ageOfMoney.sampleCount).toBe(10);
    expect(budget.ageOfMoney.days).toBe(6);
    expect(reports.ageOfMoney.days).toBe(6);
  });

  it("filters Reflect reports by account and category and builds Income v Expense", async () => {
    const { cash, card, categoryId, groupId } = await setup();
    const { getReports } = await import("@/application/reports");
    const fun = await run({ type: "category.create", name: "Fun", groupId });
    await run({ type: "transaction.create", accountId: cash, kind: "INCOME", date: "2026-01-05", amount: "200", payee: "Employer" });
    await run({ type: "transaction.create", accountId: cash, kind: "EXPENSE", date: "2026-01-06", amount: "-30", splits: [{ categoryId, amount: "-30" }] });
    await run({ type: "transaction.create", accountId: card, kind: "EXPENSE", date: "2026-02-06", amount: "-12.34", splits: [{ categoryId: fun.id, amount: "-12.34" }] });
    const all = await getReports(userId, budgetId, { from: "2026-01", through: "2026-02" });
    expect(all.flows.byGroup).toEqual([
      expect.objectContaining({ key: groupId, name: "Everyday", amount: 4234n }),
    ]);
    expect(all.incomeExpense.income.map((r) => [r.name, r.amounts])).toEqual([["Employer", [20000n, 0n]]]);
    expect(all.incomeExpense.expenses[0].categories.map((c) => [c.name, c.amounts])).toEqual([
      ["Food", [3000n, 0n]],
      ["Fun", [0n, 1234n]],
    ]);
    expect(all.incomeExpense.net.total).toBe(20000n - 4234n);
    const onCard = await getReports(userId, budgetId, { from: "2026-01", through: "2026-02", accounts: [card] });
    expect(onCard.flows.consumption).toBe(1234n);
    expect(onCard.flows.income).toBe(0n);
    expect(onCard.balances.map((b) => b.id)).toEqual([card]);
    const food = await getReports(userId, budgetId, { from: "2026-01", through: "2026-02", categories: [categoryId] });
    expect(food.flows.consumption).toBe(3000n);
    expect(food.incomeExpense.incomeTotal.total).toBe(20000n);
    await expect(
      getReports(userId, budgetId, { accounts: ["not-a-uuid"] }),
    ).rejects.toThrow("Invalid report filters");
  });

  it("excludes voided entries and transfers, drills down, and compares periods", async () => {
    const { cash, card, categoryId } = await setup();
    const { getReports } = await import("@/application/reports");
    await run({
      type: "transaction.create",
      accountId: cash,
      kind: "INCOME",
      date: "2026-02-02",
      amount: "2000",
      payee: "Employer",
    });
    const spent = await run({
      type: "transaction.create",
      accountId: cash,
      kind: "EXPENSE",
      date: "2026-02-03",
      amount: "-80",
      payee: "Grocer",
      splits: [{ categoryId, amount: "-80" }],
    });
    const mistake = await run({
      type: "transaction.create",
      accountId: cash,
      kind: "EXPENSE",
      date: "2026-02-04",
      amount: "-500",
      payee: "Typo",
      splits: [{ categoryId, amount: "-500" }],
    });
    await run({
      type: "transaction.void",
      id: mistake.id,
      reason: "Entered twice",
      acknowledgeReconciled: true,
    });
    await run({
      type: "transaction.create",
      accountId: cash,
      kind: "TRANSFER",
      transferAccountId: card,
      date: "2026-02-05",
      amount: "-30",
    });
    await run({
      type: "transaction.create",
      accountId: cash,
      kind: "EXPENSE",
      date: "2026-01-10",
      amount: "-20",
      payee: "Grocer",
      splits: [{ categoryId, amount: "-20" }],
    });
    const report = await getReports(userId, budgetId, {
      from: "2026-02",
      through: "2026-02",
      line: categoryId,
    });
    expect(report.flows.income).toBe(200000n);
    expect(report.flows.consumption).toBe(8000n);
    expect(report.flows.financing).toBe(0n);
    expect(report.drill?.map((l) => l.transactionId)).toEqual([spent.id]);
    // Previous period of equal length: 31 days ending 31 January.
    expect(report.previous?.consumption).toBe(2000n);
    expect(report.flows.budgetChange).toBe(200000n - 8000n);
    await expect(
      getReports(randomUUID(), budgetId, { from: "2026-02" }),
    ).rejects.toThrow("Budget unavailable");
    await expect(
      getReports(userId, budgetId, { from: "2026-03", through: "2026-02" }),
    ).rejects.toThrow("start month");
  });
});

describe("forecasts on PostgreSQL", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T15:00:00Z"));
    await db.budget.update({
      where: { id: budgetId },
      data: { timezone: "America/New_York" },
    });
  });
  afterEach(() => vi.useRealTimers());

  it("counts scheduled bills once, averages the rest and never writes", async () => {
    const { cash, categoryId, groupId } = await setup();
    const rent = await run({
      type: "category.create",
      name: "Rent",
      groupId,
    });
    for (const month of ["2025-12", "2026-01", "2026-02"]) {
      await run({
        type: "transaction.create",
        accountId: cash,
        kind: "EXPENSE",
        date: `${month}-05`,
        amount: "-30",
        payee: "Grocer",
        splits: [{ categoryId, amount: "-30" }],
      });
      await run({
        type: "transaction.create",
        accountId: cash,
        kind: "EXPENSE",
        date: `${month}-01`,
        amount: "-500",
        payee: "Landlord",
        splits: [{ categoryId: rent.id, amount: "-500" }],
      });
    }
    await run({
      type: "schedule.create",
      name: "Rent",
      accountId: cash,
      kind: "EXPENSE",
      amount: "-500",
      payee: "Landlord",
      startDate: "2026-04-01",
      cadence: "MONTHLY",
      splits: [{ categoryId: rent.id, amount: "-500" }],
    });
    await run({
      type: "schedule.create",
      name: "Pay",
      accountId: cash,
      kind: "INCOME",
      amount: "800",
      payee: "Employer",
      startDate: "2026-03-15",
      cadence: "MONTHLY",
    });
    const { getForecast } = await import("@/application/forecasts");
    const journals = await db.journal.count();
    const f = await getForecast(userId, budgetId, { months: 3 });
    expect(await db.journal.count()).toBe(journals);
    // Groceries only: rent is scheduled, so its history is left out.
    expect(f.assumptions.averageSpending).toBe(3000n);
    expect(f.incomeSource).toBe("scheduled");
    expect(f.rows[0]).toMatchObject({
      month: "2026-03",
      partial: true,
      income: 80000n,
      bills: 0n,
      spending: 0n,
    });
    expect(f.rows[1]).toMatchObject({
      month: "2026-04",
      income: 80000n,
      bills: -50000n,
      spending: -3000n,
      net: 27000n,
    });
    expect(f.rows.at(-1)!.ending).toBe(
      f.rows.reduce((n, r) => n + r.net, f.startPosition),
    );
    const year = await getForecast(userId, budgetId, { months: "12" });
    expect(year.rows).toHaveLength(13);
    await expect(getForecast(userId, budgetId, { months: 2 })).rejects.toThrow(
      "1, 3, 6 or 12",
    );
    await expect(
      getForecast(randomUUID(), budgetId, { months: 3 }),
    ).rejects.toThrow("Budget unavailable");
  });
});
