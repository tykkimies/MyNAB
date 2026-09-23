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
export function Navigation() {
  const path = usePathname();
  return (
    <nav className="navigation" aria-label="Main navigation">
      {links.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={path === href ? "page" : undefined}
        >
          <Icon size={20} aria-hidden />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
