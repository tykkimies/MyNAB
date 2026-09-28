"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartColumn,
  Landmark,
  Plus,
  TrendingDown,
  Wallet,
} from "lucide-react";

const TABS = [
  { href: "/budget", label: "Budget", Icon: Wallet },
  { href: "/accounts", label: "Accounts", Icon: Landmark },
  { href: "/add", label: "Add", Icon: Plus },
  { href: "/debt", label: "Debt", Icon: TrendingDown },
  { href: "/reports", label: "Reports", Icon: ChartColumn },
];

/**
 * The phone app's tab bar, as in YNAB's app: four areas and a raised
 * "Add transaction" button in the middle.
 */
export function PhoneTabBar({ unapproved }: { unapproved: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Main navigation" className="phone-tabbar">
      <ul>
        {TABS.map(({ href, label, Icon }) => {
          const current = path === href || path.startsWith(`${href}/`);
          if (href === "/add")
            return (
              <li key={href}>
                <Link
                  href={href}
                  className="phone-add"
                  aria-label="Add transaction"
                  aria-current={current ? "page" : undefined}
                >
                  <span className="phone-add-disc">
                    <Icon size={24} strokeWidth={2.25} aria-hidden />
                  </span>
                </Link>
              </li>
            );
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className="phone-tab"
              >
                <span className="relative">
                  <Icon size={22} aria-hidden />
                  {href === "/accounts" && unapproved > 0 && (
                    <span
                      className="phone-badge"
                      aria-label={`${unapproved} to approve`}
                    >
                      {unapproved > 99 ? "99+" : unapproved}
                    </span>
                  )}
                </span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
