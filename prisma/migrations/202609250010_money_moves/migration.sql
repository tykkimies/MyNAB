-- Money Moves: record what produced each assignment row and who asked for it.
-- Existing rows stay NULL; the application infers MOVE (moveId present) or ASSIGN.
ALTER TABLE "BudgetAssignment" ADD COLUMN "origin" VARCHAR(40);
ALTER TABLE "BudgetAssignment" ADD COLUMN "actorId" UUID;
ALTER TABLE "BudgetAssignment" ADD CONSTRAINT "BudgetAssignment_origin_check"
  CHECK ("origin" IS NULL OR "origin" ~ '^(ASSIGN|MOVE|TARGET_FUND|AUTO_ASSIGN:[A-Z_]+)$');
ALTER TABLE "BudgetAssignment" ADD CONSTRAINT "BudgetAssignment_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "BudgetAssignment_moveId_idx" ON "BudgetAssignment"("moveId");
