"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, Landmark, Flag, TrendingDown } from "lucide-react";
const links = [
  { href: "/budget", label: "Budget", Icon: Wallet },
  { href: "/accounts", label: "Accounts", Icon: Landmark },
  { href: "/goals", label: "Goals", Icon: Flag },
  { href: "/debt", label: "Debt", Icon: TrendingDown },
];
/**
 * A four-column row below the desktop breakpoint and the design system's rail
 * above it. Stitch exported no mobile shell — its "mobile" screen is a byte
 * copy of the desktop one — so the off-canvas drawer its prose describes has no
 * design to follow, and a drawer would in any case hide these links from the
 * 390px viewport where the suite still clicks them.
 */
export function Navigation() {
  const path = usePathname();
  return (
    <nav
      className="grid grid-cols-4 gap-space-xs lg:flex lg:flex-col"
      aria-label="Main navigation"
    >
      {links.map(({ href, label, Icon }) => {
        const active = path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-11 min-w-0 items-center justify-center gap-space-sm rounded-md px-space-xs py-2 font-body-md text-label-sm transition-colors lg:justify-start lg:px-space-sm lg:text-body-md ${
              active
                ? "bg-status-ready-bg font-semibold text-status-ready-text"
                : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            }`}
          >
            {/* The accent bar the design system docks to the left edge of the
                selected rail item; there is no left edge to dock to in the
                mobile row, so it appears only at the rail breakpoint. */}
            {active && (
              <span
                className="absolute left-0 top-1/2 hidden h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary-container lg:block"
                aria-hidden
              />
            )}
            <Icon size={20} className="shrink-0" aria-hidden />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
