ALTER TABLE "CategoryGroup"
  ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Category"
  ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "note" VARCHAR(1000) NOT NULL DEFAULT '';

WITH ordered AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "budgetId" ORDER BY "system" ASC, "name", "id"
  )::INTEGER AS position FROM "CategoryGroup"
)
UPDATE "CategoryGroup" AS item SET "sortOrder" = ordered.position
FROM ordered WHERE item."id" = ordered."id";

WITH ordered AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "budgetId", "groupId" ORDER BY "name", "id"
  )::INTEGER AS position FROM "Category"
)
UPDATE "Category" AS item SET "sortOrder" = ordered.position
FROM ordered WHERE item."id" = ordered."id";

CREATE INDEX "CategoryGroup_budgetId_sortOrder_idx"
  ON "CategoryGroup"("budgetId", "sortOrder", "id");
CREATE INDEX "Category_budgetId_groupId_sortOrder_idx"
  ON "Category"("budgetId", "groupId", "sortOrder", "id");
