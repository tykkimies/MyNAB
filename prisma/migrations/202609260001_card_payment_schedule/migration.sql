-- The one payment schedule each card's terms maintain: saving terms with a due
-- day and a paying account creates or replaces it. Owner-made schedules leave
-- this null and are never touched by terms.
ALTER TABLE "Schedule" ADD COLUMN "paymentForAccountId" UUID;
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_paymentFor_budget_fk"
 FOREIGN KEY ("paymentForAccountId", "budgetId") REFERENCES "FinancialAccount"("id", "budgetId");
CREATE INDEX "Schedule_budgetId_paymentForAccountId_idx" ON "Schedule"("budgetId", "paymentForAccountId");

-- A card's monthly payment target is due on the card's due day too.
ALTER TABLE "CategoryTarget" DROP CONSTRAINT "target_due_day_sane";
ALTER TABLE "CategoryTarget" ADD CONSTRAINT "target_due_day_sane" CHECK (
  "dueDay" IS NULL OR ("dueDay" BETWEEN 1 AND 31 AND "type" IN ('MONTHLY', 'PERIODIC', 'DEBT_PAYOFF'))
);
