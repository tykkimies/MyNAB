CREATE TABLE "TransactionPreference" (
 "transactionId" UUID PRIMARY KEY, "budgetId" UUID NOT NULL,
 "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "locked" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision">0),
 CHECK ("locked" <@ ARRAY['payee','categoryId','memo','tags','transferAccountId']::TEXT[]),
 FOREIGN KEY ("transactionId","budgetId") REFERENCES "FinancialTransaction"("id","budgetId")
);
CREATE INDEX "TransactionPreference_budgetId_idx" ON "TransactionPreference"("budgetId");
