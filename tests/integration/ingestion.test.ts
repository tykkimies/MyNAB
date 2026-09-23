import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/infrastructure/db";
import { createOwner } from "@/application/auth";
import { executeFinance, getFinance } from "@/application/finance";
import { encryptSecret } from "@/infrastructure/crypto";
import type { NormalizedEntry } from "@/domain/ingestion";
import type { Provider, ProviderBatch } from "@/infrastructure/providers/types";

const db = getDb();
let userId: string, budgetId: string;

/** Stands in for an institution so the whole path runs without network access. */
let batches: ProviderBatch[] = [];
let calls = 0;
const stub: Provider = {
  name: "PLAID",
  createLinkToken: async () => "link-stub",
  exchange: async () => ({
    accessToken: "access-stub",
    itemId: "item-1",
    institutionId: "ins_1",
    institutionName: "Stub Bank",
  }),
  listAccounts: async () => [
    {
      externalAccountId: "ext-checking",
      name: "Stub Checking",
      mask: "0000",
      type: "checking",
    },
  ],
  sync: async () => batches[Math.min(calls++, batches.length - 1)],
  disconnect: async () => undefined,
};

vi.mock("@/infrastructure/providers/plaid", () => ({
  createPlaidProvider: () => stub,
  normalizeAmount: (n: number) => BigInt(Math.round(-n * 100)),
}));

const ingestion = await import("@/application/ingestion");

const entry = (
  externalId: string,
  amount: bigint,
  over: Partial<NormalizedEntry> = {},
): NormalizedEntry => ({
  externalId,
  status: "POSTED",
  externalAccountId: "ext-checking",
  date: "2026-03-05",
  amount,
  payee: "Grocer",
  ...over,
});

async function clear() {
  await db.$executeRawUnsafe(
    'TRUNCATE "Budget", "User", "Installation", "LoginThrottle" CASCADE',
  );
}

beforeEach(async () => {
  await clear();
  batches = [];
  calls = 0;
  process.env.PLAID_CLIENT_ID = "client";
  process.env.PLAID_SECRET = "secret";
  process.env.PLAID_ENV = "sandbox";
  const owner = await createOwner("owner", "synthetic-ingestion-passphrase");
  userId = owner.userId;
  budgetId = (await db.budget.findFirstOrThrow()).id;
});
afterAll(async () => {
  await clear();
  await db.$disconnect();
});

/** Link a connection and attach its one external account to a budget account. */
async function connected() {
  const account = await executeFinance(userId, budgetId, randomUUID(), {
    type: "account.create",
    name: "Checking",
    accountType: "CHECKING",
    participation: "BUDGET",
    opening: "1000",
    date: "2026-03-01",
  });
  const { connectionId } = await ingestion.completeLink(
    userId,
    budgetId,
    "public-stub",
  );
  const providerAccount = await db.providerAccount.findFirstOrThrow({
    where: { connectionId },
  });
  await ingestion.linkAccount(userId, budgetId, providerAccount.id, account.id);
  return { connectionId, accountId: account.id };
}

describe("provider ingestion on PostgreSQL", () => {
  it("stores the access token only as an encrypted envelope", async () => {
    const { connectionId } = await connected();
    const row = await db.providerConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    expect(row.accessToken).not.toContain("access-stub");
    expect(row.accessToken.startsWith("v1.")).toBe(true);
    // The envelope is bound to this connection, so it cannot be replayed elsewhere.
    const other = encryptSecret(
      "access-stub",
      process.env.SECRET_ENCRYPTION_KEY!,
      "provider-connection:other",
    );
    expect(row.accessToken).not.toBe(other);
  });

  it("imports entries as balanced transactions and is idempotent on resync", async () => {
    const { accountId } = await connected();
    batches = [
      {
        entries: [entry("a", -2500n), entry("b", 10000n)],
        removed: [],
        cursor: "c1",
      },
      {
        entries: [entry("a", -2500n), entry("b", 10000n)],
        removed: [],
        cursor: "c2",
      },
    ];
    const first = await ingestion.syncConnection(
      userId,
      budgetId,
      (await db.providerConnection.findFirstOrThrow()).id,
    );
    expect(first.created).toBe(2);
    const state = await getFinance(userId, budgetId, "2026-03");
    // 1000 opening - 25 spent + 100 received
    expect(state.projection.cash).toBe(107500n);
    const ledger = await db.posting.groupBy({
      by: ["accountId"],
      where: { budgetId, accountId },
      _sum: { amount: true },
    });
    expect(ledger[0]._sum.amount).toBe(107500n);

    const second = await ingestion.syncConnection(
      userId,
      budgetId,
      (await db.providerConnection.findFirstOrThrow()).id,
    );
    expect(second.created).toBe(0);
    expect(await db.ingestedEntry.count()).toBe(2);
    expect(
      await db.financialTransaction.count({ where: { voidedAt: null } }),
    ).toBe(3);
  });

  it("puts imported spending in Uncategorized until it is approved", async () => {
    await connected();
    batches = [{ entries: [entry("a", -2500n)], removed: [], cursor: "c1" }];
    const connection = await db.providerConnection.findFirstOrThrow();
    await ingestion.syncConnection(userId, budgetId, connection.id);
    const category = await db.category.findFirstOrThrow({
      where: { budgetId, system: true, paymentAccountId: null },
    });
    expect(category.name).toBe("Uncategorized");
    const state = await getFinance(userId, budgetId, "2026-03");
    const row = state.projection.categories.find((c) => c.id === category.id);
    // Unassigned imported spending shows as overspending, never as free money.
    expect(row?.activity).toBe(-2500n);
    expect(row?.available).toBe(-2500n);
    expect(state.projection.cashDeficit).toBe(2500n);
  });

  it("recategorises on approval by replacing rather than rewriting", async () => {
    await connected();
    batches = [{ entries: [entry("a", -2500n)], removed: [], cursor: "c1" }];
    const connection = await db.providerConnection.findFirstOrThrow();
    await ingestion.syncConnection(userId, budgetId, connection.id);
    const group = await executeFinance(userId, budgetId, randomUUID(), {
      type: "group.create",
      name: "Everyday",
    });
    const food = await executeFinance(userId, budgetId, randomUUID(), {
      type: "category.create",
      name: "Food",
      groupId: group.id,
    });
    const before = await db.ingestedEntry.findFirstOrThrow();
    await ingestion.approveEntry(userId, budgetId, before.id, food.id);
    const after = await db.ingestedEntry.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.approved).toBe(true);
    expect(after.transactionId).not.toBe(before.transactionId);
    const original = await db.financialTransaction.findUniqueOrThrow({
      where: { id: before.transactionId },
    });
    expect(original.voidedAt).not.toBeNull();
    // The reversal keeps the account balance correct through the replacement.
    const state = await getFinance(userId, budgetId, "2026-03");
    expect(state.projection.cash).toBe(97500n);
    expect(
      state.projection.categories.find((c) => c.id === food.id)?.activity,
    ).toBe(-2500n);
  });

  it("promotes a pending entry to its posted row without double counting", async () => {
    await connected();
    const connection = await db.providerConnection.findFirstOrThrow();
    batches = [
      {
        entries: [entry("p", -2000n, { status: "PENDING" })],
        removed: [],
        cursor: "c1",
      },
      {
        entries: [entry("x", -2200n, { pendingExternalId: "p" })],
        removed: [],
        cursor: "c2",
      },
    ];
    await ingestion.syncConnection(userId, budgetId, connection.id);
    expect(
      (await getFinance(userId, budgetId, "2026-03")).projection.cash,
    ).toBe(98000n);
    await ingestion.syncConnection(userId, budgetId, connection.id);
    expect(await db.ingestedEntry.count()).toBe(1);
    // Only the posted amount remains; the pending entry was reversed, not deleted.
    expect(
      (await getFinance(userId, budgetId, "2026-03")).projection.cash,
    ).toBe(97800n);
    expect(
      await db.financialTransaction.count({
        where: { voidedAt: { not: null } },
      }),
    ).toBe(1);
  });

  it("corrects rather than deletes when the institution withdraws an entry", async () => {
    await connected();
    const connection = await db.providerConnection.findFirstOrThrow();
    batches = [
      { entries: [entry("a", -2500n)], removed: [], cursor: "c1" },
      { entries: [], removed: ["a"], cursor: "c2" },
    ];
    await ingestion.syncConnection(userId, budgetId, connection.id);
    const result = await ingestion.syncConnection(
      userId,
      budgetId,
      connection.id,
    );
    expect(result.corrected).toBe(1);
    expect(await db.ingestedEntry.count()).toBe(0);
    const voided = await db.financialTransaction.findFirst({
      where: { voidedAt: { not: null } },
    });
    expect(voided?.voidReason).toContain("Removed by the institution");
    // The reversing journal restores the balance without erasing the record.
    expect(
      (await getFinance(userId, budgetId, "2026-03")).projection.cash,
    ).toBe(100000n);
  });

  it("never imports history the opening balance already covers", async () => {
    // The account opens at 2026-03-01 with 1000. Anything at or before that date
    // is already inside that balance, so importing it would double count.
    await connected();
    const connection = await db.providerConnection.findFirstOrThrow();
    batches = [
      {
        entries: [
          entry("old", -50000n, { date: "2025-06-14" }),
          entry("onOpeningDay", -9900n, { date: "2026-03-01" }),
          entry("after", -2500n, { date: "2026-03-05" }),
        ],
        removed: [],
        cursor: "c1",
      },
    ];
    const result = await ingestion.syncConnection(
      userId,
      budgetId,
      connection.id,
    );
    expect(result.created).toBe(1);
    const state = await getFinance(userId, budgetId, "2026-03");
    // 1000 opening - 25, with the prior year and the opening day itself excluded.
    expect(state.projection.cash).toBe(97500n);
    expect(await db.ingestedEntry.count()).toBe(1);
    // Excluded history must not later look like the institution withdrew it.
    const again = await ingestion.syncConnection(
      userId,
      budgetId,
      connection.id,
    );
    expect(again.corrected).toBe(0);
    expect(again.created).toBe(0);
  });

  it("records the start date when an account is linked", async () => {
    const { accountId } = await connected();
    const linked = await db.providerAccount.findFirstOrThrow({
      where: { accountId },
    });
    // Defaults to the account's own opening entry rather than to all of history.
    expect(linked.linkedFrom?.toISOString().slice(0, 10)).toBe("2026-03-01");
  });

  it("ignores accounts the owner has not linked", async () => {
    await connected();
    const connection = await db.providerConnection.findFirstOrThrow();
    batches = [
      {
        entries: [entry("u", -9999n, { externalAccountId: "ext-savings" })],
        removed: [],
        cursor: "c1",
      },
    ];
    const result = await ingestion.syncConnection(
      userId,
      budgetId,
      connection.id,
    );
    expect(result.created).toBe(0);
    expect(
      (await getFinance(userId, budgetId, "2026-03")).projection.cash,
    ).toBe(100000n);
  });

  it("commits the cursor only with the ledger changes it came from", async () => {
    await connected();
    const connection = await db.providerConnection.findFirstOrThrow();
    expect(connection.cursor).toBeNull();
    batches = [{ entries: [entry("a", -2500n)], removed: [], cursor: "c1" }];
    await ingestion.syncConnection(userId, budgetId, connection.id);
    const after = await db.providerConnection.findUniqueOrThrow({
      where: { id: connection.id },
    });
    expect(after.cursor).toBe("c1");
    expect(after.syncingSince).toBeNull();
    expect(after.lastSyncedAt).not.toBeNull();
  });

  it("refuses a second sync while one is already running", async () => {
    await connected();
    const connection = await db.providerConnection.findFirstOrThrow();
    await db.providerConnection.update({
      where: { id: connection.id },
      data: { syncingSince: new Date() },
    });
    await expect(
      ingestion.syncConnection(userId, budgetId, connection.id),
    ).rejects.toThrow("already running");
    // A claim older than the timeout is stale and must not lock the connection out.
    await db.providerConnection.update({
      where: { id: connection.id },
      data: { syncingSince: new Date(Date.now() - 11 * 60 * 1000) },
    });
    batches = [{ entries: [], removed: [], cursor: "c1" }];
    await expect(
      ingestion.syncConnection(userId, budgetId, connection.id),
    ).resolves.toMatchObject({ created: 0 });
  });

  it("refuses cross-budget access to a connection", async () => {
    const { connectionId } = await connected();
    const other = await db.budget.create({ data: { name: "Other" } });
    await expect(
      ingestion.syncConnection(userId, other.id, connectionId),
    ).rejects.toThrow("unavailable");
    await expect(
      ingestion.approveEntry(userId, other.id, randomUUID(), null),
    ).rejects.toThrow("unavailable");
  });

  it("keeps imported history after disconnecting", async () => {
    await connected();
    const connection = await db.providerConnection.findFirstOrThrow();
    batches = [{ entries: [entry("a", -2500n)], removed: [], cursor: "c1" }];
    await ingestion.syncConnection(userId, budgetId, connection.id);
    await ingestion.disconnect(userId, budgetId, connection.id);
    const after = await db.providerConnection.findUniqueOrThrow({
      where: { id: connection.id },
    });
    expect(after.status).toBe("DISCONNECTED");
    expect(after.cursor).toBeNull();
    expect(await db.ingestedEntry.count()).toBe(1);
    expect(
      (await getFinance(userId, budgetId, "2026-03")).projection.cash,
    ).toBe(97500n);
    await expect(
      ingestion.syncConnection(userId, budgetId, connection.id),
    ).rejects.toThrow("removed");
  });
});
