import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/infrastructure/db";
import { getConfig, plaidConfigured } from "@/infrastructure/config";
import { backoffMs, sanitizeJobError, syncDue } from "@/domain/jobs";
import { SESSION_IDLE_MS, THROTTLE_WINDOW_MS } from "./auth";
import { syncConnection } from "./ingestion";
import { enterDueSchedules } from "./schedules";
import { executeFinance, today } from "./finance";
import {
  PUSH_HOURS,
  localHour,
  pushDebtReminders,
  pushWhere,
} from "./debt-reminders";
import { pushConfigured } from "@/infrastructure/push";

/**
 * Durable background work for the separate worker process. Jobs are claimed
 * with a random lease token; only the holder of the current lease can finish
 * one, so a worker that stalls past its lease can never overwrite the outcome
 * of the worker that reclaimed it. Nothing here bypasses the application
 * commands: a provider sync is the same `syncConnection` an owner runs, with
 * the same locks, review rules and audit trail.
 */
export const LEASE_MS = 15 * 60 * 1000;
const KEEP_FINISHED_DAYS = 30;

export type JobKind =
  | "provider.sync"
  | "maintenance"
  | "schedules.enter"
  | "debt.plan.track"
  | "notify.push";
type JobRow = {
  id: string;
  budgetId: string | null;
  kind: JobKind;
  subjectId: string | null;
  attempts: number;
  maxAttempts: number;
  leaseToken: string;
};

/** Queue a job unless one with the same key is already queued or running. */
export async function enqueue(job: {
  kind: JobKind;
  dedupeKey: string;
  budgetId?: string;
  subjectId?: string;
  runAt?: Date;
}) {
  const inserted = await getDb().$executeRaw`
    INSERT INTO "Job" ("id","budgetId","kind","subjectId","dedupeKey","runAt")
    VALUES (${randomUUID()}::uuid, ${job.budgetId ?? null}::uuid, ${job.kind},
            ${job.subjectId ?? null}::uuid, ${job.dedupeKey}, ${job.runAt ?? new Date()})
    ON CONFLICT ("dedupeKey") WHERE "status" IN ('QUEUED','RUNNING') DO NOTHING`;
  return inserted > 0;
}

/**
 * Claim the next due job, or one whose lease expired because its worker died.
 * SKIP LOCKED lets several workers run without ever sharing a job.
 */
export async function claim(now = new Date()): Promise<JobRow | null> {
  const token = randomUUID();
  const rows = await getDb().$queryRaw<JobRow[]>`
    UPDATE "Job" SET "status" = 'RUNNING', "leaseToken" = ${token}::uuid,
      "leasedUntil" = ${new Date(now.getTime() + LEASE_MS)},
      "attempts" = "attempts" + 1
    WHERE "id" = (
      SELECT "id" FROM "Job"
      WHERE ("status" = 'QUEUED' AND "runAt" <= ${now})
         OR ("status" = 'RUNNING' AND "leasedUntil" < ${now})
      ORDER BY "runAt", "id"
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id","budgetId","kind","subjectId","attempts","maxAttempts","leaseToken"`;
  return rows[0] ?? null;
}

/** Finish a job. False when the lease was lost, in which case nothing changes. */
export async function complete(job: Pick<JobRow, "id" | "leaseToken">) {
  const { count } = await getDb().job.updateMany({
    where: { id: job.id, leaseToken: job.leaseToken, status: "RUNNING" },
    data: {
      status: "DONE",
      leaseToken: null,
      leasedUntil: null,
      lastError: null,
      finishedAt: new Date(),
    },
  });
  return count === 1;
}

/** Record a failure: retry later with backoff, or give up. Lease-guarded. */
export async function failJob(
  job: Pick<JobRow, "id" | "leaseToken" | "attempts" | "maxAttempts">,
  error: unknown,
  { retry = true, now = new Date() } = {},
) {
  const final = !retry || job.attempts >= job.maxAttempts;
  const { count } = await getDb().job.updateMany({
    where: { id: job.id, leaseToken: job.leaseToken, status: "RUNNING" },
    data: {
      status: final ? "FAILED" : "QUEUED",
      leaseToken: null,
      leasedUntil: null,
      lastError: sanitizeJobError(error),
      runAt: final
        ? undefined
        : new Date(now.getTime() + backoffMs(job.attempts)),
      finishedAt: final ? now : null,
    },
  });
  return count === 1;
}

/** Queue whatever is due: stale healthy connections, and daily maintenance. */
export async function scheduleDue(now = new Date()) {
  const config = getConfig();
  let queued = 0;
  if (plaidConfigured(config)) {
    const connections = await getDb().providerConnection.findMany({
      where: {
        provider: "PLAID",
        OR: [
          { status: "ACTIVE" },
          // Transient failures keep trying; a sign-in problem waits for the owner.
          { status: "ERROR", errorCode: { not: "REAUTH_REQUIRED" } },
        ],
      },
      select: { id: true, budgetId: true, lastSyncedAt: true },
    });
    for (const c of connections)
      if (
        syncDue(c.lastSyncedAt, now, config.SYNC_INTERVAL_HOURS) &&
        (await enqueue({
          kind: "provider.sync",
          dedupeKey: `provider.sync:${c.id}`,
          budgetId: c.budgetId,
          subjectId: c.id,
          runAt: now,
        }))
      )
        queued++;
  }
  // Scheduled transactions are entered on their date, checked hourly per budget.
  const hour = now.toISOString().slice(0, 13);
  const scheduledBudgets = await getDb().schedule.findMany({
    where: { archived: false, replacedById: null },
    distinct: ["budgetId"],
    select: { budgetId: true },
  });
  for (const budget of scheduledBudgets) {
    const key = `schedules.enter:${budget.budgetId}:${hour}`;
    if (
      !(await getDb().job.findFirst({ where: { dedupeKey: key } })) &&
      (await enqueue({
        kind: "schedules.enter",
        dedupeKey: key,
        budgetId: budget.budgetId,
        runAt: now,
      }))
    )
      queued++;
  }
  // An adopted payoff plan is kept up to date once a day, by the budget's own
  // calendar, so a new month's amounts are in place on its first morning. The
  // same run brings debt reminders up to date, so any budget with card terms
  // gets one, plan or not.
  const plans = await getDb().debtPlan.findMany({ select: { budgetId: true } });
  const terms = await getDb().debtTerms.findMany({
    distinct: ["budgetId"],
    select: { budgetId: true },
  });
  const budgets = await getDb().budget.findMany({
    where: {
      id: { in: [...plans, ...terms].map((p) => p.budgetId) },
    },
    select: { id: true, timezone: true },
  });
  for (const budget of budgets) {
    const key = `debt.plan.track:${budget.id}:${today(budget.timezone, now)}`;
    if (
      !(await getDb().job.findFirst({ where: { dedupeKey: key } })) &&
      (await enqueue({
        kind: "debt.plan.track",
        dedupeKey: key,
        budgetId: budget.id,
        runAt: now,
      }))
    )
      queued++;
  }
  // Debt reminders reach the phone in waking hours, checked hourly.
  if (pushConfigured(config)) {
    const waiting = await getDb().budget.findMany({
      where: { id: { in: [...new Set(budgets.map((b) => b.id))] } },
      select: { id: true, timezone: true },
    });
    for (const budget of waiting) {
      const h = localHour(budget.timezone, now);
      if (h < PUSH_HOURS[0] || h >= PUSH_HOURS[1]) continue;
      if (!(await getDb().debtReminder.count({ where: pushWhere(budget.id, now) })))
        continue;
      const key = `notify.push:${budget.id}:${hour}`;
      if (
        !(await getDb().job.findFirst({ where: { dedupeKey: key } })) &&
        (await enqueue({
          kind: "notify.push",
          dedupeKey: key,
          budgetId: budget.id,
          runAt: now,
        }))
      )
        queued++;
    }
  }
  const day = now.toISOString().slice(0, 10);
  const done = await getDb().job.findFirst({
    where: { kind: "maintenance", dedupeKey: `maintenance:${day}` },
  });
  if (
    !done &&
    (await enqueue({
      kind: "maintenance",
      dedupeKey: `maintenance:${day}`,
      runAt: now,
    }))
  )
    queued++;
  return queued;
}

/** Remove expired sessions and throttle windows. Shared with `npm run sessions:prune`. */
export async function pruneExpired(now = new Date()) {
  const db = getDb();
  await db.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lte: now } },
        { lastSeenAt: { lte: new Date(now.getTime() - SESSION_IDLE_MS) } },
      ],
    },
  });
  await db.loginThrottle.deleteMany({
    where: {
      windowStart: { lt: new Date(now.getTime() - THROTTLE_WINDOW_MS) },
    },
  });
}

/** The budget's owner, whose authority a background sync runs under. */
async function ownerOf(budgetId: string) {
  const member = await getDb().budgetMember.findFirst({
    where: { budgetId, role: "owner" },
    orderBy: { userId: "asc" },
  });
  if (!member) throw new Error("Budget has no owner");
  return member.userId;
}

/** Run one claimed job to completion or recorded failure. Never throws. */
export async function runJob(job: JobRow) {
  try {
    if (job.kind === "provider.sync") {
      if (!job.budgetId || !job.subjectId)
        throw new Error("Malformed provider job");
      await syncConnection(
        await ownerOf(job.budgetId),
        job.budgetId,
        job.subjectId,
      );
    } else if (job.kind === "schedules.enter") {
      if (!job.budgetId) throw new Error("Malformed schedule job");
      await enterDueSchedules(await ownerOf(job.budgetId), job.budgetId);
    } else if (job.kind === "notify.push") {
      if (!job.budgetId) throw new Error("Malformed push job");
      await pushDebtReminders(job.budgetId);
    } else if (job.kind === "debt.plan.track") {
      if (!job.budgetId) throw new Error("Malformed plan job");
      // The same command the owner runs, audited as theirs. A retry of this
      // job reuses its request key, so it can never apply twice.
      const h = createHash("sha256").update(job.id).digest("hex");
      await executeFinance(
        await ownerOf(job.budgetId),
        job.budgetId,
        `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`,
        { type: "debt.plan.track" },
      );
    } else {
      await pruneExpired();
      await getDb().job.deleteMany({
        where: {
          status: { in: ["DONE", "FAILED"] },
          finishedAt: {
            lt: new Date(Date.now() - KEEP_FINISHED_DAYS * 86_400_000),
          },
        },
      });
    }
    await complete(job);
    return "DONE" as const;
  } catch (error) {
    // A connection that needs the owner to sign in again cannot succeed by
    // retrying; it waits until the owner reconnects it.
    const reauth =
      job.kind === "provider.sync" && job.subjectId
        ? await getDb()
            .providerConnection.findUnique({
              where: { id: job.subjectId },
              select: { errorCode: true, status: true },
            })
            .catch(() => null)
        : null;
    const permanent =
      reauth?.errorCode === "REAUTH_REQUIRED" ||
      reauth?.status === "DISCONNECTED" ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025");
    await failJob(job, error, { retry: !permanent }).catch(() => undefined);
    return permanent ? ("FAILED" as const) : ("RETRY" as const);
  }
}

/** Liveness for the worker, readable by the app and the container healthcheck. */
export async function heartbeat(id: string, startedAt: Date) {
  const now = new Date();
  await getDb().workerHeartbeat.upsert({
    where: { id },
    create: { id, startedAt, seenAt: now },
    update: { startedAt, seenAt: now },
  });
}

/** What the Connections page says about automatic sync. */
export async function workerStatus(now = new Date()) {
  const beat = await getDb().workerHeartbeat.findFirst({
    orderBy: { seenAt: "desc" },
  });
  return {
    running: Boolean(
      beat && now.getTime() - beat.seenAt.getTime() < 5 * 60_000,
    ),
    seenAt: beat?.seenAt ?? null,
    intervalHours: getConfig().SYNC_INTERVAL_HOURS,
  };
}
