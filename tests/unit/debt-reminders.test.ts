import { describe, expect, it } from "vitest";
import {
  debtReminders,
  promoDeadline,
  termsCheckDate,
  type ReminderCard,
} from "@/domain/debt-reminders";

const card = (over: Partial<ReminderCard> = {}): ReminderCard => ({
  accountId: "a",
  name: "Visa",
  owed: 200_000n,
  aprBasisPoints: 2499,
  dueDay: 15,
  statementDay: 20,
  target: 15_000n,
  minimum: 5_000n,
  confirmed: 15_000n,
  payments: [{ date: "2026-09-14", amount: 15_000n }],
  interest: [],
  lastChecked: "2026-09-25",
  ...over,
});
const run = (today: string, ...cards: ReminderCard[]) =>
  debtReminders({ today, cards });
const kinds = (today: string, ...cards: ReminderCard[]) =>
  run(today, ...cards).map((r) => r.kind);

describe("debt reminders", () => {
  it("asks for nothing when the bank matches the plan", () => {
    expect(run("2026-09-27", card())).toEqual([]);
  });

  it("asks for the rollover at the bank when a card is paid off", () => {
    const paid = card({ accountId: "p", name: "Store", owed: 0n, confirmed: 10_000n });
    const next = card({ target: 25_000n });
    const out = run("2026-09-27", paid, next);
    const raise = out.find((r) => r.accountId === "a")!;
    expect(raise).toMatchObject({
      kind: "PAYMENT_CHANGE",
      level: "act",
      fromAmount: 15_000n,
      toAmount: 25_000n,
      dueDate: "2026-10-15",
      dedupeKey: "pay:a:2026-09:25000",
    });
    expect(raise.text).toContain("from $150.00 to $250.00 before Oct 15, 2026");
    const stop = out.find((r) => r.accountId === "p")!;
    expect(stop).toMatchObject({ kind: "PAYMENT_CHANGE", level: "review", toAmount: 0n });
    // Act items sort first.
    expect(out[0].accountId).toBe("a");
  });

  it("asks to set a payment the first time, and keys a newer change apart", () => {
    const first = run("2026-09-27", card({ confirmed: null }))[0];
    expect(first.text).toBe("Set Visa's payment at the bank to $150.00 a month before Oct 15, 2026.");
    const later = run("2026-10-02", card({ target: 30_000n }))[0];
    expect(later.dedupeKey).not.toBe(first.dedupeKey);
  });

  it("ignores minimum drift, except upward on deferred interest", () => {
    // Before the due date, so nothing is late yet.
    expect(kinds("2026-09-10", card({ target: 15_900n }))).toEqual([]);
    const deferred = {
      promo: { endsMonth: "2027-09", deferred: true, nextAprBasisPoints: 2999 },
      aprBasisPoints: 0,
    };
    expect(kinds("2026-09-10", card({ ...deferred, target: 15_100n, owed: 150_000n }))).toEqual([
      "PROMO_AT_RISK",
      "PAYMENT_CHANGE",
    ]);
    expect(kinds("2026-09-10", card({ ...deferred, target: 14_900n, owed: 150_000n }))).toEqual([
      "PROMO_AT_RISK",
    ]);
  });

  it("warns when a deferred promotion cannot clear, and counts down to it", () => {
    const promo = card({
      aprBasisPoints: 0,
      owed: 120_000n,
      target: 10_000n,
      confirmed: 10_000n,
      promo: { endsMonth: "2027-01", deferred: true, nextAprBasisPoints: 2699 },
    });
    // Due the 15th, already past on the 27th: Oct 15, Nov 15 and Dec 15 are
    // the payments before Dec 31, so min 50 + (1150/3) ~ 433.34 a month.
    expect(promoDeadline(promo, "2026-09-27")).toEqual({
      date: "2026-12-31",
      monthsLeft: 3,
      perMonth: 43_334n,
    });
    // With the due day still ahead this month, September's payment counts too.
    expect(promoDeadline(promo, "2026-09-10")?.monthsLeft).toBe(4);
    // An exact last day of Dec 15 excludes the payment due that day.
    expect(
      promoDeadline({ ...promo, promo: { ...promo.promo!, deadline: "2026-12-15" } }, "2026-09-27"),
    ).toMatchObject({ date: "2026-12-15", monthsLeft: 2 });
    const out = run("2026-09-27", promo);
    expect(out.map((r) => r.kind)).toEqual(["PROMO_AT_RISK"]);
    expect(out[0].text).toContain("needs $433.34 a month until Dec 31, 2026");
    // 90 days out: a review; 30 days out it becomes something to act on.
    const on = (owed: bigint) =>
      card({ ...promo, owed, target: 30_000n, confirmed: 30_000n, dueDay: null, lastChecked: "2099-01-01" });
    expect(run("2026-10-05", on(90_000n))).toMatchObject([
      { kind: "PROMO_AT_RISK", level: "act" },
      { kind: "PROMO_DEADLINE", level: "review", dedupeKey: "promo:a:2027-01:90" },
    ]);
    expect(run("2026-12-02", on(30_000n))).toMatchObject([
      { kind: "PROMO_DEADLINE", level: "act", dedupeKey: "promo:a:2027-01:30" },
    ]);
    expect(run("2026-12-20", on(30_000n))[0].dedupeKey).toBe("promo:a:2027-01:14");
    // Once the go-to rate is in force there is nothing left to count down.
    expect(kinds("2027-01-03", on(30_000n))).not.toContain("PROMO_DEADLINE");
  });

  it("gives a plain 0% ending a quieter notice", () => {
    const plain = card({
      aprBasisPoints: 0,
      promo: { endsMonth: "2026-11", deferred: false, nextAprBasisPoints: 2199 },
    });
    expect(run("2026-09-27", plain)).toMatchObject([
      { kind: "PROMO_DEADLINE", level: "review", dedupeKey: "promo:a:2026-11:60" },
    ]);
  });

  it("flags a payment that did not arrive a few days after the due date", () => {
    const late = card({ payments: [{ date: "2026-09-02", amount: 5_000n }] });
    expect(kinds("2026-09-17", late)).toEqual([]);
    expect(run("2026-09-18", late)).toMatchObject([
      { kind: "UNDERPAID", fromAmount: 5_000n, toAmount: 15_000n, dueDate: "2026-09-15" },
    ]);
    // A payment before the previous due date belongs to last cycle.
    expect(
      kinds("2026-09-18", card({ payments: [{ date: "2026-08-15", amount: 15_000n }] })),
    ).toEqual(["UNDERPAID"]);
  });

  it("asks for a rate check once per statement", () => {
    expect(termsCheckDate(card(), "2026-09-27")).toBe("2026-09-23");
    expect(termsCheckDate(card(), "2026-09-22")).toBe("2026-08-23");
    expect(run("2026-09-27", card({ lastChecked: "2026-09-10" }))).toMatchObject([
      { kind: "TERMS_CHECK", level: "review", dedupeKey: "terms:a:2026-09-23" },
    ]);
    // Without a statement date, three weeks before the due date.
    expect(termsCheckDate(card({ statementDay: null }), "2026-09-27")).toBe("2026-09-25");
    expect(kinds("2026-09-27", card({ owed: 0n, confirmed: null, lastChecked: null }))).toEqual([]);
  });

  it("notices interest that disagrees with the rate on file", () => {
    const zero = card({
      aprBasisPoints: 0,
      interest: [{ date: "2026-09-21", amount: 4_210n }],
    });
    expect(run("2026-09-27", zero)).toMatchObject([
      { kind: "RATE_MISMATCH", level: "act", toAmount: 4_210n },
    ]);
    // 2000 owed at 24.99% is about $41.65 a month: close enough.
    expect(kinds("2026-09-27", card({ interest: [{ date: "2026-09-21", amount: 4_100n }] }))).toEqual([]);
    // $55 a month on $2000 is about 33%.
    const high = run("2026-09-27", card({ interest: [{ date: "2026-09-21", amount: 5_500n }] }));
    expect(high).toMatchObject([{ kind: "RATE_MISMATCH", level: "review" }]);
    expect(high[0].text).toContain("about 33% APR, not the 24.99%");
    // Old charges are last cycle's news.
    expect(kinds("2026-09-27", card({ interest: [{ date: "2026-08-01", amount: 5_500n }] }))).toEqual([]);
  });
});
