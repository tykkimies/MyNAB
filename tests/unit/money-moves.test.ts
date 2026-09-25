import { describe, expect, it } from "vitest";
import { moneyMoves, type AssignmentRow } from "../../src/domain/money-moves";

let clock = 0;
const row = (values: Partial<AssignmentRow>): AssignmentRow => ({
  id: `row-${++clock}`,
  categoryId: "food",
  month: "2026-01",
  amount: 0n,
  moveId: null,
  origin: null,
  actorId: "owner",
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, clock)),
  ...values,
});

describe("money moves", () => {
  const rows = [
    row({ id: "assign", categoryId: "food", amount: 40000n, origin: "ASSIGN" }),
    row({ categoryId: "food", amount: -2500n, moveId: "move", origin: "MOVE" }),
    row({ categoryId: "fun", amount: 2500n, moveId: "move", origin: "MOVE" }),
    row({ categoryId: "rent", amount: 100000n, moveId: "auto", origin: "AUTO_ASSIGN:LAST_ASSIGNED" }),
    row({ categoryId: "fun", amount: -1000n, moveId: "auto", origin: "AUTO_ASSIGN:LAST_ASSIGNED" }),
    row({ id: "legacy", categoryId: "fun", amount: -500n, month: "2026-02" }),
    row({ categoryId: "rent", amount: -1n, moveId: "old" }),
    row({ categoryId: "food", amount: 1n, moveId: "old" }),
  ];

  it("groups rows into moves, newest first, with Ready to Assign effect", () => {
    const moves = moneyMoves(rows, { month: "2026-01" });
    expect(moves.map((m) => m.id)).toEqual(["old", "auto", "move", "assign"]);
    const [old, auto, move, assign] = moves;
    expect(assign).toMatchObject({ kind: "ASSIGN", readyToAssign: -40000n, from: [], to: [{ categoryId: "food", amount: 40000n }] });
    expect(move).toMatchObject({ kind: "MOVE", readyToAssign: 0n, from: [{ categoryId: "food", amount: 2500n }], to: [{ categoryId: "fun", amount: 2500n }] });
    expect(auto).toMatchObject({ kind: "AUTO_ASSIGN", mode: "LAST_ASSIGNED", readyToAssign: -99000n });
    // Rows written before origins existed are inferred from their move id.
    expect(old.kind).toBe("MOVE");
  });

  it("filters by category and month without splitting a move", () => {
    const fun = moneyMoves(rows, { categoryId: "fun" });
    expect(fun.map((m) => m.id)).toEqual(["legacy", "auto", "move"]);
    expect(fun[0]).toMatchObject({ kind: "ASSIGN", month: "2026-02", readyToAssign: 500n });
    expect(fun[2].from).toEqual([{ categoryId: "food", amount: 2500n }]);
  });

  it("marks an undone move and shows its reversal", () => {
    const history = [
      ...rows,
      row({ categoryId: "food", amount: 2500n, moveId: "u1", origin: "UNDO", undoOf: "move" }),
      row({ categoryId: "fun", amount: -2500n, moveId: "u1", origin: "UNDO", undoOf: "move" }),
    ];
    const moves = moneyMoves(history, { month: "2026-01" });
    expect(moves[0]).toMatchObject({ id: "u1", kind: "UNDO", undoOf: "move", readyToAssign: 0n });
    expect(moves.find((m) => m.id === "move")?.undone).toBe(true);
    expect(moves.find((m) => m.id === "auto")?.undone).toBe(false);
  });
});
