import { describe, expect, it } from "vitest";
import {
  coveredOverspending,
  misfits,
  subscriptions,
  unplannedSummary,
  type Review,
} from "@/domain/spending-review";
import type { ReportLine } from "@/domain/reports";
import type { MoneyMove } from "@/domain/money-moves";

const line = (
  transactionId: string,
  date: string,
  key: string,
  amount: bigint,
  payee = "Store",
): ReportLine => ({
  transactionId,
  date,
  payee,
  accountId: "pnc",
  flow: "consumption",
  key,
  amount,
});

describe("unplanned purchases", () => {
  it("totals what was marked unplanned by category and month, splits once", () => {
    const lines = [
      line("a", "2026-09-03", "fun", 4000n, "Gadget"),
      line("b", "2026-10-02", "groceries", 2500n, "Snacks"),
      line("b", "2026-10-02", "fun", 500n, "Snacks"),
      line("c", "2026-10-04", "groceries", 9000n),
      { ...line("i", "2026-10-05", "income", 100000n), flow: "income" as const },
    ];
    const reviews = new Map<string, Review>([
      ["a", "UNPLANNED"],
      ["b", "UNPLANNED"],
      ["c", "PLANNED"],
      ["i", "UNPLANNED"],
    ]);
    const s = unplannedSummary(lines, reviews);
    expect(s.total).toBe(7000n);
    expect(s.count).toBe(2);
    expect(s.byCategory).toEqual([
      { key: "fun", amount: 4500n, count: 2 },
      { key: "groceries", amount: 2500n, count: 1 },
    ]);
    expect(s.byMonth).toEqual([
      { month: "2026-09", amount: 4000n },
      { month: "2026-10", amount: 3000n },
    ]);
    expect(s.transactions.map((t) => [t.transactionId, t.amount, t.keys])).toEqual([
      ["b", 3000n, ["groceries", "fun"]],
      ["a", 4000n, ["fun"]],
    ]);
  });
});

describe("purchases that do not fit their category", () => {
  const groceries = [
    line("g1", "2026-07-02", "groceries", 6000n, "Kroger"),
    line("g2", "2026-08-02", "groceries", 6500n, "Kroger"),
    line("g3", "2026-09-02", "groceries", 7000n, "Aldi"),
  ];
  it("flags a new payee at well over the category's usual purchase", () => {
    const tv = line("tv", "2026-10-03", "groceries", 30000n, "Best Buy");
    expect(
      misfits([...groceries, tv], "2026-10-01", "2026-10-31", new Map()).map((m) => [
        m.transactionId,
        m.usual,
      ]),
    ).toEqual([["tv", 6500n]]);
  });
  it("leaves usual payees, small amounts, reviewed and split purchases alone", () => {
    const lines = [
      ...groceries,
      line("k", "2026-10-03", "groceries", 30000n, "Kroger"),
      line("small", "2026-10-04", "groceries", 1500n, "Target"),
      line("ok", "2026-10-05", "groceries", 30000n, "Costco"),
      line("split", "2026-10-06", "groceries", 30000n, "Walmart"),
      line("split", "2026-10-06", "fun", 1000n, "Walmart"),
    ];
    expect(
      misfits(lines, "2026-10-01", "2026-10-31", new Map([["ok", "PLANNED"]])),
    ).toEqual([]);
  });
  it("needs three earlier purchases in the category to know its usual", () => {
    const lines = [groceries[0], groceries[1], line("x", "2026-10-03", "groceries", 30000n, "New")];
    expect(misfits(lines, "2026-10-01", "2026-10-31", new Map())).toEqual([]);
  });
});

const move = (over: Partial<MoneyMove>): MoneyMove => ({
  id: "m",
  month: "2026-10",
  kind: "MOVE",
  mode: null,
  actorId: null,
  createdAt: new Date("2026-10-20T00:00:00Z"),
  from: [],
  to: [],
  readyToAssign: 0n,
  undoOf: null,
  undone: false,
  ...over,
});

describe("spending covered by raiding other categories", () => {
  it("reports spending past the plan that money moved in paid for", () => {
    const rows = [
      // Clothing: $50 planned, $180 spent, $130 moved in from groceries.
      { categoryId: "clothing", month: "2026-10", start: 0n, assigned: 18000n, activity: -18000n },
    ];
    const moves = [
      move({ from: [{ categoryId: "groceries", amount: 10000n }], to: [{ categoryId: "clothing", amount: 10000n }] }),
      move({ id: "m2", from: [{ categoryId: "fun", amount: 3000n }], to: [{ categoryId: "clothing", amount: 3000n }] }),
    ];
    expect(coveredOverspending(rows, moves)).toEqual([
      {
        categoryId: "clothing",
        month: "2026-10",
        planned: 5000n,
        spent: 18000n,
        covered: 13000n,
        from: [
          { categoryId: "groceries", amount: 10000n },
          { categoryId: "fun", amount: 3000n },
        ],
      },
    ]);
  });
  it("ignores undone moves, carried-over money, and moves nothing was spent past", () => {
    const rows = [
      // $100 carried in covers the spending; the move in was not needed.
      { categoryId: "gifts", month: "2026-10", start: 10000n, assigned: 2000n, activity: -9000n },
      { categoryId: "fun", month: "2026-10", start: 0n, assigned: 4000n, activity: -6000n },
    ];
    const moves = [
      move({ from: [{ categoryId: "groceries", amount: 2000n }], to: [{ categoryId: "gifts", amount: 2000n }] }),
      move({ id: "u", undone: true, from: [{ categoryId: "groceries", amount: 4000n }], to: [{ categoryId: "fun", amount: 4000n }] }),
    ];
    expect(coveredOverspending(rows, moves)).toEqual([]);
  });
});

describe("subscriptions and repeating charges", () => {
  const charge = (id: string, date: string, amount: bigint, payee = "Streamer") => ({
    id,
    accountId: "card",
    payee,
    date,
    amount,
    kind: "EXPENSE" as const,
  });
  it("lists active repeats by yearly cost with a price change", () => {
    const records = [
      charge("s1", "2026-06-10", -1299n),
      charge("s2", "2026-07-10", -1299n),
      charge("s3", "2026-08-10", -1499n),
      charge("s4", "2026-09-10", -1499n),
      charge("g1", "2026-07-01", -4000n, "Gym"),
      charge("g2", "2026-08-01", -4000n, "Gym"),
      charge("g3", "2026-09-01", -4000n, "Gym"),
      charge("g4", "2026-10-01", -4000n, "Gym"),
    ];
    const list = subscriptions(records, "2026-10-12", [
      { accountId: "card", amount: -4000n, payee: "Gym membership" },
    ]);
    expect(
      list.map((s) => [s.payee, s.amount, s.yearly, s.firstAmount, s.scheduled]),
    ).toEqual([
      ["Gym", 4000n, 48000n, 4000n, true],
      ["Streamer", 1499n, 17988n, 1299n, false],
    ]);
  });
  it("drops a repeat that stopped", () => {
    const records = [
      charge("a", "2026-03-10", -999n),
      charge("b", "2026-04-10", -999n),
      charge("c", "2026-05-10", -999n),
    ];
    expect(subscriptions(records, "2026-10-12")).toEqual([]);
  });
});
