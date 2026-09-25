import * as argon2 from "argon2";
import { z } from "zod";
import { getDb } from "@/infrastructure/db";
import { digest, newToken } from "@/infrastructure/crypto";
import { timezone } from "@/domain/dates";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_.-]{2,63}$/);
export const passwordSchema = z.string().min(15).max(128);
export const hashOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;
export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;
export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
let dummyHash: Promise<string> | undefined;
export class AuthError extends Error {
  constructor(
    public readonly code:
      "invalid" | "throttled" | "forbidden" | "owner_exists" | "owner_missing",
  ) {
    super(code);
  }
}
export async function createOwner(
  username: string,
  password: string,
  name = "My budget",
  zone = "America/New_York",
) {
  const normalized = usernameSchema.parse(username);
  passwordSchema.parse(password);
  z.string().trim().min(1).max(120).parse(name);
  timezone(zone);
  const passwordHash = await argon2.hash(password, hashOptions);
  return getDb().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(731001)`;
    if (await tx.installation.findUnique({ where: { id: 1 } }))
      throw new AuthError("owner_exists");
    const user = await tx.user.create({
      data: { username: normalized, passwordHash },
    });
    const budget = await tx.budget.create({
      data: {
        name: name.trim(),
        timezone: zone,
        members: { create: { userId: user.id } },
      },
    });
    await tx.installation.create({ data: { id: 1, ownerId: user.id } });
    await tx.auditEvent.create({
      data: {
        actorId: user.id,
        budgetId: budget.id,
        action: "OWNER_CREATED",
        entityId: user.id,
      },
    });
    return { userId: user.id, budgetId: budget.id };
  });
}
export async function resetOwnerPassword(password: string): Promise<void> {
  passwordSchema.parse(password);
  const passwordHash = await argon2.hash(password, hashOptions);
  await getDb().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(731001)`;
    const installation = await tx.installation.findUnique({ where: { id: 1 } });
    if (!installation) throw new AuthError("owner_missing");
    await tx.user.update({
      where: { id: installation.ownerId },
      data: { passwordHash, authVersion: { increment: 1 } },
    });
    await tx.session.deleteMany({ where: { userId: installation.ownerId } });
    // Recovery intentionally clears throttles, allowing an owner to recover from a login flood.
    await tx.loginThrottle.deleteMany();
    await tx.auditEvent.create({
      data: {
        actorId: installation.ownerId,
        action: "PASSWORD_RESET",
        entityId: installation.ownerId,
      },
    });
  });
}
async function consumeLoginAttempt(
  username: string,
  now: Date,
): Promise<boolean> {
  return getDb().$transaction(async (tx) => {
    // One global lock serializes the small login limiter and prevents concurrent bypass.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(731002)`;
    const entries = [
      { key: digest("login:global"), limit: 30 },
      { key: digest(`login:user:${username}`), limit: 10 },
    ];
    for (const entry of entries) {
      const row = await tx.loginThrottle.findUnique({
        where: { key: entry.key },
      });
      if (
        row &&
        now.getTime() - row.windowStart.getTime() < THROTTLE_WINDOW_MS &&
        row.attempts >= entry.limit
      )
        return false;
    }
    for (const entry of entries) {
      const row = await tx.loginThrottle.findUnique({
        where: { key: entry.key },
      });
      if (
        !row ||
        now.getTime() - row.windowStart.getTime() >= THROTTLE_WINDOW_MS
      ) {
        await tx.loginThrottle.upsert({
          where: { key: entry.key },
          create: { key: entry.key, windowStart: now, attempts: 1 },
          update: { windowStart: now, attempts: 1 },
        });
      } else
        await tx.loginThrottle.update({
          where: { key: entry.key },
          data: { attempts: { increment: 1 } },
        });
    }
    return true;
  });
}
export async function login(
  username: string,
  password: string,
  now = new Date(),
  previousToken?: string,
) {
  const parsed = usernameSchema.safeParse(username);
  // Invalid names share one bounded bucket; do not allocate a row for arbitrary payloads.
  const normalized = parsed.success ? parsed.data : "invalid";
  if (!(await consumeLoginAttempt(normalized, now)))
    throw new AuthError("throttled");
  if (!parsed.success || !passwordSchema.safeParse(password).success)
    throw new AuthError("invalid");
  const db = getDb();
  const user = await db.user.findUnique({ where: { username: normalized } });
  dummyHash ??= argon2.hash(newToken(), hashOptions);
  const valid = await argon2.verify(
    user?.passwordHash ?? (await dummyHash),
    password,
  );
  if (!valid || !user) throw new AuthError("invalid");
  const token = newToken();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
  await db.$transaction(async (tx) => {
    // Same lock as password reset: an in-flight login cannot survive a reset unnoticed.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(731001)`;
    const current = await tx.user.findUnique({ where: { id: user.id } });
    if (current?.authVersion !== user.authVersion)
      throw new AuthError("invalid");
    if (previousToken && /^[a-f0-9]{64}$/.test(previousToken))
      await tx.session.deleteMany({
        where: { tokenHash: digest(previousToken) },
      });
    await tx.session.create({
      data: {
        tokenHash: digest(token),
        userId: user.id,
        authVersion: user.authVersion,
        expiresAt,
        createdAt: now,
        lastSeenAt: now,
      },
    });
    await tx.auditEvent.create({
      data: { actorId: user.id, action: "LOGIN_SUCCEEDED", entityId: user.id },
    });
  });
  return { token, expiresAt };
}
export async function authenticate(
  token: string | undefined,
  now = new Date(),
) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const db = getDb();
  const session = await db.session.findUnique({
    where: { tokenHash: digest(token) },
    include: {
      user: { select: { id: true, username: true, authVersion: true } },
    },
  });
  if (
    !session ||
    session.expiresAt <= now ||
    now.getTime() - session.lastSeenAt.getTime() >= SESSION_IDLE_MS ||
    session.authVersion !== session.user.authVersion
  )
    return null;
  // updateMany tolerates concurrent logout; no session recreation.
  const touched = await db.session.updateMany({
    where: { tokenHash: session.tokenHash },
    data: { lastSeenAt: now },
  });
  if (!touched.count) return null;
  return { userId: session.user.id, username: session.user.username };
}
export async function logout(token: string | undefined): Promise<void> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  await getDb().$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { tokenHash: digest(token) },
    });
    if (!session) return;
    await tx.session.deleteMany({ where: { tokenHash: session.tokenHash } });
    await tx.auditEvent.create({
      data: {
        actorId: session.userId,
        action: "LOGOUT",
        entityId: session.userId,
      },
    });
  });
}
export async function requireBudgetMembership(
  userId: string,
  budgetId: string,
) {
  const membership = await getDb().budgetMember.findUnique({
    where: { budgetId_userId: { budgetId, userId } },
    select: {
      budget: {
        select: { id: true, name: true, currency: true, timezone: true },
      },
    },
  });
  if (!membership) throw new AuthError("forbidden");
  return membership.budget;
}
export async function listBudgets(userId: string) {
  return getDb().budget.findMany({
    where: { members: { some: { userId } } },
    select: { id: true, name: true, currency: true, timezone: true },
    orderBy: { createdAt: "asc" },
  });
}
