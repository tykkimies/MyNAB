import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  addMoney,
  formatUSD,
  fromMinorUnits,
  money,
  parseUSD,
  toMinorUnits,
} from "@/domain/money";
describe("exact USD", () => {
  it("round trips every signed 64-bit cent value without JSON number conversion", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(2n ** 63n), max: 2n ** 63n - 1n }),
        (value) => {
          expect(
            fromMinorUnits(
              JSON.parse(JSON.stringify(toMinorUnits(money(value)))),
            ),
          ).toBe(value);
        },
      ),
      { numRuns: 1000 },
    );
  });
  it("preserves values beyond Number.MAX_SAFE_INTEGER", () => {
    expect(parseUSD("90071992547409.93")).toBe(9007199254740993n);
    expect(formatUSD(money(-9007199254740993n))).toBe(
      "-$90,071,992,547,409.93",
    );
    expect(parseUSD("0.1")).toBe(10n);
    expect(parseUSD("-0.01")).toBe(-1n);
  });
  it.each([
    "NaN",
    "1e4",
    "1.001",
    "1,000",
    " 1",
    "+1",
    "01",
    ".50",
    "Infinity",
    "",
  ])("rejects ambiguous dollars %s", (value) =>
    expect(() => parseUSD(value)).toThrow(),
  );
  it.each(["-0", "00", "1.0", "1e2", "+1", "9223372036854775808"])(
    "rejects invalid/overflow cents %s",
    (value) => expect(() => fromMinorUnits(value)).toThrow(),
  );
  it("checks overflow on arithmetic", () =>
    expect(() => addMoney(money(2n ** 63n - 1n), money(1n))).toThrow());
});
