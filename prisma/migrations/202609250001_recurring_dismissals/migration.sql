CREATE TABLE "RecurringDismissal" (
 "budgetId" UUID NOT NULL REFERENCES "Budget"("id"),
 "key" VARCHAR(500) NOT NULL CHECK (length("key") > 0),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("budgetId","key")
);
