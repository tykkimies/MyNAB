import { config } from "dotenv";
config({ path: ".env.test", quiet: true });
// Every destructive test must use a clearly named, separate test database.
const url = new URL(
  process.env.DATABASE_URL ?? "postgresql://localhost/missing",
);
if (!url.pathname.endsWith("_test"))
  throw new Error("Tests require a DATABASE_URL ending in _test");
process.env.APP_ORIGIN ??= "http://127.0.0.1:3100";
process.env.SECRET_ENCRYPTION_KEY ??= "11".repeat(32); // Synthetic test key, never production.
