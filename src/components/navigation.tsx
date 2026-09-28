"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Wallet,
  Landmark,
  Flag,
  TrendingDown,
  ChartColumn,
  CalendarClock,
  Link2,
  Upload,
  SlidersHorizontal,
  Users,
  Download,
} from "lucide-react";
import { Amount } from "@/components/amount";

const PRIMARY = [
  { href: "/budget", label: "Budget", Icon: Wallet },
  { href: "/accounts", label: "Accounts", Icon: Landmark },
  { href: "/targets", label: "Targets", Icon: Flag },
  { href: "/debt", label: "Debt", Icon: TrendingDown },
  { href: "/reports", label: "Reports", Icon: ChartColumn },
];
const MANAGE = [
  { href: "/accounts/schedules", label: "Schedules", Icon: CalendarClock },
  { href: "/accounts/connections", label: "Bank sync", Icon: Link2 },
  { href: "/accounts/import", label: "Import a file", Icon: Upload },
  { href: "/accounts/rules", label: "Rules", Icon: SlidersHorizontal },
  { href: "/accounts/payees", label: "Payees", Icon: Users },
  { href: "/accounts/export", label: "Export", Icon: Download },
];

export interface NavAccount {
  id: string;
  name: string;
  /** Preformatted; masked by Hide Amounts. */
  balance: string;
  negative: boolean;
  tracking: boolean;
  /** Imported transactions waiting for approval, as YNAB counts them. */
  unapproved?: number;
}

/**
 * One navigation, two shapes: the sidebar's column on desktop (with the
 * accounts under Accounts and the Manage group), and a five-item tab bar
 * below the desktop breakpoint, where the account list and Manage links are
 * hidden and reached from the Accounts page instead.
 */
export function Navigation({
  accounts,
  collapseTracking,
}: {
  accounts: NavAccount[];
  collapseTracking: boolean;
}) {
  const path = usePathname();
  // Accounts stays selected on every page under it, including the Manage
  // pages, which light their own entry as well.
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  const budget = accounts.filter((a) => !a.tracking);
  const tracking = accounts.filter((a) => a.tracking);
  return (
    <nav aria-label="Main navigation" className="lg:flex lg:flex-col lg:gap-1">
      <ul className="grid grid-cols-5 lg:flex lg:flex-col lg:gap-0.5">
        {PRIMARY.map(({ href, label, Icon }) => {
          const current = active(href);
          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={`relative flex min-h-11 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] font-medium transition-colors lg:h-8 lg:min-h-0 lg:flex-row lg:justify-start lg:gap-2.5 lg:rounded-md lg:px-2.5 lg:text-[0.8125rem] ${
                  current
                    ? "text-accent-text lg:bg-accent-soft"
                    : "text-ink-2 hover:text-ink lg:hover:bg-surface-sunken"
                }`}
              >
                {current && (
                  <span
                    className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-accent lg:inset-x-auto lg:inset-y-1.5 lg:left-0 lg:h-auto lg:w-0.5"
                    aria-hidden
                  />
                )}
                <Icon size={18} className="shrink-0 lg:size-4" aria-hidden />
                <span className="truncate">{label}</span>
              </Link>
              {href === "/accounts" && accounts.length > 0 && (
                <div className="hidden lg:block">
                  <AccountList accounts={budget} path={path} />
                  {tracking.length > 0 &&
                    (collapseTracking ? (
                      <details className="group">
                        <summary className="flex h-7 cursor-pointer items-center gap-1 pl-8 pr-2.5 text-caps uppercase text-ink-3 hover:text-ink">
                          Tracking
                          <span className="text-[0.625rem] group-open:hidden">
                            ▸
                          </span>
                          <span className="hidden text-[0.625rem] group-open:inline">
                            ▾
                          </span>
                        </summary>
                        <AccountList accounts={tracking} path={path} />
                      </details>
                    ) : (
                      <>
                        <span className="flex h-7 items-center pl-8 text-caps uppercase text-ink-3">
                          Tracking
                        </span>
                        <AccountList accounts={tracking} path={path} />
                      </>
                    ))}
                  <Link
                    href="/accounts/register"
                    aria-current={
                      path === "/accounts/register" ? "page" : undefined
                    }
                    className={`flex h-7 items-center rounded-md pl-8 pr-2.5 text-meta hover:bg-surface-sunken hover:text-ink ${path === "/accounts/register" ? "text-accent-text" : "text-ink-2"}`}
                  >
                    All accounts
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="hidden lg:block lg:pt-4">
        <span className="block px-2.5 pb-1 text-caps uppercase text-ink-3">
          Manage
        </span>
        <ul className="flex flex-col gap-0.5">
          {MANAGE.map(({ href, label, Icon }) => {
            const current = path === href || path.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={`flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors ${
                    current
                      ? "bg-accent-soft text-accent-text"
                      : "text-ink-2 hover:bg-surface-sunken hover:text-ink"
                  }`}
                >
                  <Icon size={16} className="shrink-0" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

function AccountList({
  accounts,
  path,
}: {
  accounts: NavAccount[];
  path: string;
}) {
  return (
    <ul className="flex flex-col">
      {accounts.map((a) => {
        const current = path === `/accounts/${a.id}`;
        return (
          <li key={a.id}>
            <Link
              href={`/accounts/${a.id}`}
              aria-current={current ? "page" : undefined}
              className={`flex h-7 items-center gap-2 rounded-md pl-8 pr-2.5 text-meta transition-colors hover:bg-surface-sunken hover:text-ink ${current ? "bg-accent-soft text-accent-text" : "text-ink-2"}`}
            >
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              {a.unapproved ? (
                <span
                  className="unapproved-count"
                  aria-label={`${a.unapproved} to approve`}
                  title={`${a.unapproved} to approve`}
                >
                  {a.unapproved}
                </span>
              ) : null}
              <span
                className={`shrink-0 font-medium ${a.negative ? "text-negative" : ""}`}
                data-numeric
              >
                <Amount>{a.balance}</Amount>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
