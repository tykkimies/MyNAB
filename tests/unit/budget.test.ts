import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  projectBudget,
  type BudgetInput,
  type BudgetTransaction,
} from "@/domain/budget";
const cash = {
  id: "cash",
  name: "Checking",
  type: "CHECKING",
  participation: "BUDGET",
} as const;
const card = {
  id: "card",
  name: "Card",
  type: "CREDIT_CARD",
  participation: "BUDGET",
} as const;
const categories = [
  { id: "food", name: "Food", paymentAccountId: null },
  { id: "other", name: "Other", paymentAccountId: null },
  { id: "payment", name: "Card payment", paymentAccountId: "card" },
];
const opening = (accountId: string, amount: bigint): BudgetTransaction => ({
  id: `opening-${accountId}`,
  date: "2026-01-01",
  kind: "OPENING",
  accountId,
  amount,
  splits: [],
});
const expense = (
  id: string,
  accountId: string,
  amount: bigint,
  date = "2026-01-03",
): BudgetTransaction => ({
  id,
  date,
  kind: "EXPENSE",
  accountId,
  amount: -amount,
  splits: [{ categoryId: "food", amount: -amount }],
});
const refund = (
  id: string,
  amount: bigint,
  date = "2026-01-04",
): BudgetTransaction => ({
  id,
  date,
  kind: "REFUND",
  accountId: "card",
  amount,
  splits: [{ categoryId: "food", amount }],
});
const payment = (amount: bigint, date = "2026-01-05"): BudgetTransaction => ({
  id: "payment",
  date,
  kind: "TRANSFER",
  accountId: "cash",
  transferAccountId: "card",
  amount: -amount,
  splits: [],
});
function input(
  extra: BudgetTransaction[] = [],
  assigned = 40000n,
): BudgetInput {
  return {
    accounts: [cash, card],
    categories,
    transactions: [opening("cash", 100000n), opening("card", 0n), ...extra],
    assignments: [
      { id: "a", month: "2026-01", categoryId: "food", amount: assigned },
    ],
  };
}
const row = (s: ReturnType<typeof projectBudget>, id: string) =>
  s.categories.find((c) => c.id === id)!;
describe("envelope invariants before application workflows", () => {
  it("allocates existing money and conserves it when moved", () => {
    const i = input();
    i.assignments.push(
      { id: "b", month: "2026-01", categoryId: "food", amount: -5000n },
      { id: "c", month: "2026-01", categoryId: "other", amount: 5000n },
    );
    const s = projectBudget(i, "2026-01");
    expect(s.readyToAssign).toBe(60000n);
    expect(row(s, "food").available).toBe(35000n);
    expect(row(s, "other").available).toBe(5000n);
  });
  it("moves funded card spending to payment reserve without reducing cash", () => {
    const s = projectBudget(input([expense("p", "card", 10000n)]), "2026-01");
    expect(s.cash).toBe(100000n);
    expect(row(s, "food").available).toBe(30000n);
    expect(row(s, "payment").available).toBe(10000n);
    expect(s.readyToAssign).toBe(60000n);
  });
  it("treats payments as transfers, not duplicate spending", () => {
    const s = projectBudget(
      input([expense("p", "card", 10000n), payment(10000n)]),
      "2026-01",
    );
    expect(s.cash).toBe(90000n);
    expect(row(s, "food").activity).toBe(-10000n);
    expect(row(s, "payment").available).toBe(0n);
    expect(s.readyToAssign).toBe(60000n);
  });
  it("rolls cash deficits into next month's RTA", () => {
    const i = input([expense("p", "cash", 45000n)]);
    expect(projectBudget(i, "2026-01").cashDeficit).toBe(5000n);
    const s = projectBudget(i, "2026-02");
    expect(row(s, "food").available).toBe(0n);
    expect(s.readyToAssign).toBe(55000n);
  });
  it("leaves unfunded card purchases as debt at rollover", () => {
    const i = input([expense("p", "card", 45000n)]);
    const jan = projectBudget(i, "2026-01");
    expect(jan.creditDeficit).toBe(5000n);
    expect(jan.cashDeficit).toBe(0n);
    const s = projectBudget(i, "2026-02");
    expect(row(s, "food").available).toBe(0n);
    expect(row(s, "payment").available).toBe(40000n);
    expect(s.readyToAssign).toBe(60000n);
  });
  it("gives cash spending priority regardless of entry order", () => {
    const i = input([
      expense("card-first", "card", 40000n),
      expense("cash-later", "cash", 10000n, "2026-01-10"),
    ]);
    const s = projectBudget(i, "2026-01");
    expect(row(s, "payment").available).toBe(30000n);
    expect(s.creditDeficit).toBe(10000n);
    expect(s.cashDeficit).toBe(0n);
    expect(
      projectBudget(
        { ...i, transactions: [...i.transactions].reverse() },
        "2026-01",
      ),
    ).toEqual(s);
  });
  it("does not reserve cash for pre-existing debt", () => {
    const i = input([], 0n);
    i.transactions[1] = opening("card", -80000n);
    expect(row(projectBudget(i, "2026-01"), "payment").available).toBe(0n);
    i.assignments.push({
      id: "pay",
      categoryId: "payment",
      month: "2026-01",
      amount: 20000n,
    });
    i.transactions.push(payment(20000n));
    expect(projectBudget(i, "2026-01").readyToAssign).toBe(80000n);
  });
  it("handles partial refunds and refunds after paying off a card", () => {
    const s = projectBudget(
      input([expense("p", "card", 10000n), refund("r", 4000n)]),
      "2026-01",
    );
    expect(row(s, "food").available).toBe(34000n);
    expect(row(s, "payment").available).toBe(6000n);
    const paid = projectBudget(
      input([
        expense("p", "card", 10000n),
        payment(10000n),
        refund("r", 10000n, "2026-02-01"),
      ]),
      "2026-02",
    );
    expect(paid.cardAssets).toBe(10000n);
    expect(row(paid, "food").available).toBe(40000n);
    expect(paid.readyToAssign).toBe(60000n);
  });
  it("discloses an underfunded old refund without creating cash", () => {
    const i = input(
      [expense("p", "card", 10000n), refund("r", 10000n, "2026-02-01")],
      0n,
    );
    const s = projectBudget(i, "2026-02");
    expect(row(s, "food").available).toBe(10000n);
    expect(row(s, "payment").available).toBe(-10000n);
    expect(s.cashDeficit).toBe(10000n);
    expect(s.resources).toBe(100000n);
    expect(projectBudget(i, "2026-03").readyToAssign).toBe(90000n);
  });
  it("consumes positive card assets before reserving new debt", () => {
    const i = input([expense("p", "card", 3000n)], 3000n);
    i.transactions[1] = opening("card", 2000n);
    const s = projectBudget(i, "2026-01");
    expect(s.cardAssets).toBe(0n);
    expect(row(s, "payment").available).toBe(1000n);
    expect(s.readyToAssign).toBe(99000n);
  });
  it("releases excess reserves after a statement credit", () => {
    const i = input([
      expense("p", "card", 10000n),
      {
        id: "credit",
        kind: "CREDIT",
        accountId: "card",
        amount: 2000n,
        date: "2026-01-04",
        splits: [],
      },
    ]);
    const s = projectBudget(i, "2026-01");
    expect(row(s, "payment").available).toBe(8000n);
    expect(s.releasedReserves).toBe(2000n);
    expect(s.readyToAssign).toBe(62000n);
  });
  it("counts received cash advances as assignable financing, not income", () => {
    const i = input(
      [
        {
          id: "advance",
          kind: "TRANSFER",
          accountId: "card",
          transferAccountId: "cash",
          date: "2026-01-04",
          amount: -10000n,
          splits: [],
        },
      ],
      0n,
    );
    const s = projectBudget(i, "2026-01");
    expect(s.cash).toBe(110000n);
    expect(s.readyToAssign).toBe(110000n);
    expect(row(s, "payment").available).toBe(0n);
  });
  it("earmarks future assignments without future income", () => {
    const i = input();
    i.assignments.push({
      id: "future",
      categoryId: "other",
      month: "2026-02",
      amount: 20000n,
    });
    expect(projectBudget(i, "2026-01").readyToAssign).toBe(40000n);
    const next = projectBudget(i, "2026-02");
    expect(next.readyToAssign).toBe(40000n);
    expect(row(next, "other").available).toBe(20000n);
  });
  it("excludes tracking assets and categorizes budget-boundary outflows", () => {
    const i = input([
      {
        id: "t",
        kind: "TRANSFER",
        accountId: "cash",
        transferAccountId: "tracking",
        date: "2026-01-04",
        amount: -10000n,
        splits: [{ categoryId: "food", amount: -10000n }],
      },
    ]);
    i.accounts.push({
      id: "tracking",
      name: "Investment",
      type: "INVESTMENT",
      participation: "TRACKING",
    });
    i.transactions.push(opening("tracking", 900000n));
    const s = projectBudget(i, "2026-01");
    expect(s.resources).toBe(90000n);
    expect(row(s, "food").available).toBe(30000n);
    expect(s.readyToAssign).toBe(60000n);
  });
  it("conserves cash backing and is order independent for generated spending sequences", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            card: fc.boolean(),
            amount: fc.bigInt({ min: 1n, max: 20000n }),
          }),
          { maxLength: 30 },
        ),
        (entries) => {
          const i = input(
            entries.map((e, n) =>
              expense(
                `p-${n.toString().padStart(3, "0")}`,
                e.card ? "card" : "cash",
                e.amount,
              ),
            ),
          );
          for (const month of ["2026-01", "2026-02"]) {
            const s = projectBudget(i, month);
            expect(s.resources).toBe(
              s.readyToAssign + s.funded + s.futureReservations - s.cashDeficit,
            );
            expect(s.readyToAssign).toBe(
              month === "2026-01"
                ? 60000n
                : 60000n - projectBudget(i, "2026-01").cashDeficit,
            );
            expect(
              projectBudget(
                { ...i, transactions: [...i.transactions].reverse() },
                month,
              ),
            ).toEqual(s);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
