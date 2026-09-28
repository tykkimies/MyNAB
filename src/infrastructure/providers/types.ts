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

export type ProviderName = "SIMPLEFIN";

/** A SimpleFIN setup token, pasted by the owner from the SimpleFIN Bridge. */
export interface SimpleFinSetup {
  setupToken: string;
}


/**
 * What the application knows that a provider without a cursor needs to produce
 * a delta: which accounts are linked and from when, and which pending rows it
 * has already seen (so a pending row that disappears can be withdrawn, and one
 * that posts under a new id can be recognised).
 */
export interface SyncContext {
  today: string;
  /** The budget's time zone, for providers that report instants, not dates. */
  timezone: string;
  accounts: { externalAccountId: string; linkedFrom: string }[];
  pending: {
    externalId: string;
    externalAccountId: string;
    amount: bigint;
    date: string;
  }[];
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
  /**
   * Problems the provider reported alongside data it did return, such as one
   * bank in an aggregator needing attention. Shown to the owner; not a failure.
   */
  warnings?: string[];
  /**
   * Every account the provider reported, linked or not, so accounts added at
   * the provider since the connection was made appear for linking.
   */
  accounts?: DiscoveredAccount[];
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
  readonly name: ProviderName;
  /** Claim a setup token for the access this connection syncs with. */
  exchange(completion: SimpleFinSetup): Promise<Connected>;
  listAccounts(accessToken: string): Promise<DiscoveredAccount[]>;
  sync(
    accessToken: string,
    cursor: string | null,
    context?: SyncContext,
  ): Promise<ProviderBatch>;
  disconnect(accessToken: string): Promise<void>;
}
