import type { Config } from "./config";

/**
 * Phone push through ntfy's JSON publish API. The only outbound call is this
 * one POST; nothing is read back. Never called inside a financial
 * transaction.
 */
export interface PushMessage {
  title: string;
  message: string;
  /** Opened when the notification is tapped. */
  click?: string;
  urgent?: boolean;
}

export function pushConfigured(
  config: Config,
): config is Config & { NTFY_TOPIC: string } {
  return Boolean(config.NTFY_TOPIC);
}

export async function sendPush(
  config: Config,
  push: PushMessage,
  fetchImpl: typeof fetch = fetch,
) {
  if (!pushConfigured(config)) throw new Error("Push is not configured");
  const response = await fetchImpl(config.NTFY_URL.replace(/\/+$/, ""), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.NTFY_TOKEN
        ? { Authorization: `Bearer ${config.NTFY_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({
      topic: config.NTFY_TOPIC,
      title: push.title,
      message: push.message,
      ...(push.click ? { click: push.click } : {}),
      priority: push.urgent ? 4 : 3,
      tags: [push.urgent ? "warning" : "credit_card"],
    }),
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  // The status only; a response body could echo the topic or token.
  if (!response.ok) throw new Error(`Push failed with HTTP ${response.status}`);
}
