import type { ReactNode } from "react";
import { Check, ChevronDown, LogOut, Monitor } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { appPath } from "@/infrastructure/app-path";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { HideAmountsToggle } from "@/components/hide-amounts-toggle";
import { OutboxSync } from "@/components/outbox-sync";
import { PopoverKeys } from "@/components/ui/popover-keys";
import { Popover } from "@/components/ui/popover";
import { ViewSwitch } from "@/components/view-switch";
import { PhoneTabBar } from "./tab-bar";
import { PhoneGate } from "./gate";

/**
 * The phone app's frame (owner decision 2026-09-28): a slim top bar with the
 * plan name and an account menu, the page, and a bottom tab bar. It replaces
 * the rail and toolbar of the desktop shell; pages outside the phone areas
 * render `PhoneDesktopOnly` instead of their content.
 */
export function PhoneShell({
  planName,
  planId,
  plans,
  username,
  role,
  dark,
  hideAmounts,
  unapproved,
  children,
}: {
  planName: string;
  planId: string | null;
  /** Every plan the user belongs to, for the switcher. */
  plans: { id: string; name: string }[];
  username: string;
  role: string;
  dark: boolean;
  hideAmounts: boolean;
  unapproved: number;
  children: ReactNode;
}) {
  return (
    <div data-shell data-phone className="phone-shell">
      <PopoverKeys />
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60 focus:rounded-md focus:border focus:border-hairline focus:bg-surface focus:px-4 focus:py-2 focus:text-body focus:shadow-pop"
        href="#main"
      >
        Skip to content
      </a>
      <header className="phone-topbar">
        <Brand />
        <div className="min-w-0 flex-1">
          {/* Keyed by the open plan, so it closes once a switch lands. */}
          <Popover
            key={planId}
            chevron={false}
            className="phone-plan"
            summaryClassName="phone-plan-button"
            label={`${planName} · Switch plan`}
            summary={
              <>
                <span className="truncate">{planName}</span>
                <ChevronDown size={14} aria-hidden className="shrink-0 opacity-70" />
              </>
            }
          >
            <h2 className="px-1 pb-2">Switch plan</h2>
            <ul className="flex flex-col">
              {plans.map((plan) => (
                <li key={plan.id}>
                  {plan.id === planId ? (
                    <span className="phone-plan-option" aria-current="true">
                      <span className="truncate">{plan.name}</span>
                      <Check size={16} aria-label="Open now" />
                    </span>
                  ) : (
                    <ActionForm action={appPath("/api/plans")}>
                      <input type="hidden" name="intent" value="select" />
                      <input type="hidden" name="budgetId" value={plan.id} />
                      <button type="submit" className="phone-plan-option">
                        <span className="truncate">Open {plan.name}</span>
                      </button>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          </Popover>
        </div>
        <Popover
          align="right"
          chevron={false}
          className="phone-account"
          summaryClassName="phone-avatar"
          label="Account and settings"
          summary={<span aria-hidden>{username[0]?.toUpperCase()}</span>}
        >
          <div className="flex min-w-60 flex-col gap-1">
            <div className="flex flex-col px-1 pb-2">
              <span className="text-label text-ink">{username}</span>
              <span className="text-meta text-ink-3">{role}</span>
            </div>
            <div className="phone-setting">
              <span>Dark theme</span>
              <ThemeToggle initiallyDark={dark} />
            </div>
            <div className="phone-setting">
              <span>Hide amounts</span>
              <HideAmountsToggle initiallyHidden={hideAmounts} />
            </div>
            <div className="mt-2 flex flex-col gap-2 border-t border-hairline pt-3">
              <ViewSwitch to="desktop" className="btn btn-secondary w-full" />
              <form action={appPath("/api/auth/logout")} method="post">
                <button className="btn btn-ghost w-full" type="submit">
                  <LogOut size={16} aria-hidden />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </Popover>
      </header>
      <div className="px-gutter">
        <OutboxSync />
      </div>
      <PhoneGate fallback={<PhoneDesktopOnly />}>{children}</PhoneGate>
      <PhoneTabBar unapproved={unapproved} />
    </div>
  );
}

/** What a phone shows for a page that lives on the desktop site only. */
export function PhoneDesktopOnly() {
  return (
    <main
      id="main"
      className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center"
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-sunken text-ink-2">
        <Monitor size={22} aria-hidden />
      </span>
      <h1 className="text-page-title text-ink">On the desktop site</h1>
      <p className="max-w-xs text-body text-ink-2">
        This page is part of the full site. Open it on a computer, or switch
        this phone to the desktop site.
      </p>
      <ViewSwitch to="desktop" />
    </main>
  );
}
