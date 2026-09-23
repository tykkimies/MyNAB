import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/infrastructure/db";
import { digest } from "@/infrastructure/crypto";
import {
  authenticate,
  createOwner,
  listBudgets,
  login,
  logout,
  requireBudgetMembership,
  resetOwnerPassword,
  SESSION_IDLE_MS,
  SESSION_LIFETIME_MS,
  THROTTLE_WINDOW_MS,
} from "@/application/auth";
const db = getDb();
const password = "synthetic-test-passphrase-123";
const now = new Date("2026-09-22T12:00:00Z");
async function clear() {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditEvent", "Session", "BudgetMember", "Installation", "Budget", "User", "LoginThrottle" CASCADE',
  );
}
beforeEach(clear);
afterAll(async () => {
  await clear();
  await db.$disconnect();
});
describe("owner and authentication on PostgreSQL", () => {
  it("creates one owner/budget atomically, normalizes names, hashes passwords and audits", async () => {
    const owner = await createOwner(" Owner ", password);
    const user = await db.user.findUniqueOrThrow({
      where: { id: owner.userId },
    });
    expect(user.username).toBe("owner");
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(password);
    expect(await listBudgets(owner.userId)).toHaveLength(1);
    expect(
      await db.auditEvent.count({ where: { action: "OWNER_CREATED" } }),
    ).toBe(1);
    await expect(createOwner("another", password)).rejects.toMatchObject({
      code: "owner_exists",
    });
    expect(await db.user.count()).toBe(1);
  });
  it("serializes simultaneous bootstrap attempts", async () => {
    const results = await Promise.allSettled([
      createOwner("owner1", password),
      createOwner("owner2", password),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.budget.count()).toBe(1);
    expect(await db.auditEvent.count()).toBe(1);
  });
  it("rejects weak passwords before creating anything", async () => {
    await expect(createOwner("owner", "short")).rejects.toThrow();
    expect(await db.user.count()).toBe(0);
  });
  it("returns generic failures for missing users and incorrect passwords", async () => {
    await createOwner("owner", password);
    for (const [u, p] of [
      ["missing", password],
      ["owner", "incorrect-passphrase"],
    ])
      await expect(login(u, p, now)).rejects.toMatchObject({ code: "invalid" });
    expect(await db.session.count()).toBe(0);
  });
  it("stores only token hashes, authenticates and rotates existing session at login", async () => {
    const owner = await createOwner("owner", password);
    const a = await login("owner", password, now);
    expect(
      await db.session.findUnique({ where: { tokenHash: a.token } }),
    ).toBeNull();
    expect(
      await db.session.findUnique({ where: { tokenHash: digest(a.token) } }),
    ).not.toBeNull();
    expect(await authenticate(a.token, now)).toEqual({
      userId: owner.userId,
      username: "owner",
    });
    const b = await login("owner", password, now, a.token);
    expect(b.token).not.toBe(a.token);
    expect(await authenticate(a.token, now)).toBeNull();
    expect(await authenticate(b.token, now)).not.toBeNull();
  });
  it("enforces absolute and idle expiry and malformed-token rejection", async () => {
    await createOwner("owner", password);
    const a = await login("owner", password, now);
    expect(
      await authenticate(a.token, new Date(now.getTime() + SESSION_IDLE_MS)),
    ).toBeNull();
    await db.session.update({
      where: { tokenHash: digest(a.token) },
      data: { lastSeenAt: new Date(now.getTime() + SESSION_LIFETIME_MS - 1) },
    });
    expect(
      await authenticate(
        a.token,
        new Date(now.getTime() + SESSION_LIFETIME_MS),
      ),
    ).toBeNull();
    expect(await authenticate("invalid", now)).toBeNull();
    expect(await authenticate(undefined, now)).toBeNull();
  });
  it("revokes on logout, preserves an audit, and tolerates repeated logout", async () => {
    await createOwner("owner", password);
    const a = await login("owner", password, now);
    await logout(a.token);
    await logout(a.token);
    expect(await authenticate(a.token, now)).toBeNull();
    expect(await db.auditEvent.count({ where: { action: "LOGOUT" } })).toBe(1);
  });
  it("resets the password, revokes all sessions, rejects the old password", async () => {
    await createOwner("owner", password);
    const a = await login("owner", password, now);
    const b = await login("owner", password, now);
    await resetOwnerPassword("replacement-passphrase-456");
    expect(await authenticate(a.token, now)).toBeNull();
    expect(await authenticate(b.token, now)).toBeNull();
    await expect(login("owner", password, now)).rejects.toMatchObject({
      code: "invalid",
    });
    expect(
      (await login("owner", "replacement-passphrase-456", now)).token,
    ).toBeTruthy();
    expect(
      await db.auditEvent.count({ where: { action: "PASSWORD_RESET" } }),
    ).toBe(1);
  });
  it("does not retain a session from a login racing with password recovery", async () => {
    await createOwner("owner", password);
    const [attempt, reset] = await Promise.allSettled([
      login("owner", password, now),
      resetOwnerPassword("replacement-passphrase-456"),
    ]);
    expect(reset.status).toBe("fulfilled");
    if (attempt.status === "fulfilled") {
      expect(await authenticate(attempt.value.token, now)).toBeNull();
    } else {
      expect(attempt.reason).toMatchObject({ code: "invalid" });
    }
    expect(await db.session.count()).toBe(0);
  });
  it("rejects stale authVersion even if a session row is retained", async () => {
    const owner = await createOwner("owner", password);
    const a = await login("owner", password, now);
    await db.user.update({
      where: { id: owner.userId },
      data: { authVersion: { increment: 1 } },
    });
    expect(await authenticate(a.token, now)).toBeNull();
  });
  it("enforces per-user limits under concurrent requests and permits a new window", async () => {
    // Missing valid-format user exercises hashing and limiter without real credentials.
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => login("missing", password, now)),
    );
    const codes = results.map((r) =>
      r.status === "rejected" ? r.reason.code : "success",
    );
    expect(codes.filter((c) => c === "throttled")).toHaveLength(2);
    expect(codes.filter((c) => c === "invalid")).toHaveLength(10);
    await expect(
      login("missing", password, new Date(now.getTime() + THROTTLE_WINDOW_MS)),
    ).rejects.toMatchObject({ code: "invalid" });
  });
  it("enforces global limits when usernames change", async () => {
    for (let i = 0; i < 30; i++)
      await expect(login(`user${i}`, "short", now)).rejects.toMatchObject({
        code: "invalid",
      });
    await expect(login("different", "short", now)).rejects.toMatchObject({
      code: "throttled",
    });
  });
  it("checks budget membership rather than trusting a supplied budget ID", async () => {
    const owner = await createOwner("owner", password);
    const other = await db.user.create({
      data: { username: "other", passwordHash: "not-a-credential" },
    });
    expect(
      (await requireBudgetMembership(owner.userId, owner.budgetId)).currency,
    ).toBe("USD");
    await expect(
      requireBudgetMembership(other.id, owner.budgetId),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await listBudgets(other.id)).toEqual([]);
  });
  it("enforces USD and singleton installation in SQL, not only UI", async () => {
    const owner = await createOwner("owner", password);
    await expect(
      db.budget.create({ data: { name: "Foreign", currency: "EUR" } }),
    ).rejects.toThrow();
    await expect(
      db.installation.create({ data: { id: 2, ownerId: owner.userId } }),
    ).rejects.toThrow();
  });
});
