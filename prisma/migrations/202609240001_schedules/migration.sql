CREATE TABLE "Schedule" (
 "id" UUID PRIMARY KEY, "budgetId" UUID NOT NULL REFERENCES "Budget"("id"),
 "accountId" UUID NOT NULL, "transferAccountId" UUID,
 "name" VARCHAR(120) NOT NULL, "kind" VARCHAR(16) NOT NULL CHECK ("kind" IN ('INCOME','EXPENSE','TRANSFER')),
 "amount" BIGINT NOT NULL CHECK ("amount" <> 0), "payee" VARCHAR(120) NOT NULL, "memo" VARCHAR(500) NOT NULL,
 "startDate" DATE NOT NULL, "endDate" DATE, "timezone" VARCHAR(64) NOT NULL,
 "cadence" VARCHAR(8) NOT NULL CHECK ("cadence" IN ('ONCE','DAILY','WEEKLY','MONTHLY','YEARLY')),
 "interval" INTEGER NOT NULL DEFAULT 1 CHECK ("interval" BETWEEN 1 AND 1200),
 "archived" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("id","budgetId"), CHECK ("endDate" IS NULL OR "endDate" >= "startDate"),
 FOREIGN KEY ("accountId","budgetId") REFERENCES "FinancialAccount"("id","budgetId"),
 FOREIGN KEY ("transferAccountId","budgetId") REFERENCES "FinancialAccount"("id","budgetId")
);
CREATE INDEX "Schedule_budgetId_archived_idx" ON "Schedule"("budgetId","archived");
CREATE TABLE "ScheduleSplit" (
 "scheduleId" UUID NOT NULL, "budgetId" UUID NOT NULL, "categoryId" UUID NOT NULL,
 "amount" BIGINT NOT NULL, "position" INTEGER NOT NULL,
 PRIMARY KEY ("scheduleId","position"),
 FOREIGN KEY ("scheduleId","budgetId") REFERENCES "Schedule"("id","budgetId"),
 FOREIGN KEY ("categoryId","budgetId") REFERENCES "Category"("id","budgetId")
);
CREATE TABLE "ScheduleOccurrence" (
 "scheduleId" UUID NOT NULL, "budgetId" UUID NOT NULL, "date" DATE NOT NULL,
 "transactionId" UUID, "status" VARCHAR(8) NOT NULL CHECK ("status" IN ('APPROVED','SKIPPED')),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("scheduleId","date"),
 CHECK (("status" = 'APPROVED') = ("transactionId" IS NOT NULL)),
 FOREIGN KEY ("scheduleId","budgetId") REFERENCES "Schedule"("id","budgetId"),
 FOREIGN KEY ("transactionId","budgetId") REFERENCES "FinancialTransaction"("id","budgetId")
);
CREATE INDEX "ScheduleOccurrence_budgetId_date_idx" ON "ScheduleOccurrence"("budgetId","date");
