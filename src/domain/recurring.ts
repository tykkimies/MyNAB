import { financialDate } from "./dates";
import { occurrences, type Recurrence } from "./schedules";
export interface RecurringRecord {
  id: string;
  accountId: string;
  payee: string;
  date: string;
  amount: bigint;
  kind:
    | "INCOME"
    | "EXPENSE"
    | "TRANSFER"
    | "REFUND"
    | "CREDIT"
    | "ADJUSTMENT"
    | "OPENING";
  voided?: boolean;
}
export interface RecurringSuggestion {
  key: string;
  accountId: string;
  payee: string;
  amount: bigint;
  cadence: Recurrence["cadence"];
  interval: number;
  nextDate: string;
  transactionIds: string[];
  confidence: "EXACT" | "APPROXIMATE";
}
const options: Pick<Recurrence, "cadence" | "interval">[] = [
  { cadence: "WEEKLY", interval: 1 },
  { cadence: "WEEKLY", interval: 2 },
  { cadence: "MONTHLY", interval: 1 },
  { cadence: "MONTHLY", interval: 3 },
  { cadence: "MONTHLY", interval: 6 },
  { cadence: "YEARLY", interval: 1 },
];
/** Conservative suggestions: at least three records, same account/payee/direction,
 * dates within two days of one anchored cadence, amounts within 20% of the median.
 * All evidence is returned; no suggestion is an authorization to create anything.
 */
export function detectRecurring(
  records: RecurringRecord[],
): RecurringSuggestion[] {
  const groups = new Map<string, RecurringRecord[]>();
  const ids = new Set<string>();
  for (const row of records) {
    financialDate(row.date);
    if (ids.has(row.id)) throw new Error("Duplicate transaction identity");
    ids.add(row.id);
    if (
      row.voided ||
      !["INCOME", "EXPENSE"].includes(row.kind) ||
      row.amount === 0n
    )
      continue;
    const payee = row.payee.normalize("NFKC").trim().toLowerCase();
    if (!payee) continue;
    const key = JSON.stringify([
      row.accountId,
      payee,
      row.kind,
      row.amount > 0n,
    ]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const suggestions: RecurringSuggestion[] = [];
  for (const [key, group] of groups) {
    if (group.length < 3 || group.length > 1000) continue;
    const sorted = [...group].sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    );
    const amounts = sorted
      .map((r) => (r.amount < 0n ? -r.amount : r.amount))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const median = amounts[Math.floor(amounts.length / 2)];
    if (
      amounts.some(
        (a) => (a > median ? a - median : median - a) * 100n > median * 20n,
      )
    )
      continue;
    const first = sorted[0],
      last = sorted.at(-1)!;
    const through = new Date(`${last.date}T00:00:00Z`);
    through.setUTCFullYear(through.getUTCFullYear() + 2);
    if (through.getUTCFullYear() > 9999) continue;
    for (const option of options) {
      let planned;
      try {
        planned = occurrences(
          { id: key, startDate: first.date, timezone: "UTC", ...option },
          first.date,
          through.toISOString().slice(0, 10),
        );
      } catch {
        continue;
      }
      if (planned.length <= sorted.length) continue;
      const offsets = sorted.map(
        (r, i) =>
          Math.abs(
            new Date(r.date).getTime() - new Date(planned[i].date).getTime(),
          ) / 86400000,
      );
      if (offsets.some((d) => d > 2)) continue;
      suggestions.push({
        key,
        accountId: first.accountId,
        payee: last.payee,
        // The latest amount, as a new schedule should expect: a loan or
        // subscription that changed keeps its new amount. The median only
        // decides whether the amounts are alike enough to be one pattern.
        amount: last.amount,
        ...option,
        interval: option.interval!,
        nextDate: planned[sorted.length].date,
        transactionIds: sorted.map((r) => r.id),
        confidence:
          offsets.every((d) => d === 0) && amounts.every((a) => a === median)
            ? "EXACT"
            : "APPROXIMATE",
      });
      break;
    }
  }
  return suggestions.sort(
    (a, b) =>
      a.nextDate.localeCompare(b.nextDate) || a.key.localeCompare(b.key),
  );
}
