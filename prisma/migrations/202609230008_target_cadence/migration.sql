-- Closes two gaps against YNAB: a weekly cadence, and the refill/set-aside
-- toggle. Refill tops a category back up to the amount counting what survived
-- the month; set aside asks for the amount again regardless.
ALTER TABLE "CategoryTarget" ADD COLUMN "refill" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CategoryTarget" ADD COLUMN "dayOfWeek" INTEGER;

ALTER TABLE "CategoryTarget" DROP CONSTRAINT "target_type_known";
ALTER TABLE "CategoryTarget" ADD CONSTRAINT "target_type_known" CHECK (
  "type" IN ('BALANCE','BALANCE_BY_DATE','MONTHLY','WEEKLY','SPENDING_LIMIT','PERIODIC','MAINTAIN')
);
-- A weekday belongs to a weekly target and nothing else.
ALTER TABLE "CategoryTarget" ADD CONSTRAINT "target_weekday_sane" CHECK (
  ("type" = 'WEEKLY') = ("dayOfWeek" IS NOT NULL)
  AND ("dayOfWeek" IS NULL OR ("dayOfWeek" BETWEEN 0 AND 6))
);
-- Refilling only means something where an amount recurs.
ALTER TABLE "CategoryTarget" ADD CONSTRAINT "target_refill_sane" CHECK (
  NOT "refill" OR "type" IN ('MONTHLY','WEEKLY')
);
