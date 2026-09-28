import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/infrastructure/db";
import { getConfig } from "@/infrastructure/config";
import { pushConfigured, sendPush } from "@/infrastructure/push";
import { minimumDue, monthlyInterest } from "@/domain/debt";
import {
  addDays,
  debtReminders,
  type ReminderCard,
} from "@/domain/debt-reminders";
import { versionFor } from "@/domain/versions";

type Tx = Prisma.TransactionClient;

/** Revolving debt, whose rate can move under a plan. Loans are fixed. */
export const REMINDER_TYPES = ["CREDIT_CARD", "LINE_OF_CREDIT"];
const INTEREST = /interest|finance charge/i;
const PAYMENT = /payment|autopay|auto pay|thank you/i;

/**
 * Bring the budget's open debt reminders in line with today's facts: new
 * situations get a reminder, a reminder whose situation has passed is
 * superseded, and one still wanted keeps its row (and so its push and done
 * state) with its wording refreshed. Writes only DebtReminder rows, so it can
 * run inside any command's transaction; it reads its own facts, so balances
 * and payments are current whoever calls it.
 */
export async function reconcileDebtReminders(
  tx: Tx,
  budgetId: string,
  today: string,
  now = new Date(),
) {
  const month = today.slice(0, 7);
  const since = new Date(`${addDays(today, -70)}T00:00:00Z`);
  const accounts = await tx.financialAccount.findMany({
    where: {
      budgetId,
      deletedAt: null,
      closed: false,
      type: { in: REMINDER_TYPES },
    },
    select: { id: true, name: true },
  });
  const ids = accounts.map((a) => a.id);
  const [versions, balances, envelopes, recent, existing] = await Promise.all([
    tx.debtTerms.findMany({ where: { budgetId, accountId: { in: ids } } }),
    tx.posting.groupBy({
      by: ["accountId"],
      where: { budgetId, accountId: { in: ids } },
      _sum: { amount: true },
    }),
    tx.category.findMany({
      where: { budgetId, paymentAccountId: { in: ids }, archived: false },
      select: { id: true, paymentAccountId: true },
    }),
    tx.financialTransaction.findMany({
      where: {
        budgetId,
        voidedAt: null,
        date: { gte: since },
        OR: [{ accountId: { in: ids } }, { transferAccountId: { in: ids } }],
      },
      select: {
        accountId: true,
        transferAccountId: true,
        kind: true,
        amount: true,
        date: true,
        payee: true,
        memo: true,
      },
    }),
    tx.debtReminder.findMany({ where: { budgetId } }),
  ]);
  const [targets, snoozed] = await Promise.all([
    tx.categoryTarget.findMany({
      where: { budgetId, categoryId: { in: envelopes.map((e) => e.id) } },
    }),
    tx.targetSnooze.findMany({
      where: { budgetId, month, categoryId: { in: envelopes.map((e) => e.id) } },
      select: { categoryId: true },
    }),
  ]);
  const dateOf = (d: Date) => d.toISOString().slice(0, 10);
  const cards: ReminderCard[] = [];
  for (const a of accounts) {
    const own = versions.filter((v) => v.accountId === a.id);
    const t = versionFor(own, month);
    if (!t) continue;
    const next = own
      .filter((v) => v.effectiveFrom > t.effectiveFrom)
      .sort((x, y) => x.effectiveFrom.localeCompare(y.effectiveFrom))[0];
    const balance =
      balances.find((b) => b.accountId === a.id)?._sum.amount ?? 0n;
    const owed = balance < 0n ? -balance : 0n;
    const envelope = envelopes.find((e) => e.paymentAccountId === a.id);
    const target = envelope && !snoozed.some((s) => s.categoryId === envelope.id)
      ? versionFor(
          targets.filter((x) => x.categoryId === envelope.id),
          month,
        )
      : undefined;
    const mine = existing.filter((r) => r.accountId === a.id && r.doneAt);
    const lastDone = (kind: string) =>
      mine
        .filter((r) => r.kind === kind)
        .sort((x, y) => y.doneAt!.getTime() - x.doneAt!.getTime())[0];
    const checked = [
      ...own.map((v) => dateOf(v.updatedAt)),
      ...(lastDone("TERMS_CHECK") ? [dateOf(lastDone("TERMS_CHECK")!.doneAt!)] : []),
    ].sort();
    const text = (x: { payee: string; memo: string }) => `${x.payee} ${x.memo}`;
    cards.push({
      accountId: a.id,
      name: a.name,
      owed,
      aprBasisPoints: t.aprBasisPoints,
      promo:
        next && (t.deferredInterest || next.aprBasisPoints > t.aprBasisPoints)
          ? {
              endsMonth: next.effectiveFrom,
              ...(t.promoEndsOn
                ? { deadline: t.promoEndsOn.toISOString().slice(0, 10) }
                : {}),
              deferred: t.deferredInterest,
              nextAprBasisPoints: next.aprBasisPoints,
            }
          : undefined,
      dueDay: t.dueDay,
      statementDay: t.statementDate?.getUTCDate() ?? null,
      target: target?.type === "DEBT_PAYOFF" ? target.amount : null,
      minimum: minimumDue(
        {
          minimumPayment: t.minimumPayment,
          percentBasisPoints: t.minimumPercentBasisPoints,
          includeInterest: t.minimumIncludesInterest,
        },
        owed,
        monthlyInterest(owed, t.aprBasisPoints),
      ),
      confirmed: lastDone("PAYMENT_CHANGE")?.toAmount ?? null,
      // A payment is money moved onto the card, or a bank credit that says so.
      payments: recent.flatMap((x) =>
        x.kind === "TRANSFER" && x.transferAccountId === a.id && x.amount < 0n
          ? [{ date: dateOf(x.date), amount: -x.amount }]
          : x.accountId === a.id &&
              x.amount > 0n &&
              (x.kind === "TRANSFER" || (x.kind === "CREDIT" && PAYMENT.test(text(x))))
            ? [{ date: dateOf(x.date), amount: x.amount }]
            : [],
      ),
      interest: recent.flatMap((x) =>
        x.accountId === a.id && x.amount < 0n && x.kind !== "TRANSFER" && INTEREST.test(text(x))
          ? [{ date: dateOf(x.date), amount: -x.amount }]
          : [],
      ),
      lastChecked: checked.at(-1) ?? null,
    });
  }
  const wanted = debtReminders({ today, cards });
  const byKey = new Map(existing.map((r) => [r.dedupeKey, r]));
  const keys = new Set(wanted.map((r) => r.dedupeKey));
  let created = 0;
  for (const r of wanted) {
    const row = byKey.get(r.dedupeKey);
    const fields = {
      kind: r.kind,
      level: r.level,
      fromAmount: r.fromAmount,
      toAmount: r.toAmount,
      dueDate: r.dueDate ? new Date(`${r.dueDate}T00:00:00Z`) : null,
      text: r.text,
    };
    if (!row) {
      await tx.debtReminder.create({
        data: { budgetId, accountId: r.accountId, dedupeKey: r.dedupeKey, ...fields },
      });
      created++;
    } else if (!row.doneAt && (row.text !== r.text || row.supersededAt))
      // Still wanted: refresh the wording (days left, amounts); a reminder
      // superseded earlier the same day comes back rather than duplicating.
      await tx.debtReminder.update({
        where: { id: row.id },
        data: { ...fields, supersededAt: null },
      });
  }
  const stale = existing.filter(
    (r) => !r.doneAt && !r.supersededAt && !keys.has(r.dedupeKey),
  );
  if (stale.length)
    await tx.debtReminder.updateMany({
      where: { id: { in: stale.map((r) => r.id) } },
      data: { supersededAt: now },
    });
  return { created, superseded: stale.length };
}

/** How often an unfinished "act" reminder is pushed again. */
export const REPUSH_MS = 3 * 86_400_000;
/** Pushes wait for waking hours in the budget's time zone: [from, to). */
export const PUSH_HOURS = [8, 21] as const;
const LABEL: Record<string, string> = {
  PAYMENT_CHANGE: "change a payment at the bank",
  TERMS_CHECK: "check the rate on the latest statement",
  PROMO_AT_RISK: "promotion will not clear in time",
  PROMO_DEADLINE: "promotion ending soon",
  UNDERPAID: "payment looks short",
  RATE_MISMATCH: "interest does not match the rate on file",
};

/** Open reminders due a push: never pushed, or "act" and not pushed lately. */
export function pushWhere(budgetId: string, now: Date) {
  return {
    budgetId,
    doneAt: null,
    supersededAt: null,
    OR: [
      { pushedAt: null },
      { level: "act", pushedAt: { lt: new Date(now.getTime() - REPUSH_MS) } },
    ],
  } satisfies Prisma.DebtReminderWhereInput;
}

export function localHour(timezone: string, now: Date) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
}

/**
 * Push each reminder that is due one, marking it as it goes, so a failure
 * part-way leaves the rest for the job's retry and nothing is sent twice.
 * Runs outside any transaction; the network call is never inside one.
 */
export async function pushDebtReminders(
  budgetId: string,
  now = new Date(),
  fetchImpl: typeof fetch = fetch,
) {
  const config = getConfig();
  if (!pushConfigured(config)) return 0;
  const due = await getDb().debtReminder.findMany({
    where: pushWhere(budgetId, now),
    orderBy: [{ level: "asc" }, { createdAt: "asc" }],
  });
  const names = new Map(
    (
      await getDb().financialAccount.findMany({
        where: { budgetId, id: { in: due.map((r) => r.accountId) } },
        select: { id: true, name: true },
      })
    ).map((a) => [a.id, a.name]),
  );
  let sent = 0;
  for (const r of due) {
    const name = names.get(r.accountId) ?? "A card";
    await sendPush(
      config,
      {
        title: `${name}: ${LABEL[r.kind] ?? "debt reminder"}`,
        message:
          config.NTFY_DETAIL === "full"
            ? r.text
            : "Open MyNAB to see what to do.",
        click: `${config.APP_ORIGIN}${config.APP_BASE_PATH}/debt`,
        urgent: r.level === "act",
      },
      fetchImpl,
    );
    await getDb().debtReminder.update({
      where: { id: r.id },
      data: { pushedAt: now },
    });
    sent++;
  }
  return sent;
}
