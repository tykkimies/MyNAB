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
        where: { budgetId, date: { gte: new Date(start), lte: new Date(end) } },
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
      const upcoming = schedules
        .flatMap((schedule) => {
          const dates = new Set<string>();
          if (!schedule.archived)
            for (const o of occurrences(
              {
                id: schedule.id,
                startDate: schedule.startDate.toISOString().slice(0, 10),
                endDate: schedule.endDate?.toISOString().slice(0, 10),
                timezone: schedule.timezone,
                cadence: schedule.cadence as Recurrence["cadence"],
                interval: schedule.interval,
              },
              start,
              end,
            ))
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
        today: today(budget.timezone),
        candidatesTruncated: candidates.length > 500,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
