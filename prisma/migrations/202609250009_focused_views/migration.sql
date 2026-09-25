CREATE TABLE "FocusedView" (
  "id" UUID NOT NULL,
  "budgetId" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FocusedView_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FocusedView_id_budgetId_key" UNIQUE ("id", "budgetId"),
  CONSTRAINT "FocusedView_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT
);
CREATE INDEX "FocusedView_budgetId_sortOrder_idx" ON "FocusedView"("budgetId", "sortOrder");

CREATE TABLE "FocusedViewCategory" (
  "viewId" UUID NOT NULL,
  "budgetId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  CONSTRAINT "FocusedViewCategory_pkey" PRIMARY KEY ("viewId", "categoryId"),
  CONSTRAINT "FocusedViewCategory_view_budget_fkey" FOREIGN KEY ("viewId", "budgetId") REFERENCES "FocusedView"("id", "budgetId") ON DELETE CASCADE,
  CONSTRAINT "FocusedViewCategory_category_budget_fkey" FOREIGN KEY ("categoryId", "budgetId") REFERENCES "Category"("id", "budgetId") ON DELETE RESTRICT
);
CREATE INDEX "FocusedViewCategory_budgetId_categoryId_idx" ON "FocusedViewCategory"("budgetId", "categoryId");
