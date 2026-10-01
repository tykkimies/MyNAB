ALTER TABLE "Budget"
  ADD COLUMN "archivedAt" TIMESTAMPTZ(3),
  ADD COLUMN "purgeAfter" TIMESTAMPTZ(3),
  ADD CONSTRAINT "Budget_archive_dates_check" CHECK (
    ("archivedAt" IS NULL AND "purgeAfter" IS NULL)
    OR (
      "archivedAt" IS NOT NULL
      AND "purgeAfter" IS NOT NULL
      AND "purgeAfter" >= "archivedAt"
    )
  );

CREATE INDEX "Budget_archivedAt_purgeAfter_idx"
  ON "Budget" ("archivedAt", "purgeAfter");
