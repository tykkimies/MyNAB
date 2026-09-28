import { describe, expect, it } from "vitest";
import {
  createSimpleFinProvider,
  guessType,
  localDate,
  simplefinAmount,
  simplefinMessages,
} from "@/infrastructure/providers/simplefin";
import { windowDelta } from "@/infrastructure/providers/window-delta";
import { ProviderError } from "@/infrastructure/providers/types";

const ACCESS = "https://user:secret@beta-bridge.simplefin.org/simplefin";
const at = (date: string, hour = 17) => Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`) / 1000;
type Call = { url: string; init?: RequestInit };
function fake(respond: (url: URL, init?: RequestInit) => Response) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url: String(input), init });
    return respond(url, init);
  }) as typeof fetch;
  return { calls, fetchImpl };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const accountSet = (transactions: unknown[], extra: Record<string, unknown> = {}) => ({
  errors: [],
  accounts: [
    {
      id: "ACT-chk",
      name: "Everyday Checking 1234",
      currency: "USD",
      balance: "1500.25",
      "available-balance": "1400.25",
      "balance-date": at("2026-09-28"),
      org: { name: "PNC", domain: "pnc.com" },
      transactions,
    },
    {
      id: "ACT-card",
      name: "Sapphire Visa 9876",
      currency: "USD",
      balance: "-240.00",
      "balance-date": at("2026-09-28"),
      org: { name: "Chase" },
      transactions: [],
    },
  ],
  ...extra,
});

describe("SimpleFIN provider", () => {
  it("reads amounts exactly, leading zeros included, and refuses sub-cent values", () => {
    expect(simplefinAmount("-05.50")).toBe(-550n);
    expect(simplefinAmount("1960.00")).toBe(196000n);
    expect(simplefinAmount("12.5")).toBe(1250n);
    expect(simplefinAmount("+3")).toBe(300n);
    expect(simplefinAmount("-0.07")).toBe(-7n);
    expect(simplefinAmount("4.100")).toBe(410n);
    expect(() => simplefinAmount("1.234")).toThrow("exact number of cents");
    expect(() => simplefinAmount("abc")).toThrow();
    expect(() => simplefinAmount("")).toThrow();
  });

  it("dates an instant in the budget's time zone", () => {
    // 02:00 UTC on the 6th is still the evening of the 5th in New York.
    expect(localDate(at("2026-03-06", 2), "America/New_York")).toBe("2026-03-05");
    expect(localDate(at("2026-03-06", 2), "UTC")).toBe("2026-03-06");
  });

  it("guesses account types from their names, then their balance", () => {
    expect(guessType("Sapphire Visa", null)).toBe("credit card");
    expect(guessType("High Yield Savings", 100n)).toBe("savings");
    expect(guessType("Everyday Checking", 100n)).toBe("checking");
    expect(guessType("Mystery", -500n)).toBe("credit card");
  });

  it("claims a setup token only from SimpleFIN's own servers", async () => {
    const { calls, fetchImpl } = fake((url, init) => {
      expect(init?.method).toBe("POST");
      expect(url.pathname).toBe("/simplefin/claim/DEMO-1");
      return new Response(ACCESS);
    });
    const provider = createSimpleFinProvider({ fetchImpl });
    const token = Buffer.from("https://beta-bridge.simplefin.org/simplefin/claim/DEMO-1").toString("base64");
    expect(await provider.exchange({ setupToken: token })).toEqual({
      accessToken: ACCESS,
      itemId: "",
      institutionId: "simplefin",
      institutionName: "SimpleFIN Bridge",
    });
    expect(calls).toHaveLength(1);
    const evil = Buffer.from("https://attacker.example/simplefin/claim/x").toString("base64");
    await expect(provider.exchange({ setupToken: evil })).rejects.toThrow("SimpleFIN Bridge");
    const plain = Buffer.from("http://beta-bridge.simplefin.org/simplefin/claim/x").toString("base64");
    await expect(provider.exchange({ setupToken: plain })).rejects.toThrow("SimpleFIN Bridge");
    // An access address pointing elsewhere is refused too.
    const bad = createSimpleFinProvider({ fetchImpl: fake(() => new Response("https://u:p@attacker.example/x")).fetchImpl });
    await expect(bad.exchange({ setupToken: token })).rejects.toThrow("SimpleFIN Bridge");
    const used = createSimpleFinProvider({ fetchImpl: fake(() => new Response("", { status: 403 })).fetchImpl });
    await expect(used.exchange({ setupToken: token })).rejects.toThrow("already used");
  });

  it("lists accounts with their bank, mask, guessed type and balance, sending credentials as a header", async () => {
    const { calls, fetchImpl } = fake(() => json(accountSet([])));
    const provider = createSimpleFinProvider({ fetchImpl });
    expect(await provider.listAccounts(ACCESS)).toEqual([
      { externalAccountId: "ACT-chk", name: "PNC Everyday Checking 1234", mask: "1234", type: "checking", currentBalance: 150025n },
      { externalAccountId: "ACT-card", name: "Chase Sapphire Visa 9876", mask: "9876", type: "credit card", currentBalance: -24000n },
    ]);
    expect(calls[0].url).toBe("https://beta-bridge.simplefin.org/simplefin/accounts?balances-only=1");
    expect(calls[0].url).not.toContain("secret");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("user:secret").toString("base64")}`,
    );
  });

  it("syncs one window for all accounts, with pending rows, dated in the budget's zone", async () => {
    const { calls, fetchImpl } = fake(() =>
      json(
        accountSet([
          { id: "T1", posted: at("2026-09-20"), amount: "-12.34", description: "COFFEE 123", payee: "Coffee Co" },
          { id: "P1", posted: 0, transacted_at: at("2026-09-27"), amount: "-9.99", description: "Pending grocer", pending: true },
          { id: "OLD", posted: at("2026-08-01"), amount: "-1.00", description: "Before link" },
        ]),
      ),
    );
    const provider = createSimpleFinProvider({ fetchImpl });
    const batch = await provider.sync(ACCESS, null, {
      today: "2026-09-28",
      timezone: "America/New_York",
      accounts: [{ externalAccountId: "ACT-chk", linkedFrom: "2026-09-01" }],
      pending: [],
    });
    const url = new URL(calls[0].url);
    expect(url.searchParams.get("pending")).toBe("1");
    expect(url.searchParams.get("start-date")).toBe(String(Date.parse("2026-09-01T00:00:00Z") / 1000));
    expect(calls).toHaveLength(1);
    expect(batch.cursor).toBe("2026-09-28");
    expect(batch.entries).toEqual([
      { externalId: "T1", status: "POSTED", externalAccountId: "ACT-chk", date: "2026-09-20", amount: -1234n, payee: "Coffee Co" },
      { externalId: "P1", status: "PENDING", externalAccountId: "ACT-chk", date: "2026-09-27", amount: -999n, payee: "Pending grocer" },
      // Filtering by link date is the planner's job; the row is still reported.
      { externalId: "OLD", status: "POSTED", externalAccountId: "ACT-chk", date: "2026-08-01", amount: -100n, payee: "Before link" },
    ]);
    // The unlinked card is never turned into entries.
    expect(batch.entries.some((e) => e.externalAccountId === "ACT-card")).toBe(false);
    // But every reported account is listed, so one added at SimpleFIN later appears.
    expect(batch.accounts?.map((a) => [a.externalAccountId, a.name, a.type])).toEqual([
      ["ACT-chk", "PNC Everyday Checking 1234", "checking"],
      ["ACT-card", "Chase Sapphire Visa 9876", "credit card"],
    ]);
  });

  it("keeps pending rows that carry no date, or only posted: 0", async () => {
    const { fetchImpl } = fake(() =>
      json(
        accountSet([
          { id: "P-undated", posted: 0, amount: "-4.25", description: "Gas station" },
          { id: "P-noflag", posted: 0, transacted_at: at("2026-09-26"), amount: "-8.00", description: "Deli" },
        ]),
      ),
    );
    const batch = await createSimpleFinProvider({ fetchImpl }).sync(ACCESS, null, {
      today: "2026-09-28",
      timezone: "UTC",
      accounts: [{ externalAccountId: "ACT-chk", linkedFrom: "2026-09-01" }],
      pending: [],
    });
    expect(batch.entries).toEqual([
      // Dated as of the account's balance when the bank gives no date.
      expect.objectContaining({ externalId: "P-undated", status: "PENDING", date: "2026-09-28", amount: -425n }),
      expect.objectContaining({ externalId: "P-noflag", status: "PENDING", date: "2026-09-26", amount: -800n }),
    ]);
  });

  it("reads a long first sync in windows of at most 45 days, never past 90 days back", async () => {
    const { calls, fetchImpl } = fake(() => json(accountSet([])));
    await createSimpleFinProvider({ fetchImpl }).sync(ACCESS, null, {
      today: "2026-09-28",
      timezone: "UTC",
      accounts: [{ externalAccountId: "ACT-chk", linkedFrom: "2025-01-01" }],
      pending: [],
    });
    const windows = calls.map((c) => new URL(c.url).searchParams);
    expect(windows).toHaveLength(2);
    const day = (p: URLSearchParams, k: string) => new Date(Number(p.get(k)) * 1000).toISOString().slice(0, 10);
    expect(day(windows[0], "start-date")).toBe("2026-07-01");
    for (const w of windows)
      expect(Number(w.get("end-date")) - Number(w.get("start-date"))).toBeLessThanOrEqual(45 * 86400);
    // Later syncs re-read two weeks before the last one.
    const later = fake(() => json(accountSet([])));
    await createSimpleFinProvider({ fetchImpl: later.fetchImpl }).sync(ACCESS, "2026-09-27", {
      today: "2026-09-28",
      timezone: "UTC",
      accounts: [{ externalAccountId: "ACT-chk", linkedFrom: "2025-01-01" }],
      pending: [],
    });
    expect(day(new URL(later.calls[0].url).searchParams, "start-date")).toBe("2026-09-13");
  });

  it("withdraws vanished pending rows only for accounts the bank reported, and passes warnings on", async () => {
    const { fetchImpl } = fake(() =>
      json({
        errlist: [{ code: "con.auth", msg: "Chase needs you to sign in again", conn_id: "CON-1" }],
        accounts: [
          {
            id: "ACT-chk",
            name: "Checking",
            currency: "USD",
            balance: "10.00",
            transactions: [{ id: "NEW", posted: at("2026-09-22"), amount: "-25.00", description: "Grocer" }],
          },
        ],
      }),
    );
    const batch = await createSimpleFinProvider({ fetchImpl }).sync(ACCESS, "2026-09-27", {
      today: "2026-09-28",
      timezone: "UTC",
      accounts: [
        { externalAccountId: "ACT-chk", linkedFrom: "2026-09-01" },
        { externalAccountId: "ACT-card", linkedFrom: "2026-09-01" },
      ],
      pending: [
        { externalId: "OLDP", externalAccountId: "ACT-chk", amount: -2500n, date: "2026-09-20" },
        { externalId: "GONE", externalAccountId: "ACT-chk", amount: -700n, date: "2026-09-21" },
        { externalId: "CARDP", externalAccountId: "ACT-card", amount: -100n, date: "2026-09-21" },
      ],
    });
    expect(batch.entries).toEqual([
      expect.objectContaining({ externalId: "NEW", pendingExternalId: "OLDP" }),
    ]);
    // The card did not answer, so its pending row stays.
    expect(batch.removed).toEqual(["GONE"]);
    expect(batch.warnings).toEqual(["Chase needs you to sign in again"]);
  });

  it("maps revoked access, lapsed subscriptions, limits and outages", async () => {
    const status = async (code: number) => {
      try {
        await createSimpleFinProvider({ fetchImpl: fake(() => new Response("", { status: code })).fetchImpl }).listAccounts(ACCESS);
      } catch (error) {
        return error instanceof ProviderError ? error.code : "ERROR";
      }
    };
    expect(await status(403)).toBe("REAUTH_REQUIRED");
    expect(await status(402)).toBe("REAUTH_REQUIRED");
    expect(await status(429)).toBe("RATE_LIMITED");
    expect(await status(503)).toBe("UNAVAILABLE");
    expect(await status(400)).toBe("ERROR");
    await expect(
      createSimpleFinProvider({ fetchImpl: fake(() => json({})).fetchImpl }).listAccounts("https://u:p@attacker.example/x"),
    ).rejects.toThrow("SimpleFIN Bridge");
  });

  it("reads both old and new error formats", () => {
    expect(simplefinMessages({ errors: ["Old style"], errlist: [{ code: "gen.x", msg: "New style" }] })).toEqual([
      "New style",
      "Old style",
    ]);
  });
});

describe("window delta", () => {
  it("keeps pending rows outside the window and never links a known row", () => {
    const rows = [
      { externalId: "K", status: "POSTED" as const, externalAccountId: "A", date: "2026-09-22", amount: -500n, payee: "" },
    ];
    const out = windowDelta(rows, "A", "2026-09-15", [
      { externalId: "K", externalAccountId: "A", amount: -500n, date: "2026-09-20" },
      { externalId: "OLD", externalAccountId: "A", amount: -500n, date: "2026-09-01" },
    ]);
    expect(out.entries[0].pendingExternalId).toBeUndefined();
    expect(out.removed).toEqual([]);
  });
});
