// Run inside the tools image with `node --import tsx`, only against a disposable *_test DB.
import assert from "node:assert/strict";
import {
  createOwner,
  login,
  authenticate,
  resetOwnerPassword,
} from "../src/application/auth.ts";
import { getDb } from "../src/infrastructure/db.ts";
import { getConfig } from "../src/infrastructure/config.ts";
const config = getConfig();
if (!new URL(config.DATABASE_URL).pathname.endsWith("_test"))
  throw new Error("Smoke checks require a disposable _test database");
const base = `http://app:3000${config.APP_BASE_PATH}`;
const origin = config.APP_ORIGIN;
const password = "synthetic-container-passphrase-123";
const db = getDb();
try {
  const installation = await db.installation.findUnique({ where: { id: 1 } });
  if (!installation) await createOwner("smokeowner", password);
  else await resetOwnerPassword(password);
  const ready = await fetch(`${base}/api/health/ready`);
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).status, "ok");
  const protectedPage = await fetch(`${base}/accounts`, { redirect: "manual" });
  assert.equal(protectedPage.status, 307);
  assert.equal(
    protectedPage.headers.get("location"),
    `${config.APP_BASE_PATH}/login`,
  );
  const rejected = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin: "https://wrong.invalid" },
  });
  assert.equal(rejected.status, 403);
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    redirect: "manual",
    headers: { origin },
    body: new URLSearchParams({ username: "smokeowner", password }),
  });
  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    `${origin}${config.APP_BASE_PATH}/budget`,
  );
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie.startsWith("__Host-mynab-session="));
  for (const flag of ["HttpOnly", "Secure", "SameSite=lax", "Path=/"])
    assert.ok(cookie.toLowerCase().includes(flag.toLowerCase()));
  const cookieHeader = cookie.split(";")[0];
  // Budget and accounts are implemented; goals and debt are still placeholders.
  const marker = {
    budget: "Ready to Assign",
    accounts: "Add an account",
    goals: "Coming in a future release",
    debt: "Coming in a future release",
  };
  for (const [path, expected] of Object.entries(marker)) {
    const page = await fetch(`${base}/${path}`, {
      headers: { cookie: cookieHeader },
      redirect: "manual",
    });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes(expected), `${path} page is missing "${expected}"`);
    assert.ok(html.includes(`${config.APP_BASE_PATH}/api/auth/logout`));
    const asset = html.match(/src="([^\"]+\/_next\/static\/[^\"]+)"/);
    assert.ok(asset);
    assert.ok(asset[1].startsWith(`${config.APP_BASE_PATH}/_next/`));
    assert.equal((await fetch(`http://app:3000${asset[1]}`)).status, 200);
  }
  const signedOut = await fetch(`${base}/api/auth/logout`, {
    method: "POST",
    headers: { origin, cookie: cookieHeader },
    redirect: "manual",
  });
  assert.equal(signedOut.status, 303);
  assert.equal(
    signedOut.headers.get("location"),
    `${origin}${config.APP_BASE_PATH}/login`,
  );
  const afterLogout = await fetch(`${base}/budget`, {
    headers: { cookie: cookieHeader },
    redirect: "manual",
  });
  assert.equal(afterLogout.status, 307);
  const session = await login("smokeowner", password);
  await resetOwnerPassword("replacement-container-passphrase-456");
  assert.equal(await authenticate(session.token), null);
  await resetOwnerPassword(password);
  console.log(
    "Container checks passed: migration/readiness, protected pages, CSRF, native login, prefixed assets/redirects, secure cookie, logout and password recovery.",
  );
} finally {
  await db.$disconnect();
}
