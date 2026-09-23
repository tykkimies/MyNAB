import { z } from "zod";
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  APP_ORIGIN: z.url(),
  DATABASE_URL: z.string().startsWith("postgresql://"),
  SECRET_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
});
export type Config = z.infer<typeof schema>;
export function parseConfig(input: Record<string, string | undefined>): Config {
  const result = schema.safeParse(input);
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
export function getConfig(): Config {
  return parseConfig(process.env);
}
