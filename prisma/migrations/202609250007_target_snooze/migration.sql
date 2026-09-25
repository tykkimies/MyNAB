CREATE TABLE "TargetSnooze" (
  "budgetId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  "month" VARCHAR(7) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TargetSnooze_pkey" PRIMARY KEY ("budgetId", "categoryId", "month"),
  CONSTRAINT "TargetSnooze_month_check" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "TargetSnooze_category_budget_fkey" FOREIGN KEY ("categoryId", "budgetId")
    REFERENCES "Category"("id", "budgetId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "TargetSnooze_budgetId_month_idx" ON "TargetSnooze"("budgetId", "month");
