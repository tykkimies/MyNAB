import "dotenv/config";
import { getDb } from "../src/infrastructure/db";
import { pruneExpired } from "../src/application/jobs";
const db = getDb();
try {
  await pruneExpired();
  console.log("Expired sessions and throttle windows removed.");
} catch {
  console.error("Cleanup failed.");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
