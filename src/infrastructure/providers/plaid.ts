import { parseUSD } from "@/domain/money";
import { financialDate } from "@/domain/dates";
import type { NormalizedEntry } from "@/domain/ingestion";
import {
  ProviderError,
  type Connected,
  type DiscoveredAccount,
  type Provider,
  type ProviderBatch,
  type ProviderErrorCode,
} from "./types";

const HOSTS = {
  sandbox: "https://sandbox.plaid.com",
  production: "https://production.plaid.com",
} as const;

export interface PlaidSettings {
  clientId: string;
  secret: string;
  environment: keyof typeof HOSTS;
  /** Registered OAuth return address; institutions using OAuth need it. */
  redirectUri?: string;
  fetchImpl?: typeof fetch;
}

// A single sync is held in memory before it is committed, so it must be bounded.
const MAX_PAGES = 60;
const PAGE_SIZE = 500;

const RECOVERABLE: Record<string, ProviderErrorCode> = {
  ITEM_LOGIN_REQUIRED: "REAUTH_REQUIRED",
  ITEM_LOCKED: "REAUTH_REQUIRED",
  PENDING_EXPIRATION: "REAUTH_REQUIRED",
  RATE_LIMIT_EXCEEDED: "RATE_LIMITED",
  INSTITUTION_DOWN: "UNAVAILABLE",
  INSTITUTION_NOT_RESPONDING: "UNAVAILABLE",
  PLANNED_MAINTENANCE: "UNAVAILABLE",
};

interface PlaidTransaction {
  transaction_id: string;
  pending_transaction_id: string | null;
  pending: boolean;
  date: string;
  amount: number;
  iso_currency_code: string | null;
  name: string;
  merchant_name: string | null;
  account_id: string;
}

/**
 * Plaid reports a positive amount when money leaves the account. MyNAB signs every
 * amount from the account's perspective, so the sign is inverted here, once, at the
 * boundary. Getting this backwards would invert every import.
 */
export function normalizeAmount(amount: number): bigint {
  if (!Number.isFinite(amount))
    throw new Error("Provider amount is not finite");
  if (Math.abs(amount) > Number.MAX_SAFE_INTEGER / 100)
    throw new Error("Provider amount exceeds safe cent precision");
  const fixed = amount.toFixed(2);
  // toFixed would quietly round sub-cent precision away, and money is never
  // rounded silently here. USD settles in cents, so anything finer is a signal
  // that the value is not what this ledger can represent exactly.
  if (Number(fixed) !== amount)
    throw new Error("Provider amount is not an exact number of cents");
  return -parseUSD(fixed);
}

export function normalizeTransaction(t: PlaidTransaction): NormalizedEntry {
  if (t.iso_currency_code !== "USD")
    throw new Error(`Unsupported currency ${t.iso_currency_code}`);
  financialDate(t.date);
  return {
    externalId: t.transaction_id,
    pendingExternalId: t.pending_transaction_id,
    status: t.pending ? "PENDING" : "POSTED",
    externalAccountId: t.account_id,
    date: t.date,
    amount: normalizeAmount(t.amount),
    payee: (t.merchant_name ?? t.name ?? "").slice(0, 120),
  };
}

export function createPlaidProvider(settings: PlaidSettings): Provider {
  const host = HOSTS[settings.environment];
  if (!host) throw new Error("Unknown Plaid environment");
  const send = settings.fetchImpl ?? fetch;

  async function call<T>(path: string, body: Record<string, unknown>) {
    const response = await send(`${host}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: settings.clientId,
        secret: settings.secret,
        ...body,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const text = await response.text();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new ProviderError(
        "UNAVAILABLE",
        "Provider returned a bad response",
      );
    }
    if (!response.ok) {
      // Report only the classified code. A provider body can echo request details,
      // so it is never attached to an error that might be logged or displayed.
      const code = String(payload.error_code ?? "");
      if (code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION")
        throw new ProviderError("PAGINATION_CHANGED", "Restart pagination");
      const recoverable = RECOVERABLE[code];
      if (recoverable) throw new ProviderError(recoverable, code);
      throw new Error(`Provider request failed: ${code || response.status}`);
    }
    return payload as T;
  }

  return {
    name: "PLAID",
    async createLinkToken(userReference, options = {}) {
      const result = await call<{ link_token: string }>("/link/token/create", {
        client_name: "MyNAB",
        language: "en",
        country_codes: ["US"],
        user: { client_user_id: userReference },
        // Update mode names the item and must not request products again.
        ...(options.accessToken
          ? { access_token: options.accessToken }
          : { products: ["transactions"] }),
        ...(settings.redirectUri ? { redirect_uri: settings.redirectUri } : {}),
      });
      return result.link_token;
    },
    async exchange(publicToken) {
      const { access_token, item_id } = await call<{
        access_token: string;
        item_id: string;
      }>("/item/public_token/exchange", { public_token: publicToken });
      const item = await call<{ item: { institution_id: string | null } }>(
        "/item/get",
        { access_token },
      );
      const institutionId = item.item.institution_id ?? "";
      let institutionName = institutionId || "Unknown institution";
      if (institutionId) {
        const found = await call<{ institution: { name: string } }>(
          "/institutions/get_by_id",
          { institution_id: institutionId, country_codes: ["US"] },
        );
        institutionName = found.institution.name;
      }
      return {
        accessToken: access_token,
        itemId: item_id,
        institutionId,
        institutionName,
      } satisfies Connected;
    },
    async listAccounts(accessToken) {
      const { accounts } = await call<{
        accounts: {
          account_id: string;
          name: string;
          mask: string | null;
          type: string;
          subtype: string | null;
          balances?: {
            current: number | null;
            iso_currency_code: string | null;
          };
        }[];
      }>("/accounts/get", { access_token: accessToken });
      return accounts.map((a): DiscoveredAccount => {
        const current = a.balances?.current;
        const usd = (a.balances?.iso_currency_code ?? "USD") === "USD";
        // Plaid reports what a card or loan owes as a positive number; the
        // ledger records owed money as negative. toFixed avoids float drift.
        const owed = a.type === "credit" || a.type === "loan";
        const cents =
          typeof current === "number" && Number.isFinite(current) && usd
            ? BigInt(current.toFixed(2).replace(".", ""))
            : null;
        return {
          externalAccountId: a.account_id,
          name: a.name.slice(0, 120),
          mask: a.mask ?? "",
          type: a.subtype ?? a.type,
          currentBalance: cents === null ? null : owed ? -cents : cents,
        };
      });
    },
    async sync(accessToken, cursor) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          // Every page is fetched before anything is returned. Pending and posted rows
          // for the same purchase can land on different pages, so a caller that acted
          // page by page would double count.
          const entries: NormalizedEntry[] = [];
          const removed = new Set<string>();
          let next = cursor || undefined;
          for (let page = 0; page < MAX_PAGES; page++) {
            const result = await call<{
              added: PlaidTransaction[];
              modified: PlaidTransaction[];
              removed: { transaction_id: string }[];
              next_cursor: string;
              has_more: boolean;
            }>("/transactions/sync", {
              access_token: accessToken,
              cursor: next,
              count: PAGE_SIZE,
            });
            for (const t of [...result.added, ...result.modified]) {
              removed.delete(t.transaction_id);
              entries.push(normalizeTransaction(t));
            }
            for (const r of result.removed) {
              removed.add(r.transaction_id);
              for (let i = entries.length - 1; i >= 0; i--)
                if (entries[i].externalId === r.transaction_id)
                  entries.splice(i, 1);
            }
            next = result.next_cursor;
            if (!result.has_more) {
              // A later page can resend an earlier row; the last copy is authoritative.
              const byId = new Map(entries.map((e) => [e.externalId, e]));
              return {
                entries: [...byId.values()],
                removed: [...new Set(removed)],
                // An empty cursor means "nothing to resume from yet", not "start of time".
                cursor: next ? next : null,
              } satisfies ProviderBatch;
            }
          }
          throw new ProviderError(
            "UNAVAILABLE",
            "Provider returned more pages than one sync may hold",
          );
        } catch (error) {
          if (
            error instanceof ProviderError &&
            error.code === "PAGINATION_CHANGED" &&
            attempt < 2
          )
            continue;
          throw error;
        }
      }
      throw new ProviderError("UNAVAILABLE", "Pagination did not settle");
    },
    async refresh(accessToken) {
      // Plaid pulls from the institution in the background and reports the
      // outcome through /transactions/sync once it is done.
      await call("/transactions/refresh", { access_token: accessToken });
    },
    async disconnect(accessToken) {
      await call("/item/remove", { access_token: accessToken });
    },
  };
}
