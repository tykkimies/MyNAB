import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  evaluateTarget,
  occurrenceFor,
  planFunding,
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

describe("funding targets from money that exists", () => {
  it("assigns what each target needs when the budget can cover it", () => {
    const plan = planFunding(
      [
        { categoryId: "rent", contribution: 100000n },
        { categoryId: "phone", contribution: 8000n },
      ],
      500000n,
    );
    expect(plan.assignments).toEqual([
      { categoryId: "rent", amount: 100000n },
      { categoryId: "phone", amount: 8000n },
    ]);
    expect(plan.total).toBe(108000n);
    expect(plan.shortfall).toBe(0n);
  });

  it("never assigns more than the money offered", () => {
    const plan = planFunding(
      [
        { categoryId: "rent", contribution: 100000n },
        { categoryId: "phone", contribution: 8000n },
        { categoryId: "fun", contribution: 20000n },
      ],
      105000n,
    );
    // Earlier needs funded fully, the boundary one part funded, the rest left.
    expect(plan.assignments).toEqual([
      { categoryId: "rent", amount: 100000n },
      { categoryId: "phone", amount: 5000n },
    ]);
    expect(plan.total).toBe(105000n);
    expect(plan.shortfall).toBe(23000n);
  });

  it("assigns nothing when there is nothing to assign", () => {
    const needs = [{ categoryId: "rent", contribution: 100000n }];
    for (const available of [0n, -50000n]) {
      const plan = planFunding(needs, available);
      expect(plan.assignments).toEqual([]);
      expect(plan.total).toBe(0n);
      // The need is still reported rather than hidden by a lack of money.
      expect(plan.shortfall).toBe(100000n);
    }
  });

  it("skips targets that need nothing", () => {
    const plan = planFunding(
      [
        { categoryId: "met", contribution: 0n },
        { categoryId: "negative", contribution: -500n },
        { categoryId: "rent", contribution: 1000n },
      ],
      500000n,
    );
    expect(plan.assignments).toEqual([{ categoryId: "rent", amount: 1000n }]);
    expect(plan.shortfall).toBe(0n);
  });

  it("fills targets past the available money when asked, and says so", () => {
    // Matching YNAB: the owner may assign more than they hold and see it in red.
    const plan = planFunding(
      [
        { categoryId: "rent", contribution: 100000n },
        { categoryId: "fun", contribution: 20000n },
      ],
      50000n,
      "full",
    );
    expect(plan.total).toBe(120000n);
    expect(plan.shortfall).toBe(0n);
    // The overshoot is reported rather than left for the owner to discover.
    expect(plan.overAssigned).toBe(70000n);
  });

  it("reports no overshoot when the money was there all along", () => {
    const plan = planFunding(
      [{ categoryId: "rent", contribution: 100000n }],
      500000n,
      "full",
    );
    expect(plan.overAssigned).toBe(0n);
  });

  it("can never hand out money the budget does not hold when capped", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            categoryId: fc.string({ minLength: 1, maxLength: 4 }),
            contribution: fc.bigInt({ min: -5000n, max: 500000n }),
          }),
          { maxLength: 20 },
        ),
        fc.bigInt({ min: -100000n, max: 1000000n }),
        (needs, available) => {
          const plan = planFunding(needs, available);
          // The invariant the whole method rests on.
          expect(plan.total <= (available > 0n ? available : 0n)).toBe(true);
          expect(plan.total >= 0n).toBe(true);
          expect(plan.shortfall >= 0n).toBe(true);
          for (const a of plan.assignments) expect(a.amount > 0n).toBe(true);
        },
      ),
      { numRuns: 500 },
    );
  });
});
