import { describe, expect, it } from "vitest";
import {
  flows,
  incomeExpense,
  netWorthSeries,
  type ReportInput,
  type ReportTransaction,
} from "@/domain/reports";

let n = 0;
const tx = (
  over: Partial<ReportTransaction> & { kind: string; amount: bigint },
): ReportTransaction => ({
  id: `t${++n}`,
  date: "2026-03-10",
  accountId: "cash",
  payee: "",
  splits: [],
  ...over,
});
const input: ReportInput = {
  accounts: [
    { id: "cash", name: "Checking", type: "CHECKING", participation: "BUDGET" },
    { id: "card", name: "Card", type: "CREDIT_CARD", participation: "BUDGET" },
    { id: "hsa", name: "HSA", type: "OTHER_ASSET", participation: "TRACKING" },
  ],
  groups: [
    { id: "bills", name: "Bills" },
    { id: "fun-group", name: "Wants" },
  ],
  categories: [
    { id: "rent", name: "Rent", groupId: "bills" },
    { id: "power", name: "Power", groupId: "bills" },
    { id: "fun", name: "Fun", groupId: "fun-group" },
  ],
  transactions: [
    tx({ kind: "OPENING", amount: 500000n, date: "2026-01-01" }),
    tx({ kind: "INCOME", amount: 300000n, payee: "Employer", date: "2026-02-01" }),
    tx({ kind: "INCOME", amount: 300000n, payee: "employer ", date: "2026-03-01" }),
    tx({ kind: "INCOME", amount: 1001n, payee: "Bank", date: "2026-03-02" }),
    tx({ kind: "EXPENSE", amount: -120000n, date: "2026-02-03", splits: [{ categoryId: "rent", amount: -120000n }] }),
    tx({ kind: "EXPENSE", amount: -120000n, date: "2026-03-03", splits: [{ categoryId: "rent", amount: -120000n }] }),
    tx({ kind: "EXPENSE", amount: -5000n, date: "2026-03-04", accountId: "card", splits: [{ categoryId: "power", amount: -3000n }, { categoryId: "fun", amount: -2000n }] }),
    tx({ kind: "REFUND", amount: 500n, date: "2026-03-05", accountId: "card", splits: [{ categoryId: "fun", amount: 500n }] }),
    tx({ kind: "EXPENSE", amount: -7000n, date: "2026-03-06", accountId: "hsa" }),
  ],
};
const period = { from: "2026-02-01", through: "2026-03-31" };

describe("Reflect-style reports", () => {
  it("breaks spending down by group, with off-budget spending apart", () => {
    const f = flows(input, period);
    expect(f.byGroup.map((g) => [g.name, g.amount])).toEqual([
      ["Bills", 243000n],
      ["Off-budget spending", 7000n],
      ["Wants", 1500n],
    ]);
  });

  it("filters by account on every line and by category on spending only", () => {
    const card = flows(input, period, { accountIds: new Set(["card"]) });
    expect(card.consumption).toBe(4500n);
    expect(card.income).toBe(0n);
    const bills = flows(input, period, { categoryIds: new Set(["rent", "power"]) });
    expect(bills.consumption).toBe(243000n);
    expect(bills.income).toBe(601001n);
    expect(bills.byCategory.map((c) => c.key)).toEqual(["rent", "power"]);
  });

  it("builds an income v expense matrix with exact totals and averages", () => {
    const m = incomeExpense(input, "2026-02", "2026-03");
    expect(m.months).toEqual(["2026-02", "2026-03"]);
    // Payee names merge case- and space-insensitively, as elsewhere.
    expect(m.income.map((r) => [r.name, r.amounts, r.total, r.average])).toEqual([
      ["Employer", [300000n, 300000n], 600000n, 300000n],
      ["Bank", [0n, 1001n], 1001n, 501n],
    ]);
    const bills = m.expenses.find((g) => g.key === "bills")!;
    expect(bills.amounts).toEqual([120000n, 123000n]);
    expect(bills.categories.map((c) => c.name)).toEqual(["Rent", "Power"]);
    expect(m.expenses.find((g) => g.key === "fun-group")!.total).toBe(1500n);
    expect(m.expenseTotal.amounts).toEqual([120000n, 131500n]);
    expect(m.net.amounts).toEqual([180000n, 169501n]);
    expect(m.net.total).toBe(m.incomeTotal.total - m.expenseTotal.total);
  });

  it("narrows net worth to chosen accounts", () => {
    const all = netWorthSeries(input, "2026-03", "2026-03")[0];
    const hsa = netWorthSeries(input, "2026-03", "2026-03", new Set(["hsa"]))[0];
    expect(hsa).toMatchObject({ assets: 0n, liabilities: 7000n, net: -7000n });
    expect(all.net).toBe(500000n + 601001n - 240000n - 4500n - 7000n);
  });
});
