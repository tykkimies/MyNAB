-- Spending review: the owner's own verdict on a purchase. UNPLANNED marks an
-- impulse buy; PLANNED says a purchase flagged as unusual was intended.
ALTER TABLE "TransactionPreference" ADD COLUMN "spendingReview" VARCHAR(10);
ALTER TABLE "TransactionPreference" ADD CONSTRAINT "TransactionPreference_spendingReview_check"
  CHECK ("spendingReview" IS NULL OR "spendingReview" IN ('UNPLANNED','PLANNED'));
CREATE INDEX "TransactionPreference_budgetId_spendingReview_idx"
  ON "TransactionPreference"("budgetId", "spendingReview");
