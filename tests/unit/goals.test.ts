import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  evaluateTarget,
  occurrenceFor,
  planFunding,
  projectCompletion,
  summarizeTargets,
  weekdayOccurrences,
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
  it("measures a balance target against available backing without asking for it", () => {
    const t = target({ type: "BALANCE", amount: 100000n });
    // Building up with no date is a wish: progress is shown, but no month is
    // asked for anything, so it never feeds "targets need" or Fund every target.
    expect(
      evaluateTarget(t, at({ available: 40000n }), "2026-04"),
    ).toMatchObject({
      funded: 40000n,
      needed: 60000n,
      contribution: 0n,
      state: "BUILDING",
    });
    expect(
      summarizeTargets([
        {
          type: "BALANCE",
          progress: evaluateTarget(t, at({ available: 40000n }), "2026-04"),
        },
      ]),
    ).toMatchObject({ neededThisMonth: 0n, behind: 0, met: 0, stillNeeded: 60000n });
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

  it("refills to the amount, counting what survived the month", () => {
    const t = target({ type: "MONTHLY", amount: 30000n, refill: true });
    // Groceries: 50 left over means only 250 is needed to be back at 300.
    expect(
      evaluateTarget(t, at({ available: 5000n, assigned: 0n }), "2026-04"),
    ).toMatchObject({ funded: 5000n, needed: 25000n });
    // Set aside is the other half of YNAB's toggle: ask again regardless.
    expect(
      evaluateTarget(
        target({ type: "MONTHLY", amount: 30000n }),
        at({ available: 5000n, assigned: 0n }),
        "2026-04",
      ),
    ).toMatchObject({ funded: 0n, needed: 30000n });
  });

  it("counts how often the weekday actually falls in the month", () => {
    // April 2026 begins on a Wednesday, so it holds five Wednesdays.
    expect(weekdayOccurrences("2026-04", 3)).toBe(5);
    expect(weekdayOccurrences("2026-04", 0)).toBe(4);
    // February 2026 is exactly four weeks, so every weekday falls four times.
    for (let day = 0; day <= 6; day++)
      expect(weekdayOccurrences("2026-02", day)).toBe(4);
    expect(() => weekdayOccurrences("2026-04", 7)).toThrow("0 (Sunday)");
  });

  it("scales a weekly target by the weeks the month really has", () => {
    const wednesday = target({
      type: "WEEKLY",
      amount: 15000n,
      dayOfWeek: 3,
    });
    // Five Wednesdays in April, so 750 rather than a nominal 600.
    expect(evaluateTarget(wednesday, at(), "2026-04").needed).toBe(75000n);
    // Four in February.
    expect(evaluateTarget(wednesday, at(), "2026-02").needed).toBe(60000n);
    // A weekly refill also counts what survived.
    expect(
      evaluateTarget(
        { ...wednesday, refill: true },
        at({ available: 10000n }),
        "2026-02",
      ).needed,
    ).toBe(50000n);
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

describe("completion projection", () => {
  const project = (t: Target, position: CategoryPosition, pace: bigint) =>
    projectCompletion(
      t,
      evaluateTarget(t, position, "2026-09"),
      "2026-09",
      pace,
    );

  it("divides what is left by the pace, rounding up to a whole month", () => {
    const t = target({ type: "BALANCE", amount: 100000n });
    // 1000.00 wanted, 250.00 there, 150.00 a month: 750.00 left is five months.
    expect(project(t, at({ available: 25000n }), 15000n)).toEqual({
      month: "2027-01",
      months: 5,
    });
    // A part month still counts as a month; it is not rounded away. 100.00
    // left at 30.00 a month is four months, the last of them a part month.
    expect(project(t, at({ available: 90000n }), 3000n)).toEqual({
      month: "2026-12",
      months: 4,
    });
  });

  it("reports a met target as finished now, whatever the pace", () => {
    const t = target({ type: "BALANCE", amount: 100000n });
    expect(project(t, at({ available: 100000n }), 0n)).toEqual({
      month: "2026-09",
      months: 0,
    });
  });

  it("offers nothing rather than inventing a date", () => {
    const balance = target({ type: "BALANCE", amount: 100000n });
    // No pace is not a slow pace. Projecting one would always answer "on time".
    expect(project(balance, at(), 0n)).toBeNull();
    expect(project(balance, at(), -500n)).toBeNull();
    // A pace of a cent a month clears in longer than anyone plans for.
    expect(project(balance, at(), 1n)).toBeNull();
    // These three never complete: a limit measures spending, a maintained
    // balance is standing, and a monthly target renews instead of finishing.
    for (const t of [
      target({ type: "SPENDING_LIMIT", amount: 50000n }),
      target({ type: "MAINTAIN", amount: 50000n }),
      target({ type: "MONTHLY", amount: 50000n }),
    ])
      expect(project(t, at(), 100000n)).toBeNull();
  });

  it("projects a dated target from the pace, not from its deadline", () => {
    const t = target({
      type: "BALANCE_BY_DATE",
      amount: 120000n,
      dueMonth: "2026-12",
    });
    const progress = evaluateTarget(t, at(), "2026-09");
    // The deadline asks for 300.00 a month across four months.
    expect(progress.contribution).toBe(30000n);
    // Funding only 100.00 a month misses it, and the projection says so rather
    // than repeating the deadline back.
    expect(projectCompletion(t, progress, "2026-09", 10000n)).toEqual({
      month: "2027-08",
      months: 12,
    });
  });

  it("rolls a periodic bill to the occurrence being funded", () => {
    const t = target({
      type: "PERIODIC",
      amount: 60000n,
      dueMonth: "2026-03",
      cadenceMonths: 12,
    });
    const progress = evaluateTarget(t, at({ available: 20000n }), "2026-09");
    expect(progress.dueMonth).toBe("2027-03");
    expect(projectCompletion(t, progress, "2026-09", 20000n)).toEqual({
      month: "2026-10",
      months: 2,
    });
  });
});

describe("target summary", () => {
  it("counts states and separates money owed from allowance left", () => {
    const entries = (
      [
        [target({ type: "MONTHLY", amount: 50000n }), at({ assigned: 50000n })],
        [target({ type: "MONTHLY", amount: 50000n }), at()],
        [
          target({
            type: "BALANCE_BY_DATE",
            amount: 120000n,
            dueMonth: "2026-12",
          }),
          at({ assigned: 30000n, available: 30000n }),
        ],
        [
          target({
            type: "BALANCE_BY_DATE",
            amount: 120000n,
            dueMonth: "2026-08",
          }),
          at(),
        ],
        [
          target({ type: "SPENDING_LIMIT", amount: 40000n }),
          at({ activity: -60000n }),
        ],
      ] as [Target, CategoryPosition][]
    ).map(([t, position]) => ({
      type: t.type,
      progress: evaluateTarget(t, position, "2026-09"),
    }));
    const summary = summarizeTargets(entries);
    expect(summary).toMatchObject({
      count: 5,
      met: 1,
      onTrack: 1,
      behind: 1,
      overdue: 1,
      exceeded: 1,
    });
    // 500.00 for the unfunded monthly and the whole 1200.00 of the overdue
    // one, which has no months left. The dated one asks for nothing further:
    // its 300.00 share for this month has already been assigned.
    expect(summary.neededThisMonth).toBe(50000n + 120000n);
    // The overspent limit contributes nothing to owe. Everything else does:
    // 500.00 unfunded monthly, 900.00 left on the dated one, 1200.00 overdue.
    expect(summary.stillNeeded).toBe(50000n + 90000n + 120000n);
  });

  it("says nothing is needed when there are no targets", () => {
    expect(summarizeTargets([])).toMatchObject({
      count: 0,
      neededThisMonth: 0n,
      stillNeeded: 0n,
    });
  });
});

describe("debt payoff targets", () => {
  const card = (over: Partial<Target> = {}): Target => ({
    type: "DEBT_PAYOFF",
    amount: 20000n,
    ...over,
  });

  it("asks for a monthly amount, capped by what is still owed", () => {
    // Owing 1000.00 with nothing reserved: the standing 200.00 is asked for.
    const progress = evaluateTarget(card(), at(), "2026-09", { owed: 100000n });
    expect(progress.contribution).toBe(20000n);
    expect(progress.needed).toBe(100000n);
    expect(progress.state).toBe("BEHIND");
    // Already assigned this month, so nothing further is owed to the plan.
    expect(
      evaluateTarget(card(), at({ assigned: 20000n }), "2026-09", {
        owed: 100000n,
      }).state,
    ).toBe("MET");
    // Only 50.00 left to clear, so asking for the full 200.00 would reserve
    // money against a card that is about to be paid off.
    expect(
      evaluateTarget(card(), at({ available: 95000n }), "2026-09", {
        owed: 100000n,
      }).contribution,
    ).toBe(5000n);
  });

  it("spreads what is owed over the months left, net of what is reserved", () => {
    const target = card({
      type: "DEBT_PAYOFF_BY_DATE",
      amount: 0n,
      dueMonth: "2026-12",
    });
    // 1200.00 owed with 400.00 already reserved is 800.00 over four months.
    const progress = evaluateTarget(
      target,
      at({ available: 40000n }),
      "2026-09",
      { owed: 120000n },
    );
    expect(progress.needed).toBe(80000n);
    expect(progress.contribution).toBe(20000n);
    expect(progress.monthsRemaining).toBe(4);
    expect(progress.state).toBe("BEHIND");
    // Assigning this month's share is what "on track" means: 400.00 was there
    // before the month, so the share is 200.00 and it has been assigned.
    expect(
      evaluateTarget(
        target,
        at({ available: 60000n, assigned: 20000n }),
        "2026-09",
        {
          owed: 120000n,
        },
      ),
    ).toMatchObject({ state: "ON_TRACK", contribution: 0n });
    // Assigning less than the share is not on track, however much is reserved.
    expect(
      evaluateTarget(
        target,
        at({ available: 40000n, assigned: 20000n }),
        "2026-09",
        {
          owed: 120000n,
        },
      ),
    ).toMatchObject({ state: "BEHIND", contribution: 5000n });
    // A card already covered by its reserve is done, whatever the date says.
    expect(
      evaluateTarget(target, at({ available: 120000n }), "2026-09", {
        owed: 120000n,
      }).state,
    ).toBe("MET");
    // A passed date asks for the remainder now instead of dividing by zero.
    expect(
      evaluateTarget(
        card({ type: "DEBT_PAYOFF_BY_DATE", amount: 0n, dueMonth: "2026-06" }),
        at(),
        "2026-09",
        { owed: 120000n },
      ),
    ).toMatchObject({ state: "OVERDUE", contribution: 120000n });
  });

  it("refuses to guess what a card owes, or to store it", () => {
    // Without the ledger's balance there is no honest answer to give.
    expect(() => evaluateTarget(card(), at(), "2026-09")).toThrow(
      /balance owed/,
    );
    expect(() =>
      evaluateTarget(card(), at(), "2026-09", { owed: -1n }),
    ).toThrow();
    // A payoff-by-date target carrying an amount would be a second answer to
    // a question the ledger already answers.
    expect(() =>
      evaluateTarget(
        card({
          type: "DEBT_PAYOFF_BY_DATE",
          amount: 50000n,
          dueMonth: "2026-12",
        }),
        at(),
        "2026-09",
        { owed: 100000n },
      ),
    ).toThrow(/stores no amount/);
    expect(() =>
      evaluateTarget(
        card({ type: "DEBT_PAYOFF_BY_DATE", amount: 0n }),
        at(),
        "2026-09",
        { owed: 100000n },
      ),
    ).toThrow(/due month/);
  });

  it("projects a payoff from the pace being paid", () => {
    const target = card();
    const progress = evaluateTarget(target, at(), "2026-09", { owed: 100000n });
    // 1000.00 owed at 200.00 a month clears in five.
    expect(projectCompletion(target, progress, "2026-09", 20000n)).toEqual({
      month: "2027-01",
      months: 5,
    });
  });

  it("stops asking once this month's share is assigned", () => {
    const target: Target = {
      type: "BALANCE_BY_DATE",
      amount: 120000n,
      dueMonth: "2026-12",
    };
    // Nothing assigned yet: 1200.00 over four months.
    const first = evaluateTarget(target, at(), "2026-09");
    expect(first.contribution).toBe(30000n);
    // Having assigned exactly that, the month is done. Computing the share
    // from `available` instead would see 900.00 left over four months and ask
    // for 225.00 more, over-funding the plan on every repeated funding.
    const after = evaluateTarget(
      target,
      at({ available: 30000n, assigned: 30000n }),
      "2026-09",
    );
    expect(after.contribution).toBe(0n);
    expect(after.state).toBe("ON_TRACK");
    // It is still not finished: 900.00 remains to be found in later months.
    expect(after.needed).toBe(90000n);
  });

  it("stays funded once the money it asked for has been spent", () => {
    const rent: Target = { type: "MONTHLY", amount: 145000n, refill: true };
    // Assigned the rent, then paid it: available is back to nothing, but the
    // month's job was done. Reading `available` alone asked for it twice.
    expect(
      evaluateTarget(
        rent,
        at({ assigned: 145000n, activity: -145000n, available: 0n }),
        "2026-09",
      ),
    ).toMatchObject({ state: "MET", contribution: 0n });
    // Money that survived last month still counts toward a refill.
    expect(
      evaluateTarget(
        rent,
        at({ assigned: 45000n, available: 145000n }),
        "2026-09",
      ).state,
    ).toBe("MET");
    // Set aside is unmoved by either: it only ever counts this month's
    // assignments, which is the difference between the two kinds.
    const saving: Target = { type: "MONTHLY", amount: 145000n };
    expect(
      evaluateTarget(saving, at({ available: 145000n }), "2026-09")
        .contribution,
    ).toBe(145000n);
    expect(
      evaluateTarget(
        saving,
        at({ assigned: 145000n, activity: -145000n }),
        "2026-09",
      ).state,
    ).toBe("MET");
  });
});

it("does not subtract monthly debt funding twice near payoff", () => {
  const progress = evaluateTarget(
    { type: "DEBT_PAYOFF", amount: 10000n },
    { available: 5000n, assigned: 5000n, activity: 0n },
    "2026-09",
    { owed: 12000n },
  );
  expect(progress.contribution).toBe(5000n);
});
