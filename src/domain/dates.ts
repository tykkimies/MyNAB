export type FinancialDate = string & {
  readonly __financialDate: unique symbol;
};
export type BudgetMonth = string & { readonly __budgetMonth: unique symbol };
export function financialDate(value: string): FinancialDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Invalid calendar date");
  const [y, m, d] = value.split("-").map(Number);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > days[m - 1])
    throw new Error("Invalid calendar date");
  return value as FinancialDate;
}
export function budgetMonth(value: string): BudgetMonth {
  financialDate(`${value}-01`);
  return value as BudgetMonth;
}
export function monthOf(value: FinancialDate): BudgetMonth {
  return budgetMonth(value.slice(0, 7));
}
export function timezone(value: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
  } catch {
    throw new Error("Invalid IANA timezone");
  }
  return value;
}
