-- Monthly job that re-sizes emergency funds from spending (target.cover.refresh).
ALTER TABLE "Job" DROP CONSTRAINT "Job_kind_check";
ALTER TABLE "Job" ADD CONSTRAINT "Job_kind_check"
 CHECK ("kind" IN ('provider.sync','maintenance','schedules.enter','debt.plan.track','notify.push','emergency.track'));
