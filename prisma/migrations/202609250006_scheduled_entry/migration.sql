-- Scheduled transactions entered on their date await owner or bank confirmation.
ALTER TABLE "ScheduleOccurrence" DROP CONSTRAINT "ScheduleOccurrence_status_check";
ALTER TABLE "ScheduleOccurrence" ADD CONSTRAINT "ScheduleOccurrence_status_check"
 CHECK ("status" IN ('APPROVED','SKIPPED','ENTERED'));
ALTER TABLE "ScheduleOccurrence" DROP CONSTRAINT "ScheduleOccurrence_check";
ALTER TABLE "ScheduleOccurrence" ADD CONSTRAINT "ScheduleOccurrence_check"
 CHECK (("status" IN ('APPROVED','ENTERED')) = ("transactionId" IS NOT NULL));
ALTER TABLE "Job" DROP CONSTRAINT "Job_kind_check";
ALTER TABLE "Job" ADD CONSTRAINT "Job_kind_check"
 CHECK ("kind" IN ('provider.sync','maintenance','schedules.enter'));
