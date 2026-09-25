/**
 * Money Moves: a readable history of how plan money moved between Ready to
 * Assign and categories. Derived from the append-only assignment rows; it
 * never changes a projection.
 */
export type MoveKind = "ASSIGN" | "MOVE" | "TARGET_FUND" | "AUTO_ASSIGN" | "UNDO";

export interface AssignmentRow {
  id: string;
  categoryId: string;
  month: string;
  amount: bigint;
  moveId: string | null;
  origin: string | null;
  actorId: string | null;
  createdAt: Date;
  /** For an undo: the move it reverses. */
  undoOf?: string | null;
}

export interface MoneyMove {
  id: string;
  month: string;
  kind: MoveKind;
  /** The Auto-Assign mode, when kind is AUTO_ASSIGN. */
  mode: string | null;
  actorId: string | null;
  createdAt: Date;
  /** Money taken out of categories (amounts are positive). */
  from: { categoryId: string; amount: bigint }[];
  /** Money put into categories (amounts are positive). */
  to: { categoryId: string; amount: bigint }[];
  /**
   * Net effect on Ready to Assign: negative when the move assigned money,
   * positive when it returned money, zero for category-to-category moves.
   */
  readyToAssign: bigint;
  /** The move this one reverses, when it is an undo. */
  undoOf: string | null;
  /** True once a later undo has reversed this move. */
  undone: boolean;
}

function kindOf(row: AssignmentRow): { kind: MoveKind; mode: string | null } {
  if (row.origin?.startsWith("AUTO_ASSIGN:"))
    return { kind: "AUTO_ASSIGN", mode: row.origin.slice(12) };
  if (
    row.origin === "TARGET_FUND" ||
    row.origin === "MOVE" ||
    row.origin === "ASSIGN" ||
    row.origin === "UNDO"
  )
    return { kind: row.origin, mode: null };
  // Rows written before origins were recorded: a shared moveId was only ever
  // used by a category-to-category move.
  return { kind: row.moveId ? "MOVE" : "ASSIGN", mode: null };
}

/** Newest first; optionally only moves in one month or touching one category. */
export function moneyMoves(
  rows: readonly AssignmentRow[],
  filter: { month?: string; categoryId?: string } = {},
): MoneyMove[] {
  const undone = new Set(
    rows.flatMap((row) => (row.undoOf ? [row.undoOf] : [])),
  );
  const groups = new Map<string, AssignmentRow[]>();
  for (const row of rows) {
    if (filter.month && row.month !== filter.month) continue;
    const key = row.moveId ?? row.id;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const moves: MoneyMove[] = [];
  for (const [id, list] of groups) {
    if (
      filter.categoryId &&
      !list.some((row) => row.categoryId === filter.categoryId)
    )
      continue;
    const first = list[0];
    const { kind, mode } = kindOf(first);
    const net = new Map<string, bigint>();
    for (const row of list)
      net.set(row.categoryId, (net.get(row.categoryId) ?? 0n) + row.amount);
    const from: MoneyMove["from"] = [];
    const to: MoneyMove["to"] = [];
    let total = 0n;
    for (const [categoryId, amount] of net) {
      total += amount;
      if (amount < 0n) from.push({ categoryId, amount: -amount });
      else if (amount > 0n) to.push({ categoryId, amount });
    }
    moves.push({
      id,
      month: first.month,
      kind,
      mode,
      actorId: first.actorId,
      createdAt: list.reduce(
        (latest, row) => (row.createdAt > latest ? row.createdAt : latest),
        first.createdAt,
      ),
      from,
      to,
      readyToAssign: -total,
      undoOf: first.undoOf ?? null,
      undone: undone.has(id),
    });
  }
  return moves.sort(
    (a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
  );
}
