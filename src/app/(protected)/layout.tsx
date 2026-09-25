import Link from "next/link";
import { appPath } from "@/infrastructure/app-path";
import { cookies } from "next/headers";
import { LogOut, Plus, ShieldCheck } from "lucide-react";
import { requireUser } from "@/application/session";
import { openBudget } from "@/application/finance-page";
import { Navigation } from "@/components/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { HideAmountsToggle } from "@/components/hide-amounts-toggle";
import { OutboxSync } from "@/components/outbox-sync";
import { Brand } from "@/components/brand";
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const plan = await openBudget(user.userId).catch(() => {
    throw new Error("Workspace temporarily unavailable");
  });
  const jar = await cookies();
  const dark = jar.get("mynab-theme")?.value === "dark";
  const hideAmounts = jar.get("mynab-hide-amounts")?.value === "1";
  return (
    <div className="min-h-screen bg-canvas-paper">
      {/* First tabbable element on the page, and the suite tabs straight to it. */}
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-space-md focus:top-space-md focus:z-60 focus:rounded-md focus:border focus:border-border-warm focus:bg-surface-card focus:px-space-md focus:py-space-sm focus:font-body-md focus:text-body-md focus:shadow-level2"
        href="#main"
      >
        Skip to content
      </a>
      <aside className="border-b border-border-warm bg-surface-container-low px-gutter py-space-md lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:w-64 lg:flex-col lg:justify-between lg:border-b-0 lg:border-r lg:px-space-md lg:pb-space-md lg:pt-space-lg">
        <div className="flex flex-col">
          <Brand />
          <Link
            className="mt-space-xs self-start font-body-sm text-body-sm text-text-secondary underline underline-offset-2 lg:hidden"
            href="/plans"
          >
            {plan?.name ?? "Your budget"} · Switch plan
          </Link>
          <Link
            className="mt-space-xs self-start font-body-sm text-body-sm text-text-secondary underline underline-offset-2 lg:hidden"
            href="/guide"
          >
            Guide
          </Link>
          <div className="mb-space-lg mt-space-lg hidden flex-col rounded-lg bg-surface-container p-space-sm lg:flex">
            <span className="font-label-caps text-label-caps uppercase text-text-secondary">
              Your space
            </span>
            <span className="mt-space-xs font-label-sm text-label-sm font-semibold text-text-primary">
              {plan?.name ?? "Your budget"}
            </span>
            <span className="font-body-sm text-body-sm text-text-secondary">
              US dollars ·{" "}
              <Link
                className="font-semibold text-secondary underline underline-offset-2"
                href="/plans"
              >
                Switch plan
              </Link>
            </span>
            <span className="mt-space-xs font-body-sm text-body-sm text-text-secondary">
              <Link
                className="font-semibold text-secondary underline underline-offset-2"
                href="/household"
              >
                Household
              </Link>
              {" · "}
              <Link
                className="font-semibold text-secondary underline underline-offset-2"
                href="/guide"
              >
                Guide
              </Link>
            </span>
          </div>
          <div className="mb-space-sm mt-space-md hidden px-space-xs font-label-caps text-label-caps uppercase text-text-tertiary lg:block">
            Navigation
          </div>
          <div className="mt-space-md lg:mt-0">
            <Navigation />
          </div>
        </div>
        <div className="hidden flex-col gap-space-md lg:flex">
          <div className="flex items-center gap-space-sm rounded-lg bg-surface-container-lowest p-space-sm">
            <ShieldCheck size={20} className="text-secondary" aria-hidden />
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm font-medium text-text-primary">
                Your data. Your home.
              </span>
              <span className="font-body-sm text-body-sm text-text-tertiary">
                Local &amp; private storage
              </span>
            </div>
          </div>
          <div className="flex items-center gap-space-sm border-t border-border-warm pt-space-md">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary font-body-md text-body-md font-bold text-on-primary"
              aria-hidden
            >
              {user.username[0].toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-label-sm text-label-sm font-semibold leading-tight text-text-primary">
                {user.username}
              </span>
              <span className="font-body-sm text-body-sm leading-tight text-text-tertiary">
                Owner
              </span>
            </span>
          </div>
        </div>
      </aside>
      <div className="flex min-h-screen flex-col lg:pl-64 lg:pt-16">
        {/*
         * Stitch docks sign-out in the rail, but the rail's footer is hidden
         * below the desktop breakpoint, and the suite signs out at 390px too.
         * Keeping both controls here means exactly one "Dark theme" and one
         * "Sign out" button is in the accessibility tree at every width.
         */}
        <header className="flex h-16 items-center justify-between gap-space-sm border-b border-border-warm bg-canvas-paper/80 px-gutter backdrop-blur-xl lg:fixed lg:left-64 lg:right-0 lg:top-0 lg:z-40 lg:px-space-lg">
          <div className="flex min-w-0 items-center gap-space-md">
            <span className="truncate font-label-caps text-label-caps uppercase tracking-widest text-text-tertiary">
              Personal finance, with intention
            </span>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-status-ready-bg px-2.5 py-1 font-label-sm text-label-sm font-medium text-status-ready-text sm:flex">
              <span
                className="h-1.5 w-1.5 rounded-full bg-status-ready-text"
                aria-hidden
              />
              Private workspace
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-space-sm">
            <Link
              className="grid h-8 w-8 place-items-center rounded-md bg-surface-container text-text-secondary transition-colors hover:bg-surface-container-high hover:text-on-surface"
              href="/add"
              aria-label="Add transaction"
              title="Add transaction"
            >
              <Plus size={18} aria-hidden />
            </Link>
            <HideAmountsToggle initiallyHidden={hideAmounts} />
            <ThemeToggle initiallyDark={dark} />
            <form action={appPath("/api/auth/logout")} method="post">
              <button
                className="grid h-8 w-8 place-items-center rounded-md text-text-secondary transition-colors hover:bg-surface-container-high hover:text-on-surface"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={18} aria-hidden />
              </button>
            </form>
          </div>
        </header>
        <div className="mx-auto w-full max-w-canvas px-gutter lg:px-space-lg">
          <OutboxSync />
        </div>
        {children}
        <footer className="mt-auto flex flex-wrap justify-between gap-space-md px-gutter pb-space-lg pt-space-md font-body-sm text-body-sm text-text-tertiary lg:px-space-lg">
          <span>A little clarity. A little more possibility.</span>
          <span>MyNAB · Personal finance</span>
        </footer>
      </div>
    </div>
  );
}
