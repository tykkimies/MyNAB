-- Preserve all accepted history. New pending observations have no ledger transaction.
ALTER TABLE "ProviderConnection" ADD COLUMN "syncToken" UUID;
ALTER TABLE "IngestedEntry" ALTER COLUMN "transactionId" DROP NOT NULL;
DROP INDEX "IngestedEntry_transactionId_key";
CREATE INDEX "IngestedEntry_transactionId_idx" ON "IngestedEntry"("transactionId");
ALTER TABLE "IngestedEntry" ADD COLUMN "removed" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "review" JSONB;
-- Prior releases posted pending observations. Never silently rewrite these records.
UPDATE "IngestedEntry" SET review=jsonb_build_object('id',id::text,'kind','legacy-pending'), approved=false WHERE status='PENDING' AND "transactionId" IS NOT NULL;
CREATE OR REPLACE FUNCTION check_ingested_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "ProviderAccount" WHERE id=NEW."providerAccountId" AND "accountId" IS NOT NULL AND "connectionId"=NEW."connectionId" AND "budgetId"=NEW."budgetId") THEN
  RAISE EXCEPTION 'Ingested entry requires a linked account in the same connection and budget';
 END IF;
 RETURN NULL;
END $$;
