import { describe, expect, it } from "vitest";
import { versionFor, versionHistory, versionsFrom } from "@/domain/versions";

const v = (effectiveFrom: string, label: string) => ({ effectiveFrom, label });

describe("effective dating", () => {
  const versions = [
    v("2026-06", "second"),
    v("2026-01", "first"),
    v("2027-01", "future"),
  ];

  it("takes the latest version that had taken effect", () => {
    expect(versionFor(versions, "2026-05")?.label).toBe("first");
    expect(versionFor(versions, "2026-06")?.label).toBe("second");
    expect(versionFor(versions, "2026-12")?.label).toBe("second");
    // A version effective this month applies this month, not next.
    expect(versionFor(versions, "2027-01")?.label).toBe("future");
  });

  it("reports nothing for a month before any version existed", () => {
    // A target created in June did not exist in May, and pretending it did
    // would invent a plan the owner never made.
    expect(versionFor(versions, "2025-12")).toBeNull();
    expect(versionFor([], "2026-06")).toBeNull();
  });

  it("refuses anything that is not a month", () => {
    expect(() => versionFor(versions, "2026-13")).toThrow();
    expect(() => versionFor([v("nope", "x")], "2026-06")).toThrow();
  });

  it("orders history newest first and the future oldest first", () => {
    expect(versionHistory(versions).map((x) => x.label)).toEqual([
      "future",
      "second",
      "first",
    ]);
    // What a simulation walks through: in force now, then each change ahead.
    expect(versionsFrom(versions, "2026-06").map((x) => x.label)).toEqual([
      "second",
      "future",
    ]);
    expect(versionsFrom(versions, "2025-01").map((x) => x.label)).toEqual([
      "first",
      "second",
      "future",
    ]);
  });
});
