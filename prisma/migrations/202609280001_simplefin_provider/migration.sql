-- SimpleFIN Bridge joins Plaid as a bank provider (Teller withdrew its API).
ALTER TABLE "ProviderConnection" DROP CONSTRAINT "provider_known";
ALTER TABLE "ProviderConnection" ADD CONSTRAINT "provider_known" CHECK ("provider" IN ('PLAID','FILE','SIMPLEFIN'));

-- What the provider last said needs attention while still returning data,
-- such as one bank inside a SimpleFIN connection asking to sign in again.
ALTER TABLE "ProviderConnection" ADD COLUMN "warning" VARCHAR(400);

-- A bank account moved from one provider to another: the provider account it
-- took over. Transactions that one imported stay matchable, so the overlap
-- re-read by the new provider matches them instead of duplicating.
ALTER TABLE "ProviderAccount" ADD COLUMN "replacesAccountId" UUID;
ALTER TABLE "ProviderAccount" ADD FOREIGN KEY ("replacesAccountId","budgetId") REFERENCES "ProviderAccount"("id","budgetId") ON DELETE RESTRICT;
