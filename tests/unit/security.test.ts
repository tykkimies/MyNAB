import { expect, it, vi } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  digest,
  newToken,
} from "@/infrastructure/crypto";
import {
  bankSyncConfigured,
  parseConfig,
  simplefinEnabled,
} from "@/infrastructure/config";
import {
  isAllowedMutation,
  readLoginForm,
  securityHeaders,
  sessionCookie,
} from "@/infrastructure/http-security";
import { logEvent } from "@/infrastructure/log";
const key = "11".repeat(32);
const base = {
  DATABASE_URL: "postgresql://local/test",
  APP_ORIGIN: "https://mynab.example",
  SECRET_ENCRYPTION_KEY: key,
  NODE_ENV: "production",
};
it("encrypts with random nonces and rejects tampering, wrong key, or context", () => {
  const a = encryptSecret("synthetic-token", key, "connection-1"),
    b = encryptSecret("synthetic-token", key, "connection-1");
  expect(a).not.toBe(b);
  expect(a).not.toContain("synthetic-token");
  expect(decryptSecret(a, key, "connection-1")).toBe("synthetic-token");
  expect(() => decryptSecret(a, key, "connection-2")).toThrow();
  expect(() => decryptSecret(a, "22".repeat(32), "connection-1")).toThrow();
  const parts = a.split(".");
  parts[3] = Buffer.from("tampered").toString("base64url");
  expect(() => decryptSecret(parts.join("."), key, "connection-1")).toThrow();
  expect(() => decryptSecret(a + ".extra", key, "connection-1")).toThrow();
});
it("generates distinct 256-bit tokens and irreversible storage identifiers", () => {
  const token = newToken();
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect(token).not.toBe(newToken());
  expect(digest(token)).not.toBe(token);
});
it("requires an exact secure deployment origin and redacts config values", () => {
  expect(parseConfig(base).APP_ORIGIN).toBe(base.APP_ORIGIN);
  for (const origin of [
    "http://mynab.example",
    "https://mynab.example/path",
    "https://mynab.example/",
    "https://user:secret@mynab.example",
    "http://localhost",
  ])
    expect(() => parseConfig({ ...base, APP_ORIGIN: origin })).toThrow();
  expect(
    parseConfig({
      ...base,
      NODE_ENV: "development",
      APP_ORIGIN: "http://localhost:3000",
    }),
  ).toBeTruthy();
  expect(() =>
    parseConfig({ ...base, SECRET_ENCRYPTION_KEY: "sensitive-value" }),
  ).toThrow("SECRET_ENCRYPTION_KEY");
  try {
    parseConfig({ ...base, SECRET_ENCRYPTION_KEY: "sensitive-value" });
  } catch (e) {
    expect(String(e)).not.toContain("sensitive-value");
  }
});
it("requires Origin even when forwarded headers or referer claim to be trusted", () => {
  expect(
    isAllowedMutation(
      new Headers({ origin: base.APP_ORIGIN }),
      base.APP_ORIGIN,
    ),
  ).toBe(true);
  for (const headers of [
    {},
    { origin: "https://evil.example" },
    { referer: base.APP_ORIGIN, "x-forwarded-host": "mynab.example" },
    { origin: base.APP_ORIGIN, "sec-fetch-site": "cross-site" },
  ])
    expect(
      isAllowedMutation(
        new Headers(headers as Record<string, string>),
        base.APP_ORIGIN,
      ),
    ).toBe(false);
});
it("uses HTTPS host cookies and strict production script policy", () => {
  expect(sessionCookie(base)).toMatchObject({
    name: "__Host-mynab-session",
    secure: true,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  const h = securityHeaders("nonce-test", false, true);
  expect(h["Content-Security-Policy"]).toContain("'nonce-nonce-test'");
  expect(h["Content-Security-Policy"]).not.toContain("unsafe-eval");
  expect(h["Strict-Transport-Security"]).toBeTruthy();
  expect(h["Cache-Control"]).toContain("no-store");
  expect(h["Referrer-Policy"]).toBe("same-origin");
});
it("bounds actual request bytes rather than trusting Content-Length", async () => {
  await expect(
    readLoginForm(
      new Request("https://local", {
        method: "POST",
        body: "x=" + "x".repeat(4096),
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    readLoginForm(
      new Request("https://local", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      }),
    ),
  ).rejects.toThrow();
});
it("logs only allowlisted event metadata", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  logEvent("request_failed");
  expect(Object.keys(JSON.parse(spy.mock.calls[0][0])).sort()).toEqual([
    "event",
    "time",
  ]);
  spy.mockRestore();
});

it("keeps the HTTPS origin separate from a validated deployment subpath", () => {
  expect(parseConfig({ ...base, APP_BASE_PATH: "/mynab" }).APP_BASE_PATH).toBe(
    "/mynab",
  );
  expect(parseConfig(base).APP_BASE_PATH).toBe("");
  for (const path of [
    "mynab",
    "/mynab/",
    "//evil.example",
    "/../",
    "/mynab?x=1",
  ]) {
    expect(() => parseConfig({ ...base, APP_BASE_PATH: path })).toThrow();
  }
});
it("ignores retired Plaid variables left in an old stack", () => {
  // Plaid was removed; a stack that still sets its variables must still start.
  const config = parseConfig({ ...base, PLAID_CLIENT_ID: "x", PLAID_ENV: "sandbox" });
  expect("PLAID_CLIENT_ID" in config).toBe(false);
});
it("keeps phone push off until a topic is set, without amounts by default", () => {
  const config = parseConfig(base);
  expect(config.NTFY_TOPIC).toBeUndefined();
  expect(config.NTFY_DETAIL).toBe("minimal");
  expect(parseConfig({ ...base, NTFY_TOPIC: "" }).NTFY_TOPIC).toBeUndefined();
  expect(() => parseConfig({ ...base, NTFY_TOPIC: "bad topic/../x" })).toThrow();
  expect(() => parseConfig({ ...base, NTFY_DETAIL: "everything" })).toThrow();
});
it("allows nothing third-party in the browser", () => {
  const policy = securityHeaders("n0", false, true)["Content-Security-Policy"];
  // Bank sync runs on the server: nothing may be framed or contacted.
  expect(policy).toContain("frame-src 'none'");
  expect(policy).not.toContain("plaid.com");
  expect(policy).toContain("connect-src 'self';");
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).not.toContain("script-src 'self' https://");
  // The dangerous directives are unchanged either way.
  {
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
  }
});

it("offers SimpleFIN by default, and turns it off only when asked", () => {
  expect(simplefinEnabled(parseConfig(base))).toBe(true);
  expect(bankSyncConfigured(parseConfig(base))).toBe(true);
  const off = parseConfig({ ...base, SIMPLEFIN: "off" });
  expect(simplefinEnabled(off)).toBe(false);
  expect(bankSyncConfigured(off)).toBe(false);
  expect(() => parseConfig({ ...base, SIMPLEFIN: "yes" })).toThrow();
});
