import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getConfig } from "./config";
const globalDb = globalThis as unknown as { mynabDb?: PrismaClient };
export function getDb(): PrismaClient {
  if (!globalDb.mynabDb) {
    const adapter = new PrismaPg({
      connectionString: getConfig().DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 3000,
      statement_timeout: 5000,
    });
    globalDb.mynabDb = new PrismaClient({ adapter, log: [] });
  }
  return globalDb.mynabDb;
}
