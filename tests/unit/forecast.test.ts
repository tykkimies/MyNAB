import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { forecast, type ForecastInput } from "@/domain/forecast";

const base: ForecastInput = {
  today: "2026-03-20",
  months: 3,
  startPosition: 100000n,
  scheduled: [],
  averageIncome: 0n,
  averageSpending: 0n,
  loanPayments: 0n,
};

describe("cash forecast", () => {
  it("counts scheduled items once, in their month, and only the rest of this month", () => {
    const f = forecast({
      ...base,
      scheduled: [
        { date: "2026-03-10", kind: "EXPENSE", effect: -5000n }, // already past
        { date: "2026-03-25", kind: "EXPENSE", effect: -2000n },
        { date: "2026-04-01", kind: "INCOME", effect: 300000n },
        { date: "2026-04-15", kind: "TRANSFER", effect: 0n },
      ],
      averageIncome: 999999n,
      averageSpending: 150000n,
    });
    expect(f.incomeSource).toBe("scheduled");
    expect(f.rows.map((r) => r.month)).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
    // The partial month has no averages at all.
    expect(f.rows[0]).toMatchObject({
      partial: true,
      income: 0n,
      bills: -2000n,
      spending: 0n,
      ending: 98000n,
    });
    // Averaged income is ignored because income is scheduled.
    expect(f.rows[1]).toMatchObject({ income: 300000n, spending: -150000n });
    expect(f.rows[2].income).toBe(0n);
  });

  it("falls back to average income, applies scenarios and finds the low point", () => {
    const f = forecast({
      ...base,
      months: 1,
      averageIncome: 200000n,
      averageSpending: 100000n,
      loanPayments: 30000n,
      spendingChangePercent: 50,
      extraIncome: 10000n,
    });
    expect(f.incomeSource).toBe("average");
    expect(f.rows[1]).toMatchObject({
      income: 210000n,
      spending: -150000n,
      loans: -30000n,
      net: 30000n,
      ending: 130000n,
    });
  });

  it("reports the first month it would go below zero", () => {
    const f = forecast({ ...base, months: 6, averageSpending: 40000n });
    expect(f.shortfallMonth).toBe("2026-06");
    expect(f.lowest).toEqual({
      month: "2026-09",
      ending: 100000n - 6n * 40000n,
    });
  });

  it("rejects horizons and scenarios it does not support", () => {
    expect(() => forecast({ ...base, months: 2 })).toThrow();
    expect(() => forecast({ ...base, spendingChangePercent: -101 })).toThrow();
    expect(() => forecast({ ...base, extraIncome: -1n })).toThrow();
  });

  it("always ends at the start plus every row's net", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(1, 3, 6, 12),
        fc.bigInt({ min: -1000000n, max: 1000000n }),
        fc.array(
          fc.record({
            day: fc.integer({ min: 1, max: 28 }),
            offset: fc.integer({ min: 0, max: 12 }),
            kind: fc.constantFrom("INCOME", "EXPENSE", "TRANSFER"),
            effect: fc.bigInt({ min: -50000n, max: 50000n }),
          }),
          { maxLength: 30 },
        ),
        (months, start, specs) => {
          const scheduled = specs.map((s) => {
            const d = new Date(Date.UTC(2026, 2 + s.offset, s.day));
            return {
              date: d.toISOString().slice(0, 10),
              kind: s.kind as "INCOME" | "EXPENSE" | "TRANSFER",
              effect: s.effect,
            };
          });
          const f = forecast({
            ...base,
            months,
            startPosition: start,
            scheduled,
          });
          expect(f.rows.at(-1)!.ending).toBe(
            f.rows.reduce((n, r) => n + r.net, start),
          );
        },
      ),
    );
  });
});
