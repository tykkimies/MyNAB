/**
 * What the owner has to do outside the app to keep a payoff plan true. The
 * plan can only move budget targets; the bank keeps paying whatever it was
 * told, and a card's rate changes without telling anyone. Each rule here
 * compares what the app knows with what the bank must be doing, and asks for
 * the difference to be closed by hand.
 *
 * Pure: facts in, the reminders that should be open today out. Each carries a
 * stable key, so the same situation never makes a second reminder, and a
 * reminder whose situation has passed is recognised as no longer wanted.
 *
 * Domain module: no persistence, framework or provider imports.
 */
import { nextMonth } from "./budget";
import { deferredChargeMonth, deferredDeadline } from "./debt";
import { formatUSD, money } from "./money";

export type ReminderKind =
  | "PAYMENT_CHANGE"
  | "TERMS_CHECK"
  | "PROMO_AT_RISK"
  | "PROMO_DEADLINE"
  | "UNDERPAID"
  | "RATE_MISMATCH";

export interface ReminderCard {
  accountId: string;
  name: string;
  /** Owed now, positive; zero once paid off. */
  owed: bigint;
  /** The rate in force this month, in basis points. */
  aprBasisPoints: number;
  /**
   * A promotion: the month a later, higher rate takes over. Deferred interest
   * must be cleared before then or everything held back is charged.
   */
  promo?: {
    endsMonth: string;
    /** The promotion's exact last day, when known. */
    deadline?: string;
    deferred: boolean;
    nextAprBasisPoints: number;
  };
  dueDay: number | null;
  /** Day of month the statement closes, from the last statement date. */
  statementDay: number | null;
  /** This month's payment target on the card's envelope. */
  target: bigint | null;
  /** The minimum the recorded rule demands at today's balance. */
  minimum: bigint | null;
  /** What the bank is set to pay: the last payment change marked done. */
  confirmed: bigint | null;
  /** Money that reached the card, positive, recent enough to cover a cycle. */
  payments: { date: string; amount: bigint }[];
  /** Interest the card charged, positive, from imported statements. */
  interest: { date: string; amount: bigint }[];
  /** When the terms were last saved or confirmed unchanged, YYYY-MM-DD. */
  lastChecked: string | null;
}

export interface Reminder {
  accountId: string;
  kind: ReminderKind;
  dedupeKey: string;
  /** "act" costs money if missed; "review" is upkeep. */
  level: "act" | "review";
  fromAmount: bigint | null;
  toAmount: bigint | null;
  /** YYYY-MM-DD the action matters by, when there is one. */
  dueDate: string | null;
  text: string;
}

/** A change smaller than this is drift in a percentage minimum, not news. */
export const PAYMENT_TOLERANCE = 1000n;
/** Days after a due date before a missing payment counts; imports lag. */
export const UNDERPAID_GRACE_DAYS = 3;
/** Days after a statement closes before asking about its rate. */
export const STATEMENT_GRACE_DAYS = 3;
/** How far an implied rate may stray before it is worth a look, in basis points. */
export const RATE_TOLERANCE = 300;
/** Below this balance an implied rate is too noisy to mean anything. */
export const RATE_MIN_BALANCE = 50_000n;
const DEFERRED_STEPS = [14, 30, 60, 90];
const PLAIN_STEPS = [30, 60];

const usd = (v: bigint) => formatUSD(money(v));
const pct = (bp: number) => `${(bp / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** The given day of a month, pulled back to the month's last day. */
export function dayIn(month: string, day: number) {
  return `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, "0")}`;
}
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}
function monthsBetween(from: string, to: string) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}
export function shortDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/** The next due date on or after today, or null without a due day. */
function nextDue(card: ReminderCard, today: string) {
  if (!card.dueDay) return null;
  const month = today.slice(0, 7);
  const due = dayIn(month, card.dueDay);
  return due >= today ? due : dayIn(nextMonth(month), card.dueDay);
}

/**
 * The last day a deferred promotion can be cleared: the end of the month
 * before its go-to rate takes over. The monthly payment that clears the
 * balance by then counts this month's payment as the first.
 */
export function promoDeadline(card: ReminderCard, today: string) {
  if (!card.promo || card.owed <= 0n) return null;
  const month = today.slice(0, 7);
  const deferred = {
    endsMonth: card.promo.endsMonth,
    deadline: card.promo.deadline,
    aprBasisPoints: card.promo.nextAprBasisPoints,
  };
  // The payoff plan's own rule: only payments due before the last day count,
  // this month's included while its due day is still ahead.
  const timing = {
    dueDay: card.dueDay,
    firstPaymentBeforeInterest:
      !card.dueDay || Number(today.slice(8, 10)) <= card.dueDay,
  };
  const date = deferredDeadline(deferred);
  if (date < today) return null;
  const monthsLeft = monthsBetween(month, deferredChargeMonth(timing, deferred, month));
  return {
    date,
    monthsLeft,
    perMonth: monthsLeft > 0 ? ceilDiv(card.owed, BigInt(monthsLeft)) : card.owed,
  };
}

function paymentChange(card: ReminderCard, today: string): Reminder | null {
  const want = card.owed > 0n ? card.target : 0n;
  if (want === null) return null;
  const have = card.confirmed;
  if (have === null && want === 0n) return null;
  if (have !== null) {
    const diff = want - have;
    // A deferred balance is not allowed to fall short by even a dollar.
    const raise = card.promo?.deferred && card.owed > 0n && diff > 0n;
    if (!raise && (diff < 0n ? -diff : diff) < PAYMENT_TOLERANCE) return null;
    if (want === 0n && have === 0n) return null;
  }
  const month = today.slice(0, 7);
  const due = nextDue(card, today);
  const by = due ? ` before ${shortDate(due)}` : "";
  const text =
    want === 0n
      ? `${card.name} is paid off. Turn off its ${usd(have!)} payment at the bank, or lower it to the statement balance.`
      : have === null
        ? `Set ${card.name}'s payment at the bank to ${usd(want)} a month${by}.`
        : `Change ${card.name}'s payment at the bank from ${usd(have)} to ${usd(want)}${by}.`;
  return {
    accountId: card.accountId,
    kind: "PAYMENT_CHANGE",
    dedupeKey: `pay:${card.accountId}:${month}:${want}`,
    level: want === 0n ? "review" : "act",
    fromAmount: have,
    toAmount: want,
    dueDate: due,
    text,
  };
}

/**
 * The statement a rate check waits for: a few days after the statement
 * closes, or, with only a due day, about three weeks before it is due.
 */
export function termsCheckDate(card: ReminderCard, today: string) {
  const month = today.slice(0, 7);
  const anchor = (m: string) =>
    card.statementDay
      ? addDays(dayIn(m, card.statementDay), STATEMENT_GRACE_DAYS)
      : card.dueDay
        ? addDays(dayIn(m, card.dueDay), -20)
        : dayIn(m, 1 + STATEMENT_GRACE_DAYS);
  return [anchor(nextMonth(month)), anchor(month), anchor(nextMonth(month, -1))]
    .filter((d) => d <= today)
    .sort()
    .at(-1)!;
}

function termsCheck(card: ReminderCard, today: string): Reminder | null {
  if (card.owed <= 0n) return null;
  const since = termsCheckDate(card, today);
  if (card.lastChecked && card.lastChecked >= since) return null;
  return {
    accountId: card.accountId,
    kind: "TERMS_CHECK",
    dedupeKey: `terms:${card.accountId}:${since}`,
    level: "review",
    fromAmount: null,
    toAmount: null,
    dueDate: null,
    text: `Check ${card.name}'s latest statement: is the APR still ${pct(card.aprBasisPoints)}${card.promo ? `, and does the promotion still end in ${card.promo.endsMonth}` : ""}?`,
  };
}

function promoAtRisk(card: ReminderCard, today: string): Reminder | null {
  if (!card.promo?.deferred) return null;
  const deadline = promoDeadline(card, today);
  if (!deadline) return null;
  const planned = card.target ?? card.minimum ?? 0n;
  if (planned >= deadline.perMonth) return null;
  return {
    accountId: card.accountId,
    kind: "PROMO_AT_RISK",
    dedupeKey: `risk:${card.accountId}:${card.promo.endsMonth}`,
    level: "act",
    fromAmount: planned,
    toAmount: deadline.perMonth,
    dueDate: deadline.date,
    text: `${card.name} will not clear its deferred-interest balance in time: it needs ${usd(deadline.perMonth)} a month until ${shortDate(deadline.date)}, and ${usd(planned)} is planned. Every dollar of held-back interest is charged if any balance remains.`,
  };
}

function promoCountdown(card: ReminderCard, today: string): Reminder | null {
  const deadline = promoDeadline(card, today);
  if (!deadline || !card.promo) return null;
  const days = daysBetween(today, deadline.date);
  const steps = card.promo.deferred ? DEFERRED_STEPS : PLAIN_STEPS;
  const step = steps.find((s) => days <= s);
  if (step === undefined || days < 0) return null;
  const deferred = card.promo.deferred;
  return {
    accountId: card.accountId,
    kind: "PROMO_DEADLINE",
    dedupeKey: `promo:${card.accountId}:${card.promo.endsMonth}:${step}`,
    level: deferred && step <= 30 ? "act" : "review",
    fromAmount: null,
    toAmount: deadline.perMonth,
    dueDate: deadline.date,
    text: deferred
      ? `${days} days left on ${card.name}'s deferred interest: ${usd(card.owed)} must be paid by ${shortDate(deadline.date)} (${usd(deadline.perMonth)} a month).`
      : `${card.name}'s promotional rate ends ${shortDate(deadline.date)}; ${usd(card.owed)} left will then be charged ${pct(card.promo.nextAprBasisPoints)}.`,
  };
}

function underpaid(card: ReminderCard, today: string): Reminder | null {
  if (!card.dueDay || card.owed <= 0n) return null;
  const month = today.slice(0, 7);
  const due = dayIn(month, card.dueDay);
  if (today < addDays(due, UNDERPAID_GRACE_DAYS)) return null;
  const expected = card.target ?? card.minimum;
  if (!expected) return null;
  const since = dayIn(nextMonth(month, -1), card.dueDay);
  const paid = card.payments
    .filter((p) => p.date > since && p.date <= today)
    .reduce((sum, p) => sum + p.amount, 0n);
  if (paid >= expected) return null;
  return {
    accountId: card.accountId,
    kind: "UNDERPAID",
    dedupeKey: `under:${card.accountId}:${month}`,
    level: "act",
    fromAmount: paid,
    toAmount: expected,
    dueDate: due,
    text: `Only ${usd(paid)} of the ${usd(expected)} planned reached ${card.name} by its ${shortDate(due)} due date. Check the payment at the bank.`,
  };
}

/**
 * Interest the card actually charged, against the rate on file. Any interest
 * on a 0% rate is wrong; otherwise a rough annual rate from one month's charge
 * that is well away from the recorded one means the rate probably moved.
 */
function rateMismatch(card: ReminderCard, today: string): Reminder | null {
  const recent = card.interest.filter((i) => i.date > addDays(today, -40));
  if (!recent.length) return null;
  const charged = recent.reduce((sum, i) => sum + i.amount, 0n);
  const latest = recent.map((i) => i.date).sort().at(-1)!;
  const base = {
    accountId: card.accountId,
    kind: "RATE_MISMATCH" as const,
    dedupeKey: `rate:${card.accountId}:${latest}`,
    fromAmount: null,
    toAmount: charged,
    dueDate: null,
  };
  if (card.aprBasisPoints === 0)
    return {
      ...base,
      level: "act",
      text: `${card.name} charged ${usd(charged)} interest on ${shortDate(latest)}, but its rate is recorded as 0%${card.promo?.deferred ? " with deferred interest" : ""}. Check the statement now.`,
    };
  if (card.owed < RATE_MIN_BALANCE) return null;
  const implied = Number((charged * 12n * 10_000n) / card.owed);
  if (Math.abs(implied - card.aprBasisPoints) <= RATE_TOLERANCE) return null;
  return {
    ...base,
    level: "review",
    text: `${card.name}'s ${usd(charged)} interest charge suggests about ${pct(Math.round(implied / 100) * 100)} APR, not the ${pct(card.aprBasisPoints)} on file. Check the statement and update the terms.`,
  };
}

/** Every reminder that should be open today, act before review. */
export function debtReminders(input: {
  today: string;
  cards: ReminderCard[];
}): Reminder[] {
  const out: Reminder[] = [];
  for (const card of input.cards)
    for (const rule of [
      promoAtRisk,
      paymentChange,
      underpaid,
      promoCountdown,
      rateMismatch,
      termsCheck,
    ]) {
      const r = rule(card, input.today);
      if (r) out.push(r);
    }
  return [
    ...out.filter((r) => r.level === "act"),
    ...out.filter((r) => r.level === "review"),
  ];
}
