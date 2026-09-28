-- The promotion's exact last day, on its intro version. A deferred balance
-- must be cleared by a payment due before this day; a month alone could let
-- the last planned payment fall due on the day the interest is charged.
ALTER TABLE "DebtTerms" ADD COLUMN "promoEndsOn" DATE;
