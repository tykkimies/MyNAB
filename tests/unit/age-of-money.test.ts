import { describe, expect, it } from "vitest";
import { ageOfMoney } from "@/domain/age-of-money";
import type { BudgetInput, BudgetTransaction } from "@/domain/budget";

const input = (): BudgetInput => ({
  accounts: [
    { id: "cash", name: "Checking", type: "CHECKING", participation: "BUDGET" },
    { id: "savings", name: "Savings", type: "SAVINGS", participation: "BUDGET" },
    { id: "card", name: "Card", type: "CREDIT_CARD", participation: "BUDGET" },
    { id: "tracking", name: "Investment", type: "INVESTMENT", participation: "TRACKING" },
  ],
  categories: [],
  assignments: [],
  transactions: [],
});
const tx = (
  id: string,
  date: string,
  accountId: string,
  amount: bigint,
  kind = "EXPENSE",
  transferAccountId?: string,
): BudgetTransaction => ({
  id,
  date,
  kind,
  accountId,
  transferAccountId,
  amount,
  splits: [],
});

describe("Age of Money", () => {
  it("waits for ten cash outflows and counts opening money as a FIFO lot", () => {
    const data = input();
    data.transactions.push(tx("opening", "2026-01-01", "cash", 100000n, "OPENING"));
    for (let day = 1; day <= 9; day++)
      data.transactions.push(
        tx(`spend-${day}`, `2026-01-${String(day + 1).padStart(2, "0")}`, "cash", -100n),
      );
    expect(ageOfMoney(data, "2026-01-10").days).toBeNull();
    data.transactions.push(tx("spend-10", "2026-01-11", "cash", -100n));
    const result = ageOfMoney(data, "2026-01-11");
    expect(result.sampleCount).toBe(10);
    expect(result.days).toBe(6); // mean of days 1..10, rounded
  });

  it("uses FIFO across all budget cash accounts, without double-counting transfers", () => {
    const data = input();
    data.transactions.push(
      tx("in1", "2026-01-01", "cash", 500n, "INCOME"),
      tx("move", "2026-01-02", "cash", -500n, "TRANSFER", "savings"),
      tx("in2", "2026-01-06", "savings", 1000n, "INCOME"),
    );
    for (let day = 11; day <= 20; day++)
      data.transactions.push(
        tx(`expense-${day}`, `2026-01-${day}`, "savings", -100n),
      );
    const result = ageOfMoney(data, "2026-01-20");
    expect(result.sampleCount).toBe(10);
    expect(result.samples[0].centDays).toBe(100n * 10n);
    expect(result.samples.at(-1)?.centDays).toBe(100n * 14n);
    expect(result.days).toBe(12);
  });

  it("counts card payments but not card purchases or tracking transfers", () => {
    const data = input();
    data.transactions.push(tx("income", "2026-01-01", "cash", 100000n, "INCOME"));
    data.transactions.push(
      tx("card-buy", "2026-01-02", "card", -1000n),
      tx("move-out", "2026-01-03", "cash", -1000n, "TRANSFER", "tracking"),
    );
    for (let day = 4; day <= 12; day++)
      data.transactions.push(tx(`cash-${day}`, `2026-01-${String(day).padStart(2, "0")}`, "cash", -100n));
    expect(ageOfMoney(data, "2026-01-12").sampleCount).toBe(9);
    data.transactions.push(
      tx("payment", "2026-01-13", "cash", -1000n, "TRANSFER", "card"),
    );
    const result = ageOfMoney(data, "2026-01-13");
    expect(result.sampleCount).toBe(10);
    expect(result.samples.at(-1)?.transactionId).toBe("payment");
  });

  it("handles a split across old and new inflow lots with exact large cents", () => {
    const data = input();
    const huge = 9007199254740993n;
    data.transactions.push(
      tx("old", "2026-01-01", "cash", huge, "INCOME"),
      tx("new", "2026-01-09", "cash", huge, "INCOME"),
      tx("big", "2026-01-11", "cash", -(huge + 1n)),
    );
    const result = ageOfMoney(data, "2026-01-11");
    expect(result.samples[0].centDays).toBe(huge * 10n + 2n);
    expect(result.days).toBeNull();
  });

  it("uses transaction date and stable ID order for same-day activity", () => {
    const data = input();
    data.transactions.push(
      tx("b-income", "2026-01-01", "cash", 1000n, "INCOME"),
      tx("a-expense", "2026-01-01", "cash", -100n),
    );
    const result = ageOfMoney(data, "2026-01-01");
    expect(result.samples[0].centDays).toBe(0n);
    expect(result.sampleCount).toBe(1);
  });
});
