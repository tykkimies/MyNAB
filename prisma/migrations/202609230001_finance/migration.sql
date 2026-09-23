-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'FINANCE_COMMAND';

-- AlterTable
ALTER TABLE "Budget" ADD COLUMN     "financeRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "details" JSONB;

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" VARCHAR(24) NOT NULL,
    "participation" VARCHAR(16) NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryGroup" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CategoryGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "paymentAccountId" UUID,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "reversesId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Posting" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "journalId" UUID NOT NULL,
    "accountId" UUID,
    "systemAccount" VARCHAR(16),
    "amount" BIGINT NOT NULL,

    CONSTRAINT "Posting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "journalId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "transferAccountId" UUID,
    "kind" VARCHAR(16) NOT NULL,
    "date" DATE NOT NULL,
    "amount" BIGINT NOT NULL,
    "payee" VARCHAR(120) NOT NULL DEFAULT '',
    "memo" VARCHAR(500) NOT NULL DEFAULT '',
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" VARCHAR(500),
    "replacesId" UUID,
    "refundOfId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialSplit" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "FinancialSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionState" (
    "transactionId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "cleared" BOOLEAN NOT NULL DEFAULT false,
    "reconciliationId" UUID,

    CONSTRAINT "TransactionState_pkey" PRIMARY KEY ("transactionId","accountId")
);

-- CreateTable
CREATE TABLE "BudgetAssignment" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "amount" BIGINT NOT NULL,
    "moveId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "observed" BIGINT NOT NULL,
    "calculated" BIGINT NOT NULL,
    "affectedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationItem" (
    "reconciliationId" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "budgetId" UUID NOT NULL,

    CONSTRAINT "ReconciliationItem_pkey" PRIMARY KEY ("reconciliationId","transactionId","accountId")
);

-- CreateTable
CREATE TABLE "FinanceRequest" (
    "budgetId" UUID NOT NULL,
    "key" UUID NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceRequest_pkey" PRIMARY KEY ("budgetId","key")
);

-- CreateIndex
CREATE INDEX "FinancialAccount_budgetId_idx" ON "FinancialAccount"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_id_budgetId_key" ON "FinancialAccount"("id", "budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryGroup_id_budgetId_key" ON "CategoryGroup"("id", "budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_paymentAccountId_key" ON "Category"("paymentAccountId");

-- CreateIndex
CREATE INDEX "Category_budgetId_idx" ON "Category"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_id_budgetId_key" ON "Category"("id", "budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_reversesId_key" ON "Journal"("reversesId");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_id_budgetId_key" ON "Journal"("id", "budgetId");

-- CreateIndex
CREATE INDEX "Posting_journalId_idx" ON "Posting"("journalId");

-- CreateIndex
CREATE INDEX "Posting_accountId_idx" ON "Posting"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_journalId_key" ON "FinancialTransaction"("journalId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_replacesId_key" ON "FinancialTransaction"("replacesId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_budgetId_date_idx" ON "FinancialTransaction"("budgetId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_id_budgetId_key" ON "FinancialTransaction"("id", "budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialSplit_transactionId_position_key" ON "FinancialSplit"("transactionId", "position");

-- CreateIndex
CREATE INDEX "BudgetAssignment_budgetId_month_idx" ON "BudgetAssignment"("budgetId", "month");

-- CreateIndex
CREATE INDEX "Reconciliation_accountId_createdAt_idx" ON "Reconciliation"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reconciliation_id_budgetId_key" ON "Reconciliation"("id", "budgetId");

ALTER TABLE "FinancialAccount" ADD FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE RESTRICT;
ALTER TABLE "CategoryGroup" ADD FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE RESTRICT;
ALTER TABLE "Category" ADD FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE RESTRICT;
ALTER TABLE "Journal" ADD FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE RESTRICT;
ALTER TABLE "Posting" ADD FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE RESTRICT;
ALTER TABLE "FinancialTransaction" ADD FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE RESTRICT;
ALTER TABLE "FinancialSplit" ADD FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE RESTRICT;
ALTER TABLE "TransactionState" ADD FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE RESTRICT;
ALTER TABLE "BudgetAssignment" ADD FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE RESTRICT;
ALTER TABLE "Reconciliation" ADD FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE RESTRICT;
ALTER TABLE "ReconciliationItem" ADD FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE RESTRICT;
ALTER TABLE "FinanceRequest" ADD FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE RESTRICT;
ALTER TABLE "Category" ADD FOREIGN KEY ("groupId","budgetId") REFERENCES "CategoryGroup"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "Category" ADD FOREIGN KEY ("paymentAccountId","budgetId") REFERENCES "FinancialAccount"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "Posting" ADD FOREIGN KEY ("journalId","budgetId") REFERENCES "Journal"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "Posting" ADD FOREIGN KEY ("accountId","budgetId") REFERENCES "FinancialAccount"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "Journal" ADD FOREIGN KEY ("reversesId","budgetId") REFERENCES "Journal"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "FinancialTransaction" ADD FOREIGN KEY ("journalId","budgetId") REFERENCES "Journal"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "FinancialTransaction" ADD FOREIGN KEY ("accountId","budgetId") REFERENCES "FinancialAccount"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "FinancialTransaction" ADD FOREIGN KEY ("transferAccountId","budgetId") REFERENCES "FinancialAccount"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "FinancialTransaction" ADD FOREIGN KEY ("replacesId","budgetId") REFERENCES "FinancialTransaction"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "FinancialTransaction" ADD FOREIGN KEY ("refundOfId","budgetId") REFERENCES "FinancialTransaction"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "FinancialSplit" ADD FOREIGN KEY ("transactionId","budgetId") REFERENCES "FinancialTransaction"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "FinancialSplit" ADD FOREIGN KEY ("categoryId","budgetId") REFERENCES "Category"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "TransactionState" ADD FOREIGN KEY ("transactionId","budgetId") REFERENCES "FinancialTransaction"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "TransactionState" ADD FOREIGN KEY ("accountId","budgetId") REFERENCES "FinancialAccount"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "TransactionState" ADD FOREIGN KEY ("reconciliationId","budgetId") REFERENCES "Reconciliation"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "BudgetAssignment" ADD FOREIGN KEY ("categoryId","budgetId") REFERENCES "Category"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "Reconciliation" ADD FOREIGN KEY ("accountId","budgetId") REFERENCES "FinancialAccount"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "ReconciliationItem" ADD FOREIGN KEY ("reconciliationId","budgetId") REFERENCES "Reconciliation"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "ReconciliationItem" ADD FOREIGN KEY ("transactionId","budgetId") REFERENCES "FinancialTransaction"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "ReconciliationItem" ADD FOREIGN KEY ("accountId","budgetId") REFERENCES "FinancialAccount"(id,"budgetId") ON DELETE RESTRICT;
ALTER TABLE "FinancialAccount" ADD CHECK (type IN ('CHECKING','SAVINGS','CASH','CREDIT_CARD','LINE_OF_CREDIT','LOAN','INVESTMENT','OTHER_ASSET','OTHER_LIABILITY')), ADD CHECK (participation IN ('BUDGET','TRACKING')), ADD CHECK (participation <> 'BUDGET' OR type IN ('CHECKING','SAVINGS','CASH','CREDIT_CARD','LINE_OF_CREDIT')), ADD CHECK (length(trim(name)) > 0);
ALTER TABLE "Category" ADD CHECK (length(trim(name)) > 0);
ALTER TABLE "CategoryGroup" ADD CHECK (length(trim(name)) > 0);
ALTER TABLE "Posting" ADD CHECK (amount <> 0), ADD CHECK (("accountId" IS NULL) <> ("systemAccount" IS NULL)), ADD CHECK ("systemAccount" IN ('INCOME','EXPENSE','OPENING','ADJUSTMENT','CREDIT','REFUND'));
ALTER TABLE "FinancialTransaction" ADD CHECK (amount <> 0), ADD CHECK (kind IN ('OPENING','INCOME','EXPENSE','REFUND','CREDIT','ADJUSTMENT','TRANSFER')), ADD CHECK ((kind = 'TRANSFER') = ("transferAccountId" IS NOT NULL)), ADD CHECK ("accountId" <> "transferAccountId"), ADD CHECK (kind NOT IN ('INCOME','REFUND','CREDIT') OR amount > 0), ADD CHECK (kind <> 'EXPENSE' OR amount < 0), ADD CHECK (("voidedAt" IS NULL) = ("voidReason" IS NULL)), ADD CHECK (date >= DATE '1900-01-01');
ALTER TABLE "FinancialSplit" ADD CHECK (amount <> 0), ADD CHECK (position >= 0);
ALTER TABLE "BudgetAssignment" ADD CHECK (amount <> 0), ADD CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND month >= '1900-01');
ALTER TABLE "Reconciliation" ADD CHECK (observed = calculated);
CREATE FUNCTION reject_financial_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable financial record'; END $$;
CREATE TRIGGER journal_immutable BEFORE UPDATE OR DELETE ON "Journal" FOR EACH ROW EXECUTE FUNCTION reject_financial_rewrite();
CREATE TRIGGER posting_immutable BEFORE UPDATE OR DELETE ON "Posting" FOR EACH ROW EXECUTE FUNCTION reject_financial_rewrite();
CREATE TRIGGER split_immutable BEFORE UPDATE OR DELETE ON "FinancialSplit" FOR EACH ROW EXECUTE FUNCTION reject_financial_rewrite();
CREATE TRIGGER assignment_immutable BEFORE UPDATE OR DELETE ON "BudgetAssignment" FOR EACH ROW EXECUTE FUNCTION reject_financial_rewrite();
CREATE TRIGGER reconciliation_item_immutable BEFORE UPDATE OR DELETE ON "ReconciliationItem" FOR EACH ROW EXECUTE FUNCTION reject_financial_rewrite();
CREATE TRIGGER request_immutable BEFORE UPDATE OR DELETE ON "FinanceRequest" FOR EACH ROW EXECUTE FUNCTION reject_financial_rewrite();
CREATE FUNCTION check_transaction_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP = 'DELETE' OR OLD."voidedAt" IS NOT NULL OR NEW."voidedAt" IS NULL OR (to_jsonb(OLD) - 'voidedAt' - 'voidReason') <> (to_jsonb(NEW) - 'voidedAt' - 'voidReason') THEN RAISE EXCEPTION 'Use reversal and replacement'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER transaction_immutable BEFORE UPDATE OR DELETE ON "FinancialTransaction" FOR EACH ROW EXECUTE FUNCTION check_transaction_rewrite();
CREATE FUNCTION check_reconciliation_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP = 'DELETE' OR (to_jsonb(OLD) - 'affectedAt') <> (to_jsonb(NEW) - 'affectedAt') OR NEW."affectedAt" IS NULL THEN RAISE EXCEPTION 'Immutable reconciliation'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER reconciliation_immutable BEFORE UPDATE OR DELETE ON "Reconciliation" FOR EACH ROW EXECUTE FUNCTION check_reconciliation_rewrite();
CREATE FUNCTION check_journal_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE jid uuid; j "Journal"; n bigint; total numeric;
BEGIN
 jid := CASE WHEN TG_TABLE_NAME = 'Journal' THEN NEW.id ELSE NEW."journalId" END;
 SELECT * INTO j FROM "Journal" WHERE id = jid;
 SELECT count(*),coalesce(sum(amount),0) INTO n,total FROM "Posting" WHERE "journalId" = jid;
 IF n < 2 OR total <> 0 THEN RAISE EXCEPTION 'Journal must balance with at least two postings'; END IF;
 IF j."reversesId" IS NOT NULL THEN
  IF EXISTS (SELECT 1 FROM "Journal" WHERE id=j."reversesId" AND "reversesId" IS NOT NULL) OR EXISTS (
   SELECT "accountId","systemAccount",sum(amount) FROM "Posting" WHERE "journalId" IN (jid,j."reversesId") GROUP BY "accountId","systemAccount" HAVING sum(amount) <> 0
  ) THEN RAISE EXCEPTION 'Reversal must exactly reverse original journal'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_balanced AFTER INSERT ON "Journal" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_integrity();
CREATE CONSTRAINT TRIGGER posting_balanced AFTER INSERT ON "Posting" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_integrity();
CREATE FUNCTION check_transaction_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid; t "FinancialTransaction"; a "FinancialAccount"; b "FinancialAccount"; total numeric; n bigint; expected numeric;
BEGIN
 tid := CASE WHEN TG_TABLE_NAME = 'FinancialTransaction' THEN NEW.id ELSE NEW."transactionId" END;
 SELECT * INTO t FROM "FinancialTransaction" WHERE id=tid;
 SELECT * INTO a FROM "FinancialAccount" WHERE id=t."accountId";
 SELECT * INTO b FROM "FinancialAccount" WHERE id=t."transferAccountId";
 IF (SELECT date FROM "Journal" WHERE id=t."journalId") <> t.date OR (SELECT coalesce(sum(amount),0) FROM "Posting" WHERE "journalId"=t."journalId" AND "accountId"=t."accountId") <> t.amount OR (t."transferAccountId" IS NOT NULL AND (SELECT coalesce(sum(amount),0) FROM "Posting" WHERE "journalId"=t."journalId" AND "accountId"=t."transferAccountId") <> -t.amount) THEN RAISE EXCEPTION 'Transaction must match journal'; END IF;
 IF (SELECT count(*) FROM "Posting" WHERE "journalId"=t."journalId") <> 2 THEN RAISE EXCEPTION 'Manual transaction requires two postings'; END IF;
 IF t."voidedAt" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Journal" WHERE "reversesId"=t."journalId") THEN RAISE EXCEPTION 'Void requires reversal'; END IF;
 SELECT count(*),coalesce(sum(amount),0) INTO n,total FROM "FinancialSplit" WHERE "transactionId"=tid;
 expected := CASE WHEN a.participation='BUDGET' THEN t.amount ELSE -t.amount END;
 IF t.kind='TRANSFER' AND a.participation<>b.participation THEN
  IF (expected < 0 OR n > 0) AND (n=0 OR total<>expected) THEN RAISE EXCEPTION 'Boundary transfer splits must match'; END IF;
 ELSIF t.kind IN ('EXPENSE','REFUND') AND a.participation='BUDGET' THEN
  IF n=0 OR total<>t.amount THEN RAISE EXCEPTION 'Splits must match transaction'; END IF;
 ELSIF n<>0 THEN RAISE EXCEPTION 'Unexpected category splits'; END IF;
 IF EXISTS (SELECT 1 FROM "FinancialSplit" s JOIN "Category" c ON c.id=s."categoryId" WHERE s."transactionId"=tid AND (c."paymentAccountId" IS NOT NULL OR sign(s.amount)<>sign(expected))) THEN RAISE EXCEPTION 'Invalid split category or sign'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER transaction_integrity AFTER INSERT OR UPDATE ON "FinancialTransaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_transaction_integrity();
CREATE CONSTRAINT TRIGGER split_integrity AFTER INSERT ON "FinancialSplit" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_transaction_integrity();
