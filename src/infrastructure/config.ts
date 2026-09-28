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
  // How often the worker syncs each healthy connection, in hours.
  SYNC_INTERVAL_HOURS: z.coerce.number().int().min(1).max(168).default(6),
  // SimpleFIN Bridge bank sync. No server secret: each connection brings its
  // own access, claimed from a setup token the owner pastes in. On by default;
  // "off" hides it and stops its syncs.
  SIMPLEFIN: z.enum(["on", "off"]).default("on"),
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
  return config;
}
export function simplefinEnabled(config: Config) {
  return config.SIMPLEFIN === "on";
}
/** Any bank provider at all: the Bank sync pages and the worker's sync jobs. */
export function bankSyncConfigured(config: Config) {
  return simplefinEnabled(config);
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
