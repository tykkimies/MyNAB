import { describe, expect, it } from "vitest";
import { occurrences, type Recurrence } from "@/domain/schedules";
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
