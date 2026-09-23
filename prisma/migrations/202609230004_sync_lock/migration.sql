-- A sync calls the provider outside any database transaction, so the lock that
-- prevents two concurrent syncs cannot be a row lock. This timestamp is claimed
-- in its own committed transaction before the call and released afterwards.
ALTER TABLE "ProviderConnection" ADD COLUMN "syncingSince" TIMESTAMPTZ(3);
