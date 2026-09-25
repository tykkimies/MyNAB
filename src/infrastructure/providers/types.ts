import type { NormalizedEntry } from "@/domain/ingestion";

/** An account as the institution describes it, before the owner links anything. */
export interface DiscoveredAccount {
  externalAccountId: string;
  name: string;
  mask: string;
  type: string;
  /**
   * The institution's current balance in cents, signed as the ledger records it:
   * money held is positive, money owed on a card or loan is negative. Absent when
   * the institution does not report one.
   */
  currentBalance?: bigint | null;
}

export interface Connected {
  accessToken: string;
  itemId: string;
  institutionId: string;
  institutionName: string;
}

/**
 * One complete sync: every page already fetched. Callers commit the entries and
 * `cursor` together, so an interrupted fetch leaves the stored cursor untouched
 * and the next attempt repeats from the same place.
 */
export interface ProviderBatch {
  entries: NormalizedEntry[];
  /** External IDs the institution no longer reports. These become corrections. */
  removed: string[];
  /**
   * Null when the institution has no position to resume from yet. A freshly linked
   * item returns an empty cursor while history is still being assembled; storing
   * that as a real cursor would skip everything that arrives afterwards.
   */
  cursor: string | null;
}

/** Recoverable states an adapter may report. Anything else is a failure. */
export type ProviderErrorCode =
  "REAUTH_REQUIRED" | "RATE_LIMITED" | "UNAVAILABLE" | "PAGINATION_CHANGED";

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Adapters translate an institution into normalized batches and nothing else.
 * They never touch the database, the ledger or the budget: see
 * docs/PHASE5_INGESTION.md.
 */
export interface Provider {
  readonly name: "PLAID";
  /**
   * Short-lived token handed to the browser so Plaid Link can collect credentials.
   * With `accessToken` it opens update mode, re-authenticating an existing item
   * without creating a new one.
   */
  createLinkToken(
    userReference: string,
    options?: { accessToken?: string },
  ): Promise<string>;
  exchange(publicToken: string): Promise<Connected>;
  listAccounts(accessToken: string): Promise<DiscoveredAccount[]>;
  sync(accessToken: string, cursor: string | null): Promise<ProviderBatch>;
  disconnect(accessToken: string): Promise<void>;
}
