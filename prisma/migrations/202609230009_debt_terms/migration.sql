-- Terms come from the institution's contract, which this application cannot
-- read. Balances are never stored here: they are always derived from the
-- ledger, so a scenario can never become a fact.
CREATE TABLE "DebtTerms" (
    "accountId" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "aprBasisPoints" INTEGER NOT NULL,
    "minimumPayment" BIGINT NOT NULL,
    "dueDay" INTEGER,
    "creditLimit" BIGINT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtTerms_pkey" PRIMARY KEY ("accountId")
);

CREATE UNIQUE INDEX "DebtTerms_accountId_budgetId_key" ON "DebtTerms"("accountId", "budgetId");
CREATE INDEX "DebtTerms_budgetId_idx" ON "DebtTerms"("budgetId");

ALTER TABLE "DebtTerms" ADD FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE RESTRICT;
ALTER TABLE "DebtTerms" ADD FOREIGN KEY ("accountId","budgetId") REFERENCES "FinancialAccount"(id,"budgetId") ON DELETE RESTRICT;

-- Ranges wide enough for any real contract and narrow enough to catch a typo.
ALTER TABLE "DebtTerms" ADD CONSTRAINT "terms_apr_sane" CHECK ("aprBasisPoints" BETWEEN 0 AND 100000);
ALTER TABLE "DebtTerms" ADD CONSTRAINT "terms_minimum_sane" CHECK ("minimumPayment" >= 0);
ALTER TABLE "DebtTerms" ADD CONSTRAINT "terms_due_day_sane" CHECK ("dueDay" IS NULL OR ("dueDay" BETWEEN 1 AND 31));
ALTER TABLE "DebtTerms" ADD CONSTRAINT "terms_limit_sane" CHECK ("creditLimit" IS NULL OR "creditLimit" > 0);
