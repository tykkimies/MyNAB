-- Targets describe what a category needs each month. They are guidance only:
-- nothing here assigns money, and a target can never create money that the
-- budget does not already hold.
CREATE TABLE "CategoryTarget" (
    "categoryId" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "amount" BIGINT NOT NULL,
    "dueMonth" VARCHAR(7),
    "cadenceMonths" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryTarget_pkey" PRIMARY KEY ("categoryId")
);

CREATE UNIQUE INDEX "CategoryTarget_categoryId_budgetId_key" ON "CategoryTarget"("categoryId", "budgetId");
CREATE INDEX "CategoryTarget_budgetId_idx" ON "CategoryTarget"("budgetId");

-- Composite ownership, so a target cannot reference another budget's category.
ALTER TABLE "CategoryTarget" ADD FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE RESTRICT;
ALTER TABLE "CategoryTarget" ADD FOREIGN KEY ("categoryId","budgetId") REFERENCES "Category"(id,"budgetId") ON DELETE RESTRICT;

-- The vocabulary is closed at the database so no caller can invent a type.
ALTER TABLE "CategoryTarget" ADD CONSTRAINT "target_type_known" CHECK (
  "type" IN ('BALANCE','BALANCE_BY_DATE','MONTHLY','SPENDING_LIMIT','PERIODIC','MAINTAIN')
);
ALTER TABLE "CategoryTarget" ADD CONSTRAINT "target_amount_positive" CHECK ("amount" > 0);
-- Dated types need a month; a cadence only means something for a periodic one.
ALTER TABLE "CategoryTarget" ADD CONSTRAINT "target_due_month_required" CHECK (
  ("type" IN ('BALANCE_BY_DATE','PERIODIC')) = ("dueMonth" IS NOT NULL)
);
ALTER TABLE "CategoryTarget" ADD CONSTRAINT "target_cadence_sane" CHECK (
  "cadenceMonths" IS NULL OR ("type" = 'PERIODIC' AND "cadenceMonths" >= 1)
);
