import { describe, expect, it } from "vitest";
import {
  billsByPeriod,
  dueDates,
  dueLabel,
  mergeBills,
  ordinal,
  payPeriods,
  paydays,
  type Bill,
} from "@/domain/paychecks";

const paycheck = {
  id: "pay",
  startDate: "2026-09-15",
  timezone: "America/New_York",
  cadence: "TWICE_MONTHLY" as const,
};

describe("paycheck periods", () => {
  it("runs from each payday to the day before the next, the 30th capped in February", () => {
    const days = paydays(paycheck, "2027-01-01", "2027-03-31");
    expect(days).toEqual([
      "2027-01-15", "2027-01-30", "2027-02-15", "2027-02-28",
      "2027-03-15", "2027-03-30",
    ]);
    expect(payPeriods(days, "2027-02-01", "2027-02-28")).toEqual([
      { start: "2027-01-30", end: "2027-02-14" },
      { start: "2027-02-15", end: "2027-02-27" },
      { start: "2027-02-28", end: "2027-03-14" },
    ]);
  });

  it("carries the pattern back before the schedule started, for past spending", () => {
    expect(paydays(paycheck, "2026-07-01", "2026-08-31")).toEqual([
      "2026-07-15", "2026-07-30", "2026-08-15", "2026-08-30",
    ]);
    const weekly = { ...paycheck, cadence: "WEEKLY" as const, startDate: "2026-09-18", interval: 2 };
    expect(paydays(weekly, "2026-08-01", "2026-09-30")).toEqual([
      "2026-08-07", "2026-08-21", "2026-09-04", "2026-09-18",
    ]);
  });
});

describe("due dates", () => {
  it("repeats a monthly bill on its day, clamped to short months", () => {
    expect(
      dueDates({ type: "MONTHLY", amount: 6999n, dueDay: 31 }, undefined, "2026-10-01", "2026-11-30"),
    ).toEqual([
      { date: "2026-10-31", amount: 6999n },
      { date: "2026-11-30", amount: 6999n },
    ]);
  });

  it("places a periodic bill only in the months it falls due", () => {
    const prime = { type: "PERIODIC" as const, amount: 14734n, dueMonth: "2026-04", cadenceMonths: 12, dueDay: 28 };
    expect(dueDates(prime, undefined, "2026-10-01", "2026-12-31")).toEqual([]);
    expect(dueDates(prime, undefined, "2027-01-01", "2027-06-30")).toEqual([
      { date: "2027-04-28", amount: 14734n },
    ]);
    const twice = { type: "PERIODIC" as const, amount: 69000n, dueMonth: "2026-01", cadenceMonths: 6 };
    expect(dueDates(twice, undefined, "2026-01-01", "2026-12-31").map((d) => d.date)).toEqual([
      "2026-01-01", "2026-07-01",
    ]);
  });

  it("uses a card's terms when its target has no due day, and never treats saving as a bill", () => {
    expect(
      dueDates({ type: "DEBT_PAYOFF", amount: 31185n }, { dueDay: 13, minimum: 4000n }, "2026-10-01", "2026-10-31"),
    ).toEqual([{ date: "2026-10-13", amount: 31185n }]);
    expect(dueDates(undefined, { dueDay: 6, minimum: 4500n }, "2026-10-01", "2026-10-31")).toEqual([
      { date: "2026-10-06", amount: 4500n },
    ]);
    expect(dueDates({ type: "BALANCE_BY_DATE", amount: 100000n, dueMonth: "2026-10" }, undefined, "2026-10-01", "2026-10-31")).toEqual([]);
    expect(dueDates({ type: "SPENDING_LIMIT", amount: 10000n, dueDay: 5 }, undefined, "2026-10-01", "2026-10-31")).toEqual([]);
    expect(dueDates({ type: "MONTHLY", amount: 20000n }, undefined, "2026-10-01", "2026-10-31")).toEqual([]);
  });
});

describe("bills by period", () => {
  const bill = (date: string, amount: bigint, categoryId: string | null, source: Bill["source"] = "target"): Bill => ({
    date, amount, categoryId, name: categoryId ?? "card", source,
  });

  it("counts a scheduled category from its schedule, never again from its target", () => {
    const merged = mergeBills(
      [bill("2026-10-10", 56200n, "car", "schedule")],
      [bill("2026-10-10", 56122n, "car"), bill("2026-10-14", 6999n, "fios")],
    );
    expect(merged.map((b) => [b.categoryId, b.amount])).toEqual([
      ["car", 56200n],
      ["fios", 6999n],
    ]);
  });

  it("totals what each paycheck covers", () => {
    const periods = [
      { start: "2026-09-30", end: "2026-10-14" },
      { start: "2026-10-15", end: "2026-10-29" },
    ];
    const result = billsByPeriod(periods, [
      bill("2026-10-14", 6999n, "fios"),
      bill("2026-10-01", 187200n, "rent"),
      bill("2026-10-16", 14761n, "pet"),
      bill("2026-10-30", 1n, "later"),
    ]);
    expect(result.map((p) => [p.start, p.due, p.bills.map((b) => b.categoryId)])).toEqual([
      ["2026-09-30", 194199n, ["rent", "fios"]],
      ["2026-10-15", 14761n, ["pet"]],
    ]);
  });
});

describe("Budget's Due column", () => {
  it("knows monthly, periodic, yearly and save-by-date targets", () => {
    expect(dueLabel({ type: "MONTHLY", amount: 1n, dueDay: 14 }, undefined, "2026-10")).toBe("14th");
    expect(dueLabel({ type: "DEBT_PAYOFF", amount: 1n }, 13, "2026-10")).toBe("13th");
    expect(dueLabel(undefined, 22, "2026-10")).toBe("22nd");
    expect(dueLabel({ type: "PERIODIC", amount: 1n, dueMonth: "2026-04", cadenceMonths: 12, dueDay: 28 }, undefined, "2026-10")).toBe("Apr 2027");
    expect(dueLabel({ type: "PERIODIC", amount: 1n, dueMonth: "2026-04", cadenceMonths: 12, dueDay: 28 }, undefined, "2027-01")).toBe("Apr 28");
    expect(dueLabel({ type: "BALANCE_BY_DATE", amount: 1n, dueMonth: "2027-04" }, undefined, "2026-10")).toBe("by Apr 2027");
    expect(dueLabel({ type: "MONTHLY", amount: 1n }, undefined, "2026-10")).toBe("");
    expect(dueLabel({ type: "SPENDING_LIMIT", amount: 1n }, 5, "2026-10")).toBe("");
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "31st",
    ]);
  });
});
