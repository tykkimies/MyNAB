-- YNAB's Delete Account, for an account with no history beyond its starting
-- balance. The row stays (append-only ledger, composite keys); it simply leaves
-- every view once deleted.
ALTER TABLE "FinancialAccount" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_deleted_closed_check"
  CHECK ("deletedAt" IS NULL OR "closed");
