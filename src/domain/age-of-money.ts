import { financialDate } from "./dates";
import { isCard, type BudgetInput } from "./budget";

export interface AgeOfMoneySample {
  transactionId: string;
  date: string;
  amount: bigint;
  /** Sum of each cent's age in days, divided by amount for this sample. */
  centDays: bigint;
}

export interface AgeOfMoney {
  days: number | null;
  sampleCount: number;
  samples: AgeOfMoneySample[];
}

const dayNumber = (date: string) => {
  financialDate(date);
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
};

/**
 * First-in-first-out age of actual budget cash. The last ten cash outflow
 * transactions are averaged equally, while each transaction's age is weighted
 * by the cents drawn from each inflow lot. Starting balances seed the pool but
 * never count as outflow samples. Internal cash transfers are ignored; card
 * payments consume cash and count as outflows. No assignments or scenarios
 * enter this calculation.
 */
export function ageOfMoney(
  input: Pick<BudgetInput, "accounts" | "transactions">,
  throughDate: string,
): AgeOfMoney {
  const cutoff = dayNumber(throughDate);
  const accounts = new Map(input.accounts.map((account) => [account.id, account]));
  const cash = (id: string) => {
    const account = accounts.get(id);
    return Boolean(account && account.participation === "BUDGET" && !isCard(account));
  };
  const card = (id: string) => {
    const account = accounts.get(id);
    return Boolean(account && account.participation === "BUDGET" && isCard(account));
  };
  const lots: { date: number; remaining: bigint }[] = [];
  const samples: AgeOfMoneySample[] = [];
  let head = 0;
  const ordered = [...input.transactions]
    .filter((transaction) => dayNumber(transaction.date) <= cutoff)
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.id.localeCompare(right.id),
    );
  for (const transaction of ordered) {
    const sourceCash = cash(transaction.accountId);
    const destinationCash = transaction.transferAccountId
      ? cash(transaction.transferAccountId)
      : false;
    const sourceCard = card(transaction.accountId);
    const destinationCard = transaction.transferAccountId
      ? card(transaction.transferAccountId)
      : false;
    const date = dayNumber(transaction.date);
    const transfer = transaction.kind === "TRANSFER";
    if (transfer && sourceCash && destinationCash) continue;

    // A transfer's second leg is the negation of the first leg. A payment can
    // be entered from either account, so normalize on its cash leg.
    const cashAmount = sourceCash
      ? transaction.amount
      : destinationCash
        ? -transaction.amount
        : 0n;
    if (cashAmount > 0n) {
      // Cash advanced from a card is borrowed but still a new cash lot. It
      // becomes ageable only if later spent, never budget income here.
      if (
        !transfer ||
        sourceCard ||
        destinationCard ||
        !sourceCash ||
        !destinationCash
      )
        lots.push({ date, remaining: cashAmount });
      continue;
    }
    if (cashAmount >= 0n) continue;
    let remaining = -cashAmount;
    let centDays = 0n;
    while (remaining > 0n && head < lots.length) {
      const lot = lots[head];
      const drawn = remaining < lot.remaining ? remaining : lot.remaining;
      centDays += drawn * BigInt(Math.max(0, date - lot.date));
      lot.remaining -= drawn;
      remaining -= drawn;
      if (lot.remaining === 0n) head++;
    }
    // Spending beyond known inflows has no prior age. Keep it as a sample
    // rather than silently dropping a real cash outflow.
    const payment =
      transfer && (sourceCard || destinationCard) && cashAmount < 0n;
    if (transaction.kind === "EXPENSE" || payment)
      samples.push({
        transactionId: transaction.id,
        date: transaction.date,
        amount: -cashAmount,
        centDays,
      });
  }
  const last = samples.slice(-10);
  if (last.length < 10)
    return { days: null, sampleCount: samples.length, samples: last };
  // Four decimal places are ample for an age in days; money itself never
  // passes through a binary floating-point conversion.
  const precision = 10000n;
  const total = last.reduce(
    (sum, sample) =>
      sum + (sample.centDays * precision) / sample.amount,
    0n,
  );
  const rounded = (total + 5n * precision) / (10n * precision);
  return { days: Number(rounded), sampleCount: samples.length, samples: last };
}
