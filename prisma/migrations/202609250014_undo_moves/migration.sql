-- Undo a money move by appending its reversal; the original rows stay.
ALTER TABLE "BudgetAssignment" ADD COLUMN "undoOf" UUID;
ALTER TABLE "BudgetAssignment" DROP CONSTRAINT "BudgetAssignment_origin_check";
ALTER TABLE "BudgetAssignment" ADD CONSTRAINT "BudgetAssignment_origin_check"
  CHECK ("origin" IS NULL OR "origin" ~ '^(ASSIGN|MOVE|TARGET_FUND|UNDO|AUTO_ASSIGN:[A-Z_]+)$');
ALTER TABLE "BudgetAssignment" ADD CONSTRAINT "BudgetAssignment_undo_origin_check"
  CHECK (("undoOf" IS NULL) = ("origin" IS DISTINCT FROM 'UNDO'));
CREATE INDEX "BudgetAssignment_undoOf_idx" ON "BudgetAssignment"("budgetId", "undoOf");
