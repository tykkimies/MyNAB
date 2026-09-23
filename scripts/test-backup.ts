import "../tests/database-env";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import pg from "pg";
const url = new URL(process.env.DATABASE_URL!);
const source = new pg.Pool({ connectionString: url.href });
const restoreName = `mynab_restore_test_${randomBytes(6).toString("hex")}`;
const restoredUrl = new URL(url);
restoredUrl.pathname = `/${restoreName}`;
const restored = new pg.Pool({ connectionString: restoredUrl.href });
mkdirSync(".local", { recursive: true, mode: 0o700 });
const temp = mkdtempSync(resolve(".local/backup-check-"));
const archive = join(temp, "synthetic.dump");
const environment = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: url.pathname.slice(1),
};
function run(command: string, args: string[]) {
  execFileSync(
    process.env.PG_BIN ? join(process.env.PG_BIN, command) : command,
    args,
    { env: environment, stdio: "pipe" },
  );
}
let created = false;
try {
  if (
    !(await source.query('SELECT count(*)::int AS count FROM "User"')).rows[0]
      .count
  )
    throw new Error("Run browser tests first to populate synthetic owner data");
  run("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-acl",
    "--file",
    archive,
  ]);
  run("pg_restore", ["--list", archive]);
  await source.query(`CREATE DATABASE "${restoreName}"`);
  created = true;
  run("pg_restore", [
    "--exit-on-error",
    "--single-transaction",
    "--no-owner",
    "--no-acl",
    "--dbname",
    restoreName,
    archive,
  ]);
  // Discover tables instead of listing them, so a new migration can never be
  // silently excluded from the only check that proves a backup is restorable.
  const tables = (
    await source.query<{ name: string }>(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
    )
  ).rows.map((r) => r.name);
  if (tables.length < 20)
    throw new Error(`Expected at least 20 tables, found ${tables.length}`);
  // A roundtrip over empty finance tables would pass without proving anything.
  const ledger = ["FinancialTransaction", "Journal", "Posting"];
  for (const table of ledger) {
    const { rows } = await source.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM "${table}"`,
    );
    if (!rows[0].count)
      throw new Error(
        `${table} is empty; run the browser tests first so the ledger is exercised`,
      );
  }
  for (const table of tables) {
    const sql = `SELECT row_to_json(t)::text AS value FROM "${table}" t ORDER BY row_to_json(t)::text`;
    const a = await source.query(sql),
      b = await restored.query(sql);
    if (JSON.stringify(a.rows) !== JSON.stringify(b.rows))
      throw new Error(`Restore mismatch: ${table}`);
  }
  console.log(
    `Backup/restore roundtrip passed: all ${tables.length} tables match, including the ledger, auth, and migration state.`,
  );
} catch (error) {
  console.error(
    "Backup/restore check failed. Check PostgreSQL client versions, test DB access, and synthetic seed data.",
  );
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await restored.end();
  if (created) await source.query(`DROP DATABASE "${restoreName}"`);
  await source.end();
  rmSync(temp, { recursive: true });
}
