import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Amount } from "@/components/amount";
import { formatUSD, money } from "@/domain/money";

const usd = (n: bigint) => formatUSD(money(n));

export interface PhoneAccountRow {
  id: string;
  name: string;
  balance: bigint;
  unapproved: number;
}

/**
 * Accounts on the phone, as YNAB's app lists them: net worth, then budget
 * and tracking accounts with their balances and what waits for approval.
 * Adding accounts, bank sync and the other tools are on the desktop site.
 */
export function PhoneAccounts({
  netWorth,
  groups,
  unapproved,
}: {
  netWorth: bigint;
  groups: { title: string; accounts: PhoneAccountRow[] }[];
  unapproved: number;
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
