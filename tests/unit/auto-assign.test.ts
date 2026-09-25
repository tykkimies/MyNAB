import { describe, expect, it } from "vitest";
import {
  planAutoAssign,
  type AutoAssignMode,
} from "@/domain/auto-assign";
import { projectBudget, type BudgetInput } from "@/domain/budget";

const base = (): BudgetInput => ({
  accounts: [
    { id: "cash", name: "Checking", type: "CHECKING", participation: "BUDGET" },
  ],
  categories: [
    { id: "food", name: "Food", paymentAccountId: null },
    { id: "rent", name: "Rent", paymentAccountId: null },
  ],
  transactions: [
    {
      id: "opening",
      date: "2026-01-01",
      kind: "OPENING",
      accountId: "cash",
      amount: 100000n,
      splits: [],
    },
  ],
  assignments: [],
});
const assign = (input: BudgetInput, id: string, month: string, amount: bigint) =>
  input.assignments.push({
    id: `${month}-${id}-${input.assignments.length}`,
    month,
    categoryId: id,
    amount,
  });
const spend = (input: BudgetInput, id: string, date: string, amount: bigint) =>
  input.transactions.push({
    id: `spend-${input.transactions.length}`,
    date,
    kind: "EXPENSE",
    accountId: "cash",
    amount: -amount,
    splits: [{ categoryId: id, amount: -amount }],
  });

describe("Auto-Assign previews", () => {
  it("sets assignment to last month's amount, not an increment", () => {
    const input = base();
    assign(input, "food", "2026-01", 12001n);
    assign(input, "food", "2026-02", 5000n);
    const plan = planAutoAssign(input, "2026-02", "LAST_ASSIGNED", ["food"]);
    expect(plan.changes).toMatchObject([
      { categoryId: "food", amount: 7001n, nextAssigned: 12001n },
    ]);
    expect(plan.readyAfter).toBe(plan.readyBefore - 7001n);
    expect(input.assignments).toHaveLength(2);
  });

  it("uses net prior-month spending and ignores card-free rollover", () => {
    const input = base();
    spend(input, "food", "2026-01-03", 5033n);
    assign(input, "food", "2026-02", 1000n);
    const plan = planAutoAssign(input, "2026-02", "LAST_SPENT", ["food"]);
    expect(plan.changes[0].amount).toBe(4033n);
    expect(plan.changes[0].nextAssigned).toBe(5033n);
  });

  it("averages from first historical activity through empty months", () => {
    const input = base();
    assign(input, "food", "2026-01", 1001n);
    const assigned = planAutoAssign(
      input,
      "2026-04",
      "AVERAGE_ASSIGNED",
      ["food"],
    );
    expect(assigned.changes[0].amount).toBe(334n);
    spend(input, "rent", "2026-02-01", 1001n);
    const spent = planAutoAssign(input, "2026-04", "AVERAGE_SPENT", ["rent"]);
    expect(spent.changes[0].amount).toBe(501n);
  });

  it("resets assigned or available precisely, including overspending", () => {
    const input = base();
    assign(input, "food", "2026-01", 10000n);
    spend(input, "food", "2026-01-03", 12000n);
    const assigned = planAutoAssign(
      input,
      "2026-01",
      "RESET_ASSIGNED",
      ["food"],
    );
    expect(assigned.changes[0].amount).toBe(-10000n);
    expect(assigned.changes[0].nextAssigned).toBe(0n);
    const available = planAutoAssign(
      input,
      "2026-01",
      "RESET_AVAILABLE",
      ["food"],
    );
    expect(available.changes[0].amount).toBe(2000n);
    expect(available.changes[0].nextAvailable).toBe(0n);
  });

  it("reduces only excess positive assignment over target need", () => {
    const input = base();
    assign(input, "food", "2026-01", 15000n);
    assign(input, "rent", "2026-01", 5000n);
    const plan = planAutoAssign(
      input,
      "2026-01",
      "REDUCE_OVERFUNDING",
      ["food", "rent"],
      new Map([
        ["food", 10000n],
        ["rent", 9000n],
      ]),
    );
    expect(plan.changes.map((change) => [change.categoryId, change.amount])).toEqual([
      ["food", -5000n],
    ]);
    expect(projectBudget(input, "2026-01").categories[0].assigned).toBe(15000n);
  });

  it("ignores duplicate category selection and does not touch unselected rows", () => {
    const input = base();
    assign(input, "food", "2026-01", 1000n);
    assign(input, "rent", "2026-01", 4000n);
    const plan = planAutoAssign(input, "2026-01", "RESET_ASSIGNED", [
      "food",
      "food",
    ]);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0].amount).toBe(-1000n);
    expect(plan.readyAfter).toBe(plan.readyBefore + 1000n);
  });

  it("uses the projected result when a card payment reserve is capped", () => {
    const input = base();
    input.accounts.push({
      id: "card",
      name: "Card",
      type: "CREDIT_CARD",
      participation: "BUDGET",
    });
    input.categories.push({
      id: "payment",
      name: "Card payment",
      paymentAccountId: "card",
    });
    input.transactions.push({
      id: "card-opening",
      date: "2026-01-01",
      kind: "OPENING",
      accountId: "card",
      amount: -1000n,
      splits: [],
    });
    assign(input, "payment", "2026-01", 2000n);
    const plan = planAutoAssign(
      input,
      "2026-01",
      "RESET_ASSIGNED",
      ["payment"],
    );
    expect(plan.changes[0].amount).toBe(-2000n);
    expect(plan.readyAfter - plan.readyBefore).toBe(1000n);
  });

  it.each<AutoAssignMode>([
    "LAST_ASSIGNED",
    "LAST_SPENT",
    "AVERAGE_ASSIGNED",
    "AVERAGE_SPENT",
    "REDUCE_OVERFUNDING",
    "RESET_ASSIGNED",
    "RESET_AVAILABLE",
  ])("returns no change for empty category with %s", (mode) => {
    const plan = planAutoAssign(base(), "2026-02", mode, ["food"]);
    expect(plan.changes).toEqual([]);
    expect(plan.readyBefore).toBe(plan.readyAfter);
  });
});
