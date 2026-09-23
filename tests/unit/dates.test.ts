import { expect, it } from "vitest";
import { budgetMonth, financialDate, monthOf, timezone } from "@/domain/dates";
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
