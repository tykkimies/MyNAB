import { z } from "zod";
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  APP_ORIGIN: z.url(),
  APP_BASE_PATH: z
    .string()
    .regex(/^(?:\/[a-zA-Z0-9_-]+)*$/)
    .default(""),
  DATABASE_URL: z.string().startsWith("postgresql://"),
  SECRET_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  // Provider access is optional; the application must run without any provider.
  PLAID_CLIENT_ID: z.string().min(1).max(64).optional(),
  PLAID_SECRET: z.string().min(1).max(128).optional(),
  PLAID_ENV: z.enum(["sandbox", "production"]).optional(),
  // Needed only for institutions that sign in through their own site (OAuth).
  // Must be registered with Plaid and point at /accounts/connections/oauth.
  PLAID_REDIRECT_URI: z.url().optional(),
  // How often the worker syncs each healthy connection, in hours.
  SYNC_INTERVAL_HOURS: z.coerce.number().int().min(1).max(168).default(6),
  // "Refresh from bank" calls Plaid's /transactions/refresh, a separate
  // per-call add-on that Plaid bills and the free tier does not include.
  // Off unless the owner opts in.
  PLAID_REFRESH: z.enum(["on", "off"]).default("off"),
  // Phone push for debt reminders through ntfy (https://ntfy.sh or a
  // self-hosted server). Off unless a topic is set. On a public server the
  // topic name is the only secret: make it long and random, or use a token.
  NTFY_URL: z.url().default("https://ntfy.sh"),
  NTFY_TOPIC: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional(),
  NTFY_TOKEN: z.string().min(1).max(200).optional(),
  // "minimal" sends the card and what kind of reminder only, no amounts: a
  // push passes through the ntfy server and the phone's lock screen.
  NTFY_DETAIL: z.enum(["minimal", "full"]).default("minimal"),
});
export type Config = z.infer<typeof schema>;
export function parseConfig(input: Record<string, string | undefined>): Config {
  // Compose passes an unset `${NAME:-}` as an empty string. Empty means unset,
  // so a deployment without a provider starts rather than failing validation.
  const result = schema.safeParse(
    Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        value === "" ? undefined : value,
      ]),
    ),
  );
  if (!result.success)
    throw new Error(
      `Invalid configuration: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  const config = result.data;
  const origin = new URL(config.APP_ORIGIN);
  if (origin.origin !== config.APP_ORIGIN || origin.username || origin.password)
    throw new Error("APP_ORIGIN must be an exact origin without a path");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (
    origin.protocol !== "https:" &&
    !(config.NODE_ENV !== "production" && local && origin.protocol === "http:")
  ) {
    throw new Error("APP_ORIGIN requires HTTPS (except local development)");
  }
  // All three or none. A half-configured provider must fail at startup, not at
  // the first sync, and an unrecognised environment must never fall back to a
  // default: silently using sandbox in production would look like working sync
  // while touching no real account, and the reverse would touch real accounts.
  const plaid = [config.PLAID_CLIENT_ID, config.PLAID_SECRET, config.PLAID_ENV];
  if (plaid.some(Boolean) && !plaid.every(Boolean))
    throw new Error(
      "Set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV together, or none of them",
    );
  if (
    config.PLAID_REDIRECT_URI &&
    config.PLAID_REDIRECT_URI !==
      `${config.APP_ORIGIN}${config.APP_BASE_PATH}/accounts/connections/oauth`
  )
    throw new Error(
      "PLAID_REDIRECT_URI must be APP_ORIGIN + APP_BASE_PATH + /accounts/connections/oauth",
    );
  return config;
}
export function plaidConfigured(config: Config): config is Config & {
  PLAID_CLIENT_ID: string;
  PLAID_SECRET: string;
  PLAID_ENV: "sandbox" | "production";
} {
  return Boolean(
    config.PLAID_CLIENT_ID && config.PLAID_SECRET && config.PLAID_ENV,
  );
}
export function getConfig(): Config {
  const config = parseConfig(process.env);
  if (
    process.env.NEXT_PUBLIC_BASE_PATH !== undefined &&
    config.APP_BASE_PATH !== process.env.NEXT_PUBLIC_BASE_PATH
  ) {
    throw new Error(
      "APP_BASE_PATH differs from the image build path; rebuild the image",
    );
  }
  return config;
}
