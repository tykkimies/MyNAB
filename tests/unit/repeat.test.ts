import { describe, expect, it } from "vitest";
import { repeatChoice } from "@/domain/repeat";

describe("repeatChoice", () => {
  it("maps every other week to a weekly interval of 2", () => {
    expect(repeatChoice("BIWEEKLY")).toEqual({
      id: "BIWEEKLY",
      label: "Every other week",
      cadence: "WEEKLY",
      interval: 2,
    });
  });
  it("maps the other repeats onto stored cadences", () => {
    expect(repeatChoice("MONTHLY")?.cadence).toBe("MONTHLY");
    expect(repeatChoice("QUARTERLY")).toMatchObject({
      cadence: "MONTHLY",
      interval: 3,
    });
    expect(repeatChoice("YEARLY")?.cadence).toBe("YEARLY");
    expect(repeatChoice("NEVER")?.cadence).toBeNull();
  });
  it("does not invent a choice", () => {
    expect(repeatChoice("NOPE")).toBeNull();
  });
});
