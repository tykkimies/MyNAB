"use client";
import { useState } from "react";
import { appPath } from "@/infrastructure/app-path";

/** Sends one test push, so the owner knows debt reminders will reach the phone. */
export function PushTest() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const response = await fetch(appPath("/api/provider"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "push.test" }),
            });
            const result = (await response.json().catch(() => ({}))) as {
              message?: string;
              error?: string;
            };
            setMessage(result.message ?? result.error ?? "That did not complete.");
          } catch {
            setMessage("That did not complete. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Send test notification
      </button>
      <span role="status" className="text-label text-ink-2">
        {message}
      </span>
    </span>
  );
}
