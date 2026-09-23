-- Non-destructive correction to trigger record dispatch.
CREATE OR REPLACE FUNCTION check_journal_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE jid uuid; j "Journal"; n bigint; total numeric;
BEGIN
 IF TG_TABLE_NAME = 'Journal' THEN jid := NEW.id; ELSE jid := NEW."journalId"; END IF;
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
CREATE OR REPLACE FUNCTION check_transaction_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid; t "FinancialTransaction"; a "FinancialAccount"; b "FinancialAccount"; total numeric; n bigint; expected numeric;
BEGIN
 IF TG_TABLE_NAME = 'FinancialTransaction' THEN tid := NEW.id; ELSE tid := NEW."transactionId"; END IF;
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
