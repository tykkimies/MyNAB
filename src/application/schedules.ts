import { randomUUID } from "node:crypto";
import { getDb } from "@/infrastructure/db";
import { authorize, today, fail } from "./finance";
import { occurrences, type Recurrence } from "@/domain/schedules";
import { financialDate } from "@/domain/dates";

export async function getSchedules(
  userId: string,
  budgetId: string,
  from?: string,
  through?: string,
) {
  return getDb().$transaction(
    async (tx) => {
      const budget = await authorize(tx, userId, budgetId);
      const start = from ?? today(budget.timezone);
      financialDate(start);
      const last = new Date(`${start}T00:00:00Z`);
      last.setUTCDate(last.getUTCDate() + 90);
      const end = through ?? last.toISOString().slice(0, 10);
      financialDate(end);
      if (
        start > end ||
        new Date(end).getTime() - new Date(start).getTime() > 366 * 86400000
      )
        fail("Choose at most one year of occurrences.");
      const schedules = await tx.schedule.findMany({
        where: { budgetId },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
      const splits = await tx.scheduleSplit.findMany({
        where: { budgetId },
        orderBy: { position: "asc" },
      });
      const handled = await tx.scheduleOccurrence.findMany({
        where: {
          budgetId,
          OR: [
            { date: { gte: new Date(start), lte: new Date(end) } },
            // Keep older unapproved entries visible in the default view.
            { status: "ENTERED", date: { lte: new Date(end) } },
          ],
        },
      });
      const earliest = new Date(start);
      earliest.setUTCDate(earliest.getUTCDate() - 7);
      const latest = new Date(end);
      latest.setUTCDate(latest.getUTCDate() + 7);
      const candidates = await tx.financialTransaction.findMany({
        where: {
          budgetId,
          voidedAt: null,
          date: { gte: earliest, lte: latest },
          kind: { in: ["EXPENSE", "INCOME", "TRANSFER"] },
        },
        orderBy: [{ date: "desc" }, { id: "asc" }],
        take: 501,
      });
      const used = new Set(
        (
          await tx.scheduleOccurrence.findMany({
            where: {
              budgetId,
              transactionId: { in: candidates.map((t) => t.id) },
            },
            select: { transactionId: true },
          })
        ).map((o) => o.transactionId),
      );
      const histories = await tx.financialTransaction.findMany({
        where: {
          budgetId,
          id: {
            in: handled.flatMap((h) =>
              h.transactionId ? [h.transactionId] : [],
            ),
          },
        },
        select: { id: true, voidedAt: true },
      });
      const current = today(budget.timezone);
      const recurrence = (schedule: (typeof schedules)[number]) => ({
        id: schedule.id,
        startDate: schedule.startDate.toISOString().slice(0, 10),
        endDate: schedule.endDate?.toISOString().slice(0, 10),
        timezone: schedule.timezone,
        cadence: schedule.cadence as Recurrence["cadence"],
        interval: schedule.interval,
      });
      // Overdue is reported whatever window is on screen, so nothing is missed
      // just because the list starts today.
      const yearAgo = new Date(`${current}T00:00:00Z`);
      yearAgo.setUTCDate(yearAgo.getUTCDate() - 365);
      const overdueFrom = yearAgo.toISOString().slice(0, 10);
      const past = await tx.scheduleOccurrence.findMany({
        where: {
          budgetId,
          date: { gte: yearAgo, lt: new Date(current) },
        },
        select: { scheduleId: true, date: true },
      });
      const handledKeys = new Set(
        past.map((h) =>
          JSON.stringify([h.scheduleId, h.date.toISOString().slice(0, 10)]),
        ),
      );
      const overdueDates = schedules
        .filter((schedule) => !schedule.archived)
        .flatMap((schedule) =>
          occurrences(recurrence(schedule), overdueFrom, current)
            .map((o) => o.date)
            .filter(
              (date) =>
                date < current &&
                date <= today(schedule.timezone) &&
                !handledKeys.has(JSON.stringify([schedule.id, date])),
            ),
        )
        .sort();
      const dismissed = await tx.recurringDismissal.findMany({
        where: { budgetId },
        orderBy: { createdAt: "desc" },
      });
      const upcoming = schedules
        .flatMap((schedule) => {
          const dates = new Set<string>();
          if (!schedule.archived)
            for (const o of occurrences(recurrence(schedule), start, end))
              dates.add(o.date);
          for (const h of handled.filter((h) => h.scheduleId === schedule.id))
            dates.add(h.date.toISOString().slice(0, 10));
          return [...dates].map((date) => {
            const done = handled.find(
              (h) =>
                h.scheduleId === schedule.id &&
                h.date.toISOString().slice(0, 10) === date,
            );
            return {
              key: JSON.stringify([schedule.id, date]),
              date,
              due: date <= current && date <= today(schedule.timezone),
              schedule,
              handled: done,
              corrected: Boolean(
                histories.find((h) => h.id === done?.transactionId)?.voidedAt,
              ),
              candidates: done
                ? []
                : candidates
                    .slice(0, 500)
                    .filter(
                      (t) =>
                        !used.has(t.id) &&
                        t.accountId === schedule.accountId &&
                        t.transferAccountId === schedule.transferAccountId &&
                        t.kind === schedule.kind &&
                        t.amount === schedule.amount &&
                        Math.abs(t.date.getTime() - new Date(date).getTime()) <=
                          7 * 86400000,
                    ),
            };
          });
        })
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.schedule.id.localeCompare(b.schedule.id),
        );
      if (upcoming.length > 2000)
        fail("Too many occurrences. Choose a shorter date range.");
      return {
        schedules,
        splits,
        upcoming,
        start,
        end,
        today: current,
        overdue: {
          count: overdueDates.length,
          oldest: overdueDates[0] ?? null,
        },
        dismissed: dismissed.map((d) => d.key),
        candidatesTruncated: candidates.length > 500,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

/**
 * YNAB_ALIGNMENT A3: enter every due, unhandled occurrence as a real,
 * uncleared transaction awaiting approval. Run by the worker, never by a page
 * load. Only occurrences on or after the day the schedule was created are
 * entered, so a schedule with an old start date never floods the register.
 */
export async function enterDueSchedules(userId: string, budgetId: string) {
  const { executeFinance, FinanceError } = await import("./finance");
  const due = await getDb().$transaction(
    async (tx) => {
      const budget = await authorize(tx, userId, budgetId);
      const current = today(budget.timezone);
      const schedules = await tx.schedule.findMany({
        where: { budgetId, archived: false, replacedById: null },
      });
      const handled = new Set(
        (
          await tx.scheduleOccurrence.findMany({
            where: {
              budgetId,
              scheduleId: { in: schedules.map((s) => s.id) },
            },
            select: { scheduleId: true, date: true },
          })
        ).map((o) => `${o.scheduleId}/${o.date.toISOString().slice(0, 10)}`),
      );
      const list: { id: string; date: string }[] = [];
      for (const s of schedules) {
        const created = new Intl.DateTimeFormat("en-CA", {
          timeZone: budget.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(s.createdAt);
        const start = s.startDate.toISOString().slice(0, 10);
        const from = start > created ? start : created;
        const through =
          today(s.timezone) < current ? today(s.timezone) : current;
        if (from > through) continue;
        let dates: string[] = [];
        try {
          dates = occurrences(
            {
              id: s.id,
              startDate: start,
              endDate: s.endDate?.toISOString().slice(0, 10),
              timezone: s.timezone,
              cadence: s.cadence as Recurrence["cadence"],
              interval: s.interval,
            },
            from,
            through,
          ).map((o) => o.date);
        } catch {
          continue; // An unusable schedule is reported on its own page.
        }
        for (const date of dates)
          if (!handled.has(`${s.id}/${date}`)) list.push({ id: s.id, date });
      }
      return list.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 200);
    },
    { isolationLevel: "RepeatableRead" },
  );
  let entered = 0,
    failed = 0;
  for (const occurrence of due) {
    try {
      await executeFinance(userId, budgetId, randomUUID(), {
        type: "schedule.enter",
        ...occurrence,
      });
      entered++;
    } catch (error) {
      // A closed account or a changed category waits for the owner.
      if (error instanceof FinanceError) failed++;
      else throw error;
    }
  }
  return { entered, failed };
}

/**
 * The live schedules that fund or draw on one category, each with its next
 * unhandled date, for the category inspector. A card's payment category also
 * shows the transfers into the card, since that is what the envelope pays.
 */
export async function categorySchedules(
  userId: string,
  budgetId: string,
  categoryId: string,
) {
  return getDb().$transaction(async (tx) => {
    const budget = await authorize(tx, userId, budgetId);
    const category = await tx.category.findFirst({
      where: { id: categoryId, budgetId },
      select: { paymentAccountId: true },
    });
    if (!category) return [];
    const split = await tx.scheduleSplit.findMany({
      where: { budgetId, categoryId },
      select: { scheduleId: true },
    });
    const schedules = await tx.schedule.findMany({
      where: {
        budgetId,
        archived: false,
        replacedById: null,
        OR: [
          { id: { in: split.map((s) => s.scheduleId) } },
          ...(category.paymentAccountId
            ? [
                { paymentForAccountId: category.paymentAccountId },
                {
                  kind: "TRANSFER",
                  transferAccountId: category.paymentAccountId,
                },
              ]
            : []),
        ],
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const current = today(budget.timezone);
    const horizon = new Date(`${current}T00:00:00Z`);
    horizon.setUTCDate(horizon.getUTCDate() + 400);
    const handled = await tx.scheduleOccurrence.findMany({
      where: {
        budgetId,
        scheduleId: { in: schedules.map((s) => s.id) },
        date: { gte: new Date(current) },
      },
      select: { scheduleId: true, date: true },
    });
    const done = new Set(
      handled.map((h) => `${h.scheduleId} ${h.date.toISOString().slice(0, 10)}`),
    );
    return schedules.map((schedule) => ({
      id: schedule.id,
      name: schedule.name,
      amount: schedule.amount,
      accountId: schedule.accountId,
      transferAccountId: schedule.transferAccountId,
      cadence: schedule.cadence,
      managed: schedule.paymentForAccountId !== null,
      next:
        occurrences(
          {
            id: schedule.id,
            startDate: schedule.startDate.toISOString().slice(0, 10),
            endDate: schedule.endDate?.toISOString().slice(0, 10),
            timezone: schedule.timezone,
            cadence: schedule.cadence as Recurrence["cadence"],
            interval: schedule.interval,
          },
          current,
          horizon.toISOString().slice(0, 10),
        )
          .map((o) => o.date)
          .find((date) => !done.has(`${schedule.id} ${date}`)) ?? null,
    }));
  });
}

/** The live payment schedule each card's terms maintain, keyed by card. */
export async function managedCardPayments(userId: string, budgetId: string) {
  return getDb().$transaction(async (tx) => {
    await authorize(tx, userId, budgetId);
    const cards = await tx.financialAccount.findMany({
      where: {
        budgetId,
        deletedAt: null,
        closed: false,
        type: "CREDIT_CARD",
        participation: "BUDGET",
      },
      select: { id: true },
    });
    if (!cards.length) return [];
    const rows = await tx.schedule.findMany({
      where: {
        budgetId,
        archived: false,
        replacedById: null,
        paymentForAccountId: { in: cards.map((card) => card.id) },
      },
      select: { paymentForAccountId: true, accountId: true, amount: true },
    });
    return rows.map((row) => ({
      cardId: row.paymentForAccountId!,
      payFromAccountId: row.accountId,
      amount: row.amount < 0n ? -row.amount : row.amount,
    }));
  });
}

/** The live payment schedule for a tracking loan, including its budget category. */
export async function managedLoanPayments(userId: string, budgetId: string) {
  return getDb().$transaction(async (tx) => {
    await authorize(tx, userId, budgetId);
    const accounts = await tx.financialAccount.findMany({
      where: {
        budgetId,
        deletedAt: null,
        type: { in: ["LINE_OF_CREDIT", "LOAN", "OTHER_LIABILITY"] },
        participation: "TRACKING",
      },
      select: { id: true },
    });
    if (!accounts.length) return [];
    const rows = await tx.schedule.findMany({
      where: {
        budgetId,
        archived: false,
        replacedById: null,
        endDate: null,
        paymentForAccountId: { in: accounts.map((account) => account.id) },
      },
      select: { id: true, paymentForAccountId: true, accountId: true, amount: true },
    });
    const splits = await tx.scheduleSplit.findMany({
      where: { scheduleId: { in: rows.map((row) => row.id) } },
      orderBy: { position: "asc" },
      select: { scheduleId: true, categoryId: true },
    });
    return rows.map((row) => ({
      accountId: row.paymentForAccountId!,
      payFromAccountId: row.accountId,
      amount: row.amount < 0n ? -row.amount : row.amount,
      categoryId:
        splits.find((split) => split.scheduleId === row.id)?.categoryId ?? null,
    }));
  });
}
