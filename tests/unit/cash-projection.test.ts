import { describe, expect, it } from "vitest";
import { cashProjection } from "@/domain/cash-projection";

const base = {
  today: "2026-10-05",
  through: "2026-11-30",
  start: 845032n,
  events: [],
  monthlySpending: 0n,
  cushion: 50000n,
};

describe("cash projection", () => {
  it("walks day by day and finds a dip a month-end figure would miss", () => {
    const p = cashProjection({
      ...base,
      start: 100000n,
      events: [
        { date: "2026-10-30", name: "Paycheck", amount: 306955n },
        { date: "2026-11-01", name: "Rent", amount: -187200n },
        { date: "2026-11-13", name: "Barclays", amount: -45229n },
        { date: "2026-11-15", name: "Paycheck", amount: 306955n },
      ],
      through: "2026-11-30",
    });
    expect(p.days[0]).toMatchObject({ date: "2026-10-05", balance: 100000n });
    expect(p.lowest).toEqual({ date: "2026-10-05", balance: 100000n });
    const nov13 = p.days.find((d) => d.date === "2026-11-13")!;
    expect(nov13.balance).toBe(100000n + 306955n - 187200n - 45229n);
    expect(nov13.events.map((e) => e.name)).toEqual(["Barclays"]);
    expect(p.days.at(-1)!.balance).toBe(100000n + 2n * 306955n - 187200n - 45229n);
  });

  it("spreads everyday spending so each whole month sums exactly", () => {
    const p = cashProjection({ ...base, today: "2026-10-31", through: "2026-12-31", monthlySpending: 210001n });
    const month = (m: string) =>
      p.days.filter((d) => d.date.startsWith(m)).reduce((n, d) => n + d.spending, 0n);
    expect(month("2026-11")).toBe(210001n);
    expect(month("2026-12")).toBe(210001n);
    expect(p.spending).toBe(420002n);
    expect(p.days.at(-1)!.balance).toBe(845032n - 420002n);
  });

  it("reports the first day below the cushion and below zero", () => {
    const p = cashProjection({
      ...base,
      start: 60000n,
      events: [
        { date: "2026-10-10", name: "Car", amount: -20000n },
        { date: "2026-10-12", name: "Card", amount: -50000n },
        { date: "2026-10-15", name: "Paycheck", amount: 306955n },
      ],
      through: "2026-10-20",
    });
    expect(p.firstBelowCushion).toBe("2026-10-10");
    expect(p.firstNegative).toBe("2026-10-12");
    expect(p.lowest).toEqual({ date: "2026-10-12", balance: -10000n });
  });

  it("leaves out what is already in today's balance or past the end", () => {
    const p = cashProjection({
      ...base,
      through: "2026-10-10",
      events: [
        { date: "2026-10-05", name: "Already in", amount: -100n },
        { date: "2026-10-11", name: "Too late", amount: -100n },
      ],
    });
    expect(p.days.flatMap((d) => d.events)).toEqual([]);
    expect(p.days.at(-1)!.balance).toBe(845032n);
  });
});
