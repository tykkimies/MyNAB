-- Effective dating for targets and debt terms, per PROJECT_SPEC sections 7 and 8.
--
-- A target and a set of contract terms are both decisions made at a point in
-- time. Overwriting one rewrote history: a past month's plan changed because a
-- rate was edited today. Each row now carries the month it takes effect from,
-- and the version in force for a month is the latest one effective on or before
-- it. Existing rows take '1900-01', meaning they have always applied.
--
-- This is also all a promotional rate needs. A 0% intro card is the intro rate
-- effective now and the go-to rate effective from the month it ends; no column
-- has to describe a promotion, and the simulator charges what was in force.

ALTER TABLE "CategoryTarget" ADD COLUMN "effectiveFrom" VARCHAR(7) NOT NULL DEFAULT '1900-01';
ALTER TABLE "CategoryTarget" DROP CONSTRAINT "CategoryTarget_pkey";
ALTER TABLE "CategoryTarget" ADD CONSTRAINT "CategoryTarget_pkey" PRIMARY KEY ("categoryId","effectiveFrom");
DROP INDEX "CategoryTarget_categoryId_budgetId_key";
CREATE UNIQUE INDEX "CategoryTarget_categoryId_budgetId_effectiveFrom_key"
  ON "CategoryTarget"("categoryId","budgetId","effectiveFrom");

ALTER TABLE "DebtTerms" ADD COLUMN "effectiveFrom" VARCHAR(7) NOT NULL DEFAULT '1900-01';
ALTER TABLE "DebtTerms" DROP CONSTRAINT "DebtTerms_pkey";
ALTER TABLE "DebtTerms" ADD CONSTRAINT "DebtTerms_pkey" PRIMARY KEY ("accountId","effectiveFrom");
DROP INDEX "DebtTerms_accountId_budgetId_key";
CREATE UNIQUE INDEX "DebtTerms_accountId_budgetId_effectiveFrom_key"
  ON "DebtTerms"("accountId","budgetId","effectiveFrom");

-- A month, and nothing else, so an ordering comparison is always meaningful.
ALTER TABLE "CategoryTarget" ADD CONSTRAINT "target_effective_month" CHECK (
  "effectiveFrom" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
);
ALTER TABLE "DebtTerms" ADD CONSTRAINT "terms_effective_month" CHECK (
  "effectiveFrom" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
);

-- Paying off a card is a target like any other. It lives on the card's payment
-- category, and what is owed is read from the ledger at evaluation time, so
-- DEBT_PAYOFF_BY_DATE deliberately stores no amount: a stored balance would be
-- a second answer that could disagree with the ledger.
ALTER TABLE "CategoryTarget" DROP CONSTRAINT "target_type_known";
ALTER TABLE "CategoryTarget" ADD CONSTRAINT "target_type_known" CHECK (
  "type" IN ('BALANCE','BALANCE_BY_DATE','MONTHLY','WEEKLY','SPENDING_LIMIT','PERIODIC',
             'MAINTAIN','DEBT_PAYOFF','DEBT_PAYOFF_BY_DATE')
);
ALTER TABLE "CategoryTarget" DROP CONSTRAINT "target_amount_positive";
ALTER TABLE "CategoryTarget" ADD CONSTRAINT "target_amount_positive" CHECK (
  CASE WHEN "type" = 'DEBT_PAYOFF_BY_DATE' THEN "amount" = 0 ELSE "amount" > 0 END
);
ALTER TABLE "CategoryTarget" DROP CONSTRAINT "target_due_month_required";
ALTER TABLE "CategoryTarget" ADD CONSTRAINT "target_due_month_required" CHECK (
  ("type" IN ('BALANCE_BY_DATE','PERIODIC','DEBT_PAYOFF_BY_DATE')) = ("dueMonth" IS NOT NULL)
);
