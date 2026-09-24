ALTER TABLE "DebtTerms"
 ADD COLUMN "minimumPercentBasisPoints" INTEGER NOT NULL DEFAULT 0
   CHECK ("minimumPercentBasisPoints" BETWEEN 0 AND 10000),
 ADD COLUMN "minimumIncludesInterest" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "statementBalance" BIGINT,
 ADD COLUMN "statementDate" DATE;
