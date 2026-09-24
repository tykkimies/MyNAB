ALTER TABLE "Schedule" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0);
ALTER TABLE "Schedule" ADD COLUMN "replacedById" UUID;
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_replacement_budget_fk"
 FOREIGN KEY ("replacedById", "budgetId") REFERENCES "Schedule"("id", "budgetId");
ALTER TABLE "ScheduleOccurrence" ADD COLUMN "matched" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ScheduleOccurrence" ADD CONSTRAINT "ScheduleOccurrence_matched_check"
 CHECK (NOT "matched" OR "status" = 'APPROVED');
CREATE UNIQUE INDEX "ScheduleOccurrence_transactionId_key" ON "ScheduleOccurrence"("transactionId");
