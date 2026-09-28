import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  balancesAt,
  budgetVsActual,
  comparisonPeriod,
  flows,
  monthlyFlows,
  netWorthSeries,
  type ReportInput,
  type ReportTransaction,
} from "@/domain/reports";

const accounts = [
  { id: "cash", name: "Checking", type: "CHECKING", participation: "BUDGET" },
  { id: "card", name: "Card", type: "CREDIT_CARD", participation: "BUDGET" },
  { id: "loan", name: "Car loan", type: "LOAN", participation: "TRACKING" },
  {
    id: "invest",
    name: "Brokerage",
    type: "INVESTMENT",
    participation: "TRACKING",
  },
];
const categories = [
  { id: "food", name: "Groceries" },
  { id: "fun", name: "Fun" },
];
let n = 0;
const tx = (
  over: Partial<ReportTransaction> & { kind: string; amount: bigint },
): ReportTransaction => ({
  id: `t${String(++n).padStart(3, "0")}`,
  date: "2026-03-10",
  accountId: "cash",
  payee: "",
  splits: [],
  ...over,
});

function ledger(): ReportInput {
  n = 0;
  return {
    accounts,
    categories,
    transactions: [
      tx({ kind: "OPENING", amount: 100000n, date: "2026-01-01" }),
      tx({
        kind: "OPENING",
        amount: -900000n,
        accountId: "loan",
        date: "2026-01-01",
      }),
      tx({ kind: "INCOME", amount: 300000n, payee: "Employer" }),
      tx({
        kind: "EXPENSE",
        amount: -12000n,
        payee: "Grocer",
        splits: [
          { categoryId: "food", amount: -9000n },
          { categoryId: "fun", amount: -3000n },
        ],
      }),
      tx({
        kind: "EXPENSE",
        amount: -5000n,
        accountId: "card",
        payee: "grocer ",
        splits: [{ categoryId: "food", amount: -5000n }],
      }),
      // A refund reduces the category's spending rather than counting as income.
      tx({
        kind: "REFUND",
        amount: 2000n,
        payee: "Grocer",
        splits: [{ categoryId: "food", amount: 2000n }],
      }),
      tx({
        kind: "CREDIT",
        amount: 1500n,
        accountId: "card",
        payee: "Cashback",
      }),
      // Card payment: internal, invisible to income and spending.
      tx({ kind: "TRANSFER", amount: -5000n, transferAccountId: "card" }),
      // Loan principal: financing, not spending.
      tx({ kind: "TRANSFER", amount: -40000n, transferAccountId: "loan" }),
      // Loan interest on the tracking account: off-budget spending.
      tx({
        kind: "EXPENSE",
        amount: -3500n,
        accountId: "loan",
        payee: "Interest",
      }),
      tx({ kind: "ADJUSTMENT", amount: -100n }),
      // A valuation on a tracking account is never income.
      tx({ kind: "ADJUSTMENT", amount: 25000n, accountId: "invest" }),
      tx({ kind: "INCOME", amount: 999n, date: "2026-04-01", payee: "Later" }),
    ],
  };
}
const march = { from: "2026-03-01", through: "2026-03-31" };

describe("report semantics", () => {
  it("classifies every kind of movement", () => {
    const f = flows(ledger(), march);
    expect(f.income).toBe(300000n);
    expect(f.credits).toBe(1500n);
    // 120 + 50 - 20 on budget, plus 35 of loan interest.
    expect(f.consumption).toBe(18500n);
    expect(f.offBudgetConsumption).toBe(3500n);
    expect(f.financing).toBe(40000n);
    expect(f.adjustments).toBe(-100n);
    expect(f.byCategory.map((c) => [c.name, c.amount, c.count])).toEqual([
      ["Groceries", 12000n, 3],
      ["Off-budget: Car loan", 3500n, 1],
      ["Fun", 3000n, 1],
    ]);
    // Payee names group case-insensitively.
    expect(f.byPayee[0]).toEqual({ payee: "Grocer", amount: 15000n, count: 3 });
    expect(f.savingsRate).toBeCloseTo((300000 - 18500) / 300000, 4);
  });

  it("reconciles cash flow to the change in budget balances", () => {
    const input = ledger();
    const f = flows(input, march);
    const before = balancesAt(input, "2026-02-28");
    const after = balancesAt(input, "2026-03-31");
    const change = ["cash", "card"].reduce(
      (s, id) => s + after.get(id)! - before.get(id)!,
      0n,
    );
    expect(f.budgetChange).toBe(change);
  });

  it("reports an unavailable savings rate without income", () => {
    n = 0;
    const f = flows(
      {
        accounts,
        categories,
        transactions: [
          tx({
            kind: "EXPENSE",
            amount: -100n,
            splits: [{ categoryId: "fun", amount: -100n }],
          }),
        ],
      },
      march,
    );
    expect(f.savingsRate).toBeNull();
  });

  it("builds monthly series and net worth where internal transfers cancel", () => {
    const input = ledger();
    const months = monthlyFlows(input, "2026-03", "2026-04");
    expect(months.map((m) => m.income)).toEqual([301500n, 999n]);
    const worth = netWorthSeries(input, "2026-02", "2026-03");
    expect(worth[0]).toEqual({
      month: "2026-02",
      assets: 100000n,
      liabilities: 900000n,
      net: -800000n,
    });
    // March: +3,000 income +15 credit -185 spending -1 adjustment +250 valuation.
    expect(worth[1].net - worth[0].net).toBe(
      300000n + 1500n - 18500n - 100n + 25000n,
    );
  });

  it("compares with the previous equal period or the same dates last year", () => {
    expect(comparisonPeriod(march, "previous")).toEqual({
      from: "2026-01-29",
      through: "2026-02-28",
    });
    expect(
      comparisonPeriod({ from: "2024-02-01", through: "2024-02-29" }, "year"),
    ).toEqual({ from: "2023-02-01", through: "2023-02-28" });
  });

  it("always reconciles, and net worth never moves on an internal transfer", () => {
    const kinds = [
      "INCOME",
      "EXPENSE",
      "REFUND",
      "CREDIT",
      "TRANSFER",
      "ADJUSTMENT",
      "OPENING",
    ];
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            kind: fc.constantFrom(...kinds),
            account: fc.constantFrom("cash", "card", "loan", "invest"),
            other: fc.constantFrom("cash", "card", "loan", "invest"),
            cents: fc.bigInt({ min: 1n, max: 100000n }),
            day: fc.integer({ min: 1, max: 28 }),
            month: fc.constantFrom("02", "03", "04"),
          }),
          { maxLength: 40 },
        ),
        (specs) => {
          n = 0;
          const transactions: ReportTransaction[] = [];
          for (const s of specs) {
            const budget = s.account === "cash" || s.account === "card";
            const negative =
              s.kind === "EXPENSE" ||
              (s.kind !== "INCOME" &&
                s.kind !== "REFUND" &&
                s.kind !== "CREDIT" &&
                s.cents % 2n === 0n);
            const amount = negative ? -s.cents : s.cents;
            if (s.kind === "TRANSFER" && s.other === s.account) continue;
            transactions.push(
              tx({
                kind: s.kind,
                amount,
                accountId: s.account,
                date: `2026-${s.month}-${String(s.day).padStart(2, "0")}`,
                transferAccountId: s.kind === "TRANSFER" ? s.other : null,
                splits:
                  budget && (s.kind === "EXPENSE" || s.kind === "REFUND")
                    ? [{ categoryId: "food", amount }]
                    : [],
              }),
            );
          }
          const input = { accounts, categories, transactions };
          const f = flows(input, march);
          const before = balancesAt(input, "2026-02-28");
          const after = balancesAt(input, "2026-03-31");
          const change = ["cash", "card"].reduce(
            (sum, id) => sum + after.get(id)! - before.get(id)!,
            0n,
          );
          expect(f.budgetChange).toBe(change);
          const internal = transactions.filter((t) => t.kind === "TRANSFER");
          const without = netWorthSeries(
            {
              ...input,
              transactions: transactions.filter((t) => t.kind !== "TRANSFER"),
            },
            "2026-04",
            "2026-04",
          )[0].net;
          const withAll = netWorthSeries(input, "2026-04", "2026-04")[0].net;
          if (internal.length) expect(withAll).toBe(without);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("budget vs actual", () => {
  const grouped = (): ReportInput => ({
    ...ledger(),
    groups: [
      { id: "wants", name: "Wants" },
      { id: "needs", name: "Needs" },
    ],
    categories: [
      { id: "food", name: "Groceries", groupId: "needs", sortOrder: 1 },
      { id: "fun", name: "Fun", groupId: "wants", sortOrder: 2 },
      { id: "rent", name: "Rent", groupId: "needs", sortOrder: 0 },
      { id: "cardpay", name: "Card", paymentAccountId: "card" },
    ],
  });
  const assignments = [
    { categoryId: "food", month: "2026-03", amount: 15000n },
    { categoryId: "fun", month: "2026-03", amount: 2000n },
    // Outside the range, and a card payment: neither is counted.
    { categoryId: "food", month: "2026-05", amount: 99999n },
    { categoryId: "cardpay", month: "2026-03", amount: 5000n },
  ];

  it("sets each category's assignments against its net spending", () => {
    const r = budgetVsActual(grouped(), assignments, "2026-03", "2026-04");
    // Budget order: groups as listed, categories by sort order; Rent has no
    // money in or out, so it is left out.
    expect(r.groups.map((g) => g.name)).toEqual(["Wants", "Needs"]);
    const needs = r.groups[1];
    expect(needs.categories.map((c) => c.name)).toEqual(["Groceries"]);
    // Spent 90 + 50 − a 20 refund; off-budget loan interest is not here.
    expect(needs.categories[0]).toMatchObject({
      assigned: 15000n,
      spent: 12000n,
      difference: 3000n,
    });
    expect(r.groups[0]).toMatchObject({
      assigned: 2000n,
      spent: 3000n,
      difference: -1000n,
    });
    expect(r.total).toMatchObject({
      assigned: 17000n,
      spent: 15000n,
      difference: 2000n,
    });
  });

  it("narrows by category, and by account for spending only", () => {
    const byCategory = budgetVsActual(grouped(), assignments, "2026-03", "2026-03", {
      categoryIds: new Set(["fun"]),
    });
    expect(byCategory.total).toMatchObject({ assigned: 2000n, spent: 3000n });
    const byAccount = budgetVsActual(grouped(), assignments, "2026-03", "2026-03", {
      accountIds: new Set(["card"]),
    });
    // Only the card's 50 of groceries is spending here; assignments stay.
    expect(byAccount.total).toMatchObject({ assigned: 17000n, spent: 5000n });
  });
});
