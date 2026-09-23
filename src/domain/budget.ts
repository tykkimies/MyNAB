import { budgetMonth } from "./dates";
export interface BudgetAccount {
  id: string;
  name: string;
  type: string;
  participation: string;
}
export interface BudgetCategory {
  id: string;
  name: string;
  paymentAccountId: string | null;
}
export interface BudgetTransaction {
  id: string;
  date: string;
  kind: string;
  accountId: string;
  transferAccountId?: string | null;
  amount: bigint;
  splits: { categoryId: string; amount: bigint }[];
}
export interface BudgetInput {
  accounts: BudgetAccount[];
  categories: BudgetCategory[];
  transactions: BudgetTransaction[];
  assignments: {
    id: string;
    month: string;
    categoryId: string;
    amount: bigint;
  }[];
}
export const positive = (n: bigint) => (n > 0n ? n : 0n);
const min = (a: bigint, b: bigint) => (a < b ? a : b);
export const isCard = (a: BudgetAccount) =>
  a.type === "CREDIT_CARD" || a.type === "LINE_OF_CREDIT";
export function nextMonth(month: string, delta = 1) {
  budgetMonth(month);
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + m - 1 + delta;
  return `${Math.floor(index / 12)
    .toString()
    .padStart(4, "0")}-${((index % 12) + 1).toString().padStart(2, "0")}`;
}
/** Pure replay. Input contains only active transactions, never their reversing journals. */
export function projectBudget(input: BudgetInput, target: string) {
  budgetMonth(target);
  const accounts = new Map(input.accounts.map((a) => [a.id, a]));
  const balances = new Map(input.accounts.map((a) => [a.id, 0n]));
  const available = new Map(input.categories.map((c) => [c.id, 0n]));
  const transactions = [...input.transactions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  const earliest = [
    ...transactions.map((t) => t.date.slice(0, 7)),
    ...input.assignments.map((a) => a.month),
    target,
  ].sort()[0];
  if (earliest < "1900-01" || target > "2200-12")
    throw new Error("Projection date outside supported range");
  let result!: ReturnType<typeof snapshot>;
  function snapshot(
    month: string,
    rows: {
      id: string;
      name: string;
      paymentAccountId: string | null;
      carry: bigint;
      assigned: bigint;
      activity: bigint;
      available: bigint;
      cashDeficit: bigint;
      creditDeficit: bigint;
    }[],
    releasedReserves: bigint,
  ) {
    let cash = 0n,
      cardAssets = 0n;
    for (const a of input.accounts)
      if (a.participation === "BUDGET") {
        const b = balances.get(a.id)!;
        if (isCard(a)) cardAssets += positive(b);
        else cash += b;
      }
    const resources = cash + cardAssets;
    const funded = rows.reduce((n, c) => n + positive(c.available), 0n);
    const cashDeficit = rows.reduce((n, c) => n + c.cashDeficit, 0n);
    const creditDeficit = rows.reduce((n, c) => n + c.creditDeficit, 0n);
    const future = new Map<string, bigint>();
    for (const a of input.assignments)
      if (a.month > month) {
        const key = `${a.month}/${a.categoryId}`;
        future.set(key, (future.get(key) ?? 0n) + a.amount);
      }
    const futureReservations = [...future.values()].reduce(
      (n, v) => n + positive(v),
      0n,
    );
    return {
      month,
      categories: rows,
      accounts: input.accounts.map((a) => ({
        ...a,
        balance: balances.get(a.id)!,
      })),
      cash,
      cardAssets,
      resources,
      funded,
      cashDeficit,
      creditDeficit,
      futureReservations,
      releasedReserves,
      readyToAssign: resources - funded + cashDeficit - futureReservations,
    };
  }
  for (let month = earliest; month <= target; month = nextMonth(month)) {
    const rows = input.categories.map((c) => {
      const carry = positive(available.get(c.id)!);
      const assigned = input.assignments
        .filter((a) => a.month === month && a.categoryId === c.id)
        .reduce((n, a) => n + a.amount, 0n);
      return {
        ...c,
        carry,
        assigned,
        activity: 0n,
        available: carry + assigned,
        cashDeficit: 0n,
        creditDeficit: 0n,
      };
    });
    const byId = new Map(rows.map((c) => [c.id, c]));
    const payment = new Map(
      rows
        .filter((c) => c.paymentAccountId)
        .map((c) => [c.paymentAccountId!, c]),
    );
    const debts = new Map<
      string,
      Map<string, { amount: bigint; order: string }>
    >();
    const shifts: { from: string; to: string; amount: bigint }[] = [];
    for (const t of transactions.filter((t) => t.date.slice(0, 7) === month)) {
      const a = accounts.get(t.accountId);
      if (!a) throw new Error("Unknown account");
      const before = balances.get(a.id)!;
      const other = t.transferAccountId
        ? accounts.get(t.transferAccountId)
        : undefined;
      const otherBefore = other ? balances.get(other.id)! : 0n;
      balances.set(a.id, before + t.amount);
      if (other) balances.set(other.id, otherBefore - t.amount);
      const legs = [
        { account: a, amount: t.amount, before },
        ...(other
          ? [{ account: other, amount: -t.amount, before: otherBefore }]
          : []),
      ];
      if (
        other &&
        a.participation === "BUDGET" &&
        other.participation === "BUDGET"
      ) {
        const out = legs.find((l) => l.amount < 0n)!,
          into = legs.find((l) => l.amount > 0n)!;
        if (isCard(into.account)) {
          const repaid = min(into.amount, positive(-into.before));
          if (isCard(out.account))
            shifts.push({
              from: into.account.id,
              to: out.account.id,
              amount: min(repaid, positive(-out.amount - positive(out.before))),
            });
          else {
            const r = payment.get(into.account.id);
            if (r) r.available -= repaid;
          }
        }
        continue;
      }
      const leg = legs.find((l) => l.account.participation === "BUDGET");
      if (!leg || !t.splits.length) continue;
      let assetRemaining = isCard(leg.account)
        ? leg.amount < 0n
          ? min(-leg.amount, positive(leg.before))
          : positive(leg.amount - positive(-leg.before))
        : leg.amount < 0n
          ? -leg.amount
          : leg.amount;
      for (const split of t.splits) {
        const c = byId.get(split.categoryId);
        if (!c || c.paymentAccountId)
          throw new Error("Invalid spending category");
        const abs = split.amount < 0n ? -split.amount : split.amount;
        const asset = min(assetRemaining, abs) * (split.amount < 0n ? -1n : 1n);
        assetRemaining -= asset < 0n ? -asset : asset;
        c.available += asset;
        c.activity += split.amount;
        const debt = split.amount - asset;
        if (debt) {
          const map = debts.get(c.id) ?? new Map();
          const old = map.get(leg.account.id);
          map.set(leg.account.id, {
            amount: (old?.amount ?? 0n) + debt,
            order: old?.order ?? `${t.date}/${t.id}`,
          });
          debts.set(c.id, map);
        }
      }
    }
    for (const c of rows.filter((c) => !c.paymentAccountId)) {
      const activity = [...(debts.get(c.id)?.entries() ?? [])].sort(
        (a, b) =>
          a[1].order.localeCompare(b[1].order) || a[0].localeCompare(b[0]),
      );
      for (const [id, d] of activity)
        if (d.amount > 0n) {
          c.available += d.amount;
          const r = payment.get(id);
          if (r) r.available -= d.amount;
        }
      c.cashDeficit = positive(-c.available);
      let funding = positive(c.available);
      for (const [id, d] of activity)
        if (d.amount < 0n) {
          const funded = min(funding, -d.amount);
          funding -= funded;
          c.available += d.amount;
          c.creditDeficit += -d.amount - funded;
          const r = payment.get(id);
          if (r) r.available += funded;
        }
    }
    for (const shift of shifts) {
      const from = payment.get(shift.from),
        to = payment.get(shift.to);
      if (from && to) {
        const moved = min(positive(from.available), shift.amount);
        from.available -= moved;
        to.available += moved;
      }
    }
    let released = 0n;
    for (const [id, c] of payment) {
      const cap = positive(-balances.get(id)!);
      const excess = positive(c.available - cap);
      released += excess;
      c.available -= excess;
      c.activity = c.available - c.carry - c.assigned;
      c.cashDeficit = positive(-c.available);
    }
    for (const c of rows) available.set(c.id, c.available);
    result = snapshot(month, rows, released);
  }
  return result;
}
