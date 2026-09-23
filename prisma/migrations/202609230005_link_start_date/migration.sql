-- A linked account starts from the owner's opening balance, not from the
-- institution's full history. Without this boundary the first sync would add
-- months of transactions on top of a balance that already included them.
ALTER TABLE "ProviderAccount" ADD COLUMN "linkedFrom" DATE;
