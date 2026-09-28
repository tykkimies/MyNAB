import { describe, expect, it } from "vitest";
import {
  budgetMonth,
  financialDate,
  formatDateTime,
  monthOf,
  timezone,
} from "@/domain/dates";
it("preserves calendar dates across DST and validates Gregorian leap years", () => {
  expect(monthOf(financialDate("2024-02-29"))).toBe("2024-02");
  expect(financialDate("2026-03-08")).toBe("2026-03-08");
  expect(budgetMonth("2026-12")).toBe("2026-12");
  expect(financialDate("2000-02-29")).toBe("2000-02-29");
});
it.each([
  "1900-02-29",
  "2026-02-29",
  "2026-04-31",
  "0000-01-01",
  "2026-13-01",
  "2026-01-00",
  "2026-1-1",
  "2026-01-01T00:00:00Z",
])("rejects %s", (v) => expect(() => financialDate(v)).toThrow());
it("validates IANA zones", () => {
  expect(timezone("America/New_York")).toBe("America/New_York");
  expect(() => timezone("Not/AZone")).toThrow();
});

describe("formatDateTime", () => {
  it("shows the plan's date and clock time in its timezone", () => {
    const at = new Date("2026-09-28T19:41:24Z");
    expect(formatDateTime(at, "US", "America/New_York")).toBe(
      "09/28/2026, 3:41 PM",
    );
    expect(formatDateTime(at, "ISO", "UTC")).toBe("2026-09-28, 7:41 PM");
    // Past midnight UTC is still the evening before in New York.
    expect(
      formatDateTime(new Date("2026-09-29T02:05:00Z"), "EU", "America/New_York"),
    ).toBe("28/09/2026, 10:05 PM");
  });
});
