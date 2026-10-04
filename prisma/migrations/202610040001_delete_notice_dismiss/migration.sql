-- Hides a deleted-register notice without undoing the void or posting.
ALTER TABLE "FinancialTransaction" ADD COLUMN "noticeDismissedAt" TIMESTAMPTZ(3);
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_notice_dismiss_check"
  CHECK ("noticeDismissedAt" IS NULL OR "voidedAt" IS NOT NULL);

-- The first void may set voidedAt and voidReason. A later update may set
-- noticeDismissedAt once. Every other rewrite still has to be a replacement.
CREATE OR REPLACE FUNCTION check_transaction_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Use reversal and replacement';
  END IF;
  IF OLD."voidedAt" IS NULL AND NEW."voidedAt" IS NOT NULL
     AND (to_jsonb(OLD) - 'voidedAt' - 'voidReason') = (to_jsonb(NEW) - 'voidedAt' - 'voidReason') THEN
    RETURN NEW;
  END IF;
  IF OLD."voidedAt" IS NOT NULL
     AND OLD."noticeDismissedAt" IS NULL
     AND NEW."noticeDismissedAt" IS NOT NULL
     AND (to_jsonb(OLD) - 'noticeDismissedAt') = (to_jsonb(NEW) - 'noticeDismissedAt') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Use reversal and replacement';
END $$;
