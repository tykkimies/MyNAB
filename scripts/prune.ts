import "dotenv/config";
import { getDb } from "../src/infrastructure/db";
import { SESSION_IDLE_MS, THROTTLE_WINDOW_MS } from "../src/application/auth";
const db = getDb();
try {
  const now = new Date();
  await db.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lte: now } },
        { lastSeenAt: { lte: new Date(now.getTime() - SESSION_IDLE_MS) } },
      ],
    },
  });
  await db.loginThrottle.deleteMany({
    where: {
      windowStart: { lt: new Date(now.getTime() - THROTTLE_WINDOW_MS) },
    },
  });
  console.log("Expired sessions and throttle windows removed.");
} catch {
  console.error("Cleanup failed.");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
