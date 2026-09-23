import type { NextConfig } from "next";
const basePath = process.env.APP_BASE_PATH ?? "";
if (
  basePath !== "" &&
  !/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(basePath)
) {
  throw new Error(
    "APP_BASE_PATH must be empty or a path like /mynab, without a trailing slash",
  );
}
const config: NextConfig = {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  output: "standalone",
  poweredByHeader: false,
  // Keep build worker memory bounded on small self-hosted machines.
  experimental: { cpus: 2 },
  serverExternalPackages: ["argon2", "pg"],
};
export default config;
