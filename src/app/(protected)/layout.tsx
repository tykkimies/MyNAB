import Link from "next/link";
import { appPath } from "@/infrastructure/app-path";
import { cookies } from "next/headers";
import { ChevronDown, LogOut, Plus } from "lucide-react";
import { requireUser } from "@/application/session";
import { listBudgets } from "@/application/auth";
import {
  financePage,
  openBudget,
  unapprovedImports,
} from "@/application/finance-page";
import { Navigation, type NavAccount } from "@/components/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { HideAmountsToggle } from "@/components/hide-amounts-toggle";
import { OutboxSync } from "@/components/outbox-sync";
import { Brand } from "@/components/brand";
import { PopoverKeys } from "@/components/ui/popover-keys";
import { formatUSD, money } from "@/domain/money";
import { getDb } from "@/infrastructure/db";
import { isPhone, isPhoneDevice } from "@/infrastructure/view";
import { PhoneShell } from "@/components/phone/shell";
import { ViewSwitch } from "@/components/view-switch";
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const plan = await openBudget(user.userId).catch(() => {
    throw new Error("Workspace temporarily unavailable");
  });
  const isOwner =
    (await getDb().installation.findUnique({ where: { id: 1 } }))?.ownerId ===
    user.userId;
  const jar = await cookies();
  const dark = jar.get("mynab-theme")?.value === "dark";
  const hideAmounts = jar.get("mynab-hide-amounts")?.value === "1";
  // The sidebar lists the open accounts with their balances. financePage is
  // memoised per request, so a page that reads the ledger itself shares this
  // computation; if the read fails the shell still renders, without balances.
  const ledger = await financePage().catch(() => null);
  const closed = new Set(
    (ledger?.accounts ?? []).filter((a) => a.closed).map((a) => a.id),
  );
  const waiting = ledger
    ? await unapprovedImports().catch(() => null)
    : null;
  const accounts: NavAccount[] = (ledger?.projection.accounts ?? [])
    .filter((a) => !closed.has(a.id))
    .map((a) => ({
      id: a.id,
      name: a.name,
      balance: formatUSD(money(a.balance)),
      negative: a.balance < 0n,
      tracking: a.participation === "TRACKING",
      unapproved: waiting?.byAccount.get(a.id)?.length ?? 0,
    }));
  const planName = plan?.name ?? "Your budget";
  if (await isPhone())
    return (
      <PhoneShell
        planName={planName}
        planId={plan?.id ?? null}
        plans={(await listBudgets(user.userId)).map((b) => ({
          id: b.id,
          name: b.name,
        }))}
        username={user.username}
        role={isOwner ? "Owner" : "Household member"}
        dark={dark}
        hideAmounts={hideAmounts}
        unapproved={accounts.reduce((n, a) => n + (a.unapproved ?? 0), 0)}
      >
        {children}
      </PhoneShell>
    );
  // A phone that chose the desktop site can switch back from the top bar.
  const offerPhone = await isPhoneDevice();
  return (
    <div
      data-shell
      className="min-h-screen bg-canvas pb-[max(var(--tabbar-h),var(--sheet-h,0px))] md:pb-(--tabbar-h) lg:flex lg:h-screen lg:overflow-hidden lg:pb-0"
    >
      <PopoverKeys />
      {/* First tabbable element on the page, and the suite tabs straight to it. */}
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60 focus:rounded-md focus:border focus:border-hairline focus:bg-surface focus:px-4 focus:py-2 focus:text-body focus:shadow-pop"
        href="#main"
      >
        Skip to content
      </a>
      {/*
       * The rail on desktop; below the desktop breakpoint the same element is
       * the bottom tab bar, and everything but the five primary links hides.
       */}
      <aside className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom)] lg:static lg:flex lg:h-screen lg:w-62 lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-t-0 lg:px-3 lg:pb-3 lg:pt-3">
        <div className="hidden items-center justify-between px-2.5 pb-4 lg:flex">
          <Brand />
        </div>
        <Navigation accounts={accounts} collapseTracking={accounts.length > 8} />
        <div className="mt-auto hidden flex-col gap-3 pt-6 lg:flex">
          <div className="flex flex-wrap gap-x-3 px-2.5 text-meta">
            <Link
              className="text-ink-2 underline-offset-2 hover:text-ink hover:underline"
              href="/household"
            >
              Household
            </Link>
            <Link
              className="text-ink-2 underline-offset-2 hover:text-ink hover:underline"
              href="/guide"
            >
              Guide
            </Link>
          </div>
          <div className="flex items-center gap-2.5 border-t border-hairline px-2.5 pt-3">
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-[0.75rem] font-semibold text-on-accent"
              aria-hidden
            >
              {user.username[0].toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-label leading-tight text-ink">
                {user.username}
              </span>
              <span className="text-meta leading-tight text-ink-3">
                {isOwner ? "Owner" : "Household member"}
              </span>
            </span>
          </div>
        </div>
      </aside>
      <div
        id="workspace"
        className="flex min-h-screen flex-col lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
      >
        {/*
         * One global bar at every width, so exactly one "Sign out", one
         * "Dark theme" and one "Hide amounts" control is ever on the page.
         */}
        <header className="z-30 flex h-(--topbar-h) lg:sticky lg:top-0 shrink-0 items-center gap-2 border-b border-hairline bg-canvas px-gutter lg:px-space-lg">
          <div className="lg:hidden">
            <Brand />
          </div>
          <Link
            className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-label text-ink-2 hover:bg-surface-sunken hover:text-ink"
            href="/plans"
            aria-label={`${planName} · Switch plan`}
            title="Switch plan"
          >
            <span className="truncate">{planName}</span>
            <ChevronDown size={14} aria-hidden className="shrink-0 opacity-70" />
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {offerPhone && (
              <ViewSwitch
                to="phone"
                className="btn btn-ghost btn-sm gap-1"
                labelClassName="hidden md:inline"
              />
            )}
            <Link
              className="btn btn-secondary btn-sm gap-1"
              href="/add"
              aria-label="Add transaction"
              title="Add transaction"
            >
              <Plus size={16} aria-hidden />
              <span className="hidden md:inline">Add transaction</span>
            </Link>
            <HideAmountsToggle initiallyHidden={hideAmounts} />
            <ThemeToggle initiallyDark={dark} />
            <form action={appPath("/api/auth/logout")} method="post">
              <button
                className="icon-button"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={16} aria-hidden />
              </button>
            </form>
          </div>
        </header>
        <div className="mx-auto w-full max-w-canvas px-gutter lg:px-space-lg">
          <OutboxSync />
        </div>
        {children}
      </div>
    </div>
  );
}
