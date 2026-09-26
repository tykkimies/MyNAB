-- An adopted payoff plan now follows itself: the worker applies each month and
-- retires cards that are paid off. "paidOff" lists those cards, so new
-- spending on one does not bring it back into the plan.
ALTER TABLE "DebtPlan" ADD COLUMN "paidOff" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Job" DROP CONSTRAINT "Job_kind_check";
ALTER TABLE "Job" ADD CONSTRAINT "Job_kind_check"
 CHECK ("kind" IN ('provider.sync','maintenance','schedules.enter','debt.plan.track'));
