import { describe, expect, it } from "vitest";
import {
  DEFAULT_REGISTER_VIEW,
  parseRegisterView,
  presetRange,
  registerRowShown,
} from "@/domain/register-view";

const view = (
  over: Partial<typeof DEFAULT_REGISTER_VIEW> = {},
): typeof DEFAULT_REGISTER_VIEW => ({ ...DEFAULT_REGISTER_VIEW, ...over });

describe("register view", () => {
  it("covers each preset, including a year boundary", () => {
    expect(presetRange("THIS_MONTH", "2026-01-15")).toEqual({
      from: "2026-01",
      to: "2026-01",
    });
    expect(presetRange("LAST_MONTH", "2026-01-15")).toEqual({
      from: "2025-12",
      to: "2025-12",
    });
    expect(presetRange("LATEST_3", "2026-01-15")).toEqual({
      from: "2025-11",
      to: "2026-01",
    });
    expect(presetRange("THIS_YEAR", "2026-03-01")).toEqual({
      from: "2026-01",
      to: "2026-12",
    });
    expect(presetRange("LAST_YEAR", "2026-03-01")).toEqual({
      from: "2025-01",
      to: "2025-12",
    });
    expect(presetRange("ALL", "2026-03-01")).toBeNull();
  });

  it("keeps a future month in this year, and every month for All Dates", () => {
    const today = "2026-03-04";
    expect(
      registerRowShown("2026-12-01", false, view({ preset: "THIS_YEAR" }), today),
    ).toBe(true);
    expect(
      registerRowShown("2027-01-01", false, view({ preset: "ALL" }), today),
    ).toBe(true);
    expect(
      registerRowShown("2025-12-01", false, view({ preset: "THIS_YEAR" }), today),
    ).toBe(false);
  });

  it("uses a hand-set range and rejects an inverted one", () => {
    const custom = view({ preset: null, from: "2026-02", to: "2026-04" });
    expect(registerRowShown("2026-02-01", false, custom, "2026-10-01")).toBe(true);
    expect(registerRowShown("2026-05-01", false, custom, "2026-10-01")).toBe(false);
    expect(
      parseRegisterView(
        JSON.stringify({ preset: null, from: "2026-05", to: "2026-01" }),
      ),
    ).toEqual(DEFAULT_REGISTER_VIEW);
  });

  it("hides stamped rows unless reconciled is shown, and keeps cleared ones", () => {
    const today = "2026-10-04";
    expect(registerRowShown("2026-09-01", true, view(), today)).toBe(false);
    expect(registerRowShown("2026-09-01", false, view(), today)).toBe(true);
    expect(
      registerRowShown("2026-09-01", true, view({ showReconciled: true }), today),
    ).toBe(true);
  });

  it("falls back when the cookie is missing or nonsense", () => {
    expect(parseRegisterView(undefined)).toEqual(DEFAULT_REGISTER_VIEW);
    expect(parseRegisterView("not-json")).toEqual(DEFAULT_REGISTER_VIEW);
    expect(parseRegisterView(JSON.stringify({ preset: "NOPE" }))).toEqual(
      DEFAULT_REGISTER_VIEW,
    );
  });
});
