import { afterEach, expect, it, vi } from "vitest";
import { appPath } from "@/infrastructure/app-path";
afterEach(() => vi.unstubAllEnvs());
it("prefixes native form actions and absolute API redirect paths", () => {
  vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/mynab");
  expect(appPath("/api/auth/login")).toBe("/mynab/api/auth/login");
  expect(appPath("/login?error=invalid")).toBe("/mynab/login?error=invalid");
});
it("keeps root deployments supported", () => {
  vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "");
  expect(appPath("/budget")).toBe("/budget");
});
