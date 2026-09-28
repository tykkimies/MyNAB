/**
 * Which presentation a request gets: the phone app or the desktop site. Pure,
 * so the proxy and the unit tests share one rule.
 *
 * The `mynab-view` cookie (set by the "Desktop site" / "Phone site" switch)
 * wins. Otherwise Chromium's low-entropy client hint decides, and failing that
 * the User-Agent: iPhones, iPods and Android phones are phones; iPads and
 * Android tablets (no "Mobile" token) get the desktop site.
 */
export type View = "phone" | "desktop";
export const VIEW_COOKIE = "mynab-view";
export const VIEW_HEADER = "x-mynab-view";
export const DEVICE_HEADER = "x-mynab-device";

export function phoneDevice(input: {
  userAgent?: string | null;
  chMobile?: string | null;
}): boolean {
  if (input.chMobile === "?1") return true;
  const ua = input.userAgent ?? "";
  if (/iPad/.test(ua)) return false;
  return /iPhone|iPod|Android.+Mobile|Windows Phone/.test(ua);
}

export function resolveView(input: {
  cookie?: string | null;
  userAgent?: string | null;
  chMobile?: string | null;
}): View {
  if (input.cookie === "phone" || input.cookie === "desktop")
    return input.cookie;
  return phoneDevice(input) ? "phone" : "desktop";
}

/**
 * Pages with a phone presentation; every other page shows "on the desktop
 * site" on a phone (owner decision 2026-09-28). `/accounts/<id>` is one
 * account's register; the Manage pages under /accounts are not.
 */
const PHONE_PAGES = ["/budget", "/accounts", "/accounts/register", "/add", "/debt", "/reports"];
const DESKTOP_ONLY_UNDER_ACCOUNTS = new Set([
  "schedules",
  "connections",
  "import",
  "export",
  "rules",
  "payees",
]);
export function phonePage(path: string): boolean {
  if (PHONE_PAGES.includes(path)) return true;
  const account = /^\/accounts\/([^/]+)$/.exec(path);
  return !!account && !DESKTOP_ONLY_UNDER_ACCOUNTS.has(account[1]);
}
