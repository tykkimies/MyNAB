import { describe, expect, it } from "vitest";
import { formatDate } from "../../src/domain/dates";

describe("plan date formats", () => {
  it("shows the same stored date three ways", () => {
    expect(formatDate("2026-03-09")).toBe("2026-03-09");
    expect(formatDate("2026-03-09", "US")).toBe("03/09/2026");
    expect(formatDate(new Date("2026-03-09T00:00:00Z"), "EU")).toBe("09/03/2026");
  });
});
