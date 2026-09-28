import { describe, expect, it } from "vitest";
import type { DebtTerms } from "@/generated/prisma/client";
import { planProjection } from "@/application/debt-plan";

const terms = (
  accountId: string,
  over: Partial<DebtTerms> = {},
): DebtTerms => ({
  accountId,
  budgetId: "budget",
  aprBasisPoints: 2400,
  minimumPayment: 2500n,
  minimumPercentBasisPoints: 0,
  minimumIncludesInterest: false,
  statementBalance: null,
  statementDate: null,
  dueDay: 28,
  creditLimit: null,
  effectiveFrom: "1900-01",
  deferredInterest: false,
  deferredAccrued: null,
  promoEndsOn: null,
  updatedAt: new Date(0),
  ...over,
});

const settings = {
  strategy: "AVALANCHE" as const,
  monthlyBudget: 15000n,
  extraMonthly: 0n,
  ranks: {},
  clearDeferredFirst: false,
};

describe("adopted plan projection", () => {
  it("pays each card what the plan says in each month and nothing once it is clear", () => {
    const projection = planProjection(
      settings,
      [
        { id: "small", name: "Small", owed: 10000n },
        { id: "big", name: "Big", owed: 40000n },
      ],
      [terms("small", { aprBasisPoints: 3000 }), terms("big")],
      "2026-09",
      "2026-09-10",
    );
    expect(projection.result).not.toBeNull();
    // Avalanche clears the dearer small card first, within the budget.
    expect(projection.paymentFor("small", "2026-09")).toBe(10000n);
    expect(projection.paymentFor("big", "2026-09")).toBe(5000n);
    // Next month the whole budget goes to the card still owed; the cleared
    // card has no target at all, rather than last month's amount.
    expect(projection.paymentFor("small", "2026-10")).toBeNull();
    expect(projection.paymentFor("big", "2026-10")).toBe(15000n);
    // The same numbers the applied month uses: one simulation, not two.
    expect(
      projection.result!.rows.filter((r) => r.month === "2026-09"),
    ).toHaveLength(2);
  });

  it("has no schedule to read while a card's terms are missing", () => {
    const projection = planProjection(
      settings,
      [{ id: "card", name: "Card", owed: 10000n }],
      [],
      "2026-09",
      "2026-09-10",
    );
    expect(projection.missingTerms.map((d) => d.name)).toEqual(["Card"]);
    expect(projection.result).toBeNull();
    expect(projection.paymentFor("card", "2026-09")).toBeNull();
  });
});
