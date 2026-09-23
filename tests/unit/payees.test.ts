import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { suggestCategory, type CategorisedPayee } from "@/domain/payees";

const seen = (
  payee: string,
  categoryId: string,
  date = "2026-03-01",
): CategorisedPayee => ({ payee, categoryId, date });

describe("payee memory", () => {
  it("suggests the category chosen before for the same payee", () => {
    const history = [seen("Shell", "fuel"), seen("Kroger", "groceries")];
    expect(suggestCategory(history, "Shell")).toMatchObject({
      categoryId: "fuel",
      support: 1,
      basis: "exact",
    });
  });

  it("ignores the noise institutions add to a payee", () => {
    const history = [seen("GROCER #221", "groceries")];
    // Case, punctuation and spacing vary between appearances of one payee.
    for (const variant of ["grocer 221", "Grocer  #221", "GROCER #221  "])
      expect(suggestCategory(history, variant)?.categoryId).toBe("groceries");
  });

  it("falls back to a shared prefix and says the match was partial", () => {
    const history = [seen("Shell Oil 4471", "fuel")];
    const result = suggestCategory(history, "Shell Oil");
    expect(result).toMatchObject({ categoryId: "fuel", basis: "partial" });
  });

  it("prefers an exact match over a more popular partial one", () => {
    const history = [
      seen("Amazon Marketplace", "household"),
      seen("Amazon Marketplace", "household"),
      seen("Amazon Marketplace", "household"),
      seen("Amazon", "fun"),
    ];
    expect(suggestCategory(history, "Amazon")).toMatchObject({
      categoryId: "fun",
      basis: "exact",
    });
  });

  it("prefers the category chosen most often, then the most recent", () => {
    const history = [
      seen("Target", "household", "2026-01-01"),
      seen("Target", "household", "2026-01-02"),
      seen("Target", "groceries", "2026-03-01"),
    ];
    expect(suggestCategory(history, "Target")?.categoryId).toBe("household");
    // On an even split the later decision is the better guess.
    const tied = [
      seen("Target", "household", "2026-01-01"),
      seen("Target", "groceries", "2026-03-01"),
    ];
    expect(suggestCategory(tied, "Target")?.categoryId).toBe("groceries");
  });

  it("suggests nothing rather than guessing", () => {
    expect(suggestCategory([], "Shell")).toBeNull();
    expect(suggestCategory([seen("Shell", "fuel")], "Kroger")).toBeNull();
    // A payee that normalises to nothing carries no signal at all.
    expect(suggestCategory([seen("Shell", "fuel")], "")).toBeNull();
    expect(suggestCategory([seen("Shell", "fuel")], "###")).toBeNull();
    expect(suggestCategory([seen("", "fuel")], "Shell")).toBeNull();
  });

  it("reports support so a single sighting is not shown as certainty", () => {
    expect(suggestCategory([seen("Shell", "fuel")], "Shell")?.support).toBe(1);
    expect(
      suggestCategory([seen("Shell", "fuel"), seen("Shell", "fuel")], "Shell")
        ?.support,
    ).toBe(2);
  });

  it("is stable and order independent for any generated history", () => {
    const row = fc.record({
      payee: fc.constantFrom("Shell", "Kroger", "Target", "Amazon"),
      categoryId: fc.constantFrom("fuel", "groceries", "household"),
      day: fc.integer({ min: 1, max: 28 }),
    });
    fc.assert(
      fc.property(
        fc.array(row, { maxLength: 25 }),
        fc.constantFrom("Shell", "Kroger", "Target", "Amazon", "Unknown"),
        (rows, payee) => {
          const history = rows.map((r) =>
            seen(
              r.payee,
              r.categoryId,
              `2026-03-${String(r.day).padStart(2, "0")}`,
            ),
          );
          const forward = suggestCategory(history, payee);
          const reverse = suggestCategory([...history].reverse(), payee);
          // The same history must never produce two different suggestions.
          expect(reverse).toEqual(forward);
          if (forward)
            expect(
              history.some((h) => h.categoryId === forward.categoryId),
            ).toBe(true);
        },
      ),
      { numRuns: 400 },
    );
  });
});
