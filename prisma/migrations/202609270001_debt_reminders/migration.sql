-- Things the owner has to do outside this application to keep a payoff plan
-- true: change a payment at the bank, confirm a card's rate after a statement,
-- clear a deferred-interest promotion before it ends. Worked out again each day
-- from the ledger and the plan; a row is kept so an item can be marked done,
-- pushed to a phone once, and replaced (superseded) when the plan moves on.
-- The last payment change marked done is what the bank is set to pay.
CREATE TABLE "DebtReminder" (
 "id" UUID PRIMARY KEY,
 "budgetId" UUID NOT NULL REFERENCES "Budget"("id") ON DELETE RESTRICT,
 "accountId" UUID NOT NULL,
 "kind" VARCHAR(16) NOT NULL CHECK ("kind" IN
   ('PAYMENT_CHANGE','TERMS_CHECK','PROMO_AT_RISK','PROMO_DEADLINE','UNDERPAID','RATE_MISMATCH')),
 "dedupeKey" VARCHAR(160) NOT NULL,
 "level" VARCHAR(6) NOT NULL CHECK ("level" IN ('act','review')),
 "fromAmount" BIGINT,
 "toAmount" BIGINT,
 "dueDate" DATE,
 "text" VARCHAR(400) NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "doneAt" TIMESTAMPTZ(3),
 "supersededAt" TIMESTAMPTZ(3),
 "pushedAt" TIMESTAMPTZ(3)
);
CREATE UNIQUE INDEX "DebtReminder_budgetId_dedupeKey_key" ON "DebtReminder"("budgetId","dedupeKey");
CREATE INDEX "DebtReminder_budgetId_open_idx" ON "DebtReminder"("budgetId") WHERE "doneAt" IS NULL AND "supersededAt" IS NULL;
ALTER TABLE "DebtReminder" ADD FOREIGN KEY ("accountId","budgetId") REFERENCES "FinancialAccount"(id,"budgetId") ON DELETE RESTRICT;

ALTER TABLE "Job" DROP CONSTRAINT "Job_kind_check";
ALTER TABLE "Job" ADD CONSTRAINT "Job_kind_check"
 CHECK ("kind" IN ('provider.sync','maintenance','schedules.enter','debt.plan.track','notify.push'));
