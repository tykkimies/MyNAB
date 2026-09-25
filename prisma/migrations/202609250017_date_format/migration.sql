-- YNAB plan settings: how dates are shown. ISO keeps today's display.
ALTER TABLE "Budget" ADD COLUMN "dateFormat" VARCHAR(4) NOT NULL DEFAULT 'ISO';
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_dateFormat_check" CHECK ("dateFormat" IN ('ISO', 'US', 'EU'));
