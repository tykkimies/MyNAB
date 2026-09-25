import { describe, expect, it } from "vitest";
import {
  createPlaidProvider,
  normalizeAmount,
  normalizeTransaction,
} from "@/infrastructure/providers/plaid";
import { ProviderError } from "@/infrastructure/providers/types";

const transaction = (over: Record<string, unknown> = {}) => ({
  transaction_id: "t1",
  pending_transaction_id: null,
  pending: false,
  date: "2026-03-05",
  amount: 12.34,
  iso_currency_code: "USD",
  name: "GROCER 221",
  merchant_name: "Grocer",
  account_id: "acct-1",
  ...over,
});

/** Records every request so the sign, paging and secret handling can be asserted. */
function stubFetch(pages: Record<string, unknown>[], status = 200) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  let index = 0;
  const impl = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push({ path: new URL(url).pathname, body });
    const payload = pages[Math.min(index++, pages.length - 1)];
    return new Response(JSON.stringify(payload), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const provider = (impl: typeof fetch) =>
  createPlaidProvider({
    clientId: "client",
    secret: "secret",
    environment: "sandbox",
    fetchImpl: impl,
  });

describe("Plaid adapter", () => {
  it("inverts the provider sign so an outflow is negative", () => {
    // Plaid reports a positive amount when money LEAVES the account.
    expect(normalizeAmount(12.34)).toBe(-1234n);
    expect(normalizeAmount(-50)).toBe(5000n);
    expect(normalizeTransaction(transaction()).amount).toBe(-1234n);
    expect(normalizeTransaction(transaction({ amount: -20.5 })).amount).toBe(
      2050n,
    );
  });

  it("converts float amounts to exact cents", () => {
    for (const [value, cents] of [
      [0.1, -10n],
      [0.07, -7n],
      [19.99, -1999n],
      [12345.67, -1234567n],
    ] as const)
      expect(normalizeAmount(value)).toBe(cents);
    expect(() => normalizeAmount(Number.NaN)).toThrow("not finite");
    expect(() => normalizeAmount(Number.POSITIVE_INFINITY)).toThrow();
    // Sub-cent precision is refused rather than rounded: (1.005).toFixed(2) is
    // "1.00" in JavaScript, which would lose money without saying so.
    for (const odd of [1.005, 0.001, 12.3456])
      expect(() => normalizeAmount(odd)).toThrow("exact number of cents");
  });

  it("prefers the merchant name and carries pending identity through", () => {
    expect(normalizeTransaction(transaction()).payee).toBe("Grocer");
    expect(
      normalizeTransaction(transaction({ merchant_name: null })).payee,
    ).toBe("GROCER 221");
    const pending = normalizeTransaction(
      transaction({ pending: true, pending_transaction_id: null }),
    );
    expect(pending.status).toBe("PENDING");
    expect(
      normalizeTransaction(transaction({ pending_transaction_id: "p1" }))
        .pendingExternalId,
    ).toBe("p1");
  });

  it("refuses a currency the ledger cannot represent", () => {
    expect(() =>
      normalizeTransaction(transaction({ iso_currency_code: "EUR" })),
    ).toThrow("Unsupported currency");
    expect(() =>
      normalizeTransaction(transaction({ date: "2026-02-30" })),
    ).toThrow();
  });

  it("fetches every page before returning, and returns the final cursor", async () => {
    const { impl, calls } = stubFetch([
      {
        added: [transaction({ transaction_id: "a" })],
        modified: [],
        removed: [],
        next_cursor: "c1",
        has_more: true,
      },
      {
        added: [transaction({ transaction_id: "b" })],
        modified: [],
        removed: [{ transaction_id: "gone" }],
        next_cursor: "c2",
        has_more: false,
      },
    ]);
    const batch = await provider(impl).sync("token", null);
    expect(batch.entries.map((e) => e.externalId)).toEqual(["a", "b"]);
    expect(batch.removed).toEqual(["gone"]);
    expect(batch.cursor).toBe("c2");
    // The second request must continue from the first page's cursor.
    expect(calls[1].body.cursor).toBe("c1");
    expect(calls).toHaveLength(2);
  });

  it("keeps the last copy when a row repeats across pages", async () => {
    const { impl } = stubFetch([
      {
        added: [transaction({ transaction_id: "a", amount: 10 })],
        modified: [],
        removed: [],
        next_cursor: "c1",
        has_more: true,
      },
      {
        added: [],
        modified: [transaction({ transaction_id: "a", amount: 11 })],
        removed: [],
        next_cursor: "c2",
        has_more: false,
      },
    ]);
    const batch = await provider(impl).sync("token", null);
    expect(batch.entries).toHaveLength(1);
    expect(batch.entries[0].amount).toBe(-1100n);
  });

  it("classifies a re-authentication error instead of leaking the response", async () => {
    const { impl } = stubFetch(
      [{ error_code: "ITEM_LOGIN_REQUIRED", request_id: "req-secret" }],
      400,
    );
    const failure = await provider(impl)
      .sync("token", null)
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ProviderError);
    expect((failure as ProviderError).code).toBe("REAUTH_REQUIRED");
    expect((failure as Error).message).not.toContain("req-secret");
  });

  it("sends credentials in the body and never in a URL or header", async () => {
    const { impl, calls } = stubFetch([{ link_token: "link-sandbox-1" }]);
    expect(await provider(impl).createLinkToken("owner-1")).toBe(
      "link-sandbox-1",
    );
    expect(calls[0].path).toBe("/link/token/create");
    expect(calls[0].body.client_id).toBe("client");
    expect(calls[0].body.secret).toBe("secret");
    expect(calls[0].body.user).toEqual({ client_user_id: "owner-1" });
  });

  it("opens update mode for an existing item without requesting products again", async () => {
    const { impl, calls } = stubFetch([
      { link_token: "link-a" },
      { link_token: "link-b" },
    ]);
    const plaid = provider(impl);
    await plaid.createLinkToken("owner-1");
    await plaid.createLinkToken("owner-1", { accessToken: "access-x" });
    expect(calls[0].body.products).toEqual(["transactions"]);
    expect(calls[0].body.access_token).toBeUndefined();
    expect(calls[1].body.access_token).toBe("access-x");
    expect(calls[1].body.products).toBeUndefined();
    expect(calls[0].body.redirect_uri).toBeUndefined();
    const { impl: withRedirect, calls: redirected } = stubFetch([
      { link_token: "link-c" },
    ]);
    await createPlaidProvider({
      clientId: "client",
      secret: "secret",
      environment: "sandbox",
      redirectUri: "https://money.example/accounts/connections/oauth",
      fetchImpl: withRedirect,
    }).createLinkToken("owner-1");
    expect(redirected[0].body.redirect_uri).toBe(
      "https://money.example/accounts/connections/oauth",
    );
  });

  it("refuses an environment it does not recognise", () => {
    expect(() =>
      createPlaidProvider({
        clientId: "c",
        secret: "s",
        environment: "development" as "sandbox",
      }),
    ).toThrow("Unknown Plaid environment");
  });
});
it("treats an empty cursor as no position rather than a real one", async () => {
  // A freshly linked item returns an empty cursor while Plaid assembles history.
  // Persisting it as a cursor would permanently skip that history.
  const { impl, calls } = stubFetch([
    { added: [], modified: [], removed: [], next_cursor: "", has_more: false },
  ]);
  const batch = await provider(impl).sync("token", null);
  expect(batch.cursor).toBeNull();
  expect(batch.entries).toEqual([]);
  expect(calls[0].body.cursor).toBeUndefined();
});

it("restarts every page from the original cursor after a pagination mutation", async () => {
  const calls: (string | undefined)[] = [];
  let n = 0;
  const impl = (async (_url: unknown, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)).cursor);
    n++;
    if (n === 2)
      return Response.json(
        { error_code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" },
        { status: 400 },
      );
    return Response.json({
      added: [
        transaction({ transaction_id: n === 1 ? "discarded" : "settled" }),
      ],
      modified: [],
      removed: [],
      next_cursor: n === 1 ? "intermediate" : "final",
      has_more: n === 1,
    });
  }) as typeof fetch;
  const batch = await provider(impl).sync("token", "original");
  expect(calls).toEqual(["original", "intermediate", "original"]);
  expect(batch.entries.map((e) => e.externalId)).toEqual(["settled"]);
});
it("rejects unknown currency and amounts above safe cent precision", () => {
  expect(() =>
    normalizeTransaction(transaction({ iso_currency_code: null })),
  ).toThrow("Unsupported currency");
  expect(() => normalizeAmount(Number.MAX_SAFE_INTEGER)).toThrow(
    "safe cent precision",
  );
});

describe("Plaid account balances", () => {
  it("records held money as positive and owed money as negative, in exact cents", async () => {
    const { impl, calls } = stubFetch([
      {
        accounts: [
          { account_id: "a", name: "Spend", mask: "9251", type: "depository", subtype: "checking", balances: { current: 8800.07, iso_currency_code: "USD" } },
          { account_id: "b", name: "Card", mask: "1", type: "credit", subtype: "credit card", balances: { current: 482.65, iso_currency_code: "USD" } },
          { account_id: "c", name: "Euro", mask: "2", type: "depository", subtype: "savings", balances: { current: 10, iso_currency_code: "EUR" } },
          { account_id: "d", name: "Unknown", mask: null, type: "depository", subtype: null, balances: { current: null, iso_currency_code: "USD" } },
        ],
      },
    ]);
    const accounts = await provider(impl).listAccounts("access");
    expect(calls[0].path).toBe("/accounts/get");
    expect(accounts.map((a) => a.currentBalance)).toEqual([880007n, -48265n, null, null]);
  });
});

