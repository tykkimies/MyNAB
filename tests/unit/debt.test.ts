import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  comparePlans,
  monthlyInterest,
  orderDebts,
  rateFor,
  simulatePayoff,
  type Debt,
} from "@/domain/debt";

const debt = (over: Partial<Debt> & { accountId: string }): Debt => ({
  name: over.accountId,
  balance: 100000n,
  aprBasisPoints: 1999,
  minimumPayment: 5000n,
  ...over,
});

describe("debt payoff simulation", () => {
  it("charges interest rounded half up to whole cents", () => {
    // 1000.00 at 19.99% for one month is 16.6583..., which rounds to 16.66.
    expect(monthlyInterest(100000n, 1999)).toBe(1666n);
    expect(monthlyInterest(0n, 1999)).toBe(0n);
    // A zero rate and a cleared balance both cost nothing.
    expect(monthlyInterest(100000n, 0)).toBe(0n);
    expect(monthlyInterest(-5000n, 1999)).toBe(0n);
    // Exactly half a cent rounds up, not to even.
    expect(monthlyInterest(600n, 100)).toBe(1n);
  });

  it("orders by strategy with a stable tie breaker", () => {
    const debts = [
      debt({ accountId: "b", balance: 50000n, aprBasisPoints: 1000 }),
      debt({ accountId: "a", balance: 90000n, aprBasisPoints: 2400 }),
      debt({ accountId: "c", balance: 20000n, aprBasisPoints: 1000 }),
    ];
    expect(orderDebts(debts, "AVALANCHE").map((d) => d.accountId)).toEqual([
      "a",
      "c",
      "b",
    ]);
    expect(orderDebts(debts, "SNOWBALL").map((d) => d.accountId)).toEqual([
      "c",
      "b",
      "a",
    ]);
    // Equal on every field, so the identifier decides and never shuffles.
    const tied = [debt({ accountId: "z" }), debt({ accountId: "y" })];
    expect(orderDebts(tied, "AVALANCHE").map((d) => d.accountId)).toEqual([
      "y",
      "z",
    ]);
    expect(
      orderDebts(
        [
          debt({ accountId: "a", priority: 2 }),
          debt({ accountId: "b", priority: 1 }),
        ],
        "CUSTOM",
      ).map((d) => d.accountId),
    ).toEqual(["b", "a"]);
  });

  it("clears a single debt and never overpays the final month", () => {
    const plan = simulatePayoff({
      debts: [
        debt({ accountId: "card", balance: 10000n, minimumPayment: 5000n }),
      ],
      startMonth: "2026-01",
      strategy: "AVALANCHE",
    });
    expect(plan.payoffMonth).not.toBeNull();
    const last = plan.rows.at(-1)!;
    expect(last.balance).toBe(0n);
    // The closing payment is exactly what was owed, not a full minimum.
    expect(last.payment).toBeLessThanOrEqual(5000n);
    expect(plan.totalPaid).toBe(10000n + plan.totalInterest);
  });

  it("rolls a cleared debt's minimum onto the next one", () => {
    const debts = [
      debt({
        accountId: "small",
        balance: 10000n,
        minimumPayment: 5000n,
        aprBasisPoints: 0,
      }),
      debt({
        accountId: "big",
        balance: 100000n,
        minimumPayment: 5000n,
        aprBasisPoints: 0,
      }),
    ];
    const plan = simulatePayoff({
      debts,
      startMonth: "2026-01",
      strategy: "SNOWBALL",
    });
    const small = plan.debts.find((d) => d.accountId === "small")!;
    const big = plan.debts.find((d) => d.accountId === "big")!;
    expect(small.payoffMonth).toBe("2026-02");
    // Once "small" clears, "big" receives 10000 a month rather than 5000.
    const marchBig = plan.rows.find(
      (r) => r.month === "2026-03" && r.accountId === "big",
    )!;
    expect(marchBig.payment).toBe(10000n);
    expect(big.totalPaid).toBe(100000n);
  });

  it("applies extra monthly and dated lump sums to the strategy's first debt", () => {
    const debts = [
      debt({
        accountId: "a",
        balance: 100000n,
        minimumPayment: 2000n,
        aprBasisPoints: 0,
      }),
      debt({
        accountId: "b",
        balance: 100000n,
        minimumPayment: 2000n,
        aprBasisPoints: 2400,
      }),
    ];
    const plan = simulatePayoff({
      debts,
      startMonth: "2026-01",
      strategy: "AVALANCHE",
      extraMonthly: 10000n,
      lumpSums: [{ month: "2026-02", amount: 50000n }],
    });
    // Avalanche targets the higher rate, so every spare cent goes to "b".
    const january = plan.rows.find(
      (r) => r.month === "2026-01" && r.accountId === "b",
    )!;
    expect(january.payment).toBe(12000n);
    const february = plan.rows.find(
      (r) => r.month === "2026-02" && r.accountId === "b",
    )!;
    expect(february.payment).toBe(62000n);
    expect(
      plan.debts.find((d) => d.accountId === "b")!.payoffMonth,
    ).not.toBeNull();
  });

  it("detects a debt whose interest outruns its payment", () => {
    const plan = simulatePayoff({
      debts: [
        debt({
          accountId: "trap",
          balance: 1000000n,
          aprBasisPoints: 2999,
          minimumPayment: 1000n,
        }),
      ],
      startMonth: "2026-01",
      strategy: "AVALANCHE",
      maxMonths: 24,
    });
    // Paying 10 a month against 249.92 of interest never clears anything.
    expect(plan.negativelyAmortising).toEqual(["trap"]);
    expect(plan.infeasible).toBe(true);
    expect(plan.payoffMonth).toBeNull();
    expect(plan.truncated).toBe(true);
    // The balance is larger than it started, and the plan says so rather than
    // reporting a payoff date that will never arrive.
    expect(plan.rows.at(-1)!.balance).toBeGreaterThan(1000000n);
  });

  it("refuses inputs that cannot describe a real debt", () => {
    for (const bad of [
      { balance: -1n },
      { minimumPayment: -1n },
      { aprBasisPoints: -5 },
      { aprBasisPoints: 200000 },
    ])
      expect(() =>
        simulatePayoff({
          debts: [debt({ accountId: "x", ...bad })],
          startMonth: "2026-01",
          strategy: "AVALANCHE",
        }),
      ).toThrow();
  });

  it("reports what one plan costs against another", () => {
    const debts = [
      debt({
        accountId: "a",
        balance: 200000n,
        minimumPayment: 5000n,
        aprBasisPoints: 2400,
      }),
      debt({
        accountId: "b",
        balance: 50000n,
        minimumPayment: 2000n,
        aprBasisPoints: 600,
      }),
    ];
    const avalanche = simulatePayoff({
      debts,
      startMonth: "2026-01",
      strategy: "AVALANCHE",
    });
    const snowball = simulatePayoff({
      debts,
      startMonth: "2026-01",
      strategy: "SNOWBALL",
    });
    const delta = comparePlans(avalanche, snowball);
    // Avalanche minimises interest by construction, so snowball cannot beat it.
    expect(delta.interestDelta).toBeGreaterThanOrEqual(0n);
    expect(avalanche.totalInterest).toBeLessThanOrEqual(snowball.totalInterest);
  });

  it("never invents or loses money, for any generated set of debts", () => {
    const row = fc.record({
      accountId: fc.string({ minLength: 1, maxLength: 3 }),
      balance: fc.bigInt({ min: 1n, max: 2_000_000n }),
      aprBasisPoints: fc.integer({ min: 0, max: 3500 }),
      minimumPayment: fc.bigInt({ min: 1000n, max: 80000n }),
    });
    fc.assert(
      fc.property(
        fc.uniqueArray(row, { selector: (r) => r.accountId, maxLength: 5 }),
        fc.bigInt({ min: 0n, max: 100000n }),
        (rows, extraMonthly) => {
          const debts = rows.map((r) => ({ ...r, name: r.accountId }));
          const plan = simulatePayoff({
            debts,
            startMonth: "2026-01",
            strategy: "AVALANCHE",
            extraMonthly,
            maxMonths: 120,
          });
          for (const outcome of plan.debts) {
            const start = debts.find(
              (d) => d.accountId === outcome.accountId,
            )!.balance;
            const remaining =
              plan.rows.filter((r) => r.accountId === outcome.accountId).at(-1)
                ?.balance ?? start;
            // Everything paid is principal plus interest, exactly.
            expect(outcome.totalPaid).toBe(
              start + outcome.totalInterest - remaining,
            );
            expect(outcome.totalPaid >= 0n).toBe(true);
          }
          // A payment is never more than what was owed at the time.
          for (const r of plan.rows) expect(r.balance >= 0n).toBe(true);
          // The same inputs always produce the same schedule.
          expect(
            simulatePayoff({
              debts: [...debts].reverse(),
              startMonth: "2026-01",
              strategy: "AVALANCHE",
              extraMonthly,
              maxMonths: 120,
            }),
          ).toEqual(plan);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("charges the rate in force, so a promotional period actually ends", () => {
    const promo = debt({
      accountId: "intro",
      balance: 120000n,
      // 0% now; the contract's go-to rate starts in April.
      aprBasisPoints: 0,
      rates: [
        { effectiveFrom: "2026-01", aprBasisPoints: 0 },
        { effectiveFrom: "2026-04", aprBasisPoints: 2400 },
      ],
      minimumPayment: 10000n,
    });
    expect(rateFor(promo, "2026-03")).toBe(0);
    expect(rateFor(promo, "2026-04")).toBe(2400);
    // A month before any period keeps the plain rate rather than guessing.
    expect(rateFor(promo, "2025-12")).toBe(0);

    const plan = simulatePayoff({
      debts: [promo],
      startMonth: "2026-01",
      strategy: "AVALANCHE",
    });
    // Nothing is charged while the promotion runs.
    for (const row of plan.rows.filter((r) => r.month < "2026-04"))
      expect(row.interest).toBe(0n);
    expect(
      plan.rows.find((r) => r.month === "2026-04")!.interest,
    ).toBeGreaterThan(0n);
    // Paying the same card at a flat 24% throughout costs more, which is the
    // whole reason a promotional period has to be modelled separately.
    const flat = simulatePayoff({
      debts: [{ ...promo, rates: undefined, aprBasisPoints: 2400 }],
      startMonth: "2026-01",
      strategy: "AVALANCHE",
    });
    expect(plan.totalInterest).toBeLessThan(flat.totalInterest);
  });

  it("notices a payment that only stops covering interest later", () => {
    const plan = simulatePayoff({
      debts: [
        debt({
          accountId: "late",
          balance: 1000000n,
          aprBasisPoints: 0,
          rates: [
            { effectiveFrom: "2026-01", aprBasisPoints: 0 },
            { effectiveFrom: "2026-06", aprBasisPoints: 2999 },
          ],
          minimumPayment: 1000n,
        }),
      ],
      startMonth: "2026-01",
      strategy: "AVALANCHE",
      maxMonths: 24,
    });
    // At the start the minimum covers the interest, because there is none. The
    // old check ran once, up front, and would have called this fine forever.
    expect(plan.negativelyAmortising).toEqual(["late"]);
    expect(plan.payoffMonth).toBeNull();
  });

  it("does not call a debt hopeless when a rolled-up minimum rescues it", () => {
    const plan = simulatePayoff({
      debts: [
        // Alone, this one's interest outruns its minimum from the start.
        debt({
          accountId: "card",
          balance: 240000n,
          aprBasisPoints: 1999,
          minimumPayment: 3500n,
        }),
        // This clears quickly and hands its minimum over.
        debt({
          accountId: "small",
          balance: 20000n,
          aprBasisPoints: 500,
          minimumPayment: 20000n,
        }),
      ],
      startMonth: "2026-01",
      strategy: "AVALANCHE",
    });
    expect(
      plan.debts.find((d) => d.accountId === "card")!.payoffMonth,
    ).not.toBeNull();
    // Saying "this never gets paid off" beside a payoff date is a contradiction
    // the owner would be right to distrust.
    expect(plan.negativelyAmortising).toEqual([]);
    expect(plan.infeasible).toBe(false);
  });
});
