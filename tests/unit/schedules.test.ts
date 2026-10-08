import { describe, expect, it } from "vitest";
import {
  editStart,
  matchWindow,
  nextDueDate,
  occurrences,
  type Recurrence,
} from "@/domain/schedules";
const monthly: Recurrence = {
  id: "rent",
  startDate: "2026-01-31",
  timezone: "America/New_York",
  cadence: "MONTHLY",
};
describe("planned calendar occurrences", () => {
  it("clamps month ends without drifting the original anchor", () => {
    expect(
      occurrences(monthly, "2026-01-01", "2026-04-30").map((o) => o.date),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("repeats twice a month on the day and fifteen days later, like YNAB", () => {
    const dates = occurrences(
      { ...monthly, startDate: "2026-01-16", cadence: "TWICE_MONTHLY" },
      "2026-01-01",
      "2026-03-31",
    ).map((o) => o.date);
    // The second date is capped at the month's end in February.
    expect(dates).toEqual([
      "2026-01-16",
      "2026-01-31",
      "2026-02-16",
      "2026-02-28",
      "2026-03-16",
      "2026-03-31",
    ]);
    expect(
      occurrences(
        { ...monthly, startDate: "2026-01-05", cadence: "TWICE_MONTHLY", interval: 2 },
        "2026-01-01",
        "2026-05-31",
      ).map((o) => o.date),
    ).toEqual(["2026-01-05", "2026-01-20", "2026-03-05", "2026-03-20", "2026-05-05", "2026-05-20"]);
  });
  it("restores February 29 in leap years", () => {
    const dates = occurrences(
      { ...monthly, startDate: "2024-02-29", cadence: "YEARLY" },
      "2024-01-01",
      "2028-12-31",
    );
    expect(dates.map((o) => o.date)).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });
  it("keeps fortnightly calendar dates across daylight saving", () => {
    expect(
      occurrences(
        { ...monthly, startDate: "2026-03-01", cadence: "WEEKLY", interval: 2 },
        "2026-03-01",
        "2026-03-29",
      ).map((o) => o.date),
    ).toEqual(["2026-03-01", "2026-03-15", "2026-03-29"]);
  });
  it("uses inclusive end dates and stable keys across overlapping windows", () => {
    const schedule = { ...monthly, endDate: "2026-03-31" };
    const first = occurrences(schedule, "2026-01-01", "2026-12-31");
    expect(first).toHaveLength(3);
    expect(occurrences(schedule, "2026-03-01", "2026-12-31")).toEqual([
      first[2],
    ]);
  });
  it("handles a one-off and a window before the start", () => {
    expect(
      occurrences({ ...monthly, cadence: "ONCE" }, "2026-02-01", "2026-12-31"),
    ).toEqual([]);
    expect(occurrences(monthly, "2025-01-01", "2025-12-31")).toEqual([]);
  });
  it("rejects malformed, reversed, unbounded and invalid timezone requests", () => {
    expect(() =>
      occurrences({ ...monthly, interval: 0 }, "2026-01-01", "2026-12-31"),
    ).toThrow();
    expect(() =>
      occurrences(
        { ...monthly, timezone: "Invalid/Zone" },
        "2026-01-01",
        "2026-12-31",
      ),
    ).toThrow();
    expect(() => occurrences(monthly, "2026-02-30", "2026-12-31")).toThrow();
    expect(() => occurrences(monthly, "2026-12-31", "2026-01-01")).toThrow();
    expect(() =>
      occurrences({ ...monthly, cadence: "DAILY" }, "2026-01-01", "2030-01-01"),
    ).toThrow();
  });
});
describe("next due date for a card payment", () => {
  it("anchors on the due day, today included, skipping months too short for it", () => {
    expect(nextDueDate("2026-03-10", 15)).toBe("2026-03-15");
    expect(nextDueDate("2026-03-15", 15)).toBe("2026-03-15");
    expect(nextDueDate("2026-03-16", 15)).toBe("2026-04-15");
    expect(nextDueDate("2026-12-20", 5)).toBe("2027-01-05");
    // February has no 30th; anchoring on the 28th would move every month.
    expect(nextDueDate("2026-02-01", 30)).toBe("2026-03-30");
    expect(nextDueDate("2026-04-02", 31)).toBe("2026-05-31");
    expect(() => nextDueDate("2026-04-02", 0)).toThrow();
  });
});

describe("matching an existing payment to an occurrence", () => {
  const base = { id: "s", timezone: "UTC", startDate: "2026-01-05" } as const;
  it("allows YNAB's ten days for a monthly bill", () => {
    expect(matchWindow({ ...base, cadence: "MONTHLY" }, "2026-10-05")).toBe(10);
  });
  it("stays nearer this occurrence than the next for short cadences", () => {
    expect(matchWindow({ ...base, cadence: "WEEKLY" }, "2026-01-12")).toBe(3);
    expect(
      matchWindow({ ...base, cadence: "TWICE_MONTHLY" }, "2026-01-20"),
    ).toBe(7);
    expect(matchWindow({ ...base, cadence: "DAILY" }, "2026-01-08")).toBe(0);
  });
  it("uses the full window for a one-time schedule", () => {
    expect(matchWindow({ ...base, cadence: "ONCE" }, "2026-01-05")).toBe(10);
  });
});

describe("the default start of an edited schedule", () => {
  const base = { id: "s", timezone: "UTC" } as const;
  it("keeps a monthly bill on its day", () => {
    const rent = { ...base, cadence: "MONTHLY", startDate: "2026-01-05" } as const;
    expect(editStart(rent, "2026-10-07", new Set())).toBe("2026-11-05");
    expect(editStart(rent, "2026-10-05", new Set())).toBe("2026-10-05");
    expect(editStart(rent, "2026-10-05", new Set(["2026-10-05"]))).toBe(
      "2026-11-05",
    );
  });
  it("restarts twice a month on its first day", () => {
    const pay = {
      ...base,
      cadence: "TWICE_MONTHLY",
      startDate: "2026-01-01",
    } as const;
    expect(editStart(pay, "2026-10-07", new Set())).toBe("2026-11-01");
  });
  it("skips a month too short for the anchor day", () => {
    const end = { ...base, cadence: "MONTHLY", startDate: "2026-01-31" } as const;
    expect(editStart(end, "2026-11-01", new Set())).toBe("2026-12-31");
  });
  it("uses the next weekly occurrence", () => {
    const week = { ...base, cadence: "WEEKLY", startDate: "2026-01-05" } as const;
    expect(editStart(week, "2026-10-07", new Set())).toBe("2026-10-12");
  });
});
