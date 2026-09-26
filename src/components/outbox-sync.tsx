"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { appPath } from "@/infrastructure/app-path";
import { OUTBOX_EVENT, readOutbox, writeOutbox } from "@/components/outbox";

/** Sends entries saved offline once the connection is back. */
export function OutboxSync() {
  const router = useRouter();
  const [waiting, setWaiting] = useState(0);
  const [refused, setRefused] = useState<string[]>([]);
  useEffect(() => {
    let sending = false;
    const refresh = () => setWaiting(readOutbox().length);
    const drain = async () => {
      if (sending || !navigator.onLine) return refresh();
      sending = true;
      let sent = false;
      for (const entry of readOutbox()) {
        try {
          const response = await fetch(appPath("/api/finance"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              budgetId: entry.budgetId,
              key: entry.key,
              command: entry.command,
            }),
          });
          if (response.status >= 500 || response.status === 401) break;
          if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            setRefused((r) => [...r, result.error ?? "An offline entry was refused."]);
          }
          writeOutbox(readOutbox().filter((e) => e.key !== entry.key));
          sent = true;
        } catch {
          break;
        }
      }
      sending = false;
      refresh();
      if (sent) router.refresh();
    };
    refresh();
    void drain();
    window.addEventListener("online", drain);
    window.addEventListener(OUTBOX_EVENT, refresh);
    return () => {
      window.removeEventListener("online", drain);
      window.removeEventListener(OUTBOX_EVENT, refresh);
    };
  }, [router]);
  if (!waiting && !refused.length) return null;
  return (
    <div role="status" className="outbox-status text-table text-ink-2">
      {waiting > 0 &&
        `${waiting} entr${waiting === 1 ? "y" : "ies"} saved on this device, waiting for a connection.`}
      {refused.map((message, i) => (
        <span key={i} className="block text-negative">
          Not recorded: {message}
        </span>
      ))}
    </div>
  );
}
