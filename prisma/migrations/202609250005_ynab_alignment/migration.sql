-- An import linked to a transaction the owner entered, rather than one it created.
ALTER TABLE "IngestedEntry" ADD COLUMN "matched" BOOLEAN NOT NULL DEFAULT false;
