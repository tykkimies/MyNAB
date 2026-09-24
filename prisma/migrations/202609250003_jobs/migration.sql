CREATE TABLE "Job" (
 "id" UUID PRIMARY KEY,
 "budgetId" UUID REFERENCES "Budget"("id"),
 "kind" VARCHAR(32) NOT NULL CHECK ("kind" IN ('provider.sync','maintenance')),
 "subjectId" UUID,
 "dedupeKey" VARCHAR(200) NOT NULL,
 "status" VARCHAR(8) NOT NULL DEFAULT 'QUEUED' CHECK ("status" IN ('QUEUED','RUNNING','DONE','FAILED')),
 "runAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
 "maxAttempts" INTEGER NOT NULL DEFAULT 5 CHECK ("maxAttempts" > 0),
 "leaseToken" UUID,
 "leasedUntil" TIMESTAMPTZ(3),
 "lastError" VARCHAR(300),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "finishedAt" TIMESTAMPTZ(3),
 CHECK (("status" = 'RUNNING') = ("leaseToken" IS NOT NULL AND "leasedUntil" IS NOT NULL))
);
-- One live job per key. Partial, so finished history never blocks a new run.
-- Prisma cannot express this index: keep it when generating future migrations.
CREATE UNIQUE INDEX "Job_live_dedupeKey" ON "Job"("dedupeKey") WHERE "status" IN ('QUEUED','RUNNING');
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status","runAt");
CREATE TABLE "WorkerHeartbeat" (
 "id" VARCHAR(32) PRIMARY KEY,
 "startedAt" TIMESTAMPTZ(3) NOT NULL,
 "seenAt" TIMESTAMPTZ(3) NOT NULL
);
