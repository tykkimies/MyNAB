-- The one payoff plan a budget has adopted. Only its settings are kept; each
-- month the plan is worked out again from the ledger and applied to the card
-- payment targets and schedules. `applied` records the amount set per card, so
-- a target later changed by hand is recognised and left alone.
CREATE TABLE "DebtPlan" (
 "budgetId" UUID PRIMARY KEY REFERENCES "Budget"("id"),
 "strategy" VARCHAR(16) NOT NULL CHECK ("strategy" IN ('AVALANCHE','SNOWBALL','CUSTOM')),
 "monthlyBudget" BIGINT CHECK ("monthlyBudget" IS NULL OR "monthlyBudget" > 0),
 "extraMonthly" BIGINT NOT NULL DEFAULT 0 CHECK ("extraMonthly" >= 0),
 "ranks" JSONB NOT NULL DEFAULT '{}',
 "clearDeferredFirst" BOOLEAN NOT NULL DEFAULT true,
 "appliedMonth" VARCHAR(7),
 "applied" JSONB NOT NULL DEFAULT '{}',
 "overridden" JSONB NOT NULL DEFAULT '[]',
 "adoptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "revision" INTEGER NOT NULL DEFAULT 1
);
