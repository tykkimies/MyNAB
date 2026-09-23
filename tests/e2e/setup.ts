import "../database-env";
import { getDb } from "../../src/infrastructure/db";
import { createOwner } from "../../src/application/auth";
export default async function setup() {
  const db = getDb();
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditEvent", "Session", "BudgetMember", "Installation", "Budget", "User", "LoginThrottle" CASCADE',
  );
  await createOwner("owner", "synthetic-e2e-passphrase-123");
  await db.$disconnect();
}
