import { fixupConfigRules } from "@eslint/compat";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...fixupConfigRules([...nextVitals, ...nextTs]),
  globalIgnores([
    ".next/**",
    "src/generated/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    // The checkpoint helper's snapshots of untracked files (git-ignored).
    "ai/.state/**",
    "next-env.d.ts",
  ]),
]);
