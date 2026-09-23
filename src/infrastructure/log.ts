export type EventCode =
  "request_failed" | "database_unavailable" | "owner_command_failed";
/** Deliberately accepts no payload/errors. Never serialize requests, secrets, or ORM errors. */
export function logEvent(event: EventCode): void {
  console.error(JSON.stringify({ event, time: new Date().toISOString() }));
}
