-- YNAB-style colour flags on transactions, and optional per-plan flag names.
ALTER TABLE "TransactionPreference" ADD COLUMN "flag" VARCHAR(8);
ALTER TABLE "TransactionPreference" ADD CONSTRAINT "TransactionPreference_flag_check"
  CHECK ("flag" IS NULL OR "flag" IN ('RED','ORANGE','YELLOW','GREEN','BLUE','PURPLE'));
CREATE INDEX "TransactionPreference_budgetId_flag_idx" ON "TransactionPreference"("budgetId", "flag");

CREATE TABLE "FlagName" (
  "budgetId" UUID NOT NULL,
  "color" VARCHAR(8) NOT NULL,
  "name" VARCHAR(40) NOT NULL,
  CONSTRAINT "FlagName_pkey" PRIMARY KEY ("budgetId", "color"),
  CONSTRAINT "FlagName_color_check" CHECK ("color" IN ('RED','ORANGE','YELLOW','GREEN','BLUE','PURPLE')),
  CONSTRAINT "FlagName_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
