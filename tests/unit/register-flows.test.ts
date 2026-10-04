import { describe, expect, it } from "vitest";
import { registerFlows } from "@/domain/money";

describe("registerFlows", () => {
  it("puts a negative amount in Outflow, without the minus", () => {
    expect(registerFlows(-1234n)).toEqual({ outflow: 1234n, inflow: null });
  });
  it("puts a positive amount in Inflow", () => {
    expect(registerFlows(500n)).toEqual({ outflow: null, inflow: 500n });
  });
  it("rejects zero, which the ledger never stores", () => {
    expect(() => registerFlows(0n)).toThrow("zero");
  });
});
