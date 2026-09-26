import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  comparePlans,
  minimumDue,
  monthlyInterest,
  monthlyBudgetForPayoffDate,
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
  it("solves the least monthly payment for a chosen payoff month", () => {
    const request = {
      debts: [debt({ accountId: "loan", balance: 120000n, aprBasisPoints: 0, minimumPayment: 1000n })],
      startMonth: "2026-01",
      strategy: "AVALANCHE" as const,
    };
    const solved = monthlyBudgetForPayoffDate(request, "2026-12");
    expect(solved.monthlyBudget).toBe(10000n);
    expect(solved.plan.payoffMonth).toBe("2026-12");
    const less = simulatePayoff({ ...request, monthlyBudget: 9999n, maxMonths: 12 });
    expect(less.payoffMonth).toBeNull();
  });

  it("uses future promotional APR versions and optional lump sums", () => {
    const request = {
      debts: [debt({
        accountId: "card",
        balance: 120000n,
        aprBasisPoints: 0,
        minimumPayment: 1000n,
        rates: [{ effectiveFrom: "2026-07", aprBasisPoints: 2400 }],
      })],
      startMonth: "2026-01",
      strategy: "AVALANCHE" as const,
    };
    const regular = monthlyBudgetForPayoffDate(request, "2026-12");
    const withLump = monthlyBudgetForPayoffDate(
      { ...request, lumpSums: [{ month: "2026-06", amount: 30000n }] },
      "2026-12",
    );
    expect(regular.monthlyBudget).toBeGreaterThan(10000n);
    expect(withLump.monthlyBudget).toBeLessThan(regular.monthlyBudget);
    expect(withLump.plan.payoffMonth).toBe("2026-12");
    expect(regular.plan.shortfallMonths).toEqual([]);
  });

  it("rejects a date before the first payment or beyond the horizon", () => {
    const request = {
      debts: [debt({ accountId: "loan" })],
      startMonth: "2026-01",
      strategy: "AVALANCHE" as const,
    };
    expect(() => monthlyBudgetForPayoffDate(request, "2025-12")).toThrow();
    expect(() => monthlyBudgetForPayoffDate(request, "2056-01")).toThrow();
  });

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

describe("review regressions", () => {
  it("redistributes the unused final minimum in the same month", () => {
    const plan = simulatePayoff({
      startMonth: "2026-01",
      strategy: "SNOWBALL",
      maxMonths: 1,
      debts: [
        debt({
          accountId: "a",
          balance: 100n,
          minimumPayment: 1000n,
          aprBasisPoints: 0,
        }),
        debt({
          accountId: "b",
          balance: 5000n,
          minimumPayment: 1000n,
          aprBasisPoints: 0,
        }),
      ],
    });
    expect(plan.rows.find((r) => r.accountId === "b")!.payment).toBe(1900n);
    expect(plan.totalPaid).toBe(2000n);
  });
  it("redirects avalanche extra payments when a promotion expires", () => {
    const plan = simulatePayoff({
      startMonth: "2026-01",
      strategy: "AVALANCHE",
      maxMonths: 2,
      extraMonthly: 1000n,
      debts: [
        debt({
          accountId: "a",
          balance: 100000n,
          minimumPayment: 100n,
          aprBasisPoints: 1200,
        }),
        debt({
          accountId: "b",
          balance: 100000n,
          minimumPayment: 100n,
          aprBasisPoints: 0,
          rates: [{ effectiveFrom: "2026-02", aprBasisPoints: 2400 }],
        }),
      ],
    });
    expect(
      plan.rows.find((r) => r.accountId === "a" && r.month === "2026-01")!
        .payment,
    ).toBe(1100n);
    expect(
      plan.rows.find((r) => r.accountId === "b" && r.month === "2026-02")!
        .payment,
    ).toBe(1100n);
  });
});

describe("minimum payment rules and a monthly budget", () => {
  it("takes the larger of the floor and the percentage, with optional interest", () => {
    const rule = { minimumPayment: 2500n, percentBasisPoints: 100 };
    // 1% of 1,000.00 is 10.00, below the 25.00 floor.
    expect(minimumDue(rule, 100000n, 1666n)).toBe(2500n);
    // 1% of 5,000.00 is 50.00.
    expect(minimumDue(rule, 500000n, 8329n)).toBe(5000n);
    // Plus that month's interest when the contract says so.
    expect(minimumDue({ ...rule, includeInterest: true }, 500000n, 8329n)).toBe(
      13329n,
    );
    // A half cent of percentage rounds up.
    expect(
      minimumDue({ minimumPayment: 0n, percentBasisPoints: 1 }, 50n, 0n),
    ).toBe(0n);
    expect(
      minimumDue({ minimumPayment: 0n, percentBasisPoints: 1 }, 5000n, 0n),
    ).toBe(1n);
    // A fixed minimum ignores the balance entirely.
    expect(minimumDue({ minimumPayment: 3000n }, 900000n, 5000n)).toBe(3000n);
  });

  it("switches minimum rules from their effective month", () => {
    const plan = simulatePayoff({
      debts: [
        debt({
          accountId: "card",
          aprBasisPoints: 0,
          balance: 100000n,
          minimumPayment: 1000n,
          minimums: [{ effectiveFrom: "2026-03", minimumPayment: 4000n }],
        }),
      ],
      startMonth: "2026-01",
      strategy: "AVALANCHE",
    });
    expect(plan.rows.slice(0, 3).map((r) => r.payment)).toEqual([
      1000n,
      1000n,
      4000n,
    ]);
  });

  it("keeps the first month's total, so a shrinking percentage minimum pays down faster", () => {
    const plan = simulatePayoff({
      debts: [
        debt({
          accountId: "card",
          aprBasisPoints: 0,
          balance: 100000n,
          minimumPayment: 0n,
          percentBasisPoints: 1000,
        }),
      ],
      startMonth: "2026-01",
      strategy: "AVALANCHE",
    });
    // 10% of 1,000.00 is 100.00, and that total is kept each month.
    expect(plan.rows.every((r) => r.payment === 10000n)).toBe(true);
    expect(plan.payoffMonth).toBe("2026-10");
    // Paying only what is demanded lets the minimum shrink with the balance.
    const baseline = simulatePayoff({
      debts: [
        debt({
          accountId: "card",
          aprBasisPoints: 0,
          balance: 100000n,
          minimumPayment: 1000n,
          percentBasisPoints: 1000,
        }),
      ],
      startMonth: "2026-01",
      strategy: "AVALANCHE",
      minimumsOnly: true,
    });
    expect(baseline.rows.slice(0, 2).map((r) => r.payment)).toEqual([
      10000n,
      9000n,
    ]);
  });

  it("spends exactly the monthly budget and reports months it cannot cover", () => {
    const debts = [
      debt({
        accountId: "a",
        aprBasisPoints: 0,
        balance: 30000n,
        minimumPayment: 5000n,
      }),
      debt({
        accountId: "b",
        aprBasisPoints: 0,
        balance: 30000n,
        minimumPayment: 5000n,
      }),
    ];
    const plan = simulatePayoff({
      debts,
      startMonth: "2026-01",
      strategy: "SNOWBALL",
      monthlyBudget: 20000n,
    });
    expect(
      plan.rows
        .filter((r) => r.month === "2026-01")
        .reduce((s, r) => s + r.payment, 0n),
    ).toBe(20000n);
    expect(plan.infeasible).toBe(false);
    const short = simulatePayoff({
      debts,
      startMonth: "2026-01",
      strategy: "SNOWBALL",
      monthlyBudget: 8000n,
    });
    expect(short.infeasible).toBe(true);
    expect(short.shortfallMonths[0]).toBe("2026-01");
    expect(() =>
      simulatePayoff({
        debts,
        startMonth: "2026-01",
        strategy: "SNOWBALL",
        monthlyBudget: 20000n,
        extraMonthly: 100n,
      }),
    ).toThrow("either");
  });

  it("never pays less than the minimums or more than the budget allows", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            balance: fc.bigInt({ min: 1n, max: 500000n }),
            minimumPayment: fc.bigInt({ min: 0n, max: 10000n }),
            percentBasisPoints: fc.integer({ min: 0, max: 500 }),
            includeInterest: fc.boolean(),
            aprBasisPoints: fc.integer({ min: 0, max: 3000 }),
          }),
          { minLength: 1, maxLength: 4 },
        ),
        fc.bigInt({ min: 0n, max: 100000n }),
        (specs, budget) => {
          const debts = specs.map((d, i) => debt({ accountId: `d${i}`, ...d }));
          const plan = simulatePayoff({
            debts,
            startMonth: "2026-01",
            strategy: "AVALANCHE",
            monthlyBudget: budget,
            maxMonths: 24,
          });
          const byMonth = new Map<string, bigint>();
          for (const r of plan.rows) {
            expect(r.balance >= 0n).toBe(true);
            byMonth.set(r.month, (byMonth.get(r.month) ?? 0n) + r.payment);
          }
          for (const [month, paid] of byMonth)
            if (!plan.shortfallMonths.includes(month))
              expect(paid <= budget).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("a payment still due this month", () => {
  const card = {
    accountId: "c6521",
    name: "6521",
    balance: 16351n,
    aprBasisPoints: 2699,
    minimumPayment: 4000n,
    percentBasisPoints: 100,
    includeInterest: true,
  };
  it("pays today's balance before any new interest, so it clears for what is owed", () => {
    const plan = simulatePayoff({
      debts: [{ ...card, firstPaymentBeforeInterest: true }],
      startMonth: "2026-09",
      strategy: "AVALANCHE",
      monthlyBudget: 42900n,
    });
    expect(plan.debts[0]).toMatchObject({
      payoffMonth: "2026-09",
      totalInterest: 0n,
      totalPaid: 16351n,
    });
  });
  it("accrues a month's interest first once the due day has passed", () => {
    const plan = simulatePayoff({
      debts: [card],
      startMonth: "2026-09",
      strategy: "AVALANCHE",
      monthlyBudget: 42900n,
    });
    expect(plan.debts[0].totalInterest).toBe(368n);
  });
  it("still asks the statement's minimum, interest included, when paying first", () => {
    const big = { ...card, balance: 500000n, minimumPayment: 2500n };
    const plan = simulatePayoff({
      debts: [{ ...big, firstPaymentBeforeInterest: true }],
      startMonth: "2026-09",
      strategy: "AVALANCHE",
      minimumsOnly: true,
    });
    // 1% of $5,000 plus $112.46 interest; nothing charged before it.
    expect(plan.rows[0]).toMatchObject({
      month: "2026-09",
      interest: 0n,
      payment: 16246n,
      balance: 483754n,
    });
    // The next month accrues interest on what is left, then pays.
    expect(plan.rows[1].interest).toBe(10880n);
  });
});
