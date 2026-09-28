import { parseUSD } from "@/domain/money";
import { financialDate } from "@/domain/dates";
import type { NormalizedEntry } from "@/domain/ingestion";
import {
  ProviderError,
  type Connected,
  type DiscoveredAccount,
  type Provider,
  type ProviderBatch,
} from "./types";
import { windowDelta } from "./window-delta";

/**
 * SimpleFIN Bridge (https://www.simplefin.org/protocol.html). The owner links
 * banks on SimpleFIN's site and pastes a setup token here; claiming it once
 * returns an access URL carrying Basic credentials, which is stored like any
 * provider token. There is no cursor: each sync reads one window of recent
 * history for every account in a single request, and pending rows are
 * reconciled by `windowDelta`. Amounts are signed from the account's side
 * (positive is money in), which is MyNAB's own convention; nothing is flipped.
 */

/** Only SimpleFIN's own servers: a pasted token must never aim this server elsewhere. */
export const SIMPLEFIN_HOSTS = ["bridge.simplefin.org", "beta-bridge.simplefin.org"];
/** SimpleFIN recommends at most 45 days per request, and caps at 90. */
export const WINDOW_DAYS = 45;
export const MAX_HISTORY_DAYS = 89;
/** Days re-read before the last sync, for late posts and pending rows that settle. */
export const LOOKBACK_DAYS = 14;

export interface SimpleFinSettings {
  fetchImpl?: typeof fetch;
  hosts?: string[];
}

interface SfTransaction {
  id: string;
  posted?: number;
  amount: string;
  description?: string;
  payee?: string;
  memo?: string;
  transacted_at?: number;
  pending?: boolean;
}
interface SfAccount {
  id: string;
  name: string;
  currency?: string;
  balance?: string;
  "available-balance"?: string;
  "balance-date"?: number;
  conn_id?: string;
  org?: { name?: string; domain?: string };
  transactions?: SfTransaction[];
}
interface SfAccountSet {
  accounts?: SfAccount[];
  connections?: { conn_id: string; name?: string; org_id?: string }[];
  errors?: unknown[];
  errlist?: { code?: string; msg?: string; message?: string; conn_id?: string }[];
}

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const epoch = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);

/**
 * SimpleFIN amounts are decimal strings, sometimes with leading zeros
 * ("-05.50") or trailing zeros past the cent. Anything finer than a cent, or
 * not a number at all, is refused rather than rounded.
 */
export function simplefinAmount(value: string): bigint {
  const match = /^([+-]?)0*(\d*)(?:\.(\d+))?$/.exec(
    typeof value === "string" ? value.trim() : "",
  );
  if (!match || (!match[2] && !match[3])) throw new Error("Invalid provider amount");
  const [, sign, whole, fraction = ""] = match;
  if (fraction.length > 2 && !/^0+$/.test(fraction.slice(2)))
    throw new Error("Provider amount is not an exact number of cents");
  return parseUSD(
    `${sign === "-" ? "-" : ""}${whole || "0"}.${fraction.slice(0, 2).padEnd(2, "0")}`,
  );
}

/** The calendar date of an instant in the budget's time zone. */
export function localDate(seconds: number, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(seconds * 1000));
}

/** SimpleFIN does not report account types; read one from the name. */
export function guessType(name: string, balance: bigint | null) {
  if (/credit|card|visa|mastercard|amex|american express|discover/i.test(name))
    return "credit card";
  if (/line of credit|\bheloc\b/i.test(name)) return "line of credit";
  if (/saving|money market/i.test(name)) return "savings";
  if (/mortgage|loan/i.test(name)) return "loan";
  if (/brokerage|ira\b|401|roth|invest/i.test(name)) return "investment";
  if (/checking/i.test(name)) return "checking";
  return balance !== null && balance < 0n ? "credit card" : "checking";
}

function checkedUrl(value: string, hosts: string[], credentials: boolean) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("That is not a SimpleFIN setup token.");
  }
  if (url.protocol !== "https:" || !hosts.includes(url.hostname))
    throw new Error("That token does not point at SimpleFIN Bridge.");
  if (credentials && (!url.username || !url.password))
    throw new Error("SimpleFIN did not return an access address.");
  return url;
}

/** What SimpleFIN says needs attention, in both the old and new formats. */
export function simplefinMessages(set: SfAccountSet) {
  const out: string[] = [];
  for (const e of set.errlist ?? []) {
    const text = e.msg ?? e.message ?? e.code;
    if (text) out.push(String(text).slice(0, 200));
  }
  for (const e of set.errors ?? [])
    if (typeof e === "string") out.push(e.slice(0, 200));
    else if (e && typeof e === "object" && "msg" in e) out.push(String(e.msg).slice(0, 200));
  return [...new Set(out)];
}

export function createSimpleFinProvider(settings: SimpleFinSettings = {}): Provider {
  const send = settings.fetchImpl ?? fetch;
  const hosts = settings.hosts ?? SIMPLEFIN_HOSTS;

  async function accounts(accessUrl: string, query: Record<string, string>) {
    const url = checkedUrl(accessUrl, hosts, true);
    const auth = Buffer.from(
      `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`,
    ).toString("base64");
    const target = `${url.origin}${url.pathname.replace(/\/+$/, "")}/accounts?${new URLSearchParams(query)}`;
    let response: Response;
    try {
      response = await send(target, {
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new ProviderError("UNAVAILABLE", "SimpleFIN could not be reached");
    }
    // 403: access revoked; 402: the subscription lapsed. Both need the owner.
    if (response.status === 403 || response.status === 402)
      throw new ProviderError("REAUTH_REQUIRED", "SimpleFIN needs attention");
    if (response.status === 429)
      throw new ProviderError("RATE_LIMITED", "SimpleFIN request limit reached");
    if (response.status >= 500)
      throw new ProviderError("UNAVAILABLE", "SimpleFIN is unavailable");
    if (!response.ok)
      throw new Error(`SimpleFIN request failed: ${response.status}`);
    return (await response.json()) as SfAccountSet;
  }

  const institutionOf = (set: SfAccountSet, a: SfAccount) =>
    a.org?.name ??
    set.connections?.find((c) => c.conn_id === a.conn_id)?.name ??
    "";
  const usd = (a: SfAccount) => !a.currency || a.currency === "USD";

  return {
    name: "SIMPLEFIN",
    async exchange(completion) {
      const decoded = Buffer.from(
        completion.setupToken.trim(),
        "base64",
      ).toString("utf8");
      const claimUrl = checkedUrl(decoded, hosts, false);
      if (!claimUrl.pathname.includes("/claim/"))
        throw new Error("That is not a SimpleFIN setup token.");
      let response: Response;
      try {
        response = await send(claimUrl.toString(), {
          method: "POST",
          headers: { "Content-Length": "0" },
          redirect: "error",
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new ProviderError("UNAVAILABLE", "SimpleFIN could not be reached");
      }
      if (response.status === 403)
        throw new Error(
          "That setup token was already used or has expired. Create a new one on SimpleFIN Bridge.",
        );
      if (!response.ok) throw new Error(`SimpleFIN claim failed: ${response.status}`);
      const accessUrl = (await response.text()).trim();
      checkedUrl(accessUrl, hosts, true);
      return {
        accessToken: accessUrl,
        itemId: "",
        institutionId: "simplefin",
        institutionName: "SimpleFIN Bridge",
      } satisfies Connected;
    },
    async listAccounts(accessUrl) {
      const set = await accounts(accessUrl, { "balances-only": "1" });
      return (set.accounts ?? []).map((a) => {
        const balance =
          usd(a) && a.balance !== undefined ? simplefinAmount(a.balance) : null;
        const institution = institutionOf(set, a);
        const name = institution ? `${institution} ${a.name}` : a.name;
        return {
          externalAccountId: a.id.slice(0, 128),
          name: name.slice(0, 120),
          mask: /(\d{4})\D*$/.exec(a.name)?.[1] ?? "",
          type: guessType(a.name, balance),
          currentBalance: balance,
        } satisfies DiscoveredAccount;
      });
    },
    async sync(accessUrl, cursor, context) {
      const today = context?.today ?? new Date().toISOString().slice(0, 10);
      const timezone = context?.timezone ?? "UTC";
      const linked = context?.accounts ?? [];
      const earliest = linked.map((a) => a.linkedFrom).sort()[0] ?? today;
      const floor = addDays(today, -MAX_HISTORY_DAYS);
      const wanted = cursor ? addDays(cursor, -LOOKBACK_DAYS) : earliest;
      const start = [wanted, earliest, floor].sort().at(-1)!;
      // One request covers every account; long first syncs take two windows.
      const rows = new Map<string, SfTransaction & { account: string }>();
      const reported = new Set<string>();
      const warnings: string[] = [];
      for (let from = start; from <= today; from = addDays(from, WINDOW_DAYS)) {
        const through = [addDays(from, WINDOW_DAYS), addDays(today, 1)].sort()[0];
        const set = await accounts(accessUrl, {
          pending: "1",
          "start-date": String(epoch(from)),
          "end-date": String(epoch(through)),
        });
        warnings.push(...simplefinMessages(set));
        for (const a of set.accounts ?? []) {
          if (!usd(a)) continue;
          reported.add(a.id);
          for (const t of a.transactions ?? [])
            rows.set(`${a.id}\u0000${t.id}`, { ...t, account: a.id });
        }
      }
      const entries: NormalizedEntry[] = [];
      const removed: string[] = [];
      for (const account of linked) {
        // An account the bank did not report this time keeps its pending rows.
        if (!reported.has(account.externalAccountId)) continue;
        const since = account.linkedFrom > start ? account.linkedFrom : start;
        const own: NormalizedEntry[] = [];
        for (const t of rows.values()) {
          if (t.account !== account.externalAccountId) continue;
          const pending = t.pending === true;
          const instant = (pending ? t.transacted_at || t.posted : t.posted || t.transacted_at) ?? 0;
          if (!instant) continue;
          const date = localDate(instant, timezone);
          financialDate(date);
          const amount = simplefinAmount(t.amount);
          if (amount === 0n) continue;
          own.push({
            externalId: t.id.slice(0, 128),
            status: pending ? "PENDING" : "POSTED",
            externalAccountId: account.externalAccountId,
            date,
            amount,
            payee: (t.payee || t.description || "").trim().slice(0, 120),
          });
        }
        const delta = windowDelta(own, account.externalAccountId, since, context?.pending ?? []);
        entries.push(...delta.entries);
        removed.push(...delta.removed);
      }
      return {
        entries,
        removed,
        cursor: today,
        warnings: [...new Set(warnings)],
      } satisfies ProviderBatch;
    },
    async disconnect() {
      // Access is revoked on SimpleFIN Bridge; MyNAB forgets its copy.
    },
  };
}
