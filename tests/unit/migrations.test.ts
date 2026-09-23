import { readdirSync } from "node:fs";
import { expect, it } from "vitest";
import { expectedMigrations } from "@/app/api/health/ready/route";

it("keeps readiness in step with the migrations on disk", () => {
  // Readiness refuses traffic unless the database reports exactly this set, so a
  // migration added without updating the list would make every deployment 503.
  const onDisk = readdirSync("prisma/migrations", { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  expect(expectedMigrations).toEqual(onDisk);
  // Ordering is compared positionally against an ORDER BY, so it must be sorted.
  expect([...expectedMigrations].sort()).toEqual(expectedMigrations);
});
