-- YNAB's "due on the Nth" for monthly and repeating targets. Display only;
-- funding still asks for the month's amount.
ALTER TABLE "CategoryTarget" ADD COLUMN "dueDay" INTEGER;
ALTER TABLE "CategoryTarget" ADD CONSTRAINT "target_due_day_sane" CHECK (
  "dueDay" IS NULL OR ("dueDay" BETWEEN 1 AND 31 AND "type" IN ('MONTHLY', 'PERIODIC'))
);
