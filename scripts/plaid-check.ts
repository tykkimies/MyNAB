/**
 * Manual provider verification. Proves configured credentials and the adapter
 * work end to end against Plaid's synthetic sandbox institution: no real bank,
 * no database, and nothing written to the ledger.
 *
 * Usage: node --env-file=.env --import tsx scripts/plaid-check.ts
 *
 * Refuses to run outside sandbox. Tokens are never printed.
 */
import { createPlaidProvider } from "../src/infrastructure/providers/plaid";
import { parseConfig, plaidConfigured } from "../src/infrastructure/config";
import { formatUSD, money } from "../src/domain/money";
import { ProviderError } from "../src/infrastructure/providers/types";

const config = parseConfig(process.env);
if (!plaidConfigured(config))
  throw new Error("Set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV first");
if (config.PLAID_ENV !== "sandbox")
  throw new Error("This check creates throwaway items and is sandbox only");

const provider = createPlaidProvider({
  clientId: config.PLAID_CLIENT_ID,
  secret: config.PLAID_SECRET,
  environment: config.PLAID_ENV,
});

// Sandbox mints a public token directly, so Link is not needed to exercise this.
const response = await fetch(
  "https://sandbox.plaid.com/sandbox/public_token/create",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.PLAID_CLIENT_ID,
      secret: config.PLAID_SECRET,
      institution_id: "ins_109508",
      initial_products: ["transactions"],
    }),
  },
);
const created = (await response.json()) as {
  public_token?: string;
  error_code?: string;
};
if (!response.ok || !created.public_token)
  throw new Error(`Sandbox token request failed: ${created.error_code}`);

const link = await provider.createLinkToken("sandbox-check");
console.log(
  `link token:   ${link.startsWith("link-") ? "created" : "unexpected format"}`,
);

const connection = await provider.exchange(created.public_token);
console.log(
  `institution:  ${connection.institutionName} (${connection.institutionId})`,
);
console.log(
  `access token: ${connection.accessToken ? "received, not printed" : "MISSING"}`,
);

const accounts = await provider.listAccounts(connection.accessToken);
console.log(`accounts:     ${accounts.length}`);

try {
  // A new item reports nothing until Plaid has assembled history.
  let batch = await provider.sync(connection.accessToken, null);
  for (let attempt = 0; attempt < 20 && !batch.entries.length; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    batch = await provider.sync(connection.accessToken, null);
  }
  console.log(
    `first sync:   ${batch.entries.length} entries, cursor ${batch.cursor ? "received" : "not yet issued"}`,
  );
  for (const entry of batch.entries.slice(0, 5))
    console.log(
      `   ${entry.date}  ${formatUSD(money(entry.amount)).padStart(11)}  ${entry.status.padEnd(7)} ${entry.payee}`,
    );

  // Plaid delivers recent history first and older history afterwards, so an
  // incremental sync converges over several rounds rather than in one call.
  let cursor = batch.cursor;
  let total = batch.entries.length;
  for (let round = 1; round <= 12; round++) {
    const next = await provider.sync(connection.accessToken, cursor);
    if (!next.entries.length && !next.removed.length) {
      console.log(
        `converged after ${round} incremental sync(s); ${total} entries total`,
      );
      break;
    }
    console.log(
      `   round ${round}: +${next.entries.length} entries, ${next.removed.length} removed`,
    );
    cursor = next.cursor;
    total += next.entries.length;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  const outflows = batch.entries.filter((e) => e.amount < 0n).length;
  console.log(
    `signs:        ${outflows} outflow(s) negative, ${batch.entries.length - outflows} inflow(s) positive`,
  );

  // Force the sign-in failure a real bank produces, then prove the adapter
  // reports it as REAUTH_REQUIRED and that Plaid accepts an update-mode token.
  const reset = await fetch(
    "https://sandbox.plaid.com/sandbox/item/reset_login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: config.PLAID_CLIENT_ID,
        secret: config.PLAID_SECRET,
        access_token: connection.accessToken,
      }),
    },
  );
  if (!reset.ok) throw new Error(`Sandbox reset_login failed: ${reset.status}`);
  const code = await provider
    .sync(connection.accessToken, cursor)
    .then(() => "no error")
    .catch((error: unknown) =>
      error instanceof ProviderError ? error.code : "unexpected failure",
    );
  console.log(`reauth:       sync after reset_login reports ${code}`);
  const update = await provider.createLinkToken("sandbox-check", {
    accessToken: connection.accessToken,
  });
  console.log(
    `update mode:  ${update.startsWith("link-") ? "link token created" : "unexpected format"}`,
  );
} finally {
  await provider.disconnect(connection.accessToken);
  console.log("disconnect:   ok, sandbox item removed");
}
