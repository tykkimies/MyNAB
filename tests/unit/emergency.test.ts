import { describe, expect, it } from "vitest";
import {
  coverGoal,
  monthlyCostOfLiving,
  monthsCovered,
  shouldAdjust,
} from "@/domain/emergency";
import type { ReportInput, ReportTransaction } from "@/domain/reports";

const accounts = [
  { id: "pnc", name: "PNC", type: "CHECKING", participation: "BUDGET" },
  { id: "car", name: "Car loan", type: "LOAN", participation: "TRACKING" },
  { id: "ira", name: "IRA", type: "INVESTMENT", participation: "TRACKING" },
];
const categories = [
  { id: "rent", name: "Rent" },
  { id: "insurance", name: "Car insurance" },
  { id: "carpay", name: "Car payment" },
  { id: "fund", name: "Emergency Fund" },
  { id: "retire", name: "Retirement" },
  { id: "cardpay", name: "Card payment", paymentAccountId: "card" },
  { id: "fun", name: "Fun" },
];
let n = 0;
const spend = (date: string, categoryId: string, amount: bigint, over: Partial<ReportTransaction> = {}) => ({
  id: `t${n++}`,
  date,
  kind: "EXPENSE",
  accountId: "pnc",
  amount: -amount,
  payee: "",
  splits: [{ categoryId, amount: -amount }],
  ...over,
});
const months = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(2025, from - 1 + i, 5));
    return d.toISOString().slice(0, 10);
  });

describe("ordinary monthly spending", () => {
  it("averages each category over twelve months, spreading a yearly bill", () => {
    const input: ReportInput = {
      accounts,
      categories,
      transactions: [
        // Oct 2025 – Sep 2026: rent every month, insurance once a year.
        ...months(10, 12).map((d) => spend(d, "rent", 150000n)),
        spend("2026-03-10", "insurance", 120000n),
        // Outside the window: before it, and the month not yet complete.
        spend("2025-09-05", "rent", 999900n),
        spend("2026-10-02", "rent", 999900n),
      ],
    };
    const r = monthlyCostOfLiving(input, "2026-09", []);
    expect(r.monthsOfHistory).toBe(12);
    expect(r.monthly).toBe(150000n + 10000n);
    expect(r.categories.map((c) => c.categoryId)).toEqual(["rent", "insurance"]);
  });

  it("counts loan payments, not savings, investing, card payments or unplanned buys", () => {
    const transactions = [
      ...months(10, 12).flatMap((d) => [
        spend(d, "rent", 100000n),
        // A categorised payment to a car loan is a living cost.
        spend(d, "carpay", 30000n, {
          kind: "TRANSFER",
          transferAccountId: "car",
        }),
        // Money put toward the fund or retirement is saving.
        spend(d, "fund", 50000n, { kind: "TRANSFER", transferAccountId: "ira" }),
        spend(d, "retire", 20000n, { kind: "TRANSFER", transferAccountId: "ira" }),
        spend(d, "cardpay", 40000n),
      ]),
      spend("2026-04-02", "fun", 240000n, { id: "impulse" }),
    ];
    const r = monthlyCostOfLiving(
      { accounts, categories, transactions },
      "2026-09",
      [{ categoryId: "fund", type: "BALANCE" }],
      new Map([["impulse", "UNPLANNED"]]),
    );
    expect(r.monthly).toBe(130000n);
  });

  it("averages a short history over the months it covers", () => {
    const input: ReportInput = {
      accounts,
      categories,
      transactions: months(7, 3).map((d) => spend(d, "rent", 90000n)),
    };
    const r = monthlyCostOfLiving(input, "2025-09", []);
    expect(r.monthsOfHistory).toBe(3);
    expect(r.monthly).toBe(90000n);
  });
});

describe("the goal and when it changes", () => {
  it("rounds months of spending up to the next $100", () => {
    expect(coverGoal(160000n, 6)).toBe(960000n);
    expect(coverGoal(160001n, 3)).toBe(490000n);
    expect(coverGoal(0n, 6)).toBe(0n);
  });
  it("adjusts only when the estimate moves more than 5%", () => {
    expect(shouldAdjust(null, 900000n)).toBe(true);
    expect(shouldAdjust(1000000n, 1050000n)).toBe(false);
    expect(shouldAdjust(1000000n, 1050100n)).toBe(true);
    expect(shouldAdjust(1000000n, 949900n)).toBe(true);
    expect(shouldAdjust(1000000n, 950000n)).toBe(false);
  });
  it("says how many months the fund holds", () => {
    expect(monthsCovered(400000n, 160000n)).toBe(2.5);
    expect(monthsCovered(0n, 160000n)).toBe(0);
  });
});
