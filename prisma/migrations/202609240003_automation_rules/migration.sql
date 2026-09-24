CREATE TABLE "AutomationRule" (
 "id" UUID PRIMARY KEY, "budgetId" UUID NOT NULL REFERENCES "Budget"("id"),
 "name" VARCHAR(120) NOT NULL, "priority" INTEGER NOT NULL DEFAULT 100,
 "enabled" BOOLEAN NOT NULL DEFAULT true, "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision">0),
 "accountId" UUID, "payeeMatch" VARCHAR(120), "matchMode" VARCHAR(8) NOT NULL DEFAULT 'CONTAINS' CHECK ("matchMode" IN ('CONTAINS','EXACT')),
 "descriptionContains" VARCHAR(500), "minimum" BIGINT, "maximum" BIGINT,
 "renamePayee" VARCHAR(120), "categoryId" UUID, "memo" VARCHAR(500), "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "transferAccountId" UUID, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("id","budgetId"), CHECK ("minimum" IS NULL OR "maximum" IS NULL OR "minimum" <= "maximum"),
 FOREIGN KEY ("accountId","budgetId") REFERENCES "FinancialAccount"("id","budgetId"),
 FOREIGN KEY ("categoryId","budgetId") REFERENCES "Category"("id","budgetId"),
 FOREIGN KEY ("transferAccountId","budgetId") REFERENCES "FinancialAccount"("id","budgetId")
);
CREATE INDEX "AutomationRule_budgetId_priority_id_idx" ON "AutomationRule"("budgetId","priority","id");
