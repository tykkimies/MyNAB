-- Emergency fund sized from spending: a build-up (BALANCE) target whose goal is
-- coverMonths of ordinary monthly spending (coverBasis, cents) at that version.
ALTER TABLE "CategoryTarget" ADD COLUMN "coverMonths" INTEGER;
ALTER TABLE "CategoryTarget" ADD COLUMN "coverBasis" BIGINT;
ALTER TABLE "CategoryTarget" ADD CONSTRAINT "CategoryTarget_coverMonths_check"
  CHECK ("coverMonths" IS NULL OR ("coverMonths" IN (3, 6) AND "type" = 'BALANCE'));
