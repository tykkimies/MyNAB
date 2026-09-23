import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  evaluateTarget,
  occurrenceFor,
  type CategoryPosition,
  type Target,
} from "@/domain/goals";

const at = (over: Partial<CategoryPosition> = {}): CategoryPosition => ({
  available: 0n,
  assigned: 0n,
  activity: 0n,
  ...over,
});
const target = (t: Target) => t;

describe("target arithmetic", () => {
  it("measures a balance target against available backing", () => {
    const t = target({ type: "BALANCE", amount: 100000n });
    expect(
      evaluateTarget(t, at({ available: 40000n }), "2026-04"),
    ).toMatchObject({
      funded: 40000n,
      needed: 60000n,
      contribution: 60000n,
      state: "BEHIND",
    });
    expect(
      evaluateTarget(t, at({ available: 100000n }), "2026-04"),
    ).toMatchObject({
      needed: 0n,
      contribution: 0n,
      state: "MET",
      progress: 1,
    });
  });

  it("never reports negative need from an overfunded category", () => {
    const result = evaluateTarget(
      target({ type: "BALANCE", amount: 100000n }),
      at({ available: 250000n }),
      "2026-04",
    );
    expect(result.needed).toBe(0n);
    expect(result.progress).toBe(1);
  });

  it("treats a negative available balance as nothing funded, not as debt", () => {
    const result = evaluateTarget(
      target({ type: "BALANCE", amount: 100000n }),
      at({ available: -5000n }),
      "2026-04",
    );
    expect(result.funded).toBe(0n);
    expect(result.needed).toBe(100000n);
  });

  it("spreads a dated target over the inclusive months remaining", () => {
    const t = target({
      type: "BALANCE_BY_DATE",
      amount: 120000n,
      dueMonth: "2026-06",
    });
    // April, May and June inclusive: three months.
    const april = evaluateTarget(t, at(), "2026-04");
    expect(april.monthsRemaining).toBe(3);
    expect(april.contribution).toBe(40000n);
    // The due month itself is the last funding month, not a dead one.
    expect(evaluateTarget(t, at(), "2026-06").monthsRemaining).toBe(1);
    expect(evaluateTarget(t, at(), "2026-06").contribution).toBe(120000n);
  });

  it("rounds a contribution up so the target cannot fall a cent short", () => {
    const t = target({
      type: "BALANCE_BY_DATE",
      amount: 10000n,
      dueMonth: "2026-06",
    });
    // 10000 over 3 months is 3333.33; paying 3333 three times leaves a cent short.
    const result = evaluateTarget(t, at(), "2026-04");
    expect(result.contribution).toBe(3334n);
    expect(result.contribution * 3n).toBeGreaterThanOrEqual(t.amount);
  });

  it("asks for the whole remainder once the deadline has passed", () => {
    const result = evaluateTarget(
      target({
        type: "BALANCE_BY_DATE",
        amount: 120000n,
        dueMonth: "2026-03",
      }),
      at({ available: 20000n }),
      "2026-07",
    );
    expect(result.state).toBe("OVERDUE");
    expect(result.monthsRemaining).toBe(0);
    // Never a division by zero, and never a contribution of nothing.
    expect(result.contribution).toBe(100000n);
  });

  it("calls a dated target on track only once this month's pace is assigned", () => {
    const t = target({
      type: "BALANCE_BY_DATE",
      amount: 120000n,
      dueMonth: "2026-06",
    });
    expect(evaluateTarget(t, at({ assigned: 39999n }), "2026-04").state).toBe(
      "BEHIND",
    );
    expect(evaluateTarget(t, at({ assigned: 40000n }), "2026-04").state).toBe(
      "ON_TRACK",
    );
  });

  it("measures monthly funding by this month's assignments, not leftovers", () => {
    const t = target({ type: "MONTHLY", amount: 50000n });
    // A large carried balance does not satisfy a monthly funding target.
    expect(
      evaluateTarget(t, at({ available: 900000n, assigned: 0n }), "2026-04"),
    ).toMatchObject({ funded: 0n, needed: 50000n, state: "BEHIND" });
    expect(
      evaluateTarget(t, at({ assigned: 50000n }), "2026-04"),
    ).toMatchObject({ needed: 0n, state: "MET" });
  });

  it("measures a spending limit by net activity and flags exceeding it", () => {
    const t = target({ type: "SPENDING_LIMIT", amount: 30000n });
    const under = evaluateTarget(t, at({ activity: -20000n }), "2026-04");
    expect(under).toMatchObject({
      funded: 20000n,
      needed: 10000n,
      state: "ON_TRACK",
    });
    const over = evaluateTarget(t, at({ activity: -45000n }), "2026-04");
    expect(over.state).toBe("EXCEEDED");
    expect(over.needed).toBe(0n);
    // A limit is never something to contribute toward.
    expect(over.contribution).toBe(0n);
    // A refund reduces net spending rather than counting against the limit.
    expect(evaluateTarget(t, at({ activity: 5000n }), "2026-04").funded).toBe(
      0n,
    );
  });

  it("rolls a periodic target to the occurrence being funded now", () => {
    const annual = target({
      type: "PERIODIC",
      amount: 60000n,
      dueMonth: "2026-03",
      cadenceMonths: 12,
    });
    expect(occurrenceFor(annual, "2026-01")).toBe("2026-03");
    // Once March passes, the target funds next March rather than reporting overdue.
    expect(occurrenceFor(annual, "2026-04")).toBe("2027-03");
    const result = evaluateTarget(annual, at(), "2026-04");
    expect(result.dueMonth).toBe("2027-03");
    expect(result.monthsRemaining).toBe(12);
    expect(result.contribution).toBe(5000n);
    // A quarterly bill rolls on its own cadence.
    const quarterly = target({
      type: "PERIODIC",
      amount: 30000n,
      dueMonth: "2026-01",
      cadenceMonths: 3,
    });
    expect(occurrenceFor(quarterly, "2026-05")).toBe("2026-07");
  });

  it("counts money already set aside against the next occurrence", () => {
    const result = evaluateTarget(
      target({
        type: "PERIODIC",
        amount: 60000n,
        dueMonth: "2026-12",
        cadenceMonths: 12,
      }),
      at({ available: 30000n }),
      "2026-10",
    );
    expect(result.needed).toBe(30000n);
    expect(result.monthsRemaining).toBe(3);
    expect(result.contribution).toBe(10000n);
  });

  it("keeps a maintain target standing rather than completing it", () => {
    const t = target({ type: "MAINTAIN", amount: 100000n });
    const held = evaluateTarget(t, at({ available: 100000n }), "2026-04");
    expect(held.state).toBe("MET");
    // Spending out of it immediately asks for the shortfall back.
    expect(
      evaluateTarget(t, at({ available: 60000n }), "2026-04"),
    ).toMatchObject({ needed: 40000n, contribution: 40000n, state: "BEHIND" });
  });

  it("rejects targets that cannot mean anything", () => {
    expect(() =>
      evaluateTarget(target({ type: "BALANCE", amount: 0n }), at(), "2026-04"),
    ).toThrow("must be positive");
    expect(() =>
      evaluateTarget(
        target({ type: "BALANCE_BY_DATE", amount: 100n }),
        at(),
        "2026-04",
      ),
    ).toThrow("requires a due month");
    expect(() =>
      occurrenceFor(
        {
          type: "PERIODIC",
          amount: 100n,
          dueMonth: "2026-01",
          cadenceMonths: 0,
        },
        "2026-05",
      ),
    ).toThrow("at least one month");
  });

  it("always asks for enough to finish, for any generated dated target", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10_000_000n }),
        fc.bigInt({ min: -100_000n, max: 10_000_000n }),
        fc.integer({ min: 0, max: 36 }),
        (amount, available, ahead) => {
          const due = `2026-${String((ahead % 12) + 1).padStart(2, "0")}`;
          const month = "2026-01";
          const t: Target = {
            type: "BALANCE_BY_DATE",
            amount,
            dueMonth: due < month ? month : due,
          };
          const r = evaluateTarget(t, at({ available }), month);
          // Never negative, never more than the whole remaining need.
          expect(r.contribution >= 0n).toBe(true);
          expect(r.contribution <= r.needed).toBe(true);
          expect(r.needed >= 0n).toBe(true);
          // Paying the contribution every remaining month always finishes it.
          if (r.monthsRemaining && r.monthsRemaining > 0)
            expect(r.contribution * BigInt(r.monthsRemaining) >= r.needed).toBe(
              true,
            );
          expect(r.progress).toBeGreaterThanOrEqual(0);
          expect(r.progress).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 500 },
    );
  });
});
