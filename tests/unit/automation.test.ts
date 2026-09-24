import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  previewRules,
  type AutomationRule,
  type RuleInput,
} from "@/domain/rules";
import { detectRecurring, type RecurringRecord } from "@/domain/recurring";
const input: RuleInput = {
  accountId: "cash",
  amount: -2500n,
  description: "CARD utility",
  payee: "Utility",
  memo: "",
  tags: [],
  locked: [],
};
const rule = (
  id: string,
  priority: number,
  actions: AutomationRule["actions"],
): AutomationRule => ({
  id,
  name: id,
  priority,
  enabled: true,
  match: { payee: { mode: "EXACT", value: "utility" } },
  actions,
});
describe("deterministic rule previews", () => {
  it("orders each field by priority then identity and explains overridden/locked fields", () => {
    const result = previewRules({ ...input, locked: ["memo"] }, [
      rule("b", 1, { payee: "B", memo: "No" }),
      rule("a", 1, { payee: "A", categoryId: "bills" }),
    ]);
    expect(result.output.payee).toBe("A");
    expect(result.output.memo).toBe("");
    expect(result.explanation[1].superseded).toEqual(["payee"]);
    expect(result.explanation[1].locked).toEqual(["memo"]);
  });
  it("matches original values without cascading renames and only suggests a transfer", () => {
    const second = {
      ...rule("b", 2, { memo: "bad" }),
      match: { payee: { mode: "EXACT" as const, value: "Renamed" } },
    };
    const result = previewRules(input, [
      rule("a", 1, { payee: "Renamed", transferAccountId: "savings" }),
      second,
    ]);
    expect(result.output.memo).toBe("");
    expect(result.transferIsSuggestion).toBe(true);
    expect(input.payee).toBe("Utility");
  });
  it("matches exact bigint boundaries, account and description", () => {
    const amount = 9007199254740993n;
    const r = {
      ...rule("x", 1, { categoryId: "bills" }),
      match: {
        minimum: amount,
        maximum: amount,
        accountId: "cash",
        description: "utility",
      },
    };
    expect(previewRules({ ...input, amount }, [r]).output.categoryId).toBe(
      "bills",
    );
    expect(
      previewRules({ ...input, amount: amount - 1n }, [r]).output.categoryId,
    ).toBeUndefined();
  });
  it("is independent of input rule order", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 100 }), { minLength: 1 }),
        (ids) => {
          const rules = ids.map((id) =>
            rule(String(id), id % 5, { payee: String(id) }),
          );
          expect(previewRules(input, rules)).toEqual(
            previewRules(input, [...rules].reverse()),
          );
        },
      ),
    );
  });
  it("rejects duplicate identities and reversed ranges", () => {
    expect(() =>
      previewRules(input, [rule("x", 1, {}), rule("x", 2, {})]),
    ).toThrow();
    expect(() =>
      previewRules(input, [
        { ...rule("x", 1, {}), match: { minimum: 2n, maximum: 1n } },
      ]),
    ).toThrow();
  });
});
const records = (dates: string[], amounts: bigint[] = []): RecurringRecord[] =>
  dates.map((date, i) => ({
    id: String(i),
    date,
    accountId: "cash",
    payee: "Bill",
    kind: "EXPENSE",
    amount: amounts[i] ?? -2500n,
  }));
describe("recurring suggestions", () => {
  it("recognizes anchored month ends and returns evidence", () => {
    const result = detectRecurring(
      records(["2026-01-31", "2026-02-28", "2026-03-31"]),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      cadence: "MONTHLY",
      interval: 1,
      nextDate: "2026-04-30",
      confidence: "EXACT",
      transactionIds: ["0", "1", "2"],
    });
  });
  it("permits small posting shifts and variable utility amounts but labels uncertainty", () => {
    const result = detectRecurring(
      records(
        ["2026-01-15", "2026-02-16", "2026-03-14"],
        [-2500n, -2600n, -2400n],
      ),
    );
    expect(result[0].confidence).toBe("APPROXIMATE");
    expect(result[0].amount).toBe(-2500n);
  });
  it("does not infer schedules from transfers, voids, insufficient or irregular history", () => {
    expect(detectRecurring(records(["2026-01-01", "2026-02-01"]))).toEqual([]);
    expect(
      detectRecurring(records(["2026-01-01", "2026-02-10", "2026-04-20"])),
    ).toEqual([]);
    expect(
      detectRecurring(
        records(["2026-01-01", "2026-02-01", "2026-03-01"]).map((r) => ({
          ...r,
          kind: "TRANSFER",
        })),
      ),
    ).toEqual([]);
    expect(
      detectRecurring(
        records(["2026-01-01", "2026-02-01", "2026-03-01"]).map((r) => ({
          ...r,
          voided: true,
        })),
      ),
    ).toEqual([]);
  });
});
