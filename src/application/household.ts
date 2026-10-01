import * as argon2 from "argon2";
import { z } from "zod";
import { getDb } from "@/infrastructure/db";
import { hashOptions, passwordSchema, usernameSchema } from "./auth";
import { FinanceError } from "./finance";

/** YNAB Together allows six people on one subscription; so does this home. */
export const HOUSEHOLD_LIMIT = 6;
const fail = (message: string): never => {
  throw new FinanceError(message);
};

async function installationOwner(userId: string) {
  const installation = await getDb().installation.findUnique({ where: { id: 1 } });
  if (installation?.ownerId !== userId)
    fail("Only the person who set up MyNAB can manage people.");
}
async function planOwner(userId: string, budgetId: string) {
  if (!z.string().uuid().safeParse(budgetId).success) fail("Plan unavailable.");
  const member = await getDb().budgetMember.findUnique({
    where: { budgetId_userId: { budgetId, userId } },
    include: { budget: { select: { archivedAt: true } } },
  });
  if (!member || member.budget.archivedAt) fail("Plan unavailable.");
  if (member!.role !== "owner") fail("Only a plan's owner can share it.");
}

export async function household(userId: string, budgetId: string) {
  const db = getDb();
  const [installation, people, members, me] = await Promise.all([
    db.installation.findUnique({ where: { id: 1 } }),
    db.user.findMany({
      select: { id: true, username: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.budgetMember.findMany({
      where: { budgetId },
      select: { userId: true, role: true },
    }),
    db.budgetMember.findUnique({
      where: { budgetId_userId: { budgetId, userId } },
    }),
  ]);
  return {
    isAdmin: installation?.ownerId === userId,
    isPlanOwner: me?.role === "owner",
    people,
    members,
  };
}

/** A new person with their own login and their own first plan. */
export async function addPerson(
  actorId: string,
  username: string,
  passphrase: string,
  timezone = "America/New_York",
) {
  await installationOwner(actorId);
  const name = usernameSchema.safeParse(username);
  if (!name.success)
    fail("Usernames are 3 to 64 letters, numbers, dots, dashes or underscores.");
  if (!passwordSchema.safeParse(passphrase).success)
    fail("Use a passphrase of at least 15 characters.");
  const passwordHash = await argon2.hash(passphrase, hashOptions);
  return getDb().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(731001)`;
    if ((await tx.user.count()) >= HOUSEHOLD_LIMIT)
      fail(`A household has up to ${HOUSEHOLD_LIMIT} people.`);
    if (await tx.user.findUnique({ where: { username: name.data! } }))
      fail("That username is taken.");
    const user = await tx.user.create({
      data: { username: name.data!, passwordHash },
    });
    const budget = await tx.budget.create({
      data: {
        name: `${name.data}'s plan`,
        timezone,
        members: { create: { userId: user.id, role: "owner" } },
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId,
        budgetId: budget.id,
        action: "USER_CREATED",
        entityId: user.id,
      },
    });
    return user;
  });
}

export async function sharePlan(actorId: string, budgetId: string, userId: string) {
  await planOwner(actorId, budgetId);
  const db = getDb();
  if (!(await db.user.findUnique({ where: { id: userId } })))
    fail("That person is not in this household.");
  await db.$transaction([
    db.budgetMember.upsert({
      where: { budgetId_userId: { budgetId, userId } },
      create: { budgetId, userId, role: "member" },
      update: {},
    }),
    db.auditEvent.create({
      data: {
        actorId,
        budgetId,
        action: "MEMBERSHIP_CHANGED",
        entityId: userId,
        details: { change: "shared" },
      },
    }),
  ]);
}

export async function unsharePlan(actorId: string, budgetId: string, userId: string) {
  await planOwner(actorId, budgetId);
  if (actorId === userId) fail("You cannot remove yourself from your own plan.");
  const db = getDb();
  const member = await db.budgetMember.findUnique({
    where: { budgetId_userId: { budgetId, userId } },
  });
  if (!member) fail("That person does not share this plan.");
  if (member!.role === "owner") fail("A plan's owner cannot be removed.");
  await db.$transaction([
    db.budgetMember.delete({ where: { budgetId_userId: { budgetId, userId } } }),
    db.auditEvent.create({
      data: {
        actorId,
        budgetId,
        action: "MEMBERSHIP_CHANGED",
        entityId: userId,
        details: { change: "removed" },
      },
    }),
  ]);
}

/** Sets a passphrase and signs that person out everywhere. */
async function setPassphrase(actorId: string, userId: string, passphrase: string) {
  if (!passwordSchema.safeParse(passphrase).success)
    fail("Use a passphrase of at least 15 characters.");
  const passwordHash = await argon2.hash(passphrase, hashOptions);
  await getDb().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(731001)`;
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, authVersion: { increment: 1 } },
    });
    await tx.session.deleteMany({ where: { userId } });
    await tx.auditEvent.create({
      data: { actorId, action: "PASSWORD_CHANGED", entityId: userId },
    });
  });
}

export async function changeOwnPassphrase(
  userId: string,
  current: string,
  next: string,
) {
  const user = await getDb().user.findUnique({ where: { id: userId } });
  if (!user || !(await argon2.verify(user.passwordHash, current)))
    fail("Your current passphrase is not right.");
  await setPassphrase(userId, userId, next);
}

export async function resetPersonPassphrase(
  actorId: string,
  userId: string,
  next: string,
) {
  await installationOwner(actorId);
  if (actorId === userId) fail("Change your own passphrase below instead.");
  if (!(await getDb().user.findUnique({ where: { id: userId } })))
    fail("That person is not in this household.");
  await setPassphrase(actorId, userId, next);
}

export async function removePerson(
  actorId: string,
  userId: string,
  transferToId: string,
) {
  if (userId === transferToId) fail("Choose another person to receive the plans.");
  const db = getDb();
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(731001)`;
    const installation = await tx.installation.findUnique({ where: { id: 1 } });
    const installationOwnerId = installation?.ownerId;
    if (installationOwnerId !== actorId)
      fail("Only the person who set up MyNAB can manage people.");
    const [person, recipient] = await Promise.all([
      tx.user.findUnique({ where: { id: userId } }),
      tx.user.findUnique({ where: { id: transferToId } }),
    ]);
    if (!person) fail("That person is not in this household.");
    if (!recipient) fail("Choose a person in this household to receive the plans.");

    const ownedPlans = await tx.budgetMember.findMany({
      where: { userId, role: "owner" },
      select: { budgetId: true },
    });
    for (const { budgetId } of ownedPlans) {
      await tx.budgetMember.upsert({
        where: { budgetId_userId: { budgetId, userId: transferToId } },
        create: { budgetId, userId: transferToId, role: "owner" },
        update: { role: "owner" },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actorId === userId ? null : actorId,
          budgetId,
          action: "MEMBERSHIP_CHANGED",
          entityId: transferToId,
          details: { change: "ownership-transferred", previousOwnerId: userId },
        },
      });
    }

    if (installationOwnerId === userId) {
      await tx.installation.update({
        where: { id: 1 },
        data: { ownerId: transferToId },
      });
    }
    await tx.auditEvent.updateMany({ where: { actorId: userId }, data: { actorId: null } });
    await tx.budgetMember.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
    await tx.auditEvent.create({
      data: {
        actorId: actorId === userId ? null : actorId,
        action: "MEMBERSHIP_CHANGED",
        entityId: userId,
        details: {
          change: "person-removed",
          transferredTo: transferToId,
          transferredBudgetIds: ownedPlans.map(({ budgetId }) => budgetId),
          installationOwnerTransferred: installationOwnerId === userId,
        },
      },
    });
  });
}
