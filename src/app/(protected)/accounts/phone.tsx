import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Amount } from "@/components/amount";
import { ProviderAction } from "@/components/provider-link";
import { formatUSD, money } from "@/domain/money";
import { formatDateTime } from "@/domain/dates";

const usd = (n: bigint) => formatUSD(money(n));

export interface PhoneSyncConnection {
  id: string;
  institutionName: string;
  status: string;
  errorCode: string | null;
  lastSyncedAt: Date | null;
  warning: string | null;
}

/** "just now", "12 min ago", "3 hr ago", "2 days ago". */
function ago(then: Date, now: Date) {
  const minutes = Math.round((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export interface PhoneAccountRow {
  id: string;
  name: string;
  balance: bigint;
  unapproved: number;
}

/**
 * Accounts on the phone, as YNAB's app lists them: net worth, each bank
 * connection with Sync now, then budget and tracking accounts with their
 * balances and what waits for approval. Adding accounts, linking banks and
 * the other tools are on the desktop site.
 */
export function PhoneAccounts({
  netWorth,
  groups,
  unapproved,
  sync,
  now,
}: {
  netWorth: bigint;
  groups: { title: string; accounts: PhoneAccountRow[] }[];
  unapproved: number;
  sync: {
    connections: PhoneSyncConnection[];
    worker: { running: boolean; intervalHours: number };
    dateFormat: string;
    timezone: string;
  } | null;
  now: Date;
}) {
  return (
    <main id="main" className="phone-page" tabIndex={-1}>
      <h1 className="sr-only">Accounts</h1>
      <div className="phone-hero">
        <span className="text-label text-ink-2">Net worth</span>
        <span
          className={`text-figure-lg ${netWorth < 0n ? "text-negative" : "text-ink"}`}
          data-numeric
        >
          <Amount>{usd(netWorth)}</Amount>
        </span>
      </div>
      {sync && sync.connections.length > 0 && (
        <section className="phone-list" aria-labelledby="sync-heading">
          <h2 id="sync-heading" className="phone-section-head">
            Bank sync
          </h2>
          <ul>
            {sync.connections.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 border-b border-hairline px-gutter py-3"
                data-connection
              >
                <div className="flex flex-col">
                  <span className="min-w-0 truncate text-body text-ink">
                    {c.institutionName}
                  </span>
                  <span
                    className={`text-meta ${c.status === "ERROR" ? "text-negative" : "text-ink-3"}`}
                  >
                    {c.status === "ERROR" && "Sync failed · "}
                    {c.lastSyncedAt
                      ? `Last synced ${formatDateTime(c.lastSyncedAt, sync.dateFormat, sync.timezone)} (${ago(c.lastSyncedAt, now)})`
                      : "Not synced yet"}
                  </span>
                </div>
                {c.warning && (
                  <p className="text-meta text-warning">{c.warning}</p>
                )}
                <ProviderAction
                  command={{ type: "sync", connectionId: c.id }}
                  label="Sync now"
                  busyLabel="Syncing…"
                  secondary
                />
              </li>
            ))}
          </ul>
          <p className="px-gutter py-2 text-meta text-ink-3">
            {sync.worker.running
              ? `Syncs on its own every ${sync.worker.intervalHours} hours. SimpleFIN collects from your banks about once a day; Sync now fetches what it has collected.`
              : "Automatic sync is not running on the server; Sync now still works."}
          </p>
        </section>
      )}
      <section className="phone-list" aria-label="Every account">
        <Link href="/accounts/register" className="phone-row">
          <span className="flex-1">All accounts</span>
          {unapproved > 0 && (
            <span className="unapproved-count" aria-label={`${unapproved} to approve`}>
              {unapproved}
            </span>
          )}
          <ChevronRight size={18} aria-hidden className="text-ink-3" />
        </Link>
      </section>
      {groups.length === 0 ? (
        <p className="px-gutter py-10 text-center text-body text-ink-2">
          No accounts yet. Add one on the desktop site.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.title} className="phone-list" aria-labelledby={`h-${g.title}`}>
            <h2 id={`h-${g.title}`} className="phone-section-head">
              <span className="flex-1">{g.title}</span>
              <span className="text-num" data-numeric>
                <Amount>
                  {usd(g.accounts.reduce((n, a) => n + a.balance, 0n))}
                </Amount>
              </span>
            </h2>
            <ul>
              {g.accounts.map((a) => (
                <li key={a.id}>
                  <Link href={`/accounts/${a.id}`} className="phone-row">
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    {a.unapproved > 0 && (
                      <span
                        className="unapproved-count"
                        aria-label={`${a.unapproved} to approve`}
                      >
                        {a.unapproved}
                      </span>
                    )}
                    <span
                      className={`text-num ${a.balance < 0n ? "text-negative" : "text-ink"}`}
                      data-numeric
                    >
                      <Amount>{usd(a.balance)}</Amount>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
