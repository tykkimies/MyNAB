import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/infrastructure/db";
import { createOwner } from "@/application/auth";
import { executeFinance, getFinance } from "@/application/finance";
import { encryptSecret } from "@/infrastructure/crypto";
import type { NormalizedEntry } from "@/domain/ingestion";
import type {
  Provider,
  ProviderBatch,
  SyncContext,
} from "@/infrastructure/providers/types";

const db = getDb();
let userId: string, budgetId: string;

/** Stands in for an institution so the whole path runs without network access. */
let batches: ProviderBatch[] = [];
let calls = 0;
let bankBalance: bigint | null = null;
let failure: Error | null = null;
/** Every connection is SimpleFIN now; the stub records each sync's context. */
let contexts: (SyncContext | undefined)[] = [];
let accountIds = ["ext-checking"];
let claims = 0;
const SETUP = Buffer.from("https://beta-bridge.simplefin.org/simplefin/claim/X").toString("base64");
const stub: Provider = {
  name: "SIMPLEFIN",
  exchange: async () => {
    claims++;
    return {
      accessToken: `https://u:p${claims}@beta-bridge.simplefin.org/simplefin`,
      itemId: "",
      institutionId: "simplefin",
      institutionName: "Stub Bank",
    };
  },
  listAccounts: async () =>
    accountIds.map((id) => ({
      externalAccountId: id,
      name: "Stub Checking",
      mask: "0000",
      type: "checking",
      currentBalance: bankBalance,
    })),
  sync: async (_token, _cursor, context) => {
    contexts.push(context);
    if (failure) throw failure;
    return batches[Math.min(calls++, batches.length - 1)];
  },
  disconnect: async () => undefined,
};

vi.mock("@/infrastructure/providers/simplefin", () => ({
  createSimpleFinProvider: () => stub,
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
  bankBalance = null;
  batches = [];
  calls = 0;
  failure = null;
  await db.workerHeartbeat.deleteMany();
  delete process.env.SIMPLEFIN;
  contexts = [];
  accountIds = ["ext-checking"];
  claims = 0;
  const owner = await createOwner("owner", "synthetic-ingestion-passphrase");
  userId = owner.userId;
  budgetId = (await db.budget.findFirstOrThrow()).id;
});
afterAll(async () => {
  await clear();
  await db.workerHeartbeat.deleteMany();
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
    { setupToken: SETUP },
  );
  const providerAccount = await db.providerAccount.findFirstOrThrow({
    where: { connectionId },
  });
  await ingestion.linkAccount(userId, budgetId, providerAccount.id, account.id);
  return { connectionId, accountId: account.id };
}

describe("linking like YNAB", () => {
  it("adds a bank account to MyNAB with the bank's balance and no typing", async () => {
    bankBalance = 880012n;
    const { connectionId } = await ingestion.completeLink(userId, budgetId, { setupToken: SETUP });
    const provider = await db.providerAccount.findFirstOrThrow({ where: { connectionId } });
    const { accountId } = await ingestion.createLinkedAccount(userId, budgetId, provider.id);
    const account = await db.financialAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(account).toMatchObject({ name: "Stub Checking 0000", type: "CHECKING", participation: "BUDGET" });
    const opening = await db.financialTransaction.findMany({ where: { accountId, voidedAt: null } });
    expect(opening.map((t) => [t.kind, t.amount])).toEqual([["OPENING", 880012n]]);
    // A second sync never adds a second starting balance.
    batches = [{ entries: [], removed: [], cursor: "c0" }];
    await ingestion.syncConnection(userId, budgetId, connectionId);
    expect(await db.financialTransaction.count({ where: { accountId, kind: "OPENING", voidedAt: null } })).toBe(1);
    await expect(ingestion.createLinkedAccount(userId, budgetId, provider.id)).rejects.toThrow("already linked");
  });

  it("backfills a starting balance on sync without counting imports twice", async () => {
    const empty = await executeFinance(userId, budgetId, randomUUID(), {
      type: "account.create", name: "PNC Checking", accountType: "CHECKING", participation: "BUDGET", opening: "0", date: "2026-03-01",
    });
    const { connectionId } = await ingestion.completeLink(userId, budgetId, { setupToken: SETUP });
    const provider = await db.providerAccount.findFirstOrThrow({ where: { connectionId } });
    // The bank reports no balance at link time, as for the owner's first link.
    await ingestion.linkAccount(userId, budgetId, provider.id, empty.id, "2026-03-01");
    expect(await db.financialTransaction.count({ where: { accountId: empty.id } })).toBe(0);
    batches = [{ entries: [entry("e1", -2500n)], removed: [], cursor: "c1" }];
    bankBalance = 10000n;
    const result = await ingestion.syncConnection(userId, budgetId, connectionId);
    expect(result.startingBalances).toBe(1);
    const live = await db.financialTransaction.findMany({ where: { accountId: empty.id, voidedAt: null }, orderBy: { date: "asc" } });
    // Starting balance on the link date = bank balance less what was imported after it.
    expect(live.map((t) => [t.kind, t.date.toISOString().slice(0, 10), t.amount])).toEqual([
      ["OPENING", "2026-03-01", 12500n],
      ["EXPENSE", "2026-03-05", -2500n],
    ]);
  });
});

describe("unlinking and deleting linked accounts", () => {
  it("deletes an emptied file-import account and unlinks a bank account first", async () => {
    // A file import's bookkeeping link must not block deleting an empty account.
    const imported = await executeFinance(userId, budgetId, randomUUID(), {
      type: "account.create", name: "PNC Import", accountType: "CHECKING", participation: "BUDGET", opening: "0", date: "2026-03-01",
    });
    const file = await db.providerConnection.create({
      data: { budgetId, provider: "FILE", institutionId: "file", institutionName: "File imports", accessToken: "" },
    });
    const fileLink = await db.providerAccount.create({
      data: { budgetId, connectionId: file.id, externalAccountId: `account:${imported.id}`, name: "PNC Import", mask: "", type: "CHECKING", accountId: imported.id },
    });
    await executeFinance(userId, budgetId, randomUUID(), { type: "account.delete", id: imported.id });
    expect((await db.providerAccount.findUniqueOrThrow({ where: { id: fileLink.id } })).accountId).toBeNull();

    // A bank link is removed deliberately, keeping what it imported.
    bankBalance = 5000n;
    const { connectionId } = await ingestion.completeLink(userId, budgetId, { setupToken: SETUP });
    const provider = await db.providerAccount.findFirstOrThrow({ where: { connectionId } });
    const { accountId } = await ingestion.createLinkedAccount(userId, budgetId, provider.id);
    await expect(
      executeFinance(userId, budgetId, randomUUID(), { type: "account.delete", id: accountId }),
    ).rejects.toThrow("Unlink it in Account settings first");
    const unlinked = await executeFinance(userId, budgetId, randomUUID(), { type: "account.unlink", id: accountId });
    expect(unlinked.message).toContain("Unlinked");
    expect((await db.providerAccount.findUniqueOrThrow({ where: { id: provider.id } })).accountId).toBeNull();
    // Its starting balance is still its only history, so it can now be deleted,
    // and the bank account can be added again later.
    await executeFinance(userId, budgetId, randomUUID(), { type: "account.delete", id: accountId });
    await ingestion.createLinkedAccount(userId, budgetId, provider.id);
    await expect(
      executeFinance(userId, budgetId, randomUUID(), { type: "account.unlink", id: imported.id }),
    ).rejects.toThrow();
  });
});

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
      where: { id: before.transactionId! },
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
    ).toBe(100000n);
    await ingestion.syncConnection(userId, budgetId, connection.id);
    expect(await db.ingestedEntry.count({ where: { removed: false } })).toBe(1);
    // Only the posted amount remains; the pending entry was reversed, not deleted.
    expect(
      (await getFinance(userId, budgetId, "2026-03")).projection.cash,
    ).toBe(97800n);
    expect(
      await db.financialTransaction.count({
        where: { voidedAt: { not: null } },
      }),
    ).toBe(0);
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
    expect(result.reviewed).toBe(1);
    expect(
      (await getFinance(userId, budgetId, "2026-03")).projection.cash,
    ).toBe(97500n);
    const removed = await db.ingestedEntry.findFirstOrThrow();
    await ingestion.resolveBankChange(
      userId,
      budgetId,
      removed.id,
      ingestion.readReview(removed.review)!.id,
      true,
    );
    expect(await db.ingestedEntry.count({ where: { removed: false } })).toBe(0);
    const voided = await db.financialTransaction.findFirst({
      where: { voidedAt: { not: null } },
    });
    expect(voided?.voidReason).toContain("Accepted bank correction");
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

it("learns a payee's category from the owner's own approvals", async () => {
  const { connectionId } = await connected();
  const group = await executeFinance(userId, budgetId, randomUUID(), {
    type: "group.create",
    name: "Everyday",
  });
  const fuel = await executeFinance(userId, budgetId, randomUUID(), {
    type: "category.create",
    name: "Fuel",
    groupId: group.id,
  });
  batches = [
    {
      entries: [entry("a", -4000n, { payee: "SHELL OIL 4471" })],
      removed: [],
      cursor: "c1",
    },
    {
      entries: [entry("b", -3500n, { payee: "Shell Oil 4471" })],
      removed: [],
      cursor: "c2",
    },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  // Nothing has been filed yet, so nothing is suggested.
  const first = await ingestion.getConnections(userId, budgetId);
  expect(first.entries[0].suggestedCategoryId).toBeNull();

  const filed = await db.ingestedEntry.findFirstOrThrow();
  await ingestion.approveEntry(userId, budgetId, filed.id, fuel.id);

  await ingestion.syncConnection(userId, budgetId, connectionId);
  const second = await ingestion.getConnections(userId, budgetId);
  const pending = second.entries.find((e) => e.externalId === "b");
  expect(pending?.suggestedCategoryId).toBe(fuel.id);
  expect(pending?.suggestionSupport).toBe(1);
});

it("does not learn from a decision the owner took back", async () => {
  const { connectionId } = await connected();
  const group = await executeFinance(userId, budgetId, randomUUID(), {
    type: "group.create",
    name: "Everyday",
  });
  const fuel = await executeFinance(userId, budgetId, randomUUID(), {
    type: "category.create",
    name: "Fuel",
    groupId: group.id,
  });
  batches = [
    {
      entries: [entry("a", -4000n, { payee: "Shell" })],
      removed: [],
      cursor: "c1",
    },
    {
      entries: [entry("b", -3000n, { payee: "Shell" })],
      removed: [],
      cursor: "c2",
    },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  const filed = await db.ingestedEntry.findFirstOrThrow();
  await ingestion.approveEntry(userId, budgetId, filed.id, fuel.id);
  const categorised = await db.ingestedEntry.findUniqueOrThrow({
    where: { id: filed.id },
  });
  // Voiding that transaction withdraws the evidence it created.
  await executeFinance(userId, budgetId, randomUUID(), {
    type: "transaction.void",
    id: categorised.transactionId!,
    reason: "Wrong category entirely",
    acknowledgeReconciled: true,
  });
  await ingestion.syncConnection(userId, budgetId, connectionId);
  const after = await ingestion.getConnections(userId, budgetId);
  expect(
    after.entries.find((e) => e.externalId === "b")?.suggestedCategoryId,
  ).toBeNull();
});

it("files imports on arrival by rule, then payee memory, as YNAB does", async () => {
  const { connectionId } = await connected();
  const group = await executeFinance(userId, budgetId, randomUUID(), {
    type: "group.create",
    name: "Everyday",
  });
  const [fuel, travel] = await Promise.all(
    ["Fuel", "Travel"].map((name) =>
      executeFinance(userId, budgetId, randomUUID(), {
        type: "category.create",
        name,
        groupId: group.id,
      }),
    ),
  );
  batches = [
    {
      entries: [
        entry("a", -4000n, { payee: "Shell" }),
        entry("c", -2000n, { payee: "Coffee" }),
      ],
      removed: [],
      cursor: "c1",
    },
    {
      entries: [entry("b", -3000n, { payee: "Shell" })],
      removed: [],
      cursor: "c2",
    },
    {
      entries: [entry("d", -1000n, { payee: "Shell" })],
      removed: [],
      cursor: "c3",
    },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  const find = async (externalId: string) =>
    (await ingestion.getConnections(userId, budgetId)).entries.find(
      (e) => e.externalId === externalId,
    )!;
  // No history and no rules yet: Uncategorized, counted but unapproved.
  expect((await find("a")).currentCategoryId).toBeNull();
  await ingestion.approveEntry(userId, budgetId, (await find("a")).id, fuel.id);
  // Payee memory files the next Shell import under Fuel on arrival.
  await ingestion.syncConnection(userId, budgetId, connectionId);
  const b = await find("b");
  expect(b.currentCategoryId).toBe(fuel.id);
  expect(b.approved).toBe(false);
  const split = await db.financialSplit.findFirstOrThrow({
    where: { transactionId: b.transactionId! },
  });
  expect(split.categoryId).toBe(fuel.id);
  // An unapproved guess is not evidence: support still counts only approvals.
  expect(b.suggestionSupport).toBe(1);
  // Approving with the category it already has is only an approval.
  const before = await db.financialTransaction.count();
  await ingestion.approveEntry(userId, budgetId, b.id, fuel.id);
  expect(await db.financialTransaction.count()).toBe(before);
  expect(
    (await db.ingestedEntry.findUniqueOrThrow({ where: { id: b.id } }))
      .approved,
  ).toBe(true);
  // A rule outranks memory for imports that arrive after it exists.
  await executeFinance(userId, budgetId, randomUUID(), {
    type: "rule.save",
    name: "Road trips",
    payeeMatch: "shell",
    categoryId: travel.id,
  });
  await ingestion.syncConnection(userId, budgetId, connectionId);
  const d = await find("d");
  expect(d.currentCategoryId).toBe(travel.id);
  expect(d.suggestionRule).toBe("Road trips");
  // An entry no rule or memory covers stays Uncategorized.
  expect((await find("c")).currentCategoryId).toBeNull();
});

it("approves many imports at once, skipping ones still under review", async () => {
  const { connectionId } = await connected();
  batches = [
    {
      entries: [
        entry("a", -1000n),
        entry("b", -2000n),
        entry("p", -500n, { status: "PENDING" }),
      ],
      removed: [],
      cursor: "c1",
    },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  const all = await db.ingestedEntry.findMany();
  const result = await ingestion.approveEntries(
    userId,
    budgetId,
    all.map((e) => e.id),
  );
  expect(result).toEqual({ approved: 2, skipped: 1 });
  expect(await db.ingestedEntry.count({ where: { approved: true } })).toBe(2);
  await expect(
    ingestion.approveEntries(randomUUID(), budgetId, [all[0].id]),
  ).rejects.toThrow("Budget unavailable");
});

it("preserves history across empty deltas and deltas with only new records", async () => {
  const { connectionId } = await connected();
  batches = [
    { entries: [entry("a", -2500n)], removed: [], cursor: "c1" },
    { entries: [], removed: [], cursor: "c2" },
    { entries: [entry("b", 1000n)], removed: [], cursor: "c3" },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  await ingestion.syncConnection(userId, budgetId, connectionId);
  await ingestion.syncConnection(userId, budgetId, connectionId);
  expect((await getFinance(userId, budgetId, "2026-03")).projection.cash).toBe(
    98500n,
  );
  expect(
    await db.financialTransaction.count({ where: { voidedAt: { not: null } } }),
  ).toBe(0);
});
it("keeps pending income and spending entirely outside the ledger", async () => {
  const { connectionId } = await connected();
  batches = [
    {
      entries: [
        entry("p", 50000n, { status: "PENDING" }),
        entry("q", -10000n, { status: "PENDING" }),
      ],
      removed: [],
      cursor: "c1",
    },
    { entries: [], removed: ["p", "q"], cursor: "c2" },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  expect(await db.financialTransaction.count()).toBe(1);
  expect(
    (await getFinance(userId, budgetId, "2026-03")).projection.readyToAssign,
  ).toBe(100000n);
  const p = await db.ingestedEntry.findFirstOrThrow();
  expect(p.transactionId).toBeNull();
  await expect(
    ingestion.approveEntry(userId, budgetId, p.id, null),
  ).rejects.toThrow("wait for posting");
  await ingestion.syncConnection(userId, budgetId, connectionId);
  expect(await db.ingestedEntry.count({ where: { removed: false } })).toBe(0);
});
it("enters a pending observation now and clears it in place when the bank posts the same amount", async () => {
  const { connectionId, accountId } = await connected();
  const food = await executeFinance(userId, budgetId, randomUUID(), { type: "category.create", name: "Food", groupId: (await executeFinance(userId, budgetId, randomUUID(), { type: "group.create", name: "Everyday" })).id });
  batches = [
    { entries: [entry("p", -2000n, { status: "PENDING" })], removed: [], cursor: "c1" },
    { entries: [entry("x", -2000n, { pendingExternalId: "p", date: "2026-03-07" })], removed: ["p"], cursor: "c2" },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  // Listed for the register, outside the ledger.
  const listed = await ingestion.pendingEntries(userId, budgetId);
  expect(listed).toHaveLength(1);
  expect(listed[0]).toMatchObject({ accountId, amount: -2000n, payee: "Grocer" });
  expect((await getFinance(userId, budgetId, "2026-03")).projection.cash).toBe(100000n);
  // Entered now: uncleared, approved, filed under the chosen category, counted.
  const { transactionId } = await ingestion.enterPending(userId, budgetId, listed[0].id, food.id);
  expect(transactionId).toBeTruthy();
  expect(await ingestion.pendingEntries(userId, budgetId)).toHaveLength(0);
  const state = await getFinance(userId, budgetId, "2026-03");
  expect(state.projection.cash).toBe(98000n);
  expect(state.projection.categories.find((c) => c.id === food.id)?.activity).toBe(-2000n);
  expect((await db.transactionState.findFirstOrThrow({ where: { transactionId: transactionId! } })).cleared).toBe(false);
  expect(await db.ingestedEntry.findFirst({ where: { externalId: "p" } })).toMatchObject({ transactionId, approved: true });
  await expect(ingestion.enterPending(userId, budgetId, listed[0].id, null)).rejects.toThrow("no longer be entered");
  // Posted with the same amount: the same row clears; no new transaction.
  await ingestion.syncConnection(userId, budgetId, connectionId);
  expect(await db.financialTransaction.count({ where: { voidedAt: null, kind: { not: "OPENING" } } })).toBe(1);
  expect((await db.transactionState.findFirstOrThrow({ where: { transactionId: transactionId! } })).cleared).toBe(true);
  expect(await db.ingestedEntry.findMany({ where: { removed: false } })).toMatchObject([{ externalId: "x", status: "POSTED", transactionId, approved: true }]);
  expect((await getFinance(userId, budgetId, "2026-03")).projection.cash).toBe(98000n);
});
it("keeps a recovered pre-link pending expense and promotes it without duplicate spending", async () => {
  const { connectionId, accountId } = await connected();
  await db.providerAccount.updateMany({ where: { connectionId }, data: { linkedFrom: new Date("2026-03-05") } });
  const link = await db.providerAccount.findFirstOrThrow({ where: { connectionId, accountId } });
  const recovered = await db.ingestedEntry.create({
    data: {
      budgetId, connectionId, providerAccountId: link.id,
      externalId: "recovered-pending:export-row-1", status: "PENDING",
      date: new Date("2026-03-03"), amount: -2000n, payee: "Grocer",
    },
  });
  const { transactionId } = await ingestion.enterPending(userId, budgetId, recovered.id, null);
  batches = [
    { entries: [], removed: [], cursor: "c1" },
    { entries: [entry("bank-posted", -2000n, { date: "2026-03-03", pendingExternalId: recovered.externalId })], removed: [], cursor: "c2" },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  expect(await db.ingestedEntry.findUniqueOrThrow({ where: { id: recovered.id } })).toMatchObject({ removed: false, transactionId });
  await ingestion.syncConnection(userId, budgetId, connectionId);
  expect(await db.financialTransaction.count({ where: { accountId, voidedAt: null, kind: "EXPENSE" } })).toBe(1);
  expect((await db.transactionState.findFirstOrThrow({ where: { transactionId: transactionId! } })).cleared).toBe(true);
  expect(await db.ingestedEntry.findFirst({ where: { externalId: "bank-posted", removed: false } })).toMatchObject({ transactionId, status: "POSTED" });
});
it("takes the bank's amount but keeps the category when an entered pending row posts differently", async () => {
  const { connectionId } = await connected();
  const food = await executeFinance(userId, budgetId, randomUUID(), { type: "category.create", name: "Food", groupId: (await executeFinance(userId, budgetId, randomUUID(), { type: "group.create", name: "Everyday" })).id });
  batches = [
    { entries: [entry("p", -2000n, { status: "PENDING" })], removed: [], cursor: "c1" },
    { entries: [entry("x", -2300n, { pendingExternalId: "p" })], removed: ["p"], cursor: "c2" },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  const [listed] = await ingestion.pendingEntries(userId, budgetId);
  const { transactionId } = await ingestion.enterPending(userId, budgetId, listed.id, food.id);
  await ingestion.syncConnection(userId, budgetId, connectionId);
  // The entered row was replaced by one with the tip, filed the same way.
  expect((await db.financialTransaction.findUniqueOrThrow({ where: { id: transactionId! } })).voidedAt).not.toBeNull();
  const live = await db.financialTransaction.findFirstOrThrow({ where: { voidedAt: null, replacesId: transactionId } });
  expect(live.amount).toBe(-2300n);
  expect(await db.financialSplit.findMany({ where: { transactionId: live.id } })).toMatchObject([{ categoryId: food.id, amount: -2300n }]);
  expect((await db.transactionState.findFirstOrThrow({ where: { transactionId: live.id } })).cleared).toBe(true);
  expect(await db.ingestedEntry.findMany({ where: { removed: false } })).toMatchObject([{ externalId: "x", transactionId: live.id, approved: true }]);
  expect((await getFinance(userId, budgetId, "2026-03")).projection.cash).toBe(97700n);
});
it("matches the owner's entry to a pending observation and clears it when it posts", async () => {
  const { connectionId, accountId } = await connected();
  const food = await executeFinance(userId, budgetId, randomUUID(), { type: "category.create", name: "Food", groupId: (await executeFinance(userId, budgetId, randomUUID(), { type: "group.create", name: "Everyday" })).id });
  const manual = await executeFinance(userId, budgetId, randomUUID(), { type: "transaction.create", accountId, kind: "EXPENSE", date: "2026-03-04", amount: "-20", payee: "Grocer", splits: [{ categoryId: food.id, amount: "-20" }] });
  batches = [
    { entries: [entry("p", -2000n, { status: "PENDING" })], removed: [], cursor: "c1" },
    { entries: [entry("x", -2000n, { pendingExternalId: "p" })], removed: ["p"], cursor: "c2" },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  // Linked, not duplicated, and not yet cleared: the bank has not settled it.
  expect(await db.ingestedEntry.findFirst({ where: { externalId: "p" } })).toMatchObject({ transactionId: manual.id, matched: true, approved: true });
  expect(await ingestion.pendingEntries(userId, budgetId)).toHaveLength(0);
  expect((await db.transactionState.findFirstOrThrow({ where: { transactionId: manual.id } })).cleared).toBe(false);
  expect((await getFinance(userId, budgetId, "2026-03")).projection.cash).toBe(98000n);
  await ingestion.syncConnection(userId, budgetId, connectionId);
  expect((await db.transactionState.findFirstOrThrow({ where: { transactionId: manual.id } })).cleared).toBe(true);
  expect(await db.financialTransaction.count({ where: { voidedAt: null, kind: { not: "OPENING" } } })).toBe(1);
  expect((await getFinance(userId, budgetId, "2026-03")).projection.cash).toBe(98000n);
});
it("keeps a pending row dated on the link day, and its posted version once it settles", async () => {
  const { connectionId } = await connected();
  // Linked from 2026-03-05: posted history on or before that day is inside
  // the opening balance, but a pending charge is not settled, so it is kept.
  await db.providerAccount.updateMany({ where: { connectionId }, data: { linkedFrom: new Date("2026-03-05") } });
  batches = [
    {
      entries: [
        entry("old", -9900n, { date: "2026-03-05" }),
        entry("p", -2000n, { status: "PENDING", date: "2026-03-05" }),
      ],
      removed: [],
      cursor: "c1",
    },
    { entries: [entry("x", -2000n, { pendingExternalId: "p", date: "2026-03-05" })], removed: ["p"], cursor: "c2" },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  expect((await ingestion.pendingEntries(userId, budgetId)).map((e) => e.amount)).toEqual([-2000n]);
  expect(await db.ingestedEntry.count({ where: { externalId: "old" } })).toBe(0);
  // Its posted version carries the same link-day date and still arrives.
  await ingestion.syncConnection(userId, budgetId, connectionId);
  expect(await db.ingestedEntry.findMany({ where: { removed: false } })).toMatchObject([{ externalId: "x", status: "POSTED" }]);
  expect((await getFinance(userId, budgetId, "2026-03")).projection.cash).toBe(98000n);
});
it("stores only one posted ledger entry when pending and posted share a batch", async () => {
  const { connectionId } = await connected();
  batches = [
    {
      entries: [
        entry("p", -1000n, { status: "PENDING" }),
        entry("x", -1500n, { pendingExternalId: "p" }),
      ],
      removed: ["p"],
      cursor: "c1",
    },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  expect(await db.financialTransaction.count()).toBe(2);
  expect((await getFinance(userId, budgetId, "2026-03")).projection.cash).toBe(
    98500n,
  );
});
it("persists proposed transfers, then joins them with no lost entries or duplicate spending", async () => {
  const { connectionId } = await connected();
  const savings = await executeFinance(userId, budgetId, randomUUID(), {
    type: "account.create",
    name: "Savings",
    accountType: "SAVINGS",
    participation: "BUDGET",
    opening: "0",
    date: "2026-03-01",
  });
  const link = await db.providerAccount.create({
    data: {
      budgetId,
      connectionId,
      externalAccountId: "savings",
      name: "Savings",
      type: "savings",
    },
  });
  await ingestion.linkAccount(
    userId,
    budgetId,
    link.id,
    savings.id,
    "2026-03-01",
  );
  batches = [
    {
      entries: [
        entry("out", -5000n),
        entry("in", 5000n, { externalAccountId: "savings" }),
      ],
      removed: [],
      cursor: "c1",
    },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  expect(await db.ingestedEntry.count()).toBe(2);
  const state = await ingestion.getConnections(userId, budgetId);
  const proposal = state.proposals.find((p) => p.otherEntryId)!;
  expect(proposal).toBeDefined();
  await ingestion.resolveMatch(userId, budgetId, proposal.entryId, {
    otherEntryId: proposal.otherEntryId,
  });
  await ingestion.resolveMatch(userId, budgetId, proposal.entryId, {
    otherEntryId: proposal.otherEntryId,
  });
  expect(
    await db.financialTransaction.count({
      where: { kind: "TRANSFER", voidedAt: null },
    }),
  ).toBe(1);
  const finance = await getFinance(userId, budgetId, "2026-03");
  expect(finance.projection.cash).toBe(100000n);
  expect(finance.projection.categories.every((c) => c.activity === 0n)).toBe(
    true,
  );
});
it("matches a single manual entry automatically, keeping the owner's choices (YNAB A2)", async () => {
  const { connectionId, accountId } = await connected();
  const g = await executeFinance(userId, budgetId, randomUUID(), {
    type: "group.create",
    name: "Food",
  });
  const c = await executeFinance(userId, budgetId, randomUUID(), {
    type: "category.create",
    name: "Groceries",
    groupId: g.id,
  });
  const manual = await executeFinance(userId, budgetId, randomUUID(), {
    type: "transaction.create",
    accountId,
    kind: "EXPENSE",
    date: "2026-03-05",
    amount: "-25",
    payee: "My grocer",
    splits: [{ categoryId: c.id, amount: "-25" }],
  });
  const count = await db.financialTransaction.count();
  // Nine days later is still inside YNAB's matching window.
  batches = [
    {
      entries: [entry("bank", -2500n, { date: "2026-03-14" })],
      removed: [],
      cursor: "c1",
    },
  ];
  const result = await ingestion.syncConnection(userId, budgetId, connectionId);
  expect(result).toMatchObject({ created: 0, matched: 1 });
  expect(await db.financialTransaction.count()).toBe(count);
  const e = await db.ingestedEntry.findFirstOrThrow();
  expect(e).toMatchObject({
    transactionId: manual.id,
    approved: true,
    matched: true,
  });
  expect(
    (
      await db.transactionState.findFirstOrThrow({
        where: { transactionId: manual.id },
      })
    ).cleared,
  ).toBe(true);
  expect((await getFinance(userId, budgetId, "2026-03")).projection.cash).toBe(
    97500n,
  );
  expect(
    (
      await db.financialSplit.findFirstOrThrow({
        where: { transactionId: manual.id },
      })
    ).categoryId,
  ).toBe(c.id);
});

it("pairs several candidates by nearest date, one-for-one (YNAB A2)", async () => {
  const { connectionId, accountId } = await connected();
  const ids: string[] = [];
  for (const date of ["2026-03-04", "2026-03-06"])
    ids.push(
      (
        await executeFinance(userId, budgetId, randomUUID(), {
          type: "transaction.create",
          accountId,
          kind: "INCOME",
          date,
          amount: "10",
        })
      ).id,
    );
  batches = [
    {
      entries: [entry("a", 1000n, { date: "2026-03-06" })],
      removed: [],
      cursor: "c1",
    },
  ];
  const result = await ingestion.syncConnection(userId, budgetId, connectionId);
  expect(result).toMatchObject({ created: 0, matched: 1 });
  expect(
    (await db.ingestedEntry.findFirstOrThrow({ where: { externalId: "a" } }))
      .transactionId,
  ).toBe(ids[1]);
});

it("matches identical cleared, reconciled manual entries to identical imports", async () => {
  const { connectionId, accountId } = await connected();
  const ids: string[] = [];
  for (let i = 0; i < 2; i++)
    ids.push(
      (
        await executeFinance(userId, budgetId, randomUUID(), {
          type: "transaction.create",
          accountId,
          kind: "INCOME",
          date: "2026-03-05",
          amount: "10.78",
        })
      ).id,
    );
  for (const id of ids)
    await executeFinance(userId, budgetId, randomUUID(), {
      type: "transaction.clear",
      id,
      accountId,
      cleared: true,
    });
  await executeFinance(userId, budgetId, randomUUID(), {
    type: "reconcile",
    accountId,
    date: "2026-03-05",
    observed: "1021.56",
  });
  const count = await db.financialTransaction.count();
  batches = [
    {
      entries: [entry("t1", 1078n), entry("t2", 1078n)],
      removed: [],
      cursor: "c1",
    },
  ];
  const result = await ingestion.syncConnection(userId, budgetId, connectionId);
  expect(result).toMatchObject({ created: 0, matched: 2 });
  expect(await db.financialTransaction.count()).toBe(count);
  const linked = (await db.ingestedEntry.findMany()).map((e) => e.transactionId);
  expect(linked.sort()).toEqual([...ids].sort());
});

it("keeps a re-issued posted ID on the owner's reconciled entry", async () => {
  const { connectionId, accountId } = await connected();
  const manual = await executeFinance(userId, budgetId, randomUUID(), {
    type: "transaction.create",
    accountId,
    kind: "INCOME",
    date: "2026-03-05",
    amount: "127.84",
  });
  batches = [
    { entries: [entry("old", 12784n)], removed: [], cursor: "c1" },
    {
      entries: [
        entry("new", 12784n, {
          date: "2026-03-07",
          payee: "Target",
          previousExternalId: "old",
        }),
      ],
      removed: [],
      cursor: "c2",
    },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  await executeFinance(userId, budgetId, randomUUID(), {
    type: "reconcile",
    accountId,
    date: "2026-03-05",
    observed: "1127.84",
  });
  const count = await db.financialTransaction.count();
  const result = await ingestion.syncConnection(userId, budgetId, connectionId);
  expect(result).toMatchObject({ created: 0, reviewed: 0 });
  expect(await db.financialTransaction.count()).toBe(count);
  expect(
    await db.ingestedEntry.findFirstOrThrow({ where: { externalId: "new" } }),
  ).toMatchObject({ transactionId: manual.id, matched: true, approved: true, removed: false });
  expect(
    (await db.ingestedEntry.findFirstOrThrow({ where: { externalId: "old" } }))
      .removed,
  ).toBe(true);
  expect((await getFinance(userId, budgetId, "2026-03")).projection.cash).toBe(
    112784n,
  );
});

it("offers to keep the original when the bank sent a charge again in a later sync", async () => {
  const { connectionId } = await connected();
  batches = [
    { entries: [entry("old", -2120n)], removed: [], cursor: "c1" },
    {
      entries: [entry("new", -2120n, { date: "2026-03-08", payee: "Anthropic" })],
      removed: [],
      cursor: "c2",
    },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  const old = await db.ingestedEntry.findFirstOrThrow({ where: { externalId: "old" } });
  await db.ingestedEntry.update({
    where: { id: old.id },
    data: { createdAt: new Date(Date.now() - 3600_000) },
  });
  await ingestion.syncConnection(userId, budgetId, connectionId);
  expect((await getFinance(userId, budgetId, "2026-03")).projection.cash).toBe(
    95760n,
  );
  const fresh = await db.ingestedEntry.findFirstOrThrow({ where: { externalId: "new" } });
  const proposal = (await ingestion.getConnections(userId, budgetId)).proposals.find(
    (p) => p.duplicateOfEntryId === old.id,
  );
  expect(proposal).toMatchObject({ entryId: fresh.id });
  await ingestion.resolveMatch(userId, budgetId, fresh.id, {
    duplicateOfEntryId: old.id,
  });
  expect((await getFinance(userId, budgetId, "2026-03")).projection.cash).toBe(
    97880n,
  );
  expect(
    await db.ingestedEntry.findFirstOrThrow({ where: { id: fresh.id } }),
  ).toMatchObject({ transactionId: old.transactionId, approved: true });
  expect(
    (await db.ingestedEntry.findFirstOrThrow({ where: { id: old.id } })).removed,
  ).toBe(true);
  expect(
    (await db.financialTransaction.findUniqueOrThrow({ where: { id: fresh.transactionId! } }))
      .voidedAt,
  ).not.toBeNull();
  // Resolved, it is never offered again (which would void the original).
  expect(
    (await ingestion.getConnections(userId, budgetId)).proposals.filter(
      (p) => p.entryId === fresh.id,
    ),
  ).toHaveLength(0);
  // One sync's identical charges are never offered as repeats.
  expect(
    (await ingestion.getConnections(userId, budgetId)).proposals.filter(
      (p) => p.duplicateOfEntryId,
    ),
  ).toHaveLength(0);
});

it("records a bank payee rename without reopening an approved entry", async () => {
  const { connectionId } = await connected();
  batches = [
    { entries: [entry("q", -1000n, { payee: "PIN POS ACME" })], removed: [], cursor: "c1" },
    { entries: [entry("q", -1000n, { payee: "Acme Markets" })], removed: [], cursor: "c2" },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  const first = await db.ingestedEntry.findFirstOrThrow();
  await ingestion.approveEntry(userId, budgetId, first.id, null);
  const result = await ingestion.syncConnection(userId, budgetId, connectionId);
  expect(result).toMatchObject({ created: 0, reviewed: 0 });
  expect(await db.ingestedEntry.findFirstOrThrow()).toMatchObject({
    payee: "Acme Markets",
    approved: true,
    review: null,
    transactionId: first.transactionId,
  });
});

it("matches a different amount by taking the bank's amount and keeping the owner's entry (YNAB B2)", async () => {
  const { connectionId, accountId } = await connected();
  const g = await executeFinance(userId, budgetId, randomUUID(), {
    type: "group.create",
    name: "Out",
  });
  const dining = await executeFinance(userId, budgetId, randomUUID(), {
    type: "category.create",
    name: "Dining",
    groupId: g.id,
  });
  const manual = await executeFinance(userId, budgetId, randomUUID(), {
    type: "transaction.create",
    accountId,
    kind: "EXPENSE",
    date: "2026-03-05",
    amount: "-40",
    payee: "Bistro dinner",
    splits: [{ categoryId: dining.id, amount: "-40" }],
  });
  batches = [
    {
      entries: [entry("tip", -4800n, { payee: "BISTRO 22" })],
      removed: [],
      cursor: "c1",
    },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  const e = await db.ingestedEntry.findFirstOrThrow();
  const proposal = (
    await ingestion.getConnections(userId, budgetId)
  ).proposals.find((p) => p.transactionId === manual.id);
  expect(proposal).toBeTruthy();
  await ingestion.resolveMatch(userId, budgetId, e.id, {
    transactionId: manual.id,
  });
  const linked = await db.ingestedEntry.findUniqueOrThrow({
    where: { id: e.id },
  });
  const kept = await db.financialTransaction.findUniqueOrThrow({
    where: { id: linked.transactionId! },
  });
  expect(kept).toMatchObject({
    amount: -4800n,
    payee: "Bistro dinner",
    replacesId: manual.id,
  });
  const split = await db.financialSplit.findFirstOrThrow({
    where: { transactionId: kept.id },
  });
  expect(split).toMatchObject({ categoryId: dining.id, amount: -4800n });
  // Only one live transaction remains: no duplicate from the bank.
  expect((await getFinance(userId, budgetId, "2026-03")).projection.cash).toBe(
    100000n - 4800n,
  );
  // A far-off amount is never offered.
  expect(
    (await ingestion.getConnections(userId, budgetId)).proposals,
  ).toHaveLength(0);
});
it("queues bank edits and requires acknowledgement before correcting reconciled history", async () => {
  const { connectionId, accountId } = await connected();
  batches = [
    { entries: [entry("a", -2500n)], removed: [], cursor: "c1" },
    { entries: [entry("a", -3000n)], removed: [], cursor: "c2" },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  const original = await db.ingestedEntry.findFirstOrThrow();
  await executeFinance(userId, budgetId, randomUUID(), {
    type: "reconcile",
    accountId,
    date: "2026-03-31",
    observed: "975",
  });
  await ingestion.syncConnection(userId, budgetId, connectionId);
  const changed = await db.ingestedEntry.findFirstOrThrow();
  const review = ingestion.readReview(changed.review)!;
  expect((await getFinance(userId, budgetId, "2026-03")).projection.cash).toBe(
    97500n,
  );
  await expect(
    ingestion.resolveBankChange(userId, budgetId, changed.id, review.id, true),
  ).rejects.toThrow("Acknowledge");
  await ingestion.resolveBankChange(
    userId,
    budgetId,
    changed.id,
    review.id,
    true,
    true,
  );
  const replacement = await db.ingestedEntry.findFirstOrThrow();
  expect(
    (
      await db.financialTransaction.findUniqueOrThrow({
        where: { id: replacement.transactionId! },
      })
    ).replacesId,
  ).toBe(original.transactionId);
  expect((await getFinance(userId, budgetId, "2026-03")).projection.cash).toBe(
    97000n,
  );
  expect(
    (await db.reconciliation.findFirstOrThrow()).affectedAt,
  ).not.toBeNull();
});
it("keeps an owner override across later bank deltas", async () => {
  const { connectionId } = await connected();
  batches = [
    { entries: [entry("a", -2500n)], removed: [], cursor: "c1" },
    { entries: [entry("a", -3000n)], removed: [], cursor: "c2" },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  await ingestion.syncConnection(userId, budgetId, connectionId);
  const e = await db.ingestedEntry.findFirstOrThrow();
  await ingestion.resolveBankChange(
    userId,
    budgetId,
    e.id,
    ingestion.readReview(e.review)!.id,
    false,
  );
  await ingestion.syncConnection(userId, budgetId, connectionId);
  expect((await getFinance(userId, budgetId, "2026-03")).projection.cash).toBe(
    97500n,
  );
  expect((await db.ingestedEntry.findFirstOrThrow()).review).toBeNull();
});
it("rolls back every staged write and cursor if any entry is invalid", async () => {
  const { connectionId } = await connected();
  batches = [
    {
      entries: [entry("a", -2500n), entry("b", -(2n ** 63n))],
      removed: [],
      cursor: "c1",
    },
  ];
  await expect(
    ingestion.syncConnection(userId, budgetId, connectionId),
  ).rejects.toThrow();
  expect(await db.ingestedEntry.count()).toBe(0);
  expect((await db.providerConnection.findFirstOrThrow()).cursor).toBeNull();
  expect(await db.financialTransaction.count()).toBe(1);
});
it("atomically excludes simultaneous syncs and fences a disconnected in-flight sync", async () => {
  const { connectionId } = await connected();
  const original = stub.sync;
  let release!: (batch: ProviderBatch) => void;
  let started!: () => void;
  const began = new Promise<void>((r) => {
    started = r;
  });
  stub.sync = async () => {
    started();
    return new Promise((r) => {
      release = r;
    });
  };
  try {
    const running = ingestion.syncConnection(userId, budgetId, connectionId);
    await began;
    await expect(
      ingestion.syncConnection(userId, budgetId, connectionId),
    ).rejects.toThrow("already running");
    await ingestion.disconnect(userId, budgetId, connectionId);
    release({ entries: [entry("a", -1000n)], removed: [], cursor: "late" });
    await expect(running).rejects.toThrow("superseded");
    const row = await db.providerConnection.findFirstOrThrow();
    expect(row.status).toBe("DISCONNECTED");
    expect(row.cursor).toBeNull();
    expect(await db.ingestedEntry.count()).toBe(0);
  } finally {
    stub.sync = original;
  }
});
it("refuses to reassign an existing linked account and replays on linking a new one", async () => {
  const { connectionId } = await connected();
  const link = await db.providerAccount.findFirstOrThrow();
  const other = await executeFinance(userId, budgetId, randomUUID(), {
    type: "account.create",
    name: "Other",
    accountType: "CASH",
    participation: "BUDGET",
    opening: "0",
    date: "2026-03-01",
  });
  await expect(
    ingestion.linkAccount(userId, budgetId, link.id, other.id),
  ).rejects.toThrow("cannot be reassigned");
  await db.providerConnection.update({
    where: { id: connectionId },
    data: { cursor: "already-passed" },
  });
  const newLink = await db.providerAccount.create({
    data: {
      budgetId,
      connectionId,
      externalAccountId: "other",
      name: "Other",
      type: "checking",
    },
  });
  await ingestion.linkAccount(
    userId,
    budgetId,
    newLink.id,
    other.id,
    "2026-03-01",
  );
  expect((await db.providerConnection.findFirstOrThrow()).cursor).toBeNull();
});

it("does not let an expired sync clear a replacement lease or cursor", async () => {
  const { connectionId } = await connected();
  const original = stub.sync;
  let release!: (batch: ProviderBatch) => void;
  let started!: () => void;
  const began = new Promise<void>((r) => {
    started = r;
  });
  stub.sync = async () => {
    started();
    return new Promise((r) => {
      release = r;
    });
  };
  try {
    const old = ingestion.syncConnection(userId, budgetId, connectionId);
    await began;
    const newer = randomUUID();
    await db.providerConnection.update({
      where: { id: connectionId },
      data: { syncToken: newer, cursor: "newer", syncingSince: new Date() },
    });
    release({ entries: [entry("late", -1n)], removed: [], cursor: "stale" });
    await expect(old).rejects.toThrow("superseded");
    const row = await db.providerConnection.findFirstOrThrow();
    expect(row.syncToken).toBe(newer);
    expect(row.cursor).toBe("newer");
  } finally {
    stub.sync = original;
  }
});
it("retains imported identity after a manual correction, including later syncs", async () => {
  const { connectionId, accountId } = await connected();
  batches = [{ entries: [entry("a", 1000n)], removed: [], cursor: "c1" }];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  const e = await db.ingestedEntry.findFirstOrThrow();
  const corrected = await executeFinance(userId, budgetId, randomUUID(), {
    type: "transaction.create",
    accountId,
    kind: "INCOME",
    date: "2026-03-05",
    amount: "12",
    replacesId: e.transactionId!,
    reason: "Owner correction",
  });
  await ingestion.syncConnection(userId, budgetId, connectionId);
  expect((await db.ingestedEntry.findFirstOrThrow()).transactionId).toBe(
    corrected.id,
  );
  expect((await getFinance(userId, budgetId, "2026-03")).projection.cash).toBe(
    101200n,
  );
});
it("remembers a declined manual match", async () => {
  const { connectionId, accountId } = await connected();
  await executeFinance(userId, budgetId, randomUUID(), {
    type: "transaction.create",
    accountId,
    kind: "INCOME",
    date: "2026-03-05",
    amount: "10",
  });
  // A near amount is suggested, never matched automatically.
  batches = [{ entries: [entry("a", 1100n)], removed: [], cursor: "c1" }];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  const e = await db.ingestedEntry.findFirstOrThrow();
  expect(
    (await ingestion.getConnections(userId, budgetId)).proposals,
  ).toHaveLength(1);
  await ingestion.resolveMatch(userId, budgetId, e.id, { decline: true });
  await ingestion.syncConnection(userId, budgetId, connectionId);
  expect(
    (await ingestion.getConnections(userId, budgetId)).proposals,
  ).toHaveLength(0);
});

it("does not let an archived import category hide later bank spending", async () => {
  const { connectionId } = await connected();
  batches = [{ entries: [entry("a", -100n)], removed: [], cursor: "c1" }];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  const category = await db.category.findFirstOrThrow({
    where: { system: true, paymentAccountId: null },
  });
  await expect(
    executeFinance(userId, budgetId, randomUUID(), {
      type: "category.update",
      id: category.id,
      name: category.name,
      groupId: category.groupId,
      archived: true,
    }),
  ).rejects.toThrow("System import categories");
});

const jobs = await import("@/application/jobs");
const { ProviderError } = await import("@/infrastructure/providers/types");

describe("durable background jobs", () => {
  const empty = { entries: [], removed: [], cursor: "c1" };

  it("queues each stale connection once and maintenance once a day", async () => {
    const { connectionId } = await connected();
    expect(await jobs.scheduleDue()).toBe(2);
    expect(await jobs.scheduleDue()).toBe(0);
    const queued = await db.job.findMany({ orderBy: { kind: "asc" } });
    expect(queued.map((j) => j.kind)).toEqual(["maintenance", "provider.sync"]);
    expect(queued[1].subjectId).toBe(connectionId);
  });

  it("runs a sync as the owner through the normal command and records the outcome", async () => {
    const { connectionId } = await connected();
    batches = [{ entries: [entry("a", -1200n)], removed: [], cursor: "c1" }];
    await jobs.scheduleDue();
    let job;
    while ((job = await jobs.claim())) await jobs.runJob(job);
    expect(await db.ingestedEntry.count()).toBe(1);
    const connection = await db.providerConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    expect(connection.lastSyncedAt).not.toBeNull();
    expect(await db.job.count({ where: { status: "DONE" } })).toBe(2);
    // A fresh sync is not due again until the interval passes.
    await db.job.deleteMany();
    await jobs.scheduleDue();
    expect(await db.job.count({ where: { kind: "provider.sync" } })).toBe(0);
    const later = new Date(Date.now() + 7 * 3_600_000);
    await jobs.scheduleDue(later);
    expect(await db.job.count({ where: { kind: "provider.sync" } })).toBe(1);
  });

  it("never hands one job to two workers, and a lost lease cannot finish it", async () => {
    await connected();
    batches = [empty];
    await jobs.enqueue({ kind: "maintenance", dedupeKey: "only" });
    const [a, b] = await Promise.all([jobs.claim(), jobs.claim()]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const first = (a ?? b)!;
    // The first worker stalls past its lease; another reclaims the job.
    const reclaimed = await jobs.claim(
      new Date(Date.now() + jobs.LEASE_MS + 1000),
    );
    expect(reclaimed?.id).toBe(first.id);
    expect(reclaimed?.attempts).toBe(2);
    expect(await jobs.complete(first)).toBe(false);
    expect(await jobs.failJob(first, new Error("late"))).toBe(false);
    expect(await jobs.complete(reclaimed!)).toBe(true);
    expect(
      (await db.job.findUniqueOrThrow({ where: { id: first.id } })).status,
    ).toBe("DONE");
  });

  it("retries transient provider failures with backoff and gives up after the limit", async () => {
    const { connectionId } = await connected();
    failure = new ProviderError("UNAVAILABLE", "institution down");
    await jobs.enqueue({
      kind: "provider.sync",
      dedupeKey: `provider.sync:${connectionId}`,
      budgetId,
      subjectId: connectionId,
    });
    const job = (await jobs.claim())!;
    const before = Date.now();
    expect(await jobs.runJob(job)).toBe("RETRY");
    const queued = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(queued.status).toBe("QUEUED");
    expect(queued.runAt.getTime()).toBeGreaterThanOrEqual(before + 59_000);
    expect(queued.lastError).toBeTruthy();
    // Not due yet, so nothing is claimed now.
    expect(await jobs.claim()).toBeNull();
    await db.job.update({ where: { id: job.id }, data: { maxAttempts: 2 } });
    const again = (await jobs.claim(new Date(Date.now() + 120_000)))!;
    expect(await jobs.runJob(again)).toBe("RETRY");
    expect(
      (await db.job.findUniqueOrThrow({ where: { id: job.id } })).status,
    ).toBe("FAILED");
  });

  it("stops retrying a connection that needs the owner to sign in again", async () => {
    const { connectionId } = await connected();
    failure = new ProviderError("REAUTH_REQUIRED", "login required");
    await jobs.scheduleDue();
    let job;
    while ((job = await jobs.claim())) await jobs.runJob(job);
    expect(
      (await db.job.findFirstOrThrow({ where: { kind: "provider.sync" } }))
        .status,
    ).toBe("FAILED");
    expect(
      (
        await db.providerConnection.findUniqueOrThrow({
          where: { id: connectionId },
        })
      ).errorCode,
    ).toBe("REAUTH_REQUIRED");
    await jobs.scheduleDue(new Date(Date.now() + 48 * 3_600_000));
    expect(
      await db.job.count({
        where: { kind: "provider.sync", status: "QUEUED" },
      }),
    ).toBe(0);
  });

  it("reports whether a worker is alive", async () => {
    expect((await jobs.workerStatus()).running).toBe(false);
    await jobs.heartbeat("worker-test", new Date());
    expect((await jobs.workerStatus()).running).toBe(true);
    expect(
      (await jobs.workerStatus(new Date(Date.now() + 10 * 60_000))).running,
    ).toBe(false);
  });
});

describe("replacing a SimpleFIN connection's access", () => {
  it("refuses other owners and removed connections", async () => {
    const { connectionId } = await connected();
    await expect(
      ingestion.replaceSimpleFinToken(randomUUID(), budgetId, connectionId, SETUP),
    ).rejects.toThrow("Budget unavailable");
    await ingestion.disconnect(userId, budgetId, connectionId);
    await expect(
      ingestion.replaceSimpleFinToken(userId, budgetId, connectionId, SETUP),
    ).rejects.toThrow("removed");
    expect(await db.job.count()).toBe(0);
  });
});

const imports = await import("@/application/imports");

describe("file imports (CSV and OFX)", () => {
  async function account(name = "Credit union") {
    return (
      await executeFinance(userId, budgetId, randomUUID(), {
        type: "account.create",
        name,
        accountType: "CHECKING",
        participation: "BUDGET",
        opening: "500",
        date: "2026-03-01",
      })
    ).id;
  }
  const csv =
    "Date,Description,Amount\n03/01/2026,Before,-1.00\n03/05/2026,Grocer,-42.10\n03/05/2026,Grocer,-42.10\n03/06/2026,Payroll,1500\n03/07/2026,Broken,abc\n";
  const mapping = {
    header: true,
    date: 0,
    dateFormat: "MM/DD/YYYY" as const,
    payee: 1,
    amount: 2,
  };

  it("previews without writing, then imports once and treats a repeat as a no-op", async () => {
    const accountId = await account();
    const journals = await db.journal.count();
    const preview = await imports.previewImport(userId, budgetId, {
      accountId,
      content: csv,
      mapping,
    });
    expect(preview.counts).toEqual({
      new: 3,
      duplicate: 0,
      beforeOpening: 1,
      invalid: 1,
    });
    expect(await db.journal.count()).toBe(journals);
    expect(await db.ingestedEntry.count()).toBe(0);

    const first = await imports.commitImport(userId, budgetId, {
      accountId,
      content: csv,
      mapping,
      fileName: "march.csv",
    });
    expect(first.created).toBe(3);
    expect(first.batchId).toBeTruthy();
    // Imported rows are ordinary imports: unapproved, awaiting review.
    const entries = await db.ingestedEntry.findMany({ where: { budgetId } });
    expect(entries).toHaveLength(3);
    expect(
      entries.every((e) => !e.approved && e.batchId === first.batchId),
    ).toBe(true);
    const review = await ingestion.getConnections(userId, budgetId);
    expect(review.entries).toHaveLength(3);
    // The file source is not a bank connection.
    expect(review.connections).toHaveLength(0);

    const again = await imports.commitImport(userId, budgetId, {
      accountId,
      content: csv,
      mapping,
    });
    expect(again).toMatchObject({ created: 0, batchId: null });
    expect(await db.importBatch.count()).toBe(1);
    const repeat = await imports.previewImport(userId, budgetId, {
      accountId,
      content: csv,
      mapping,
    });
    expect(repeat.counts.duplicate).toBe(3);
  });

  it("undoes a whole untouched import and allows importing it again", async () => {
    const accountId = await account();
    const { batchId } = await imports.commitImport(userId, budgetId, {
      accountId,
      content: csv,
      mapping,
    });
    const before = (
      await getFinance(userId, budgetId, "2026-03")
    ).projection.accounts.find((a) => a.id === accountId)!.balance;
    expect(before).toBe(50000n - 4210n * 2n + 150000n);
    await imports.undoImport(userId, budgetId, batchId!);
    const after = (
      await getFinance(userId, budgetId, "2026-03")
    ).projection.accounts.find((a) => a.id === accountId)!.balance;
    expect(after).toBe(50000n);
    expect(await db.ingestedEntry.count()).toBe(0);
    // History is kept: the transactions are voided, not deleted.
    expect(
      await db.financialTransaction.count({
        where: { accountId, voidReason: "Import undone" },
      }),
    ).toBe(3);
    await expect(
      imports.undoImport(userId, budgetId, batchId!),
    ).rejects.toThrow("already undone");
    const reimport = await imports.commitImport(userId, budgetId, {
      accountId,
      content: csv,
      mapping,
    });
    expect(reimport.created).toBe(3);
  });

  it("matches an owner's entry on import and leaves it alone on undo", async () => {
    const accountId = await account();
    const group = await executeFinance(userId, budgetId, randomUUID(), {
      type: "group.create",
      name: "Home",
    });
    const food = await executeFinance(userId, budgetId, randomUUID(), {
      type: "category.create",
      name: "Food",
      groupId: group.id,
    });
    const mine = await executeFinance(userId, budgetId, randomUUID(), {
      type: "transaction.create",
      accountId,
      kind: "EXPENSE",
      date: "2026-03-04",
      amount: "-42.10",
      payee: "Groceries I entered",
      splits: [{ categoryId: food.id, amount: "-42.10" }],
    });
    const { batchId, matched, created } = await imports.commitImport(
      userId,
      budgetId,
      { accountId, content: csv, mapping },
    );
    expect(matched).toBe(1);
    expect(created).toBe(2);
    await imports.undoImport(userId, budgetId, batchId!);
    const kept = await db.financialTransaction.findUniqueOrThrow({
      where: { id: mine.id },
    });
    expect(kept.voidedAt).toBeNull();
  });

  it("refuses undo once any row was approved", async () => {
    const accountId = await account();
    const { batchId } = await imports.commitImport(userId, budgetId, {
      accountId,
      content: csv,
      mapping,
    });
    const entry = await db.ingestedEntry.findFirstOrThrow({
      where: { batchId },
    });
    await ingestion.approveEntry(userId, budgetId, entry.id, null);
    await expect(
      imports.undoImport(userId, budgetId, batchId!),
    ).rejects.toThrow("already approved");
  });

  it("reads OFX by bank ID and refuses accounts synced from a bank", async () => {
    const accountId = await account();
    const ofx =
      "OFXHEADER:100\n<OFX><CURDEF>USD<STMTTRN><DTPOSTED>20260310<TRNAMT>-9.99<FITID>F1<NAME>Streaming<STMTTRN><DTPOSTED>20260311<TRNAMT>-5<FITID>F2<NAME>Cafe</OFX>";
    const result = await imports.commitImport(userId, budgetId, {
      accountId,
      content: ofx,
    });
    expect(result.created).toBe(2);
    const { accountId: synced } = await connected();
    await expect(
      imports.commitImport(userId, budgetId, {
        accountId: synced,
        content: ofx,
      }),
    ).rejects.toThrow("synced from your bank");
    // The worker never tries to sync the file source.
    const jobs = await import("@/application/jobs");
    await jobs.scheduleDue();
    expect(await db.job.count({ where: { kind: "provider.sync" } })).toBe(1);
  });

  it("refuses other owners and CSV without a mapping", async () => {
    const accountId = await account();
    await expect(
      imports.commitImport(randomUUID(), budgetId, {
        accountId,
        content: csv,
        mapping,
      }),
    ).rejects.toThrow("Budget unavailable");
    await expect(
      imports.previewImport(userId, budgetId, { accountId, content: csv }),
    ).rejects.toThrow("Choose which columns");
  });
});

const exportsModule = await import("@/application/exports");

describe("portable export", () => {
  it("exports everything versioned, keeps voided history and never includes tokens", async () => {
    const { connectionId } = await connected();
    const cash = await executeFinance(userId, budgetId, randomUUID(), {
      type: "account.create",
      name: "Wallet",
      accountType: "CASH",
      participation: "BUDGET",
      opening: "50",
      date: "2026-03-01",
    });
    const group = await executeFinance(userId, budgetId, randomUUID(), {
      type: "group.create",
      name: "Everyday",
    });
    const food = await executeFinance(userId, budgetId, randomUUID(), {
      type: "category.create",
      name: "Food",
      groupId: group.id,
    });
    const spent = await executeFinance(userId, budgetId, randomUUID(), {
      type: "transaction.create",
      accountId: cash.id,
      kind: "EXPENSE",
      date: "2026-03-04",
      amount: "-12.34",
      payee: '=HYPERLINK("http://evil.example","x")',
      splits: [{ categoryId: food.id, amount: "-12.34" }],
    });
    await executeFinance(userId, budgetId, randomUUID(), {
      type: "transaction.void",
      id: spent.id,
      reason: "Duplicate",
      acknowledgeReconciled: true,
    });
    const json = await exportsModule.exportJson(userId, budgetId);
    const doc = JSON.parse(json);
    expect(doc).toMatchObject({ format: "mynab.export", version: 1 });
    expect(doc.connections[0].id).toBe(connectionId);
    expect(doc.connections[0].accessToken).toBeUndefined();
    expect(doc.connections[0].cursor).toBeUndefined();
    const stored = await db.providerConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    expect(json).not.toContain(stored.accessToken);
    expect(json).not.toContain("access-stub");
    const voided = doc.transactions.find(
      (t: { id: string }) => t.id === spent.id,
    );
    expect(voided.voidedAt).toBeTruthy();
    expect(voided.amount).toBe("-1234");
    expect(
      doc.splits.some(
        (s: { transactionId: string }) => s.transactionId === spent.id,
      ),
    ).toBe(true);

    const csv = await exportsModule.exportCsv(userId, budgetId, "transactions");
    const line = csv.split("\r\n").find((l) => l.includes("HYPERLINK"))!;
    expect(line).toContain(`"'=HYPERLINK(""http://evil.example"",""x"")"`);
    expect(line).toContain(",-12.34,");
    expect(line).toContain("Duplicate");
    await expect(
      exportsModule.exportCsv(userId, budgetId, "sessions"),
    ).rejects.toThrow("Unknown export table");
    await expect(
      exportsModule.exportJson(randomUUID(), budgetId),
    ).rejects.toThrow("Budget unavailable");
  });
});

const attentionModule = await import("@/application/attention");

describe("needs attention summary", () => {
  it("reports imports, sign-in problems and a stopped worker, then clears as they are handled", async () => {
    expect(await attentionModule.getAttention(userId, budgetId)).toEqual([]);
    const { connectionId } = await connected();
    batches = [
      {
        entries: [entry("a", -1200n), entry("b", -800n)],
        removed: [],
        cursor: "c1",
      },
    ];
    await ingestion.syncConnection(userId, budgetId, connectionId);
    let items = await attentionModule.getAttention(userId, budgetId);
    expect(items.map((i) => i.key)).toEqual(["workerDown", "unapproved"]);
    expect(items[1].text).toContain("2 imported transactions are");

    await jobs.heartbeat("worker-test", new Date());
    failure = new ProviderError("REAUTH_REQUIRED", "login required");
    await expect(
      ingestion.syncConnection(userId, budgetId, connectionId),
    ).rejects.toThrow();
    items = await attentionModule.getAttention(userId, budgetId);
    expect(items[0]).toMatchObject({ key: "reauth", level: "act" });

    for (const e of await db.ingestedEntry.findMany())
      await ingestion.approveEntry(userId, budgetId, e.id, null);
    await ingestion.replaceSimpleFinToken(userId, budgetId, connectionId, SETUP);
    expect(await attentionModule.getAttention(userId, budgetId)).toEqual([]);
  });
});

describe("SimpleFIN connections", () => {
  const TOKEN = SETUP;
  const sfEntry = (externalId: string, amount: bigint, over: Partial<NormalizedEntry> = {}) =>
    entry(externalId, amount, { externalAccountId: "ext-checking", ...over });

  it("links from a setup token, syncs with context, stores warnings, and replaces its access", async () => {
    const account = await executeFinance(userId, budgetId, randomUUID(), {
      type: "account.create", name: "Checking", accountType: "CHECKING", participation: "BUDGET", opening: "1000", date: "2026-03-01",
    });
    await expect(ingestion.completeLink(userId, budgetId, { setupToken: "not a token!" })).rejects.toThrow("Paste the setup token");
    const { connectionId } = await ingestion.completeLink(userId, budgetId, { setupToken: `${TOKEN}\n` });
    const connection = await db.providerConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection).toMatchObject({ provider: "SIMPLEFIN", institutionName: "Stub Bank" });
    // The access address is stored encrypted, like any provider token.
    expect(connection.accessToken).not.toContain("simplefin.org");
    const provider = await db.providerAccount.findFirstOrThrow({ where: { connectionId } });
    await ingestion.linkAccount(userId, budgetId, provider.id, account.id);
    batches = [
      {
        entries: [sfEntry("t1", -1500n), sfEntry("p1", -700n, { status: "PENDING", date: "2026-03-06" })],
        removed: [],
        cursor: "2026-03-07",
        warnings: ["Chase needs you to sign in again"],
      },
      { entries: [], removed: ["p1"], cursor: "2026-03-08" },
    ];
    // The sync says how many pending rows SimpleFIN sent.
    expect((await ingestion.syncConnection(userId, budgetId, connectionId)).pendingSeen).toBe(1);
    expect(contexts[0]).toMatchObject({
      timezone: "America/New_York",
      accounts: [{ externalAccountId: "ext-checking", linkedFrom: "2026-03-01" }],
      pending: [],
    });
    expect(await db.ingestedEntry.count({ where: { connectionId, removed: false } })).toBe(2);
    expect((await db.providerConnection.findUniqueOrThrow({ where: { id: connectionId } })).warning).toBe(
      "Chase needs you to sign in again",
    );
    // A bank added at SimpleFIN after linking appears on the next sync, unlinked.
    batches[1] = {
      ...batches[1],
      accounts: [
        { externalAccountId: "ext-checking", name: "Stub Checking", mask: "0000", type: "checking" },
        { externalAccountId: "ext-wells", name: "Wells Fargo Checking", mask: "4321", type: "checking" },
      ],
    };
    // The next sync is told which pending rows it has seen, and withdraws one;
    // a clean sync clears the warning.
    await ingestion.syncConnection(userId, budgetId, connectionId);
    expect(contexts[1]!.pending).toEqual([
      { externalId: "p1", externalAccountId: "ext-checking", amount: -700n, date: "2026-03-06" },
    ]);
    expect(await db.ingestedEntry.count({ where: { connectionId, externalId: "p1", removed: true } })).toBe(1);
    expect(
      (await db.providerAccount.findMany({ where: { connectionId }, orderBy: { name: "asc" } })).map((p) => [p.externalAccountId, p.accountId === null]),
    ).toEqual([["ext-checking", false], ["ext-wells", true]]);
    expect((await db.providerConnection.findUniqueOrThrow({ where: { id: connectionId } })).warning).toBeNull();
    // Revoked access is repaired with a new setup token, not Plaid's Link.
    await db.providerConnection.update({ where: { id: connectionId }, data: { status: "ERROR", errorCode: "REAUTH_REQUIRED" } });
    const before = (await db.providerConnection.findUniqueOrThrow({ where: { id: connectionId } })).accessToken;
    // A token for a different SimpleFIN account cannot take over this one.
    accountIds = ["ext-other"];
    await expect(ingestion.replaceSimpleFinToken(userId, budgetId, connectionId, TOKEN)).rejects.toThrow("does not reach");
    accountIds = ["ext-checking"];
    await ingestion.replaceSimpleFinToken(userId, budgetId, connectionId, TOKEN);
    const after = await db.providerConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(after).toMatchObject({ status: "ACTIVE", errorCode: null });
    expect(after.accessToken).not.toBe(before);
    // The worker syncs SimpleFIN connections, until SimpleFIN is turned off.
    const { scheduleDue } = await import("@/application/jobs");
    await db.job.deleteMany();
    await db.providerConnection.update({ where: { id: connectionId }, data: { lastSyncedAt: null } });
    await scheduleDue();
    expect(await db.job.count({ where: { kind: "provider.sync", subjectId: connectionId } })).toBe(1);
    await db.job.deleteMany();
    process.env.SIMPLEFIN = "off";
    await scheduleDue();
    expect(await db.job.count({ where: { kind: "provider.sync", subjectId: connectionId } })).toBe(0);
  });

  it("moves an account between connections without duplicating the overlap", async () => {
    const { connectionId: plaid, accountId } = await connected();
    batches = [{ entries: [entry("plaid-1", -2000n, { date: "2026-03-05" })], removed: [], cursor: "c1" }];
    await ingestion.syncConnection(userId, budgetId, plaid);
    // The old connection stands in for a retired Plaid one: never synced again.
    await db.providerConnection.update({ where: { id: plaid }, data: { provider: "PLAID" } });
    await expect(ingestion.syncConnection(userId, budgetId, plaid)).rejects.toThrow("Plaid is retired");
    const { connectionId: simplefin } = await ingestion.completeLink(userId, budgetId, { setupToken: TOKEN });
    const target = await db.providerAccount.findFirstOrThrow({ where: { connectionId: simplefin } });
    // Imports still waiting for approval would be orphaned: refused.
    await expect(ingestion.relinkAccount(userId, budgetId, target.id, accountId)).rejects.toThrow("Approve or resolve");
    const waiting = await db.ingestedEntry.findMany({ where: { connectionId: plaid } });
    await ingestion.approveEntries(userId, budgetId, waiting.map((e) => e.id));
    const moved = await ingestion.relinkAccount(userId, budgetId, target.id, accountId);
    // Re-read from before the last Plaid row, never before the old link.
    expect(moved).toMatchObject({ from: "2026-03-01", oldConnectionIdle: plaid });
    const old = await db.providerAccount.findFirstOrThrow({ where: { connectionId: plaid } });
    expect(old.accountId).toBeNull();
    // The retired Plaid connection held only this account, so it is closed.
    expect((await db.providerConnection.findUniqueOrThrow({ where: { id: plaid } })).status).toBe("DISCONNECTED");
    // SimpleFIN re-reports the Plaid row under its own id, plus one new row.
    batches = [
      {
        entries: [sfEntry("s-same", -2000n, { date: "2026-03-05" }), sfEntry("s-new", -300n, { date: "2026-03-09", payee: "Cafe" })],
        removed: [],
        cursor: "2026-03-10",
      },
    ];
    await ingestion.syncConnection(userId, budgetId, simplefin);
    const live = await db.financialTransaction.findMany({ where: { accountId, voidedAt: null, kind: { not: "OPENING" } } });
    expect(live.map((t) => t.amount).sort()).toEqual([-2000n, -300n]);
    expect(await db.ingestedEntry.findFirstOrThrow({ where: { connectionId: simplefin, externalId: "s-same" } })).toMatchObject({ matched: true });
    await expect(ingestion.relinkAccount(userId, budgetId, target.id, accountId)).rejects.toThrow("already linked");
  });
});
