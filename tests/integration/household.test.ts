import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/infrastructure/db";
import { createOwner, listBudgets, login } from "@/application/auth";
import { executeFinance, getFinance } from "@/application/finance";
import { claim } from "@/application/jobs";
import {
  ARCHIVE_RECOVERY_MS,
  archivePlan,
  createPlan,
  listArchivedPlans,
  purgeEmptyPlan,
  renamePlan,
  restorePlan,
  selectPlan,
} from "@/application/plans";
import {
  addPerson,
  changeOwnPassphrase,
  HOUSEHOLD_LIMIT,
  removePerson,
  resetPersonPassphrase,
  sharePlan,
  unsharePlan,
} from "@/application/household";

const db = getDb();
let ownerId: string, budgetId: string;
const pass = "synthetic-finance-passphrase";
async function clear() {
  await db.$executeRawUnsafe(
    'TRUNCATE "Budget", "User", "Installation", "LoginThrottle", "Session" CASCADE',
  );
}
beforeEach(async () => {
  await clear();
  ({ userId: ownerId, budgetId } = await createOwner("owner", pass));
});
afterAll(async () => {
  await clear();
  await db.$disconnect();
});

describe("household sharing", () => {
  it("adds people with their own plan and shares a plan with them", async () => {
    const partner = await addPerson(ownerId, "Partner", "partner-passphrase-123");
    expect(partner.username).toBe("partner");
    const partnerPlan = (await listBudgets(partner.id))[0]!;
    expect(partnerPlan.name).toBe("partner's plan");
    expect((await listBudgets(ownerId)).map((b) => b.id)).not.toContain(partnerPlan.id);
    await expect(getFinance(ownerId, partnerPlan.id)).rejects.toThrow("Budget unavailable");
    await expect(addPerson(partner.id, "kid", "kid-passphrase-12345")).rejects.toThrow("Only the person who set up");
    await expect(addPerson(ownerId, "partner", "partner-passphrase-123")).rejects.toThrow("taken");

    await expect(executeFinance(partner.id, budgetId, randomUUID(), { type: "group.create", name: "Nope" })).rejects.toThrow("Budget unavailable");
    await sharePlan(ownerId, budgetId, partner.id);
    expect((await listBudgets(partner.id)).map((b) => b.id)).toContain(budgetId);
    // A member budgets fully, and each change records who made it.
    const group = await executeFinance(partner.id, budgetId, randomUUID(), { type: "group.create", name: "Shared" });
    const category = await executeFinance(partner.id, budgetId, randomUUID(), { type: "category.create", name: "Groceries", groupId: group.id });
    await executeFinance(partner.id, budgetId, randomUUID(), { type: "assign", categoryId: category.id, month: "2026-01", amount: "5" });
    expect((await getFinance(ownerId, budgetId, "2026-01")).moves[0].actor).toBe("partner");
    // Owning the plan stays with its owner.
    await expect(renamePlan(partner.id, budgetId, "Mine")).rejects.toThrow("Only an owner");
    await expect(sharePlan(partner.id, budgetId, partner.id)).rejects.toThrow("Only a plan's owner");
    await expect(unsharePlan(ownerId, budgetId, ownerId)).rejects.toThrow("yourself");

    await unsharePlan(ownerId, budgetId, partner.id);
    await expect(getFinance(partner.id, budgetId)).rejects.toThrow("Budget unavailable");
    expect(await db.auditEvent.count({ where: { action: "MEMBERSHIP_CHANGED" } })).toBe(2);
  });

  it("hides archived budgets and denies their members access", async () => {
    const partner = await addPerson(ownerId, "partner", "partner-passphrase-123");
    const partnerPlan = (await listBudgets(partner.id))[0]!;
    await sharePlan(partner.id, partnerPlan.id, ownerId);
    expect((await listBudgets(ownerId)).map((b) => b.id)).toContain(partnerPlan.id);

    const archivedAt = new Date();
    await db.budget.update({
      where: { id: partnerPlan.id },
      data: {
        archivedAt,
        purgeAfter: new Date(archivedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    expect((await listBudgets(partner.id)).map((b) => b.id)).not.toContain(partnerPlan.id);
    expect((await listBudgets(ownerId)).map((b) => b.id)).not.toContain(partnerPlan.id);
    await expect(getFinance(partner.id, partnerPlan.id)).rejects.toThrow("Budget unavailable");
    await expect(getFinance(ownerId, partnerPlan.id)).rejects.toThrow("Budget unavailable");
    await expect(selectPlan(partner.id, partnerPlan.id)).rejects.toThrow("Plan unavailable");
  });

  it("archives and restores plans, then purges an empty plan after 30 days", async () => {
    const plan = await createPlan(ownerId, "Disposable");
    await db.job.create({
      data: { budgetId: plan.id, kind: "schedules.enter", dedupeKey: `archive:${plan.id}` },
    });
    const archivedAt = new Date("2026-01-01T00:00:00Z");
    const purgeAfter = new Date(archivedAt.getTime() + ARCHIVE_RECOVERY_MS);

    await archivePlan(ownerId, plan.id, archivedAt);
    expect(await db.job.findFirst({ where: { budgetId: plan.id } })).toMatchObject({
      status: "FAILED",
      lastError: "Budget archived",
    });
    expect(await listArchivedPlans(ownerId)).toContainEqual(
      expect.objectContaining({ id: plan.id, canRestore: false, canPurge: true }),
    );
    await expect(purgeEmptyPlan(ownerId, plan.id, new Date(purgeAfter.getTime() - 1)))
      .rejects.toThrow("30-day recovery period");
    await restorePlan(ownerId, plan.id, new Date(purgeAfter.getTime() - 1));
    expect((await listBudgets(ownerId)).map((item) => item.id)).toContain(plan.id);

    await archivePlan(ownerId, plan.id, archivedAt);
    await expect(restorePlan(ownerId, plan.id, new Date(purgeAfter.getTime() + 1)))
      .rejects.toThrow("recovery period has ended");
    await purgeEmptyPlan(ownerId, plan.id, new Date(purgeAfter.getTime() + 1));
    expect(await db.budget.findUnique({ where: { id: plan.id } })).toBeNull();
  });

  it("refuses to purge an archived plan containing budget data", async () => {
    const plan = await createPlan(ownerId, "Has categories");
    await executeFinance(ownerId, plan.id, randomUUID(), {
      type: "group.create",
      name: "Keep this history",
    });
    const archivedAt = new Date("2026-01-01T00:00:00Z");
    await archivePlan(ownerId, plan.id, archivedAt);
    expect(await listArchivedPlans(ownerId)).toContainEqual(
      expect.objectContaining({ id: plan.id, canPurge: false, hasData: true }),
    );

    await expect(purgeEmptyPlan(
      ownerId,
      plan.id,
      new Date(archivedAt.getTime() + ARCHIVE_RECOVERY_MS + 1),
    )).rejects.toThrow("must remain archived");
    expect(await db.budget.findUnique({ where: { id: plan.id } })).not.toBeNull();
  });

  it("does not claim queued work for an archived plan", async () => {
    const plan = await createPlan(ownerId, "Paused automation");
    const archivedAt = new Date("2026-01-01T00:00:00Z");
    const runAt = new Date("2026-01-02T00:00:00Z");
    await db.budget.update({
      where: { id: plan.id },
      data: {
        archivedAt,
        purgeAfter: new Date(archivedAt.getTime() + ARCHIVE_RECOVERY_MS),
      },
    });
    await db.job.create({
      data: {
        budgetId: plan.id,
        kind: "schedules.enter",
        dedupeKey: `paused:${plan.id}`,
        runAt,
      },
    });

    expect(await claim(new Date(runAt.getTime() + 1))).toBeNull();
  });

  it("changes and resets passphrases, signing people out", async () => {
    const partner = await addPerson(ownerId, "partner", "partner-passphrase-123");
    await login("partner", "partner-passphrase-123");
    await expect(changeOwnPassphrase(partner.id, "wrong-passphrase-0000", "new-partner-passphrase")).rejects.toThrow("not right");
    await changeOwnPassphrase(partner.id, "partner-passphrase-123", "new-partner-passphrase");
    expect(await db.session.count({ where: { userId: partner.id } })).toBe(0);
    await expect(login("partner", "partner-passphrase-123")).rejects.toThrow();
    await login("partner", "new-partner-passphrase");
    await resetPersonPassphrase(ownerId, partner.id, "owner-chosen-passphrase");
    await login("partner", "owner-chosen-passphrase");
    await expect(resetPersonPassphrase(partner.id, ownerId, "hijacked-passphrase-1")).rejects.toThrow("Only the person who set up");
  });

  it("transfers a removed person's plans, preserves audit records, and revokes sessions", async () => {
    const partner = await addPerson(ownerId, "partner", "partner-passphrase-123");
    const partnerPlan = (await listBudgets(partner.id))[0]!;
    await sharePlan(ownerId, budgetId, partner.id);
    await login("partner", "partner-passphrase-123");

    await removePerson(ownerId, partner.id, ownerId);

    expect(await db.user.findUnique({ where: { id: partner.id } })).toBeNull();
    expect(await db.session.count({ where: { userId: partner.id } })).toBe(0);
    expect((await listBudgets(ownerId)).map((budget) => budget.id)).toContain(partnerPlan.id);
    await expect(getFinance(partner.id, budgetId)).rejects.toThrow("Budget unavailable");
    expect(await db.auditEvent.count({ where: { actorId: null } })).toBeGreaterThan(0);
    const removal = await db.auditEvent.findFirst({
      where: { entityId: partner.id, details: { path: ["change"], equals: "person-removed" } },
    });
    expect(removal?.details).toMatchObject({ transferredTo: ownerId, transferredBudgetIds: [partnerPlan.id] });
  });

  it("transfers installation ownership when its owner account is removed", async () => {
    const successor = await addPerson(ownerId, "successor", "successor-passphrase-123");
    await login("owner", pass);

    await removePerson(ownerId, ownerId, successor.id);

    expect(await db.installation.findUnique({ where: { id: 1 } })).toMatchObject({ ownerId: successor.id });
    expect(await db.user.findUnique({ where: { id: ownerId } })).toBeNull();
    expect((await listBudgets(successor.id)).map((budget) => budget.id)).toContain(budgetId);
    await expect(addPerson(ownerId, "new-person", "new-person-passphrase-123")).rejects.toThrow("Only the person who set up");
  });

  it("holds at most six people", async () => {
    for (let i = 1; i < HOUSEHOLD_LIMIT; i++)
      await addPerson(ownerId, `person${i}`, "someone-passphrase-123");
    await expect(addPerson(ownerId, "person9", "someone-passphrase-123")).rejects.toThrow(`up to ${HOUSEHOLD_LIMIT}`);
  });
});
