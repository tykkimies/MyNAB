import { describe, expect, it } from "vitest";
import { setupSteps } from "../../src/domain/setup";

const empty = { categories: 0, accounts: 0, transactions: 0, targets: 0, assignments: 0, readyToAssign: 0n };
const done = (facts: typeof empty) =>
  setupSteps(facts).filter((s) => s.done).map((s) => s.step);

describe("getting-started checklist", () => {
  it("starts with nothing done, even though Ready to Assign is zero", () => {
    expect(done(empty)).toEqual([]);
  });
  it("counts assigning only once every dollar has a job", () => {
    const facts = { ...empty, categories: 3, accounts: 1, assignments: 2, readyToAssign: 1n };
    expect(done(facts)).toEqual(["categories", "accounts"]);
    expect(done({ ...facts, readyToAssign: 0n })).toEqual(["categories", "accounts", "assign"]);
    // Over-assigning is not finished either: Ready to Assign must be exactly zero.
    expect(done({ ...facts, readyToAssign: -5n })).toEqual(["categories", "accounts"]);
  });
  it("completes with a target and a recorded transaction", () => {
    const all = { categories: 1, accounts: 1, transactions: 1, targets: 1, assignments: 1, readyToAssign: 0n };
    expect(setupSteps(all).every((s) => s.done)).toBe(true);
  });
});
