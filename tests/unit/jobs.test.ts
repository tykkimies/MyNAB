import { describe, expect, it } from "vitest";
import { backoffMs, sanitizeJobError, syncDue } from "@/domain/jobs";

describe("background job policy", () => {
  it("backs off from a minute, doubling, capped at six hours", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(5)).toBe(16 * 60_000);
    expect(backoffMs(50)).toBe(6 * 3_600_000);
    expect(() => backoffMs(0)).toThrow();
  });
  it("treats a never-synced connection as due and respects the interval", () => {
    const now = new Date("2026-03-10T12:00:00Z");
    expect(syncDue(null, now, 6)).toBe(true);
    expect(syncDue(new Date("2026-03-10T07:00:00Z"), now, 6)).toBe(false);
    expect(syncDue(new Date("2026-03-10T06:00:00Z"), now, 6)).toBe(true);
  });
  it("keeps stored errors short and strips token-shaped text", () => {
    const message = sanitizeJobError(
      new Error(
        `failed with access-sandbox-1234abcd-5678 and ${"x".repeat(40)} ${"y".repeat(400)}`,
      ),
    );
    expect(message).not.toContain("access-sandbox");
    expect(message).not.toContain("x".repeat(40));
    expect(message.length).toBeLessThanOrEqual(300);
    expect(sanitizeJobError("nope")).toBe("Unknown failure");
  });
});
