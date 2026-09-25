-- YNAB's "twice a month": the chosen day and fifteen days later, every month.
ALTER TABLE "Schedule" ALTER COLUMN "cadence" TYPE VARCHAR(16);
ALTER TABLE "Schedule" DROP CONSTRAINT "Schedule_cadence_check";
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_cadence_check"
  CHECK ("cadence" IN ('ONCE','DAILY','WEEKLY','TWICE_MONTHLY','MONTHLY','YEARLY'));
