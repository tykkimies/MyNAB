import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { getDb } from "@/infrastructure/db";
import { isRetryableConflict } from "@/infrastructure/retry";
import {
  getConfig,
  simplefinEnabled,
} from "@/infrastructure/config";
import { decryptSecret, encryptSecret } from "@/infrastructure/crypto";
import { createSimpleFinProvider } from "@/infrastructure/providers/simplefin";
import { REPOST_DAYS } from "@/infrastructure/providers/window-delta";
import {
  ProviderError,
  type SimpleFinSetup,
  type Provider,
  type ProviderName,
  type SyncContext,
} from "@/infrastructure/providers/types";
import { planIngestion, type NormalizedEntry } from "@/domain/ingestion";
import { isCard } from "@/domain/budget";
import { suggestCategory } from "@/domain/payees";
import { previewRules, type RuleField } from "@/domain/rules";
import { filingHistory, ruleDefinitions } from "./rules";
import { financialDate } from "@/domain/dates";
import { formatUSD, money } from "@/domain/money";
import {
  authorize,
  executeFinance,
  FinanceError,
  fail,
  journal,
  today,
  voidTransaction,
  type Tx,
} from "./finance";

const uuid = z.string().uuid();
/** A stale claim is released rather than locking a connection out forever. */
const SYNC_LOCK_MS = 10 * 60 * 1000;

/** Bank providers that sync; FILE connections are imports, never synced. */
export const BANK_PROVIDERS: readonly string[] = ["SIMPLEFIN"];
/**
 * Connections shown on Bank sync. PLAID rows are legacy (Plaid was removed,
 * owner decision 2026-09-28): their history stays and their accounts can be
 * moved to SimpleFIN, but they never sync again.
 */
export const LISTED_PROVIDERS: readonly string[] = ["SIMPLEFIN", "PLAID"];
const isBank = (provider: string): provider is ProviderName =>
  BANK_PROVIDERS.includes(provider);

/** The adapter for a connection's provider, or for a new link. */
export function providerFor(name: string = "SIMPLEFIN"): Provider {
  const config = getConfig();
  if (name !== "SIMPLEFIN")
    fail("This connection's provider is no longer supported. Move its accounts to SimpleFIN.");
  if (!simplefinEnabled(config)) fail("SimpleFIN is turned off on this server.");
  return createSimpleFinProvider();
}

/** A pasted SimpleFIN setup token: base64 text of a sane length, nothing more. */
function setupToken(value: unknown) {
  const token = typeof value === "string" ? value.replace(/\s+/g, "") : "";
  if (!token || token.length > 2000 || !/^[A-Za-z0-9+/=_-]+$/.test(token))
    fail("Paste the setup token from SimpleFIN Bridge.");
  return token;
}

export function parseStartDate(value: string, timezone: string) {
  financialDate(value);
  if (value < "1900-01-01") fail("Start date must be from 1900 onward.");
  if (value > today(timezone)) fail("A start date cannot be in the future.");
  return value;
}

const tokenContext = (connectionId: string) =>
  `provider-connection:${connectionId}`;

/**
 * The category imported spending lands in before the owner has said what it was.
 * It is an ordinary spending category, so unassigned imports show as overspending
 * rather than quietly inventing budget money.
 */
async function uncategorized(tx: Tx, budgetId: string) {
  const existing = await tx.category.findFirst({
    where: { budgetId, system: true, paymentAccountId: null },
  });
  if (existing)
    return existing.archived
      ? tx.category.update({
          where: { id: existing.id },
          data: { archived: false },
        })
      : existing;
  let group = await tx.categoryGroup.findFirst({
    where: { budgetId, system: true },
  });
  group ??= await tx.categoryGroup.create({
    data: { budgetId, name: "Credit card payments", system: true },
  });
  return tx.category.create({
    data: {
      budgetId,
      groupId: group.id,
      name: "Uncategorized",
      system: true,
    },
  });
}

/**
 * Write one imported entry as an ordinary balanced transaction. Plaid cannot say
 * what an inflow was for, so an inflow reaches Ready to Assign rather than a
 * category, and a card inflow is a statement credit rather than income.
 *
 * An outflow takes `categoryId` when the caller could suggest one (as YNAB does:
 * it counts in the budget straight away, unapproved), else Uncategorized.
 */
async function writeEntry(
  tx: Tx,
  budgetId: string,
  entry: NormalizedEntry,
  account: { id: string; name: string; participation: string; type: string },
  replacesId?: string,
  categoryId?: string | null,
  /**
   * A pending observation stays out of the ledger on sync (YNAB: the pending
   * section counts in nothing) unless the owner enters it now, which puts it
   * in the register uncleared.
   */
  allowPending = false,
) {
  if (entry.status === "PENDING" && !allowPending) return null;
  const budgeted = account.participation === "BUDGET";
  const outflow = entry.amount < 0n;
  const kind = outflow
    ? "EXPENSE"
    : budgeted && isCard(account)
      ? "CREDIT"
      : "INCOME";
  const journalId = await journal(
    tx,
    budgetId,
    entry.date,
    account.id,
    entry.amount,
    kind,
  );
  const created = await tx.financialTransaction.create({
    data: {
      budgetId,
      journalId,
      accountId: account.id,
      replacesId,
      kind,
      date: new Date(`${entry.date}T00:00:00Z`),
      amount: entry.amount,
      payee: entry.payee.slice(0, 120),
    },
  });
  if (replacesId) {
    const preference = await tx.transactionPreference.findUnique({
      where: { transactionId: replacesId },
    });
    if (preference)
      await tx.transactionPreference.create({
        data: {
          transactionId: created.id,
          budgetId,
          tags: preference.tags,
          locked: preference.locked,
          flag: preference.flag,
        },
      });
  }
  // Only a budget-account outflow carries envelope effect, so only it is split.
  if (budgeted && outflow) {
    const category = categoryId ?? (await uncategorized(tx, budgetId)).id;
    await tx.financialSplit.create({
      data: {
        budgetId,
        transactionId: created.id,
        categoryId: category,
        amount: entry.amount,
        position: 0,
      },
    });
  }
  // Posted means the institution has settled it, which is what cleared means here.
  await tx.transactionState.create({
    data: {
      budgetId,
      transactionId: created.id,
      accountId: account.id,
      cleared: entry.status === "POSTED",
    },
  });
  await tx.reconciliation.updateMany({
    where: {
      budgetId,
      accountId: account.id,
      date: { gte: new Date(`${entry.date}T00:00:00Z`) },
    },
    data: { affectedAt: new Date() },
  });
  return created.id;
}

export async function completeLink(
  userId: string,
  budgetId: string,
  completion: SimpleFinSetup,
) {
  if (!uuid.safeParse(budgetId).success) fail("Invalid budget.");
  completion = { setupToken: setupToken(completion?.setupToken) };
  const provider = providerFor("SIMPLEFIN");
  await getDb().$transaction((tx) => authorize(tx, userId, budgetId));
  // Authorize before exchanging any token; provider calls stay outside transactions.
  const connected = await provider.exchange(completion);
  try {
    const accounts = await provider.listAccounts(connected.accessToken);
    const key = getConfig().SECRET_ENCRYPTION_KEY;
    return await getDb().$transaction(
      async (tx) => {
        await authorize(tx, userId, budgetId);
        const connection = await tx.providerConnection.create({
          data: {
            budgetId,
            provider: provider.name,
            institutionId: connected.institutionId,
            institutionName: connected.institutionName.slice(0, 120),
            // Placeholder: the envelope binds to the row id, which needs the row.
            accessToken: "",
          },
        });
        await tx.providerConnection.update({
          where: { id: connection.id },
          data: {
            accessToken: encryptSecret(
              connected.accessToken,
              key,
              tokenContext(connection.id),
            ),
          },
        });
        await tx.providerAccount.createMany({
          data: accounts.map((a) => ({
            budgetId,
            connectionId: connection.id,
            externalAccountId: a.externalAccountId,
            name: a.name,
            mask: a.mask,
            type: a.type,
          })),
        });
        await tx.auditEvent.create({
          data: {
            budgetId,
            actorId: userId,
            action: "FINANCE_COMMAND",
            entityId: connection.id,
            details: {
              type: "connection.create",
              institution: connected.institutionName,
              accounts: accounts.length,
            },
          },
        });
        return { connectionId: connection.id, accounts: accounts.length };
      },
      { isolationLevel: "Serializable", timeout: 20000 },
    );
  } catch (error) {
    await provider.disconnect(connected.accessToken).catch(() => undefined);
    throw error;
  }
}

/** Linking is explicit: discovery never creates budget accounts by itself. */
export async function linkAccount(
  userId: string,
  budgetId: string,
  providerAccountId: string,
  accountId: string,
  startDate?: string,
) {
  for (const id of [budgetId, providerAccountId, accountId])
    if (!uuid.safeParse(id).success) fail("Invalid identifier.");
  const linked = await financialWrite(userId, budgetId, async (tx) => {
    const budget = await authorize(tx, userId, budgetId);
    const provider = await tx.providerAccount.findFirst({
      where: { id: providerAccountId, budgetId },
    });
    if (!provider) fail("Provider account unavailable.");
    const connection = await tx.providerConnection.findUniqueOrThrow({
      where: { id: provider.connectionId },
    });
    if (connection.status === "DISCONNECTED")
      fail("Reconnect this institution first.");
    if (provider.accountId) {
      if (
        provider.accountId === accountId &&
        (!startDate ||
          provider.linkedFrom?.toISOString().slice(0, 10) === startDate)
      )
        return {
          providerAccountId,
          accountId,
          from: provider.linkedFrom?.toISOString().slice(0, 10),
        };
      fail(
        "An existing link cannot be reassigned. Its imported history belongs to the original account.",
      );
    }
    const account = await tx.financialAccount.findFirst({
      where: { id: accountId, budgetId },
    });
    if (!account) fail("Account unavailable.");
    if (account.closed) fail("Reopen this account before linking it.");
    const taken = await tx.providerAccount.findFirst({
      where: { budgetId, accountId, NOT: { id: providerAccountId } },
    });
    if (taken) fail("That account is already linked to another connection.");
    // Default to the account's own opening entry: everything the owner already
    // accounted for sits at or before it, so importing from there forward is
    // exactly the history the opening balance does not already contain.
    const opening = await tx.financialTransaction.findFirst({
      where: { budgetId, accountId, kind: "OPENING" },
      orderBy: { date: "asc" },
    });
    const from =
      startDate ??
      (opening
        ? opening.date.toISOString().slice(0, 10)
        : today(budget.timezone));
    parseStartDate(from, budget.timezone);
    await tx.providerConnection.update({
      where: { id: provider.connectionId },
      data: { cursor: null, syncToken: null, syncingSince: null },
    });
    await tx.providerAccount.update({
      where: { id: providerAccountId },
      data: { accountId, linkedFrom: new Date(`${from}T00:00:00Z`) },
    });
    await tx.auditEvent.create({
      data: {
        budgetId,
        actorId: userId,
        action: "FINANCE_COMMAND",
        entityId: providerAccountId,
        details: { type: "account.link", accountId, from },
      },
    });
    return { providerAccountId, accountId, from };
  });
  // Like YNAB, a newly linked account starts from the bank's own balance.
  const link = await getDb().providerAccount.findFirst({
    where: { id: providerAccountId, budgetId },
    select: { connectionId: true },
  });
  const startingBalance = link
    ? await fillStartingBalances(
        userId,
        budgetId,
        link.connectionId,
        providerAccountId,
      )
    : 0;
  return { ...linked, startingBalance: startingBalance > 0 };
}

/**
 * Move a MyNAB account from one connection to another, such as from Plaid to
 * SimpleFIN, keeping everything already imported. The old link is released (as
 * Unlink does) and the new one reads from a little before the last posted row
 * the old one imported, so the overlap is re-read; while matching, what the
 * old link imported counts as the owner's own entries, so the overlap matches
 * instead of duplicating. Refused while the old link still has imports waiting
 * for approval or bank changes to review: those rows must not be orphaned.
 */
export async function relinkAccount(
  userId: string,
  budgetId: string,
  providerAccountId: string,
  accountId: string,
) {
  for (const id of [budgetId, providerAccountId, accountId])
    if (!uuid.safeParse(id).success) fail("Invalid identifier.");
  return financialWrite(userId, budgetId, async (tx) => {
    const budget = await authorize(tx, userId, budgetId);
    const target = await tx.providerAccount.findFirst({
      where: { id: providerAccountId, budgetId },
    });
    if (!target) fail("Provider account unavailable.");
    if (target.accountId) fail("This bank account is already linked.");
    const connection = await tx.providerConnection.findUniqueOrThrow({
      where: { id: target.connectionId },
    });
    if (connection.status === "DISCONNECTED")
      fail("Reconnect this institution first.");
    const old = await tx.providerAccount.findFirst({
      where: { budgetId, accountId },
    });
    if (!old)
      fail("That account is not linked to a bank yet. Link it instead.");
    if (old.connectionId === target.connectionId)
      fail("That account is already linked through this connection.");
    const waiting = await tx.ingestedEntry.count({
      where: {
        providerAccountId: old.id,
        removed: false,
        OR: [
          { approved: false, status: "POSTED", review: { equals: Prisma.DbNull } },
          { review: { not: Prisma.DbNull } },
        ],
      },
    });
    if (waiting)
      fail(
        `Approve or resolve the ${waiting} imported ${waiting === 1 ? "transaction" : "transactions"} waiting for this account first.`,
      );
    const last = await tx.ingestedEntry.findFirst({
      where: { providerAccountId: old.id, status: "POSTED", removed: false },
      orderBy: { date: "desc" },
    });
    const base = last?.date ?? old.linkedFrom ?? new Date(`${today(budget.timezone)}T00:00:00Z`);
    const from = new Date(base);
    from.setUTCDate(from.getUTCDate() - MATCH_DAYS);
    const floor = old.linkedFrom;
    const linkedFrom = floor && floor > from ? floor : from;
    // The old link goes first: an account has one live link at a time.
    await tx.providerAccount.update({
      where: { id: old.id },
      data: { accountId: null, linkedFrom: null },
    });
    await tx.providerAccount.update({
      where: { id: target.id },
      data: { accountId, linkedFrom, replacesAccountId: old.id },
    });
    await tx.providerConnection.update({
      where: { id: target.connectionId },
      data: { cursor: null, syncToken: null, syncingSince: null },
    });
    const remaining = await tx.providerAccount.count({
      where: { connectionId: old.connectionId, accountId: { not: null } },
    });
    // A retired Plaid connection with nothing left to hold is closed for good;
    // its imported history stays in the ledger.
    if (remaining === 0)
      await tx.providerConnection.updateMany({
        where: { id: old.connectionId, provider: "PLAID" },
        data: { status: "DISCONNECTED", syncToken: null, syncingSince: null },
      });
    const from10 = linkedFrom.toISOString().slice(0, 10);
    await audit(tx, userId, budgetId, target.connectionId, {
      type: "account.relink",
      accountId,
      from: from10,
    });
    return {
      providerAccountId: target.id,
      accountId,
      from: from10,
      // The old connection syncs nothing now; the owner can disconnect it.
      oldConnectionIdle: remaining === 0 ? old.connectionId : null,
    };
  });
}

/**
 * Three stages, because a provider call must never happen inside a financial
 * transaction. Claim the connection and read the cursor; call the provider with
 * nothing held; then commit the ledger changes and the next cursor together. An
 * interrupted sync leaves the stored cursor untouched and simply runs again.
 */
/**
 * Sync, then give any linked account that still has no starting balance the
 * bank's own, as YNAB does when an account is linked.
 */
export async function syncConnection(
  userId: string,
  budgetId: string,
  connectionId: string,
) {
  const result = await syncOnce(userId, budgetId, connectionId);
  const startingBalances = await fillStartingBalances(
    userId,
    budgetId,
    connectionId,
  );
  return { ...result, startingBalances };
}

async function syncOnce(
  userId: string,
  budgetId: string,
  connectionId: string,
) {
  for (const id of [budgetId, connectionId])
    if (!uuid.safeParse(id).success) fail("Invalid identifier.");
  const key = getConfig().SECRET_ENCRYPTION_KEY;

  const syncToken = randomUUID();
  const claim = await financialWrite(userId, budgetId, async (tx) => {
    const connection = await tx.providerConnection.findFirst({
      where: { id: connectionId, budgetId },
    });
    if (!connection || connection.status === "DISCONNECTED")
      fail("This connection was removed or is unavailable.");
    if (connection.provider === "PLAID")
      fail(
        "Plaid is retired and this connection no longer syncs. Move its accounts to SimpleFIN.",
      );
    if (!isBank(connection.provider))
      fail("File imports are not synced; import a new file instead.");
    if (
      connection.syncingSince &&
      Date.now() - connection.syncingSince.getTime() < SYNC_LOCK_MS
    )
      fail("A sync is already running for this connection.");
    const token = decryptSecret(
      connection.accessToken,
      key,
      tokenContext(connectionId),
    );
    await tx.providerConnection.update({
      where: { id: connectionId },
      data: { syncToken, syncingSince: new Date() },
    });
    // What a provider without a cursor needs to produce a delta.
    const links = await tx.providerAccount.findMany({
      where: { connectionId, accountId: { not: null } },
      select: { id: true, externalAccountId: true, linkedFrom: true },
    });
    const pending = await tx.ingestedEntry.findMany({
      where: { connectionId, status: "PENDING", removed: false },
      select: {
        externalId: true,
        providerAccountId: true,
        amount: true,
        date: true,
      },
    });
    // Recent posted rows, so one re-issued under a new ID is recognised.
    const recentFrom = new Date();
    recentFrom.setUTCDate(recentFrom.getUTCDate() - RECENT_POSTED_DAYS);
    const posted = await tx.ingestedEntry.findMany({
      where: {
        connectionId,
        status: "POSTED",
        removed: false,
        date: { gte: recentFrom },
      },
      select: {
        externalId: true,
        providerAccountId: true,
        amount: true,
        date: true,
      },
    });
    const budget = await tx.budget.findUniqueOrThrow({
      where: { id: budgetId },
      select: { timezone: true },
    });
    const visible = (rows: typeof pending) =>
      rows.flatMap((p) => {
        const link = links.find((l) => l.id === p.providerAccountId);
        return link
          ? [
              {
                externalId: p.externalId,
                externalAccountId: link.externalAccountId,
                amount: p.amount,
                date: p.date.toISOString().slice(0, 10),
              },
            ]
          : [];
      });
    const context: SyncContext = {
      today: today(budget.timezone),
      timezone: budget.timezone,
      accounts: links.map((l) => ({
        externalAccountId: l.externalAccountId,
        linkedFrom: (l.linkedFrom ?? new Date()).toISOString().slice(0, 10),
      })),
      pending: visible(pending),
      posted: visible(posted),
    };
    return {
      cursor: connection.cursor,
      token,
      provider: connection.provider,
      context,
    };
  });
  try {
    const batch = await providerFor(claim.provider).sync(
      claim.token,
      claim.cursor,
      claim.context,
    );
    return await financialWrite(userId, budgetId, async (tx) => {
      const connection = await tx.providerConnection.findFirst({
        where: {
          id: connectionId,
          budgetId,
          syncToken,
          status: { not: "DISCONNECTED" },
        },
      });
      if (!connection || connection.cursor !== claim.cursor)
        fail("This sync was superseded. Retry from the current position.");
      const { created, corrected, reviewed, matched, proposals } =
        await commitEntries(tx, budgetId, connectionId, batch);
      // Accounts added at the provider since linking appear, unlinked, for
      // the owner to link; nothing is imported for them until then.
      const newAccounts = batch.accounts?.length
        ? (
            await tx.providerAccount.createMany({
              data: batch.accounts.map((a) => ({
                budgetId,
                connectionId,
                externalAccountId: a.externalAccountId,
                name: a.name,
                mask: a.mask,
                type: a.type,
              })),
              skipDuplicates: true,
            })
          ).count
        : 0;
      await tx.providerConnection.update({
        where: { id: connectionId },
        data: {
          cursor: batch.cursor,
          syncToken: null,
          syncingSince: null,
          status: "ACTIVE",
          errorCode: null,
          // A bank inside an aggregator can need attention while the rest syncs.
          warning: batch.warnings?.length
            ? batch.warnings.join(" · ").slice(0, 400)
            : null,
          lastSyncedAt: new Date(),
        },
      });
      await audit(tx, userId, budgetId, connectionId, {
        type: "connection.sync",
        created,
        corrected,
        reviewed,
      });
      // What the provider sent this time, so a bank that never reports pending
      // charges is visible as such rather than looking like a broken sync.
      const pendingSeen = batch.entries.filter((e) => e.status === "PENDING").length;
      return { created, corrected, reviewed, matched, proposals, newAccounts, pendingSeen };
    });
  } catch (error) {
    const code = error instanceof ProviderError ? error.code : "UNAVAILABLE";
    // A stale request must never release another request's lease or resurrect a disconnect.
    await getDb()
      .providerConnection.updateMany({
        where: { id: connectionId, budgetId, syncToken },
        data: {
          syncToken: null,
          syncingSince: null,
          errorCode: code,
          status: "ERROR",
        },
      })
      .catch(() => undefined);
    if (error instanceof ProviderError)
      fail(
        code === "REAUTH_REQUIRED"
          ? "This connection needs to be signed in again."
          : "The institution could not be reached. Try again later.",
      );
    throw error;
  }
}

/** Chooses the category a new import arrives in; null means Uncategorized. */
async function importCategorizer(tx: Tx, budgetId: string) {
  const spendable = new Set(
    (
      await tx.category.findMany({
        where: {
          budgetId,
          archived: false,
          system: false,
          paymentAccountId: null,
        },
        select: { id: true },
      })
    ).map((c) => c.id),
  );
  const rules = ruleDefinitions(
    await tx.automationRule.findMany({
      where: { budgetId, enabled: true },
      orderBy: [{ priority: "asc" }, { id: "asc" }],
    }),
  );
  const history = await filingHistory(tx, budgetId, spendable);
  return async (entry: NormalizedEntry, accountId: string) => {
    if (entry.amount >= 0n) return null;
    const ruled = rules.length
      ? previewRules(
          {
            accountId,
            amount: entry.amount,
            description: "",
            payee: entry.payee,
            memo: "",
            tags: [],
            locked: [],
          },
          rules,
        ).output.categoryId
      : undefined;
    if (ruled && spendable.has(ruled)) return ruled;
    const remembered = suggestCategory(history, entry.payee)?.categoryId;
    return remembered && spendable.has(remembered) ? remembered : null;
  };
}

/**
 * YNAB-style automatic matching (YNAB_ALIGNMENT A2): an import with exactly
 * one transaction the owner entered themselves (same account, same amount,
 * within ten days, not already matched, not declined) becomes that
 * transaction instead of a duplicate. Several candidates: the nearest date,
 * then the earliest entered, so identical entries pair one-for-one. A pending
 * import matches too, as in YNAB; the owner's entry then clears when it posts.
 */
const MATCH_DAYS = 10;
/** Imports this far apart came from different syncs, not one batch. */
const SEPARATE_SYNC_MS = 10 * 60_000;
/** Posted rows old enough to be outside every re-read window are not sent. */
const RECENT_POSTED_DAYS = 45;
async function manualMatcher(
  tx: Tx,
  budgetId: string,
  connectionId: string,
  entries: NormalizedEntry[],
) {
  if (!entries.length) return () => null;
  const dates = entries.map((e) => e.date).sort();
  const from = new Date(`${dates[0]}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - MATCH_DAYS);
  const through = new Date(`${dates.at(-1)}T00:00:00Z`);
  through.setUTCDate(through.getUTCDate() + MATCH_DAYS);
  // Rows imported by a link this connection took over (a bank moved from
  // Plaid to SimpleFIN) stay matchable, so the re-read overlap matches them.
  const replaced = new Set(
    (
      await tx.providerAccount.findMany({
        where: { budgetId, connectionId, replacesAccountId: { not: null } },
        select: { replacesAccountId: true },
      })
    ).map((p) => p.replacesAccountId!),
  );
  const [candidates, imported, declined] = await Promise.all([
    tx.financialTransaction.findMany({
      where: {
        budgetId,
        voidedAt: null,
        kind: { notIn: ["OPENING", "ADJUSTMENT"] },
        date: { gte: from, lte: through },
      },
      select: {
        id: true,
        accountId: true,
        transferAccountId: true,
        amount: true,
        date: true,
        createdAt: true,
      },
    }),
    tx.ingestedEntry.findMany({
      where: { budgetId, transactionId: { not: null } },
      select: { transactionId: true, providerAccountId: true },
    }),
    tx.declinedMatch.findMany({
      where: { budgetId, connectionId },
      select: { externalId: true },
    }),
  ]);
  const taken = new Set(
    imported
      .filter((e) => !replaced.has(e.providerAccountId))
      .map((e) => e.transactionId),
  );
  const refused = new Set(declined.map((d) => d.externalId));
  return (entry: NormalizedEntry, accountId: string) => {
    if (refused.has(entry.externalId)) return null;
    const day = Date.parse(`${entry.date}T00:00:00Z`);
    const found = candidates.filter((t) => {
      if (taken.has(t.id)) return false;
      const leg =
        t.accountId === accountId
          ? t.amount
          : t.transferAccountId === accountId
            ? -t.amount
            : null;
      return (
        leg === entry.amount &&
        Math.abs(t.date.getTime() - day) <= MATCH_DAYS * 86_400_000
      );
    });
    if (!found.length) return null;
    // As YNAB: several identical entries pair one-for-one, nearest date first.
    // Same account and amount, so whichever pairs, the ledger is the same.
    const [best] = found.sort(
      (a, b) =>
        Math.abs(a.date.getTime() - day) - Math.abs(b.date.getTime() - day) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
    taken.add(best.id);
    return best.id;
  };
}

/**
 * Apply one complete, staged batch of observations to the ledger: new posted
 * rows become Uncategorized transactions awaiting approval, changes to accepted
 * history become reviews, and removals become corrections. Shared by bank sync
 * and file imports, so a file row is treated exactly like a bank row.
 */
export async function commitEntries(
  tx: Tx,
  budgetId: string,
  connectionId: string,
  batch: { entries: NormalizedEntry[]; removed: string[] },
  batchId?: string,
) {
  // As YNAB does, an import arrives categorised: an enabled rule's category
  // first, then the payee's usual category, else Uncategorized. It still
  // awaits approval, but it counts in the budget from the start.
  const categorize = await importCategorizer(tx, budgetId);
  const matchManual = await manualMatcher(
    tx,
    budgetId,
    connectionId,
    batch.entries,
  );
  const linked = await tx.providerAccount.findMany({
    where: { budgetId, connectionId, accountId: { not: null } },
  });
  const accounts = await tx.financialAccount.findMany({
    where: { budgetId, id: { in: linked.map((a) => a.accountId!) } },
  });
  const known = await tx.ingestedEntry.findMany({
    where: { budgetId, connectionId },
  });
  const byExternal = new Map(linked.map((a) => [a.externalAccountId, a]));
  const entries = batch.entries.filter((e) => {
    const link = byExternal.get(e.externalAccountId);
    if (!link) return false;
    // Existing identities still receive corrections when a bank changes their
    // date, and a posted row that settles a known pending one is its update.
    if (
      known.some(
        (k) =>
          k.externalId === e.externalId ||
          (e.pendingExternalId && k.externalId === e.pendingExternalId) ||
          (e.previousExternalId && k.externalId === e.previousExternalId),
      )
    )
      return true;
    // Before the start date is history already inside the opening balance;
    // a pending row is not settled, so it is never in that balance and is
    // kept whatever its date (the day of linking most of all).
    return (
      !link.linkedFrom ||
      e.status === "PENDING" ||
      e.date > link.linkedFrom.toISOString().slice(0, 10)
    );
  });
  const plan = planIngestion({
    entries,
    removed: batch.removed,
    known: known.map((k) => ({
      externalId: k.externalId,
      externalAccountId:
        linked.find((a) => a.id === k.providerAccountId)?.externalAccountId ??
        "",
      status: k.status as "PENDING" | "POSTED",
      date: k.date.toISOString().slice(0, 10),
      amount: k.amount,
      payee: k.payee,
      transactionId: k.transactionId,
      voided: false,
    })),
    candidates: [],
    linked: [...byExternal.keys()],
  });
  let matchedCount = 0;
  let created = 0,
    corrected = 0,
    reviewed = 0,
    reissued = 0,
    pending = 0;
  for (const decision of plan.decisions) {
    if (
      ["ignored", "unchanged", "propose-match", "propose-transfer"].includes(
        decision.kind,
      )
    )
      continue;
    if (decision.kind === "remove") {
      const old = known.find((k) => k.externalId === decision.externalId)!;
      if (old.transactionId) {
        await tx.ingestedEntry.update({
          where: { id: old.id },
          data: {
            review: { id: randomUUID(), kind: "remove" },
            approved: false,
          },
        });
        reviewed++;
      } else
        await tx.ingestedEntry.update({
          where: { id: old.id },
          data: { removed: true, review: Prisma.DbNull },
        });
      continue;
    }
    if (decision.kind === "amend-payee") {
      // The bank renamed the payee: remember its text, leave the ledger alone.
      await tx.ingestedEntry.update({
        where: {
          connectionId_externalId: {
            connectionId,
            externalId: decision.externalId,
          },
        },
        data: { payee: decision.entry.payee.slice(0, 120) },
      });
      continue;
    }
    if (decision.kind === "rekey") {
      // The bank re-issued a posted row under a new ID: the new identity takes
      // over the old one's transaction, approval and any open review.
      const old = known.find((k) => k.externalId === decision.from)!;
      const entry = decision.entry;
      await tx.ingestedEntry.update({
        where: { id: old.id },
        data: { removed: true, review: Prisma.DbNull },
      });
      const carried = {
        status: entry.status,
        date: new Date(`${entry.date}T00:00:00Z`),
        amount: entry.amount,
        payee: entry.payee.slice(0, 120),
        pendingExternalId: old.pendingExternalId,
        transactionId: old.transactionId,
        matched: old.matched,
        approved: old.approved,
        review: old.review ?? Prisma.DbNull,
        batchId: batchId ?? null,
      };
      await tx.ingestedEntry.upsert({
        where: {
          connectionId_externalId: { connectionId, externalId: entry.externalId },
        },
        create: {
          budgetId,
          connectionId,
          providerAccountId: old.providerAccountId,
          externalId: entry.externalId,
          ...carried,
        },
        update: { ...carried, removed: false },
      });
      reissued++;
      continue;
    }
    if (!("entry" in decision)) continue;
    const entry = decision.entry,
      provider = byExternal.get(entry.externalAccountId)!;
    const account = accounts.find((a) => a.id === provider.accountId)!;
    const previous = known.find(
      (k) =>
        k.externalId ===
        (decision.kind === "promote" ? decision.from : entry.externalId),
    );
    const data = {
      pendingExternalId: entry.pendingExternalId ?? null,
      status: entry.status,
      date: new Date(`${entry.date}T00:00:00Z`),
      amount: entry.amount,
      payee: entry.payee.slice(0, 120),
    };
    if (
      previous?.transactionId &&
      previous.status === "PENDING" &&
      (decision.kind === "promote" || decision.kind === "amend")
    ) {
      // The owner already has this pending row in the ledger (entered early,
      // or matched to their own entry): the bank's update lands on it
      // quietly, as YNAB consolidates the two. Anything that cannot be
      // updated quietly falls through to review.
      const merged = await mergePending(
        tx,
        budgetId,
        previous.transactionId,
        account.id,
        entry,
      );
      if (merged) {
        if (previous.externalId !== entry.externalId)
          await tx.ingestedEntry.update({
            where: { id: previous.id },
            data: { removed: true, review: Prisma.DbNull },
          });
        const carried = {
          ...data,
          transactionId: merged.transactionId,
          batchId: batchId ?? null,
          matched: previous.matched,
          approved: previous.approved,
        };
        await tx.ingestedEntry.upsert({
          where: {
            connectionId_externalId: {
              connectionId,
              externalId: entry.externalId,
            },
          },
          create: {
            budgetId,
            connectionId,
            providerAccountId: provider.id,
            externalId: entry.externalId,
            ...carried,
          },
          update: { ...carried, removed: false, review: Prisma.DbNull },
        });
        if (merged.replaced) corrected++;
        continue;
      }
    }
    if (previous?.transactionId) {
      // Bank corrections are proposals. Owner changes and statement comparisons survive sync.
      await tx.ingestedEntry.update({
        where: { id: previous.id },
        data: {
          review: {
            id: randomUUID(),
            kind: "change",
            entry: { ...entry, amount: entry.amount.toString() },
          },
          approved: false,
        },
      });
      reviewed++;
      continue;
    }
    if (account.closed)
      fail("Reopen a linked account before importing its new transactions.");
    // The owner's own entry, when exactly one fits, instead of a duplicate.
    const matched = matchManual(entry, account.id);
    // A pending match links the owner's entry now and clears it when it posts.
    if (matched && entry.status === "POSTED") {
      await tx.transactionState.updateMany({
        where: { budgetId, transactionId: matched, accountId: account.id },
        data: { cleared: true },
      });
      // A bank match also approves a worker-entered schedule occurrence.
      await tx.scheduleOccurrence.updateMany({
        where: { budgetId, transactionId: matched, status: "ENTERED" },
        data: { status: "APPROVED", matched: true },
      });
    }
    const transactionId =
      matched ??
      (await writeEntry(
        tx,
        budgetId,
        entry,
        account,
        undefined,
        await categorize(entry, account.id),
      ));
    if (previous && previous.externalId !== entry.externalId)
      await tx.ingestedEntry.update({
        where: { id: previous.id },
        data: { removed: true, review: Prisma.DbNull },
      });
    await tx.ingestedEntry.upsert({
      where: {
        connectionId_externalId: {
          connectionId,
          externalId: entry.externalId,
        },
      },
      create: {
        budgetId,
        connectionId,
        providerAccountId: provider.id,
        externalId: entry.externalId,
        ...data,
        transactionId,
        batchId: batchId ?? null,
        matched: Boolean(matched),
        // A match is the owner's own entry confirmed by the bank: approved.
        approved: Boolean(matched),
      },
      update: {
        ...data,
        transactionId,
        batchId: batchId ?? null,
        matched: Boolean(matched),
        removed: false,
        approved: Boolean(matched),
        review: Prisma.DbNull,
      },
    });
    if (matched) matchedCount++;
    else if (transactionId) created++;
    else pending++;
  }
  return {
    created,
    corrected,
    reviewed,
    matched: matchedCount,
    /** Posted rows the bank re-issued under a new ID, kept on their transaction. */
    reissued,
    /** Pending observations held outside the ledger until they post. */
    pending,
    proposals: plan.proposals,
  };
}

/** Same budget serialization boundary as manual commands, with bounded conflict retry. */
export async function financialWrite<T>(
  userId: string,
  budgetId: string,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getDb().$transaction(
        async (tx) => {
          await authorize(tx, userId, budgetId);
          await tx.$queryRaw`SELECT id FROM "Budget" WHERE id=${budgetId}::uuid FOR UPDATE`;
          return work(tx);
        },
        { isolationLevel: "Serializable", timeout: 20000 },
      );
    } catch (error) {
      if (isRetryableConflict(error) && attempt < 3) continue;
      throw error;
    }
  }
}
export async function audit(
  tx: Tx,
  userId: string,
  budgetId: string,
  id: string,
  details: Prisma.InputJsonObject,
) {
  await tx.budget.update({
    where: { id: budgetId },
    data: { financeRevision: { increment: 1 } },
  });
  await tx.auditEvent.create({
    data: {
      budgetId,
      actorId: userId,
      entityId: id,
      action: "FINANCE_COMMAND",
      details,
    },
  });
}

/**
 * A pending row the owner already put in the ledger (entered early, or
 * matched to their own entry) meets its bank update. Same amount: the ledger
 * row simply clears when it posts. A different amount (a tip added): the
 * bank's amount is taken and the owner's category, memo and flag kept, as a
 * match with a different amount does. Null when it cannot be done quietly
 * (reconciled, a transfer, or the money changed direction), so the change
 * goes to review instead.
 */
async function mergePending(
  tx: Tx,
  budgetId: string,
  transactionId: string,
  accountId: string,
  entry: NormalizedEntry,
): Promise<{ transactionId: string; replaced: boolean } | null> {
  const current = await tx.financialTransaction.findFirst({
    where: { id: transactionId, budgetId },
  });
  if (!current || current.voidedAt) return null;
  const state = await tx.transactionState.findFirst({
    where: { budgetId, transactionId, accountId },
  });
  if (state?.reconciliationId) return null;
  const leg =
    current.accountId === accountId
      ? current.amount
      : current.transferAccountId === accountId
        ? -current.amount
        : null;
  if (leg === null) return null;
  let id = transactionId;
  let replaced = false;
  if (leg !== entry.amount) {
    if (current.transferAccountId || leg < 0n !== entry.amount < 0n)
      return null;
    id = await withBankAmount(
      tx,
      budgetId,
      current,
      entry.amount,
      false,
      entry.status === "POSTED",
    );
    replaced = true;
  } else if (entry.status === "POSTED")
    await tx.transactionState.updateMany({
      where: { budgetId, transactionId, accountId },
      data: { cleared: true },
    });
  // A bank match also approves a worker-entered schedule occurrence.
  if (entry.status === "POSTED")
    await tx.scheduleOccurrence.updateMany({
      where: {
        budgetId,
        transactionId: { in: [transactionId, id] },
        status: "ENTERED",
      },
      data: { status: "APPROVED", matched: true },
    });
  return { transactionId: id, replaced };
}

/**
 * Pending observations held outside the ledger, for the registers' "Pending
 * at the bank" section (YNAB's pending section): what the bank has seen but
 * not settled, counting in nothing until it posts or the owner enters it.
 */
/**
 * Imports waiting for the owner's approval (YNAB's unapproved transactions):
 * posted, in the ledger, not yet approved and not waiting on a bank change.
 * The registers mark them and approve them in place.
 */
export async function unapprovedImports(userId: string, budgetId: string) {
  return getDb().$transaction(
    async (tx) => {
      await authorize(tx, userId, budgetId);
      const entries = await tx.ingestedEntry.findMany({
        where: {
          budgetId,
          approved: false,
          removed: false,
          status: "POSTED",
          transactionId: { not: null },
          review: { equals: Prisma.DbNull },
        },
        select: { id: true, transactionId: true, providerAccountId: true },
      });
      if (!entries.length) return [];
      const links = await tx.providerAccount.findMany({
        where: { budgetId, id: { in: [...new Set(entries.map((e) => e.providerAccountId))] } },
        select: { id: true, accountId: true },
      });
      return entries.flatMap((e) => {
        const accountId = links.find((l) => l.id === e.providerAccountId)?.accountId;
        return accountId
          ? [{ entryId: e.id, transactionId: e.transactionId!, accountId }]
          : [];
      });
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
}

export async function pendingEntries(userId: string, budgetId: string) {
  return getDb().$transaction(
    async (tx) => {
      await authorize(tx, userId, budgetId);
      const entries = await tx.ingestedEntry.findMany({
        where: {
          budgetId,
          status: "PENDING",
          removed: false,
          transactionId: null,
          review: { equals: Prisma.DbNull },
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take: 200,
      });
      if (!entries.length) return [];
      const links = await tx.providerAccount.findMany({
        where: {
          budgetId,
          id: { in: [...new Set(entries.map((e) => e.providerAccountId))] },
        },
      });
      const categorize = await importCategorizer(tx, budgetId);
      const rows = [];
      for (const e of entries) {
        const link = links.find((l) => l.id === e.providerAccountId);
        if (!link?.accountId) continue;
        rows.push({
          id: e.id,
          accountId: link.accountId,
          date: e.date.toISOString().slice(0, 10),
          amount: e.amount,
          payee: e.payee,
          suggestedCategoryId: await categorize(
            {
              externalId: e.externalId,
              status: "PENDING",
              externalAccountId: link.externalAccountId,
              date: e.date.toISOString().slice(0, 10),
              amount: e.amount,
              payee: e.payee,
            },
            link.accountId,
          ),
        });
      }
      return rows;
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
}

/**
 * YNAB's "Enter now": a pending observation goes into the register as an
 * uncleared transaction that counts in the budget, approved because the
 * owner chose it. When the bank posts it, the row clears in place.
 */
export async function enterPending(
  userId: string,
  budgetId: string,
  entryId: string,
  categoryId: string | null,
) {
  for (const id of [budgetId, entryId])
    if (!uuid.safeParse(id).success) fail("Invalid identifier.");
  return financialWrite(userId, budgetId, async (tx) => {
    const entry = await tx.ingestedEntry.findFirst({
      where: { id: entryId, budgetId },
    });
    if (
      !entry ||
      entry.removed ||
      entry.status !== "PENDING" ||
      entry.transactionId ||
      entry.review
    )
      fail("This pending transaction can no longer be entered.");
    const link = await tx.providerAccount.findFirstOrThrow({
      where: { id: entry.providerAccountId, budgetId },
    });
    if (!link.accountId) fail("Link this bank account first.");
    const account = await tx.financialAccount.findFirstOrThrow({
      where: { id: link.accountId, budgetId },
    });
    if (account.closed) fail("Reopen this account first.");
    const normalized: NormalizedEntry = {
      externalId: entry.externalId,
      pendingExternalId: entry.pendingExternalId ?? undefined,
      status: "PENDING",
      externalAccountId: link.externalAccountId,
      date: entry.date.toISOString().slice(0, 10),
      amount: entry.amount,
      payee: entry.payee,
    };
    let chosen: string | null = null;
    if (categoryId && entry.amount < 0n && account.participation === "BUDGET") {
      if (!uuid.safeParse(categoryId).success) fail("Invalid category.");
      const category = await tx.category.findFirst({
        where: { id: categoryId, budgetId, archived: false },
      });
      if (!category) fail("Category unavailable.");
      if (category.paymentAccountId)
        fail("Use a transfer to pay a card, not a payment category.");
      chosen = category.id;
    }
    const transactionId = await writeEntry(
      tx,
      budgetId,
      normalized,
      account,
      undefined,
      chosen ?? (await (await importCategorizer(tx, budgetId))(normalized, account.id)),
      true,
    );
    await tx.ingestedEntry.update({
      where: { id: entry.id },
      data: { transactionId, approved: true, matched: false },
    });
    await audit(tx, userId, budgetId, entry.id, {
      type: "entry.enter",
      categoryId: chosen,
    });
    return { entryId: entry.id, transactionId };
  });
}

/** Approving is what gives an imported entry a real category. */
export async function approveEntry(
  userId: string,
  budgetId: string,
  entryId: string,
  categoryId: string | null,
  acknowledgeReconciled = false,
) {
  for (const id of [budgetId, entryId])
    if (!uuid.safeParse(id).success) fail("Invalid identifier.");
  return financialWrite(userId, budgetId, async (tx) => {
    await authorize(tx, userId, budgetId);
    const entry = await tx.ingestedEntry.findFirst({
      where: { id: entryId, budgetId },
    });
    if (!entry || entry.removed) fail("Imported entry unavailable.");
    if (entry.status !== "POSTED" || !entry.transactionId || entry.review)
      fail("Resolve the bank change or wait for posting before approving.");
    if (entry.approved) return { entryId };
    // Approving with the category it already has is only an approval.
    const current = await tx.financialSplit.findMany({
      where: { budgetId, transactionId: entry.transactionId },
    });
    if (
      categoryId &&
      current.length === 1 &&
      current[0].categoryId === categoryId
    )
      categoryId = null;
    if (categoryId) {
      if (!uuid.safeParse(categoryId).success) fail("Invalid category.");
      const category = await tx.category.findFirst({
        where: { id: categoryId, budgetId, archived: false },
      });
      if (!category) fail("Category unavailable.");
      if (category.paymentAccountId)
        fail("Use a transfer to pay a card, not a payment category.");
      const splits = await tx.financialSplit.findMany({
        where: { budgetId, transactionId: entry.transactionId },
      });
      if (!splits.length)
        fail("This entry has no category to change; correct it instead.");
      // Splits are immutable, so recategorising replaces the transaction.
      const previous = await voidTransaction(
        tx,
        budgetId,
        entry.transactionId,
        "Recategorised on approval",
        acknowledgeReconciled,
      );
      const journalId = await journal(
        tx,
        budgetId,
        previous.date.toISOString().slice(0, 10),
        previous.accountId,
        previous.amount,
        previous.kind,
      );
      const replacement = await tx.financialTransaction.create({
        data: {
          budgetId,
          journalId,
          accountId: previous.accountId,
          kind: previous.kind,
          date: previous.date,
          amount: previous.amount,
          payee: previous.payee,
          memo: previous.memo,
          replacesId: previous.id,
        },
      });
      await tx.financialSplit.create({
        data: {
          budgetId,
          transactionId: replacement.id,
          categoryId,
          amount: previous.amount,
          position: 0,
        },
      });
      await tx.transactionState.create({
        data: {
          budgetId,
          transactionId: replacement.id,
          accountId: previous.accountId,
          cleared: entry.status === "POSTED",
        },
      });
      await tx.ingestedEntry.update({
        where: { id: entryId },
        data: { transactionId: replacement.id, approved: true },
      });
    } else {
      await tx.ingestedEntry.update({
        where: { id: entryId },
        data: { approved: true },
      });
    }
    await tx.budget.update({
      where: { id: budgetId },
      data: { financeRevision: { increment: 1 } },
    });
    await tx.auditEvent.create({
      data: {
        budgetId,
        actorId: userId,
        action: "FINANCE_COMMAND",
        entityId: entryId,
        details: { type: "entry.approve", categoryId },
      },
    });
    return { entryId };
  });
}

/**
 * Approve several imports at once with the categories they already have, as
 * YNAB's bulk approve does. Entries under bank review or still pending are
 * skipped and reported, never approved blindly.
 */
export async function approveEntries(
  userId: string,
  budgetId: string,
  entryIds: string[],
) {
  if (!uuid.safeParse(budgetId).success) fail("Invalid budget.");
  if (!entryIds.length || entryIds.length > 500)
    fail("Choose between 1 and 500 transactions.");
  for (const id of entryIds)
    if (!uuid.safeParse(id).success) fail("Invalid identifier.");
  return financialWrite(userId, budgetId, async (tx) => {
    const { count } = await tx.ingestedEntry.updateMany({
      where: {
        budgetId,
        id: { in: entryIds },
        removed: false,
        approved: false,
        status: "POSTED",
        transactionId: { not: null },
        review: { equals: Prisma.DbNull },
      },
      data: { approved: true },
    });
    if (count) {
      await tx.budget.update({
        where: { id: budgetId },
        data: { financeRevision: { increment: 1 } },
      });
      await audit(tx, userId, budgetId, budgetId, {
        type: "entry.approve.bulk",
        approved: count,
      });
    }
    return { approved: count, skipped: entryIds.length - count };
  });
}

export async function disconnect(
  userId: string,
  budgetId: string,
  connectionId: string,
) {
  for (const id of [budgetId, connectionId])
    if (!uuid.safeParse(id).success) fail("Invalid identifier.");
  const key = getConfig().SECRET_ENCRYPTION_KEY;
  const connection = await financialWrite(userId, budgetId, async (tx) => {
    await authorize(tx, userId, budgetId);
    const found = await tx.providerConnection.findFirst({
      where: { id: connectionId, budgetId },
    });
    if (!found || !LISTED_PROVIDERS.includes(found.provider))
      fail("Connection unavailable.");
    await tx.providerConnection.update({
      where: { id: connectionId },
      data: { status: "DISCONNECTED", syncToken: null, syncingSince: null },
    });
    return found;
  });
  // Best effort: the institution may already have revoked it. Local state is
  // cleared regardless, so a failed revoke cannot strand the connection. A
  // legacy Plaid connection has no provider left to tell.
  if (isBank(connection.provider))
    await providerFor(connection.provider)
      .disconnect(
        decryptSecret(connection.accessToken, key, tokenContext(connectionId)),
      )
      .catch(() => undefined);
  return getDb().$transaction(
    async (tx) => {
      await authorize(tx, userId, budgetId);
      await tx.providerConnection.update({
        where: { id: connectionId },
        data: {
          status: "DISCONNECTED",
          syncToken: null,
          // Imported history stays; only the ability to reach the bank is removed.
          accessToken: encryptSecret("", key, tokenContext(connectionId)),
          cursor: null,
          syncingSince: null,
        },
      });
      await tx.auditEvent.create({
        data: {
          budgetId,
          actorId: userId,
          action: "FINANCE_COMMAND",
          entityId: connectionId,
          details: { type: "connection.disconnect" },
        },
      });
      return { connectionId };
    },
    { isolationLevel: "Serializable", timeout: 20000 },
  );
}

/**
 * SimpleFIN's repair: the owner fixes the bank on SimpleFIN Bridge and pastes
 * a new setup token. It is claimed, must still reach every linked account,
 * and replaces the stored access; links and history are untouched.
 */
export async function replaceSimpleFinToken(
  userId: string,
  budgetId: string,
  connectionId: string,
  token: string,
) {
  for (const id of [budgetId, connectionId])
    if (!uuid.safeParse(id).success) fail("Invalid identifier.");
  const pasted = setupToken(token);
  const links = await getDb().$transaction(async (tx) => {
    await authorize(tx, userId, budgetId);
    const found = await tx.providerConnection.findFirst({
      where: { id: connectionId, budgetId, provider: "SIMPLEFIN" },
    });
    if (!found || found.status === "DISCONNECTED")
      fail("This connection was removed or is unavailable.");
    return tx.providerAccount.findMany({
      where: { connectionId, accountId: { not: null } },
      select: { externalAccountId: true, name: true },
    });
  });
  // Provider calls happen with nothing held.
  const provider = providerFor("SIMPLEFIN");
  const connected = await provider.exchange({ setupToken: pasted });
  const reachable = new Set(
    (await provider.listAccounts(connected.accessToken)).map(
      (a) => a.externalAccountId,
    ),
  );
  const missing = links.filter((l) => !reachable.has(l.externalAccountId));
  if (missing.length)
    fail(
      `That token does not reach ${missing.map((m) => m.name).join(", ")}. Create it from the same SimpleFIN account.`,
    );
  const key = getConfig().SECRET_ENCRYPTION_KEY;
  await getDb().$transaction(
    async (tx) => {
      await authorize(tx, userId, budgetId);
      await tx.providerConnection.update({
        where: { id: connectionId },
        data: {
          accessToken: encryptSecret(
            connected.accessToken,
            key,
            tokenContext(connectionId),
          ),
          status: "ACTIVE",
          errorCode: null,
          warning: null,
        },
      });
      await audit(tx, userId, budgetId, connectionId, {
        type: "connection.reauth",
      });
    },
    { isolationLevel: "Serializable", timeout: 20000 },
  );
  const { enqueue } = await import("./jobs");
  await enqueue({
    kind: "provider.sync",
    dedupeKey: `provider.sync:${connectionId}`,
    budgetId,
    subjectId: connectionId,
  });
  return { connectionId };
}

/** Everything the connections page renders, in one authorized read. */
export async function getConnections(userId: string, budgetId: string) {
  return getDb().$transaction(
    async (tx) => {
      await authorize(tx, userId, budgetId);
      const [connections, providerAccounts, accounts, entries, categories] =
        await Promise.all([
          // File imports share the review queue below but are not bank
          // connections: nothing to sync, re-sign or disconnect.
          tx.providerConnection.findMany({
            where: { budgetId, provider: { in: [...LISTED_PROVIDERS] } },
            orderBy: { createdAt: "asc" },
          }),
          tx.providerAccount.findMany({
            where: { budgetId },
            orderBy: { name: "asc" },
          }),
          tx.financialAccount.findMany({
            where: { budgetId, closed: false },
            orderBy: { name: "asc" },
          }),
          tx.ingestedEntry.findMany({
            where: {
              budgetId,
              removed: false,
              OR: [{ approved: false }, { review: { not: Prisma.DbNull } }],
            },
            orderBy: [{ date: "desc" }, { id: "desc" }],
            take: 200,
          }),
          tx.category.findMany({
            where: { budgetId, archived: false },
            orderBy: { name: "asc" },
          }),
        ]);
      const proposals = await suggestions(tx, budgetId);
      // Payee memory is drawn from the owner's own past filings, so an imported
      // transaction arrives with the category they chose last time rather than
      // with a blank field. It is a default only; approval is still explicit.
      const spendable = new Set(
        categories
          .filter((c) => !c.paymentAccountId && !c.system)
          .map((c) => c.id),
      );
      const history = await filingHistory(tx, budgetId, spendable);
      // Enabled rules outrank payee memory: they are the owner's explicit
      // instructions. Only the category is pre-filled; the rest is reviewed on
      // the Rules page, and approval stays explicit either way.
      const rules = ruleDefinitions(
        await tx.automationRule.findMany({
          where: { budgetId, enabled: true },
          orderBy: [{ priority: "asc" }, { id: "asc" }],
        }),
      );
      const linkedIds = entries.flatMap((e) =>
        e.transactionId && !e.approved ? [e.transactionId] : [],
      );
      const [linked, preferences] =
        rules.length && linkedIds.length
          ? await Promise.all([
              tx.financialTransaction.findMany({
                where: { budgetId, id: { in: linkedIds }, voidedAt: null },
              }),
              tx.transactionPreference.findMany({
                where: { budgetId, transactionId: { in: linkedIds } },
              }),
            ])
          : [[], []];
      const ruleProposal = (transactionId: string | null) => {
        const t = linked.find((x) => x.id === transactionId);
        if (!t) return null;
        const preference = preferences.find((p) => p.transactionId === t.id);
        const { output, explanation } = previewRules(
          {
            accountId: t.accountId,
            amount: t.amount,
            description: t.memo,
            payee: t.payee,
            memo: t.memo,
            tags: preference?.tags ?? [],
            locked: (preference?.locked ?? []) as RuleField[],
          },
          rules,
        );
        const categoryRule = explanation.find((e) =>
          e.applied.includes("categoryId"),
        );
        return {
          transactionId: t.id,
          categoryId:
            output.categoryId && spendable.has(output.categoryId)
              ? output.categoryId
              : null,
          categoryRule: categoryRule?.name ?? null,
          otherChanges: explanation.some((e) =>
            e.applied.some((f) => f !== "categoryId"),
          ),
        };
      };
      const currentSplits = await tx.financialSplit.findMany({
        where: {
          budgetId,
          transactionId: {
            in: entries.flatMap((e) =>
              e.transactionId && !e.approved ? [e.transactionId] : [],
            ),
          },
        },
        select: { transactionId: true, categoryId: true },
      });
      return {
        proposals,
        connections: connections.map((c) => ({
          // The encrypted token never leaves the application layer.
          id: c.id,
          provider: c.provider,
          warning: c.warning,
          institutionName: c.institutionName,
          status: c.status,
          errorCode: c.errorCode,
          lastSyncedAt: c.lastSyncedAt,
        })),
        providerAccounts,
        accounts,
        categories,
        entries: entries.map((e) => {
          const suggested = suggestCategory(history, e.payee);
          // What the import is actually filed under now (YNAB_ALIGNMENT A1).
          const own = currentSplits.filter(
            (sp) => sp.transactionId === e.transactionId,
          );
          const currentCategoryId =
            own.length === 1 && spendable.has(own[0].categoryId)
              ? own[0].categoryId
              : null;
          const rule =
            e.amount < 0n && !e.approved ? ruleProposal(e.transactionId) : null;
          const ruleCategory = rule?.categoryId ? rule : null;
          return {
            ...e,
            accountId:
              providerAccounts.find((p) => p.id === e.providerAccountId)
                ?.accountId ?? "",
            // Only offered for outflows: an inflow has no category to guess.
            currentCategoryId,
            suggestedCategoryId:
              currentCategoryId ??
              ruleCategory?.categoryId ??
              (e.amount < 0n && suggested ? suggested.categoryId : null),
            suggestionSupport: ruleCategory ? 0 : (suggested?.support ?? 0),
            suggestionRule: ruleCategory?.categoryRule ?? null,
            // Rules that would also rename, annotate or tag are reviewed in full.
            ruleReviewId: rule?.otherChanges ? rule.transactionId : null,
          };
        }),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
}

const changeReview = z.object({
  id: z.string().uuid(),
  kind: z.enum(["change", "remove", "legacy-pending"]),
  entry: z
    .object({
      externalId: z.string(),
      pendingExternalId: z.string().nullable().optional(),
      externalAccountId: z.string(),
      status: z.enum(["PENDING", "POSTED"]),
      date: z.string(),
      amount: z.string(),
      payee: z.string(),
    })
    .optional(),
});
export function readReview(value: unknown) {
  const parsed = changeReview.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Resolve a persisted bank change, rather than silently rewriting accepted history. */
export async function resolveBankChange(
  userId: string,
  budgetId: string,
  entryId: string,
  reviewId: string,
  apply: boolean,
  acknowledgeReconciled = false,
) {
  return financialWrite(userId, budgetId, async (tx) => {
    const old = await tx.ingestedEntry.findFirst({
      where: { id: entryId, budgetId },
    });
    if (!old) fail("Imported entry unavailable.");
    const review = readReview(old.review);
    if (!review) return { entryId };
    if (review.id !== reviewId)
      fail("The bank change has changed. Refresh before reviewing.");
    if (review.kind === "legacy-pending" && !apply)
      fail("Remove the legacy pending ledger effect before continuing.");
    const previous = old.transactionId
      ? await tx.financialTransaction.findUnique({
          where: { id: old.transactionId },
        })
      : null;
    if (apply && previous?.transferAccountId)
      fail(
        "This is a matched transfer. Correct both account legs in the register, then keep that corrected entry here.",
      );
    let transactionId = old.transactionId;
    if (apply && previous && !previous.voidedAt) {
      await voidTransaction(
        tx,
        budgetId,
        previous.id,
        "Accepted bank correction",
        acknowledgeReconciled,
      );
      transactionId = null;
    }
    if (review.kind === "change" && review.entry) {
      const entry = { ...review.entry, amount: BigInt(review.entry.amount) };
      if (!apply && entry.status === "PENDING" && transactionId)
        fail(
          "A pending observation cannot retain a posted ledger link. Apply the correction or review it after posting.",
        );
      const link = await tx.providerAccount.findFirstOrThrow({
        where: { id: old.providerAccountId, budgetId },
      });
      if (entry.externalAccountId !== link.externalAccountId)
        fail("Bank change refers to a different account.");
      if (apply) {
        const account = await tx.financialAccount.findFirstOrThrow({
          where: { id: link.accountId!, budgetId },
        });
        if (account.closed) fail("Reopen this account first.");
        transactionId = await writeEntry(
          tx,
          budgetId,
          entry,
          account,
          previous?.id,
        );
        // Lineage is part of insertion, never an update to the immutable payload.
      }
      const data = {
        status: entry.status,
        date: new Date(`${entry.date}T00:00:00Z`),
        amount: entry.amount,
        payee: entry.payee,
        pendingExternalId: entry.pendingExternalId ?? null,
        transactionId,
        review: Prisma.DbNull,
        approved: !apply,
        removed: false,
      };
      if (old.externalId === entry.externalId)
        await tx.ingestedEntry.update({ where: { id: old.id }, data });
      else {
        await tx.ingestedEntry.update({
          where: { id: old.id },
          data: { removed: true, review: Prisma.DbNull },
        });
        await tx.ingestedEntry.create({
          data: {
            budgetId,
            connectionId: old.connectionId,
            providerAccountId: old.providerAccountId,
            externalId: entry.externalId,
            ...data,
          },
        });
      }
    } else
      await tx.ingestedEntry.update({
        where: { id: entryId },
        data: {
          transactionId,
          removed: review.kind === "remove",
          review: Prisma.DbNull,
          approved: !apply,
        },
      });
    await audit(tx, userId, budgetId, entryId, {
      type: "entry.resolve",
      reviewId,
      apply,
      acknowledgeReconciled,
    });
    return { entryId };
  });
}

/** Proposals never suppress ingestion. Both actuals remain visible until explicitly joined. */
async function suggestions(tx: Tx, budgetId: string) {
  const entries = await tx.ingestedEntry.findMany({
    where: {
      budgetId,
      removed: false,
      status: "POSTED",
      transactionId: { not: null },
      review: { equals: Prisma.DbNull },
    },
  });
  const transactions = await tx.financialTransaction.findMany({
    where: { budgetId, voidedAt: null, kind: { not: "OPENING" } },
  });
  const links = await tx.providerAccount.findMany({ where: { budgetId } });
  const declined = await tx.declinedMatch.findMany({ where: { budgetId } });
  const allIdentities = await tx.ingestedEntry.findMany({
    where: { budgetId },
    select: { transactionId: true },
  });
  const imported = new Set(allIdentities.map((e) => e.transactionId));
  const shares = new Map<string | null, number>();
  for (const i of allIdentities)
    shares.set(i.transactionId, (shares.get(i.transactionId) ?? 0) + 1);
  const accounts = await tx.financialAccount.findMany({ where: { budgetId } });
  const describe = (
    accountId: string | undefined,
    date: Date,
    amount: bigint,
    payee: string,
  ) =>
    `${accounts.find((a) => a.id === accountId)?.name ?? "Account"} · ${date.toISOString().slice(0, 10)} · ${formatUSD(money(amount))} · ${payee || "No payee"}`;
  const near = (a: Date, b: Date) =>
    Math.abs(a.getTime() - b.getTime()) <= MATCH_DAYS * 86400000;
  const result: {
    entryId: string;
    otherEntryId?: string;
    transactionId?: string;
    /** An earlier import of the same charge, which the bank re-issued. */
    duplicateOfEntryId?: string;
    label: string;
    sourceLabel: string;
  }[] = [];
  // Earlier imports a re-issued row may repeat, open reviews included.
  const earlier = await tx.ingestedEntry.findMany({
    where: {
      budgetId,
      removed: false,
      status: "POSTED",
      transactionId: { not: null },
    },
  });
  for (const e of entries) {
    if (
      declined.some(
        (d) =>
          d.connectionId === e.connectionId && d.externalId === e.externalId,
      )
    )
      continue;
    const t = transactions.find((t) => t.id === e.transactionId);
    if (!t || t.transferAccountId) continue;
    const accountId = links.find(
      (l) => l.id === e.providerAccountId,
    )?.accountId;
    if (t.accountId !== accountId || t.amount !== e.amount) continue;
    for (const manual of transactions.filter((t) => !imported.has(t.id))) {
      const amount =
        manual.accountId === accountId
          ? manual.amount
          : manual.transferAccountId === accountId
            ? -manual.amount
            : null;
      // Exact amounts, or, as YNAB allows, a nearby amount in the same
      // direction (a tip, a conversion) on a non-transfer entry. Accepting one
      // keeps the owner's entry and takes the bank's amount (YNAB_ALIGNMENT B2).
      if (amount === null || !near(manual.date, e.date)) continue;
      if (amount !== e.amount) {
        const abs = (v: bigint) => (v < 0n ? -v : v);
        if (
          manual.transferAccountId ||
          amount < 0n !== e.amount < 0n ||
          abs(amount - e.amount) * 10n > abs(amount) * 3n
        )
          continue;
      }
      result.push({
        entryId: e.id,
        transactionId: manual.id,
        sourceLabel: describe(accountId, e.date, e.amount, e.payee),
        label: describe(accountId, manual.date, amount, manual.payee),
      });
    }
    // The bank re-issued a charge already imported, under a new ID, in a
    // later sync (window-delta now catches this as it happens). Only a copy the
    // import created itself is offered: never the owner's matched entry, nor
    // one another identity already shares (a repeat already resolved).
    for (const old of e.matched || shares.get(e.transactionId) !== 1 ? [] : earlier) {
      const kept = transactions.find((t) => t.id === old.transactionId);
      if (
        old.id === e.id ||
        old.providerAccountId !== e.providerAccountId ||
        old.amount !== e.amount ||
        old.transactionId === e.transactionId ||
        !kept ||
        Math.abs(old.date.getTime() - e.date.getTime()) >
          REPOST_DAYS * 86400000 ||
        e.createdAt.getTime() - old.createdAt.getTime() < SEPARATE_SYNC_MS
      )
        continue;
      result.push({
        entryId: e.id,
        duplicateOfEntryId: old.id,
        sourceLabel: describe(accountId, e.date, e.amount, e.payee),
        label: describe(accountId, kept.date, old.amount, kept.payee || old.payee),
      });
    }
    for (const other of entries) {
      if (
        e.id >= other.id ||
        e.providerAccountId === other.providerAccountId ||
        e.transactionId === other.transactionId ||
        e.amount !== -other.amount ||
        !near(e.date, other.date)
      )
        continue;
      if (
        declined.some(
          (d) =>
            d.connectionId === other.connectionId &&
            d.externalId === other.externalId,
        )
      )
        continue;
      const otherTx = transactions.find((t) => t.id === other.transactionId);
      if (
        !otherTx ||
        otherTx.transferAccountId ||
        otherTx.amount !== other.amount ||
        otherTx.accountId !==
          links.find((l) => l.id === other.providerAccountId)?.accountId
      )
        continue;
      result.push({
        entryId: e.id,
        otherEntryId: other.id,
        sourceLabel: describe(accountId, e.date, e.amount, e.payee),
        label: describe(
          otherTx.accountId,
          other.date,
          other.amount,
          other.payee,
        ),
      });
    }
  }
  return result;
}

/**
 * Replace an owner's entry with the same entry at the bank's amount. Splits
 * keep their categories: a single split takes the new amount, otherwise the
 * difference goes to the largest split. Cleared state and preferences carry.
 */
async function withBankAmount(
  tx: Tx,
  budgetId: string,
  manual: {
    id: string;
    accountId: string;
    kind: string;
    date: Date;
    payee: string;
    memo: string;
    amount: bigint;
  },
  amount: bigint,
  ack: boolean,
  /** False while the bank still reports the row as pending. */
  cleared = true,
) {
  await voidTransaction(
    tx,
    budgetId,
    manual.id,
    "Matched to the bank's amount",
    ack,
  );
  const journalId = await journal(
    tx,
    budgetId,
    manual.date.toISOString().slice(0, 10),
    manual.accountId,
    amount,
    manual.kind,
  );
  const replacement = await tx.financialTransaction.create({
    data: {
      budgetId,
      journalId,
      accountId: manual.accountId,
      kind: manual.kind,
      date: manual.date,
      amount,
      payee: manual.payee,
      memo: manual.memo,
      replacesId: manual.id,
    },
  });
  const splits = await tx.financialSplit.findMany({
    where: { budgetId, transactionId: manual.id },
    orderBy: { position: "asc" },
  });
  if (splits.length) {
    const abs = (v: bigint) => (v < 0n ? -v : v);
    const largest = splits.reduce(
      (best, sp, i) => (abs(sp.amount) > abs(splits[best].amount) ? i : best),
      0,
    );
    await tx.financialSplit.createMany({
      data: splits.map((sp, i) => ({
        budgetId,
        transactionId: replacement.id,
        categoryId: sp.categoryId,
        amount:
          i === largest ? sp.amount + (amount - manual.amount) : sp.amount,
        position: sp.position,
      })),
    });
  }
  await tx.transactionState.create({
    data: {
      budgetId,
      transactionId: replacement.id,
      accountId: manual.accountId,
      cleared,
    },
  });
  const preference = await tx.transactionPreference.findUnique({
    where: { transactionId: manual.id },
  });
  if (preference)
    await tx.transactionPreference.create({
      data: {
        transactionId: replacement.id,
        budgetId,
        tags: preference.tags,
        locked: preference.locked,
        flag: preference.flag,
      },
    });
  return replacement.id;
}

export async function resolveMatch(
  userId: string,
  budgetId: string,
  entryId: string,
  choice: {
    transactionId?: string;
    otherEntryId?: string;
    duplicateOfEntryId?: string;
    decline?: boolean;
    acknowledgeReconciled?: boolean;
  },
) {
  return financialWrite(userId, budgetId, async (tx) => {
    const entry = await tx.ingestedEntry.findFirst({
      where: { id: entryId, budgetId, removed: false, status: "POSTED" },
    });
    if (!entry?.transactionId) fail("Posted entry unavailable.");
    if (choice.decline) {
      await tx.declinedMatch.upsert({
        where: {
          connectionId_externalId: {
            connectionId: entry.connectionId,
            externalId: entry.externalId,
          },
        },
        create: {
          budgetId,
          connectionId: entry.connectionId,
          externalId: entry.externalId,
        },
        update: {},
      });
      await audit(tx, userId, budgetId, entryId, { type: "match.decline" });
      return { entryId };
    }
    if (choice.transactionId === entry.transactionId) return { entryId };
    if (choice.otherEntryId) {
      const other = await tx.ingestedEntry.findFirst({
        where: { id: choice.otherEntryId, budgetId },
      });
      if (other?.transactionId === entry.transactionId) return { entryId };
    }
    const proposal = (await suggestions(tx, budgetId)).find(
      (p) =>
        p.entryId === entryId &&
        p.transactionId === choice.transactionId &&
        p.otherEntryId === choice.otherEntryId &&
        p.duplicateOfEntryId === choice.duplicateOfEntryId,
    );
    if (!proposal)
      fail("This proposal is no longer valid. Refresh before matching.");
    const original = await tx.financialTransaction.findUniqueOrThrow({
      where: { id: entry.transactionId },
    });
    const ack = choice.acknowledgeReconciled ?? false;
    await voidTransaction(
      tx,
      budgetId,
      original.id,
      "Confirmed duplicate bank match",
      ack,
    );
    let targetId = choice.transactionId;
    let matched = true;
    if (choice.duplicateOfEntryId) {
      // The earlier import (often the owner's own, reconciled entry) stays;
      // the bank's new ID now points at it and the old ID is retired.
      const old = await tx.ingestedEntry.findFirstOrThrow({
        where: { id: choice.duplicateOfEntryId, budgetId },
      });
      targetId = old.transactionId!;
      matched = old.matched;
      await tx.ingestedEntry.update({
        where: { id: old.id },
        data: { removed: true, review: Prisma.DbNull },
      });
    } else if (choice.otherEntryId) {
      const other = await tx.ingestedEntry.findFirstOrThrow({
        where: { id: choice.otherEntryId, budgetId },
      });
      const counterpart = await tx.financialTransaction.findUniqueOrThrow({
        where: { id: other.transactionId! },
      });
      await voidTransaction(
        tx,
        budgetId,
        counterpart.id,
        "Confirmed transfer pair",
        ack,
      );
      const out = original.amount < 0n ? original : counterpart,
        into = original.amount < 0n ? counterpart : original;
      const accounts = await tx.financialAccount.findMany({
        where: { budgetId, id: { in: [out.accountId, into.accountId] } },
      });
      const a = accounts.find((a) => a.id === out.accountId)!,
        b = accounts.find((a) => a.id === into.accountId)!;
      const date = out.date.toISOString().slice(0, 10);
      const journalId = await journal(
        tx,
        budgetId,
        date,
        a.id,
        out.amount,
        "TRANSFER",
        b.id,
      );
      const transfer = await tx.financialTransaction.create({
        data: {
          budgetId,
          journalId,
          accountId: a.id,
          transferAccountId: b.id,
          kind: "TRANSFER",
          date: out.date,
          amount: out.amount,
          payee: "Confirmed bank transfer",
          memo: "Matched both imported account legs",
          replacesId: out.id,
        },
      });
      targetId = transfer.id;
      if (a.participation !== b.participation && a.participation === "BUDGET") {
        const splits = await tx.financialSplit.findMany({
          where: { transactionId: out.id, budgetId },
        });
        await tx.financialSplit.createMany({
          data: splits.map((s, position) => ({
            budgetId,
            transactionId: targetId!,
            categoryId: s.categoryId,
            amount: s.amount,
            position,
          })),
        });
      }
      await tx.transactionState.createMany({
        data: accounts.map((a) => ({
          budgetId,
          transactionId: targetId!,
          accountId: a.id,
          cleared: true,
        })),
      });
      await tx.ingestedEntry.update({
        where: { id: other.id },
        data: { transactionId: targetId, approved: true },
      });
    } else {
      const manual = await tx.financialTransaction.findUniqueOrThrow({
        where: { id: targetId! },
      });
      const accountId = original.accountId;
      const state = await tx.transactionState.findUniqueOrThrow({
        where: {
          transactionId_accountId: { transactionId: manual.id, accountId },
        },
      });
      if (!state.cleared) {
        const affected = await tx.reconciliation.count({
          where: { budgetId, accountId, date: { gte: manual.date } },
        });
        if (affected && !ack)
          fail(
            "Acknowledge that matching will change a prior statement comparison.",
          );
        await tx.reconciliation.updateMany({
          where: { budgetId, accountId, date: { gte: manual.date } },
          data: { affectedAt: new Date() },
        });
        await tx.transactionState.update({
          where: {
            transactionId_accountId: { transactionId: manual.id, accountId },
          },
          data: { cleared: true },
        });
      }
      // The bank knows the real amount (YNAB_ALIGNMENT B2): keep the owner's
      // date, payee and categories, and take the imported amount.
      if (manual.amount !== original.amount && !manual.transferAccountId)
        targetId = await withBankAmount(
          tx,
          budgetId,
          manual,
          original.amount,
          ack,
        );
    }
    await tx.ingestedEntry.update({
      where: { id: entryId },
      data: { transactionId: targetId, approved: true, matched },
    });
    await audit(tx, userId, budgetId, entryId, {
      type: choice.duplicateOfEntryId ? "match.reissue" : "match.accept",
      targetId: targetId!,
      otherEntryId: choice.otherEntryId ?? null,
      acknowledgeReconciled: ack,
    });
    return { entryId };
  });
}

const cents = (v: bigint) => {
  const a = v < 0n ? -v : v;
  return `${v < 0n ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
};
const openingKey = (providerAccountId: string) => {
  const h = createHash("sha256").update(`opening:${providerAccountId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/**
 * YNAB takes a linked account's starting balance from the bank. For each linked
 * account with no starting balance, the bank's current balance, less whatever
 * has already been imported since the link date, becomes the starting balance on
 * that date, so nothing is counted twice. Accounts with the owner's own history
 * before the link are left alone. The provider call happens outside any
 * financial transaction; a failure here never fails a link or a sync.
 */
export async function fillStartingBalances(
  userId: string,
  budgetId: string,
  connectionId: string,
  onlyProviderAccountId?: string,
): Promise<number> {
  try {
    const db = getDb();
    const connection = await db.providerConnection.findFirst({
      where: { id: connectionId, budgetId },
    });
    if (
      !connection ||
      !isBank(connection.provider) ||
      connection.status === "DISCONNECTED"
    )
      return 0;
    const links = await db.providerAccount.findMany({
      where: {
        budgetId,
        connectionId,
        accountId: { not: null },
        linkedFrom: { not: null },
        ...(onlyProviderAccountId ? { id: onlyProviderAccountId } : {}),
      },
    });
    const needing = [];
    for (const link of links)
      if (
        !(await db.financialTransaction.count({
          where: {
            budgetId,
            accountId: link.accountId!,
            kind: "OPENING",
            voidedAt: null,
          },
        }))
      )
        needing.push(link);
    if (!needing.length) return 0;
    const token = decryptSecret(
      connection.accessToken,
      getConfig().SECRET_ENCRYPTION_KEY,
      tokenContext(connectionId),
    );
    const discovered = await providerFor(connection.provider).listAccounts(token);
    let filled = 0;
    for (const link of needing) {
      const bank = discovered.find(
        (d) => d.externalAccountId === link.externalAccountId,
      )?.currentBalance;
      if (bank === undefined || bank === null) continue;
      const from = link.linkedFrom!.toISOString().slice(0, 10);
      const live = await db.financialTransaction.findMany({
        where: {
          budgetId,
          voidedAt: null,
          OR: [
            { accountId: link.accountId! },
            { transferAccountId: link.accountId! },
          ],
        },
        select: { accountId: true, amount: true, date: true },
      });
      if (live.some((t) => t.date.toISOString().slice(0, 10) <= from)) continue;
      const since = live.reduce(
        (n, t) => n + (t.accountId === link.accountId ? t.amount : -t.amount),
        0n,
      );
      try {
        await executeFinance(userId, budgetId, openingKey(link.id), {
          type: "account.opening",
          accountId: link.accountId!,
          amount: cents(bank - since),
          date: from,
        });
        filled++;
      } catch (error) {
        if (!(error instanceof FinanceError)) throw error;
      }
    }
    return filled;
  } catch {
    // The bank's balance is a convenience; the owner can still reconcile.
    return 0;
  }
}

/** How a bank's account subtype maps onto a MyNAB account. */
function mappedType(subtype: string): {
  accountType:
    | "CHECKING"
    | "SAVINGS"
    | "CREDIT_CARD"
    | "LINE_OF_CREDIT"
    | "LOAN"
    | "INVESTMENT"
    | "OTHER_ASSET";
  participation: "BUDGET" | "TRACKING";
} {
  const t = subtype.toLowerCase();
  if (t.includes("credit card") || t === "credit")
    return { accountType: "CREDIT_CARD", participation: "BUDGET" };
  if (t.includes("line of credit"))
    return { accountType: "LINE_OF_CREDIT", participation: "BUDGET" };
  if (["savings", "money market", "cd", "hsa"].includes(t))
    return { accountType: "SAVINGS", participation: "BUDGET" };
  if (["checking", "paypal", "prepaid", "cash management", "depository"].includes(t))
    return { accountType: "CHECKING", participation: "BUDGET" };
  if (/loan|mortgage|student|auto|home equity/.test(t))
    return { accountType: "LOAN", participation: "TRACKING" };
  if (/brokerage|ira|401|403|529|investment|retirement|roth|pension|stock|mutual/.test(t))
    return { accountType: "INVESTMENT", participation: "TRACKING" };
  return { accountType: "OTHER_ASSET", participation: "TRACKING" };
}

/**
 * YNAB's "link to a new account": creates the MyNAB account from the bank's own
 * description and links it from today, with the bank's balance as its start.
 */
export async function createLinkedAccount(
  userId: string,
  budgetId: string,
  providerAccountId: string,
  name?: string,
) {
  if (!uuid.safeParse(providerAccountId).success) fail("Invalid identifier.");
  const db = getDb();
  const provider = await db.providerAccount.findFirst({
    where: { id: providerAccountId, budgetId },
  });
  if (!provider) fail("Provider account unavailable.");
  if (provider!.accountId) fail("This bank account is already linked.");
  const connection = await db.providerConnection.findUniqueOrThrow({
    where: { id: provider!.connectionId },
  });
  if (!isBank(connection.provider) || connection.status === "DISCONNECTED")
    fail("This connection no longer syncs; add the account from SimpleFIN.");
  const { accountType, participation } = mappedType(provider!.type);
  const label =
    (name ?? "").trim() ||
    // SimpleFIN's account names already carry the bank's name.
    `${provider!.name}${provider!.mask && !provider!.name.endsWith(provider!.mask) ? ` ${provider!.mask}` : ""}`;
  const budget = await getDb().$transaction((tx) => authorize(tx, userId, budgetId));
  const created = await executeFinance(userId, budgetId, randomUUID(), {
    type: "account.create",
    name: label.slice(0, 120),
    accountType,
    participation,
    opening: "0",
    date: today(budget.timezone),
  });
  await linkAccount(userId, budgetId, providerAccountId, created.id);
  return { accountId: created.id, providerAccountId };
}
