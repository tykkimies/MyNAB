-- A deferred-interest promotion: set on the intro version of a card's terms.
-- Interest is held back during the promotion and charged in full if any
-- balance remains when it ends. deferredAccrued is what the statement shows
-- as built up so far.
ALTER TABLE "DebtTerms" ADD COLUMN "deferredInterest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DebtTerms" ADD COLUMN "deferredAccrued" BIGINT;
ALTER TABLE "DebtTerms" ADD CONSTRAINT "DebtTerms_deferredAccrued_check"
 CHECK ("deferredAccrued" IS NULL OR ("deferredAccrued" >= 0 AND "deferredInterest"));
