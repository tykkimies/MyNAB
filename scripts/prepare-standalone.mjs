import { cpSync, readdirSync, rmSync } from "node:fs";
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
cpSync("public", ".next/standalone/public", { recursive: true });
// Next's trace can include local env files. Never distribute secrets with the artifact.
for (const name of readdirSync(".next/standalone")) {
  if (name.startsWith(".env"))
    rmSync(`.next/standalone/${name}`, { force: true });
}
