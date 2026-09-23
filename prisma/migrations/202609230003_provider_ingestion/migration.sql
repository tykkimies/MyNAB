-- Provider ingestion (Phase 5). See docs/PHASE5_INGESTION.md.
--
-- WARNING: `prisma migrate dev` regenerates this file with a DROP CONSTRAINT for every
-- composite foreign key, because those are declared in raw SQL rather than as Prisma
-- relations. They are the only thing preventing cross-budget references, per
-- PROJECT_SPEC section 16. Always delete the generated DropForeignKey block by hand.

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "system" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProviderConnection" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "provider" VARCHAR(16) NOT NULL,
    "institutionId" VARCHAR(64) NOT NULL,
    "institutionName" VARCHAR(120) NOT NULL,
    "accessToken" VARCHAR(1024) NOT NULL,
    "cursor" VARCHAR(1024),
    "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    "errorCode" VARCHAR(64),
    "lastSyncedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderAccount" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "externalAccountId" VARCHAR(128) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "mask" VARCHAR(16) NOT NULL DEFAULT '',
    "type" VARCHAR(32) NOT NULL,
    "accountId" UUID,

    CONSTRAINT "ProviderAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestedEntry" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "providerAccountId" UUID NOT NULL,
    "externalId" VARCHAR(128) NOT NULL,
    "pendingExternalId" VARCHAR(128),
    "status" VARCHAR(8) NOT NULL,
    "date" DATE NOT NULL,
    "amount" BIGINT NOT NULL,
    "payee" VARCHAR(120) NOT NULL DEFAULT '',
    "transactionId" UUID NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestedEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeclinedMatch" (
    "budgetId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "externalId" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeclinedMatch_pkey" PRIMARY KEY ("connectionId","externalId")
);

-- CreateIndex
CREATE INDEX "ProviderConnection_budgetId_idx" ON "ProviderConnection"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConnection_id_budgetId_key" ON "ProviderConnection"("id", "budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAccount_accountId_key" ON "ProviderAccount"("accountId");

-- CreateIndex
CREATE INDEX "ProviderAccount_budgetId_idx" ON "ProviderAccount"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAccount_id_budgetId_key" ON "ProviderAccount"("id", "budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAccount_connectionId_externalAccountId_key" ON "ProviderAccount"("connectionId", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "IngestedEntry_transactionId_key" ON "IngestedEntry"("transactionId");

-- CreateIndex
CREATE INDEX "IngestedEntry_budgetId_approved_idx" ON "IngestedEntry"("budgetId", "approved");

-- CreateIndex
CREATE UNIQUE INDEX "IngestedEntry_connectionId_externalId_key" ON "IngestedEntry"("connectionId", "externalId");

-- Existing card payment categories are application-managed too.
UPDATE "Category" SET "system" = true WHERE "paymentAccountId" IS NOT NULL;

-- At most one Uncategorized category per budget: system, but not a payment reserve.
CREATE UNIQUE INDEX "Category_uncategorized_key" ON "Category"("budgetId")
  WHERE "system" AND "paymentAccountId" IS NULL;

-- Ownership. Composite keys make a cross-budget reference impossible in SQL, not
-- merely unlikely in service code.
ALTER TABLE "ProviderConnection" ADD FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE RESTRICT;
ALTER TABLE "ProviderAccount" ADD FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE RESTRICT;
ALTER TABLE "IngestedEntry" ADD FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE RESTRICT;
ALTER TABLE "DeclinedMatch" ADD FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE RESTRICT;
ALTER TABLE "ProviderAccount" ADD FOREIGN KEY ("connectionId","budgetId") REFERENCES "ProviderConnection"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "ProviderAccount" ADD FOREIGN KEY ("accountId","budgetId") REFERENCES "FinancialAccount"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "IngestedEntry" ADD FOREIGN KEY ("connectionId","budgetId") REFERENCES "ProviderConnection"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "IngestedEntry" ADD FOREIGN KEY ("providerAccountId","budgetId") REFERENCES "ProviderAccount"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "IngestedEntry" ADD FOREIGN KEY ("transactionId","budgetId") REFERENCES "FinancialTransaction"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "DeclinedMatch" ADD FOREIGN KEY ("connectionId","budgetId") REFERENCES "ProviderConnection"(id,"budgetId") ON DELETE RESTRICT;

-- Vocabulary is closed at the database, so an adapter cannot invent a state.
ALTER TABLE "ProviderConnection" ADD CONSTRAINT "provider_known" CHECK ("provider" IN ('PLAID'));
ALTER TABLE "ProviderConnection" ADD CONSTRAINT "connection_status_known" CHECK ("status" IN ('ACTIVE','ERROR','DISCONNECTED'));
ALTER TABLE "IngestedEntry" ADD CONSTRAINT "entry_status_known" CHECK ("status" IN ('PENDING','POSTED'));
ALTER TABLE "IngestedEntry" ADD CONSTRAINT "entry_amount_nonzero" CHECK ("amount" <> 0);

-- An unlinked provider account is never synced, so it can hold no ingested entries.
CREATE OR REPLACE FUNCTION check_ingested_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "ProviderAccount" WHERE id = NEW."providerAccountId" AND "accountId" IS NOT NULL) THEN
  RAISE EXCEPTION 'Ingested entry requires a linked provider account';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ingested_entry_linked AFTER INSERT OR UPDATE ON "IngestedEntry"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_ingested_entry();
