-- Payments the owner has fixed in an adopted plan, by card and month, as
-- cents strings: {"<accountId>": {"2026-09": "30000"}}. The plan pays exactly
-- that in that month and plans the other cards around it.
ALTER TABLE "DebtPlan" ADD COLUMN "pins" JSONB NOT NULL DEFAULT '{}';
