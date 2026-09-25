CREATE TABLE "ImportBatch" (
 "id" UUID PRIMARY KEY,
 "budgetId" UUID NOT NULL REFERENCES "Budget"("id"),
 "accountId" UUID NOT NULL,
 "format" VARCHAR(8) NOT NULL CHECK ("format" IN ('CSV','OFX')),
 "fileName" VARCHAR(120) NOT NULL DEFAULT '',
 "fileHash" CHAR(64) NOT NULL,
 "rows" INTEGER NOT NULL CHECK ("rows" >= 0),
 "created" INTEGER NOT NULL CHECK ("created" >= 0),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "undoneAt" TIMESTAMPTZ(3),
 UNIQUE ("id","budgetId"),
 FOREIGN KEY ("accountId","budgetId") REFERENCES "FinancialAccount"("id","budgetId")
);
CREATE INDEX "ImportBatch_budgetId_createdAt_idx" ON "ImportBatch"("budgetId","createdAt");
ALTER TABLE "IngestedEntry" ADD COLUMN "batchId" UUID;
ALTER TABLE "IngestedEntry" ADD FOREIGN KEY ("batchId","budgetId") REFERENCES "ImportBatch"("id","budgetId");
CREATE INDEX "IngestedEntry_batchId_idx" ON "IngestedEntry"("batchId");
-- File imports are a source like a bank, recorded as provider FILE.
ALTER TABLE "ProviderConnection" DROP CONSTRAINT "provider_known";
ALTER TABLE "ProviderConnection" ADD CONSTRAINT "provider_known" CHECK ("provider" IN ('PLAID','FILE'));
