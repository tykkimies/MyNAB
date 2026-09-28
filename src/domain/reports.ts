/**
 * Report semantics, per PROJECT_SPEC section 11. One pure layer answers every
 * report and every comparison, so two reports can never disagree about what a
 * number means.
 *
 * Classes of movement, over active (unvoided) transactions only:
 * - Consumption: expenses less refunds. On a budget account it is read from
 *   the category splits; on a tracking account (a loan's interest, say) it is
 *   reported as off-budget spending for that account.
 * - Earned income: INCOME. Card statement credits (CREDIT) are shown apart.
 * - Internal: a transfer between two budget accounts, including a card
 *   payment. It moves money without earning or spending any, so it is excluded.
 * - Financing: a transfer between a budget account and a tracking account,
 *   such as loan principal or an investment contribution.
 * - Adjustments: reconciliation differences and valuations. Never income.
 * - Opening balances only ever appear in balances.
 *
 * Amounts are integer cents. Spending is reported as a positive number.
 *
 * Domain module: no persistence, framework or provider imports.
 */
import { financialDate } from "./dates";
import { isCard, nextMonth } from "./budget";

export interface ReportAccount {
  id: string;
  name: string;
  type: string;
  participation: string;
}
export interface ReportCategory {
  id: string;
  name: string;
  groupId?: string;
  /** Set on a card's payment category, which is never spending. */
  paymentAccountId?: string | null;
  system?: boolean;
  sortOrder?: number;
}
export interface ReportGroup {
  id: string;
  name: string;
}
export interface ReportTransaction {
  id: string;
  date: string;
  kind: string;
  accountId: string;
  transferAccountId?: string | null;
  amount: bigint;
  payee: string;
  splits: { categoryId: string; amount: bigint }[];
}
export interface ReportInput {
  accounts: ReportAccount[];
  categories: ReportCategory[];
  groups?: ReportGroup[];
  transactions: ReportTransaction[];
}
/**
 * Narrows a report the way YNAB's Reflect filters do. Accounts narrow every
 * line; categories narrow spending only (income has no category), and
 * off-budget spending, which has no category, drops out under a category
 * filter.
 */
export interface ReportFilter {
  accountIds?: ReadonlySet<string>;
  categoryIds?: ReadonlySet<string>;
}
export function filtered(lines: ReportLine[], filter?: ReportFilter) {
  if (!filter?.accountIds && !filter?.categoryIds) return lines;
  return lines.filter(
    (l) =>
      (!filter.accountIds || filter.accountIds.has(l.accountId)) &&
      (!filter.categoryIds ||
        l.flow !== "consumption" ||
        filter.categoryIds.has(l.key)),
  );
}
/** Inclusive calendar dates. */
export interface Period {
  from: string;
  through: string;
}

const LIABILITY_TYPES = new Set([
  "CREDIT_CARD",
  "LINE_OF_CREDIT",
  "LOAN",
  "MORTGAGE",
  "OTHER_LIABILITY",
]);
export const isLiability = (a: ReportAccount) =>
  LIABILITY_TYPES.has(a.type) || isCard(a);

export type Flow =
  | "income"
  | "credits"
  | "consumption"
  | "financing"
  | "adjustments"
  | "opening";

/** One contribution to a report line, for drilldown. */
export interface ReportLine {
  transactionId: string;
  date: string;
  payee: string;
  accountId: string;
  flow: Flow;
  /** Category for budget spending, or the account for off-budget spending. */
  key: string;
  /** Signed as it affects the report: spending positive, a refund negative. */
  amount: bigint;
}

export interface Flows {
  income: bigint;
  credits: bigint;
  /** Budget and off-budget spending together, net of refunds. */
  consumption: bigint;
  offBudgetConsumption: bigint;
  /** Net money moved from budget accounts into tracking accounts. */
  financing: bigint;
  /** Net effect of adjustments on budget accounts. */
  adjustments: bigint;
  /** Opening balances of budget accounts opened within the period. */
  openings: bigint;
  /** The parts of income and credits that landed in budget accounts. */
  budgetIncome: bigint;
  budgetCredits: bigint;
  /** Change in budget account balances; equals the components below. */
  budgetChange: bigint;
  /** (income - consumption) / income, or null when there is no income. */
  savingsRate: number | null;
  byCategory: { key: string; name: string; amount: bigint; count: number }[];
  /** Spending by category group; off-budget spending forms its own row. */
  byGroup: { key: string; name: string; amount: bigint; count: number }[];
  byPayee: { payee: string; amount: bigint; count: number }[];
  lines: ReportLine[];
}

function checkPeriod(period: Period) {
  financialDate(period.from);
  financialDate(period.through);
  if (period.from > period.through) throw new Error("Invalid report period");
}

/** Classify every movement in the period. Pure and order independent. */
export function reportLines(input: ReportInput, period: Period): ReportLine[] {
  checkPeriod(period);
  const accounts = new Map(input.accounts.map((a) => [a.id, a]));
  const lines: ReportLine[] = [];
  for (const t of input.transactions) {
    if (t.date < period.from || t.date > period.through) continue;
    const account = accounts.get(t.accountId);
    if (!account) throw new Error("Unknown account");
    const budget = account.participation === "BUDGET";
    const base = {
      transactionId: t.id,
      date: t.date,
      payee: t.payee,
      accountId: t.accountId,
    };
    if (t.kind === "EXPENSE" || t.kind === "REFUND") {
      if (budget && t.splits.length)
        for (const s of t.splits)
          lines.push({
            ...base,
            flow: "consumption",
            key: s.categoryId,
            amount: -s.amount,
          });
      else
        lines.push({
          ...base,
          flow: "consumption",
          key: `account:${t.accountId}`,
          amount: -t.amount,
        });
    } else if (t.kind === "INCOME") {
      lines.push({ ...base, flow: "income", key: "income", amount: t.amount });
    } else if (t.kind === "CREDIT") {
      lines.push({
        ...base,
        flow: "credits",
        key: "credits",
        amount: t.amount,
      });
    } else if (t.kind === "TRANSFER") {
      const other = t.transferAccountId
        ? accounts.get(t.transferAccountId)
        : undefined;
      if (!other) throw new Error("Unknown transfer account");
      const otherBudget = other.participation === "BUDGET";
      // Internal transfers change nothing earned or spent.
      if (budget === otherBudget) continue;
      // Positive: money left the budget for a tracking account.
      const out = budget ? -t.amount : t.amount;
      lines.push({ ...base, flow: "financing", key: "financing", amount: out });
    } else if (t.kind === "OPENING" && budget) {
      // Only so cash flow reconciles when an account opens mid-period.
      lines.push({
        ...base,
        flow: "opening",
        key: "opening",
        amount: t.amount,
      });
    } else if (t.kind === "ADJUSTMENT" && budget) {
      lines.push({
        ...base,
        flow: "adjustments",
        key: "adjustments",
        amount: t.amount,
      });
    }
  }
  return lines.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.transactionId.localeCompare(b.transactionId) ||
      a.key.localeCompare(b.key),
  );
}

export function flows(
  input: ReportInput,
  period: Period,
  filter?: ReportFilter,
): Flows {
  const lines = filtered(reportLines(input, period), filter);
  const accounts = new Map(input.accounts.map((a) => [a.id, a]));
  const names = new Map(input.categories.map((c) => [c.id, c.name]));
  const sum = (flow: Flow, where: (l: ReportLine) => boolean = () => true) =>
    lines
      .filter((l) => l.flow === flow && where(l))
      .reduce((n, l) => n + l.amount, 0n);
  const offBudget = (l: ReportLine) => l.key.startsWith("account:");
  const income = sum("income");
  const credits = sum("credits");
  const consumption = sum("consumption");
  const offBudgetConsumption = sum("consumption", offBudget);
  const onBudget = (l: ReportLine) =>
    accounts.get(l.accountId)!.participation === "BUDGET";
  const budgetIncome = sum("income", onBudget);
  const budgetCredits = sum("credits", onBudget);
  const openings = sum("opening");
  const financing = sum("financing");
  const adjustments = sum("adjustments");

  const categories = new Map<
    string,
    { amount: bigint; transactions: Set<string> }
  >();
  const payees = new Map<
    string,
    { payee: string; amount: bigint; transactions: Set<string> }
  >();
  const groupOf = new Map(input.categories.map((c) => [c.id, c.groupId]));
  const groupNames = new Map((input.groups ?? []).map((g) => [g.id, g.name]));
  const groups = new Map<
    string,
    { amount: bigint; transactions: Set<string> }
  >();
  for (const l of lines) {
    if (l.flow !== "consumption") continue;
    const groupKey = l.key.startsWith("account:")
      ? "off-budget"
      : (groupOf.get(l.key) ?? "ungrouped");
    const g = groups.get(groupKey) ?? {
      amount: 0n,
      transactions: new Set<string>(),
    };
    g.amount += l.amount;
    g.transactions.add(l.transactionId);
    groups.set(groupKey, g);
    const c = categories.get(l.key) ?? {
      amount: 0n,
      transactions: new Set<string>(),
    };
    c.amount += l.amount;
    c.transactions.add(l.transactionId);
    categories.set(l.key, c);
    const payeeKey = l.payee.trim().toLowerCase() || "(no payee)";
    const p = payees.get(payeeKey) ?? {
      payee: l.payee.trim() || "(no payee)",
      amount: 0n,
      transactions: new Set<string>(),
    };
    p.amount += l.amount;
    p.transactions.add(l.transactionId);
    payees.set(payeeKey, p);
  }
  const byAmount = <T extends { amount: bigint }>(
    a: T & { name?: string; payee?: string },
    b: T & { name?: string; payee?: string },
  ) =>
    b.amount > a.amount
      ? 1
      : b.amount < a.amount
        ? -1
        : (a.name ?? a.payee ?? "").localeCompare(b.name ?? b.payee ?? "");

  return {
    income,
    credits,
    consumption,
    offBudgetConsumption,
    financing,
    adjustments,
    openings,
    budgetIncome,
    budgetCredits,
    // Every budget-account movement in the period, by class. Off-budget
    // spending and income never touch a budget account.
    budgetChange:
      budgetIncome +
      budgetCredits -
      (consumption - offBudgetConsumption) -
      financing +
      adjustments +
      openings,
    savingsRate:
      income > 0n
        ? Number(((income - consumption) * 10000n) / income) / 10000
        : null,
    byCategory: [...categories.entries()]
      .map(([key, c]) => ({
        key,
        name: key.startsWith("account:")
          ? `Off-budget: ${accounts.get(key.slice(8))?.name ?? "account"}`
          : (names.get(key) ?? "Unknown category"),
        amount: c.amount,
        count: c.transactions.size,
      }))
      .sort(byAmount),
    byGroup: [...groups.entries()]
      .map(([key, g]) => ({
        key,
        name:
          key === "off-budget"
            ? "Off-budget spending"
            : (groupNames.get(key) ?? "Other"),
        amount: g.amount,
        count: g.transactions.size,
      }))
      .sort(byAmount),
    byPayee: [...payees.values()]
      .map((p) => ({
        payee: p.payee,
        amount: p.amount,
        count: p.transactions.size,
      }))
      .sort(byAmount),
    lines,
  };
}

/** The last day of a month, as a date. */
export function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Income and spending for each month in an inclusive month range. */
export function monthlyFlows(
  input: ReportInput,
  from: string,
  through: string,
  filter?: ReportFilter,
) {
  const rows: {
    month: string;
    income: bigint;
    consumption: bigint;
    net: bigint;
  }[] = [];
  for (let month = from; month <= through; month = nextMonth(month)) {
    const f = flows(
      input,
      { from: `${month}-01`, through: monthEnd(month) },
      filter,
    );
    rows.push({
      month,
      income: f.income + f.credits,
      consumption: f.consumption,
      net: f.income + f.credits - f.consumption,
    });
    if (rows.length > 240) throw new Error("Choose at most 20 years");
  }
  return rows;
}

/** Every account's balance at the end of a date, including opening balances. */
export function balancesAt(input: ReportInput, date: string) {
  financialDate(date);
  const balances = new Map(input.accounts.map((a) => [a.id, 0n]));
  for (const t of input.transactions) {
    if (t.date > date) continue;
    balances.set(t.accountId, (balances.get(t.accountId) ?? 0n) + t.amount);
    if (t.transferAccountId)
      balances.set(
        t.transferAccountId,
        (balances.get(t.transferAccountId) ?? 0n) - t.amount,
      );
  }
  return balances;
}

/** Net worth at each month end. Internal transfers cancel by construction. */
export function netWorthSeries(
  input: ReportInput,
  from: string,
  through: string,
  accountIds?: ReadonlySet<string>,
) {
  const rows: {
    month: string;
    assets: bigint;
    liabilities: bigint;
    net: bigint;
  }[] = [];
  for (let month = from; month <= through; month = nextMonth(month)) {
    const balances = balancesAt(input, monthEnd(month));
    let assets = 0n,
      liabilities = 0n;
    for (const a of input.accounts) {
      if (accountIds && !accountIds.has(a.id)) continue;
      const b = balances.get(a.id)!;
      // A card in credit is an asset; an overdrawn account is a liability.
      if (b >= 0n) assets += b;
      else liabilities += -b;
    }
    rows.push({ month, assets, liabilities, net: assets - liabilities });
    if (rows.length > 240) throw new Error("Choose at most 20 years");
  }
  return rows;
}

/** The comparison period for a report: the same length immediately before it,
 * or the same dates one year earlier. */
export function comparisonPeriod(
  period: Period,
  mode: "previous" | "year",
): Period {
  checkPeriod(period);
  const shift = (date: string, days: number) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  if (mode === "year") {
    const back = (date: string) => {
      const [y, m, d] = date.split("-").map(Number);
      // 29 February compares with 28 February.
      const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
      return `${String(y - 1).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
    };
    return { from: back(period.from), through: back(period.through) };
  }
  const days =
    (new Date(period.through).getTime() - new Date(period.from).getTime()) /
      86_400_000 +
    1;
  return {
    from: shift(period.from, -days),
    through: shift(period.from, -1),
  };
}

export interface MatrixRow {
  key: string;
  name: string;
  /** One amount per month, in the order of `months`. */
  amounts: bigint[];
  total: bigint;
  /** Total over the number of months, rounded half away from zero. */
  average: bigint;
}
export interface IncomeExpense {
  months: string[];
  income: MatrixRow[];
  incomeTotal: MatrixRow;
  expenses: (MatrixRow & { categories: MatrixRow[] })[];
  expenseTotal: MatrixRow;
  net: MatrixRow;
}

const averageOf = (total: bigint, count: number) => {
  const n = BigInt(count);
  const half = total < 0n ? -n : n;
  return (total * 2n + half) / (2n * n);
};
function row(key: string, name: string, amounts: bigint[]): MatrixRow {
  const total = amounts.reduce((sum, n) => sum + n, 0n);
  return { key, name, amounts, total, average: averageOf(total, amounts.length) };
}
const sumRows = (key: string, name: string, rows: MatrixRow[], width: number) =>
  row(
    key,
    name,
    Array.from({ length: width }, (_, i) =>
      rows.reduce((sum, r) => sum + r.amounts[i], 0n),
    ),
  );
const byTotal = (a: MatrixRow, b: MatrixRow) =>
  b.total > a.total ? 1 : b.total < a.total ? -1 : a.name.localeCompare(b.name);

/**
 * YNAB's Income v Expense: income by payee and spending by group and
 * category, one column per month. Income includes card credits, matching
 * the cash-flow totals; spending is net of refunds.
 */
export function incomeExpense(
  input: ReportInput,
  from: string,
  through: string,
  filter?: ReportFilter,
): IncomeExpense {
  const months: string[] = [];
  for (let m = from; m <= through; m = nextMonth(m)) {
    months.push(m);
    if (months.length > 240) throw new Error("Choose at most 20 years");
  }
  const column = new Map(months.map((m, i) => [m, i]));
  const lines = filtered(
    reportLines(input, { from: `${from}-01`, through: monthEnd(through) }),
    filter,
  );
  const cells = new Map<string, bigint[]>();
  const add = (key: string, month: string, amount: bigint) => {
    const list = cells.get(key) ?? months.map(() => 0n);
    list[column.get(month)!] += amount;
    cells.set(key, list);
  };
  const payeeNames = new Map<string, string>();
  for (const l of lines) {
    const month = l.date.slice(0, 7);
    if (l.flow === "income" || l.flow === "credits") {
      const key = l.payee.trim().toLowerCase() || "(no payee)";
      if (!payeeNames.has(key)) payeeNames.set(key, l.payee.trim() || "(no payee)");
      add(`income:${key}`, month, l.amount);
    } else if (l.flow === "consumption") add(`expense:${l.key}`, month, l.amount);
  }
  const income = [...payeeNames.entries()]
    .map(([key, name]) => row(key, name, cells.get(`income:${key}`)!))
    .sort(byTotal);
  const accounts = new Map(input.accounts.map((a) => [a.id, a.name]));
  const categories = new Map(input.categories.map((c) => [c.id, c]));
  const groupNames = new Map((input.groups ?? []).map((g) => [g.id, g.name]));
  const grouped = new Map<string, MatrixRow[]>();
  for (const [cell, amounts] of cells) {
    if (!cell.startsWith("expense:")) continue;
    const key = cell.slice(8);
    const offBudget = key.startsWith("account:");
    const category = categories.get(key);
    const group = offBudget ? "off-budget" : (category?.groupId ?? "ungrouped");
    const name = offBudget
      ? (accounts.get(key.slice(8)) ?? "Account")
      : (category?.name ?? "Unknown category");
    grouped.set(group, [...(grouped.get(group) ?? []), row(key, name, amounts)]);
  }
  const expenses = [...grouped.entries()]
    .map(([key, list]) => ({
      ...sumRows(
        key,
        key === "off-budget" ? "Off-budget spending" : (groupNames.get(key) ?? "Other"),
        list,
        months.length,
      ),
      categories: list.sort(byTotal),
    }))
    .sort(byTotal);
  const incomeTotal = sumRows("income", "Total income", income, months.length);
  const expenseTotal = sumRows("expenses", "Total expenses", expenses, months.length);
  return {
    months,
    income,
    incomeTotal,
    expenses,
    expenseTotal,
    net: row(
      "net",
      "Net income",
      months.map((_, i) => incomeTotal.amounts[i] - expenseTotal.amounts[i]),
    ),
  };
}

export interface BudgetVsActualRow {
  key: string;
  name: string;
  /** Assigned over the period, net of any money moved back out. */
  assigned: bigint;
  /** Spent over the period, net of refunds. */
  spent: bigint;
  /** Assigned minus spent: positive is money left, negative is overspent. */
  difference: bigint;
}
export interface BudgetVsActual {
  groups: (BudgetVsActualRow & { categories: BudgetVsActualRow[] })[];
  total: BudgetVsActualRow;
}

/**
 * What was assigned to each category over a range of months against what was
 * spent from it. Card payment and system categories are left out: money
 * assigned there pays a card, it is not a plan for spending. Off-budget
 * spending has no category and no assignment, so it is left out too. An
 * account filter narrows spending only, since an assignment has no account.
 * Groups and categories keep the budget's own order.
 */
export function budgetVsActual(
  input: ReportInput,
  assignments: readonly { categoryId: string; month: string; amount: bigint }[],
  from: string,
  through: string,
  filter?: ReportFilter,
): BudgetVsActual {
  const categories = input.categories.filter(
    (c) =>
      !c.paymentAccountId &&
      !c.system &&
      (!filter?.categoryIds || filter.categoryIds.has(c.id)),
  );
  const included = new Set(categories.map((c) => c.id));
  const assigned = new Map<string, bigint>();
  for (const a of assignments)
    if (a.month >= from && a.month <= through && included.has(a.categoryId))
      assigned.set(a.categoryId, (assigned.get(a.categoryId) ?? 0n) + a.amount);
  const spent = new Map<string, bigint>();
  for (const l of filtered(
    reportLines(input, { from: `${from}-01`, through: monthEnd(through) }),
    filter,
  ))
    if (l.flow === "consumption" && included.has(l.key))
      spent.set(l.key, (spent.get(l.key) ?? 0n) + l.amount);
  const row = (key: string, name: string, a: bigint, s: bigint) => ({
    key,
    name,
    assigned: a,
    spent: s,
    difference: a - s,
  });
  const sum = (key: string, name: string, rows: BudgetVsActualRow[]) =>
    row(
      key,
      name,
      rows.reduce((n, r) => n + r.assigned, 0n),
      rows.reduce((n, r) => n + r.spent, 0n),
    );
  const order = (c: ReportCategory) => c.sortOrder ?? 0;
  const groupOrder = new Map((input.groups ?? []).map((g, i) => [g.id, i]));
  const byGroup = new Map<string, BudgetVsActualRow[]>();
  for (const c of [...categories].sort(
    (a, b) => order(a) - order(b) || a.name.localeCompare(b.name),
  )) {
    const a = assigned.get(c.id) ?? 0n;
    const s = spent.get(c.id) ?? 0n;
    if (!a && !s) continue;
    const g = c.groupId ?? "ungrouped";
    byGroup.set(g, [...(byGroup.get(g) ?? []), row(c.id, c.name, a, s)]);
  }
  const groupNames = new Map((input.groups ?? []).map((g) => [g.id, g.name]));
  const groups = [...byGroup.entries()]
    .sort(
      ([a], [b]) =>
        (groupOrder.get(a) ?? 1e9) - (groupOrder.get(b) ?? 1e9),
    )
    .map(([key, rows]) => ({
      ...sum(key, groupNames.get(key) ?? "Other", rows),
      categories: rows,
    }));
  return { groups, total: sum("total", "Total", groups) };
}
