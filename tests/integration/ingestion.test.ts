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
let failure: Error | null = null;
let linkOptions: { accessToken?: string } | undefined;
const stub: Provider = {
  name: "PLAID",
  createLinkToken: async (_ref, options) => {
    linkOptions = options;
    return "link-stub";
  },
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
  sync: async () => {
    if (failure) throw failure;
    return batches[Math.min(calls++, batches.length - 1)];
  },
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
  failure = null;
  await db.workerHeartbeat.deleteMany();
  process.env.PLAID_CLIENT_ID = "client";
  process.env.PLAID_SECRET = "secret";
  process.env.PLAID_ENV = "sandbox";
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

it("pre-fills an enabled rule's category ahead of payee memory, respecting protection", async () => {
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
      entries: [entry("a", -4000n, { payee: "Shell" })],
      removed: [],
      cursor: "c1",
    },
    {
      entries: [
        entry("b", -3000n, { payee: "Shell" }),
        entry("c", -2000n, { payee: "Coffee" }),
      ],
      removed: [],
      cursor: "c2",
    },
  ];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  const filed = await db.ingestedEntry.findFirstOrThrow();
  await ingestion.approveEntry(userId, budgetId, filed.id, fuel.id);
  await ingestion.syncConnection(userId, budgetId, connectionId);
  await executeFinance(userId, budgetId, randomUUID(), {
    type: "rule.save",
    name: "Road trips",
    payeeMatch: "shell",
    categoryId: travel.id,
    renamePayee: "Shell fuel",
  });
  const find = async (externalId: string) =>
    (await ingestion.getConnections(userId, budgetId)).entries.find(
      (e) => e.externalId === externalId,
    )!;
  const shell = await find("b");
  expect(shell.suggestedCategoryId).toBe(travel.id);
  expect(shell.suggestionRule).toBe("Road trips");
  expect(shell.ruleReviewId).toBe(shell.transactionId);
  // An entry no rule matches keeps the ordinary behaviour.
  const coffee = await find("c");
  expect(coffee.suggestionRule).toBeNull();
  expect(coffee.ruleReviewId).toBeNull();

  // A protected category is never proposed; payee memory takes over again.
  await db.transactionPreference.create({
    data: {
      transactionId: shell.transactionId!,
      budgetId,
      locked: ["categoryId"],
    },
  });
  const locked = await find("b");
  expect(locked.suggestedCategoryId).toBe(fuel.id);
  expect(locked.suggestionRule).toBeNull();
  await db.transactionPreference.delete({
    where: { transactionId: shell.transactionId! },
  });

  // An archived target is not offered, and nothing here touched the ledger.
  await db.category.update({
    where: { id: travel.id },
    data: { archived: true },
  });
  expect((await find("b")).suggestionRule).toBeNull();
  expect(
    (await db.ingestedEntry.findFirstOrThrow({ where: { externalId: "b" } }))
      .approved,
  ).toBe(false);
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
it("matches a manually entered purchase while preserving its chosen category", async () => {
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
  batches = [{ entries: [entry("bank", -2500n)], removed: [], cursor: "c1" }];
  await ingestion.syncConnection(userId, budgetId, connectionId);
  const state = await ingestion.getConnections(userId, budgetId);
  expect(state.proposals.some((p) => p.transactionId === manual.id)).toBe(true);
  const e = await db.ingestedEntry.findFirstOrThrow();
  await ingestion.resolveMatch(userId, budgetId, e.id, {
    transactionId: manual.id,
  });
  await ingestion.syncConnection(userId, budgetId, connectionId);
  expect((await getFinance(userId, budgetId, "2026-03")).projection.cash).toBe(
    97500n,
  );
  expect(
    (await db.ingestedEntry.findUniqueOrThrow({ where: { id: e.id } }))
      .transactionId,
  ).toBe(manual.id);
  expect(
    (
      await db.financialSplit.findFirstOrThrow({
        where: { transactionId: manual.id },
      })
    ).categoryId,
  ).toBe(c.id);
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
  batches = [{ entries: [entry("a", 1000n)], removed: [], cursor: "c1" }];
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

describe("signing a connection in again (update mode)", () => {
  it("hands Link the stored item, then clears the error and queues a sync", async () => {
    const { connectionId } = await connected();
    failure = new ProviderError("REAUTH_REQUIRED", "login required");
    await expect(
      ingestion.syncConnection(userId, budgetId, connectionId),
    ).rejects.toThrow("sign");
    failure = null;
    const { linkToken } = await ingestion.startReauth(
      userId,
      budgetId,
      connectionId,
    );
    expect(linkToken).toBe("link-stub");
    // Update mode is keyed by the decrypted access token, never a new item.
    expect(linkOptions).toEqual({ accessToken: "access-stub" });
    await ingestion.completeReauth(userId, budgetId, connectionId);
    const connection = await db.providerConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    expect(connection.status).toBe("ACTIVE");
    expect(connection.errorCode).toBeNull();
    expect(
      await db.job.count({
        where: { kind: "provider.sync", subjectId: connectionId },
      }),
    ).toBe(1);
    expect(
      await db.auditEvent.count({
        where: {
          entityId: connectionId,
          details: { path: ["type"], equals: "connection.reauth" },
        },
      }),
    ).toBe(1);
  });

  it("refuses other owners and removed connections", async () => {
    const { connectionId } = await connected();
    await expect(
      ingestion.startReauth(randomUUID(), budgetId, connectionId),
    ).rejects.toThrow("Budget unavailable");
    await expect(
      ingestion.completeReauth(randomUUID(), budgetId, connectionId),
    ).rejects.toThrow("Budget unavailable");
    await ingestion.disconnect(userId, budgetId, connectionId);
    await expect(
      ingestion.startReauth(userId, budgetId, connectionId),
    ).rejects.toThrow("removed");
    await expect(
      ingestion.completeReauth(userId, budgetId, connectionId),
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
