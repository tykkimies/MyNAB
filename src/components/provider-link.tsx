"use client";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { appPath } from "@/infrastructure/app-path";

declare global {
  interface Window {
    Plaid?: {
      create(options: {
        token: string;
        onSuccess(publicToken: string): void;
        onExit(error: unknown): void;
      }): { open(): void };
    };
  }
}

const SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

export async function post(command: Record<string, unknown>) {
  const response = await fetch(appPath("/api/provider"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(result.error ?? "Request failed."));
  return result;
}

/**
 * Loads Plaid Link on demand rather than on every page. 'strict-dynamic' extends
 * trust from this module to the script it injects, so no CSP host entry is needed
 * for it; only the iframe and Plaid's own API calls are allowlisted.
 */
function loadPlaid(): Promise<NonNullable<Window["Plaid"]>> {
  if (window.Plaid) return Promise.resolve(window.Plaid);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT}"]`,
    );
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => {
      if (window.Plaid) resolve(window.Plaid);
      else reject(new Error("Plaid Link did not initialise."));
    });
    script.addEventListener("error", () =>
      reject(new Error("Plaid Link could not be loaded.")),
    );
    if (!existing) {
      script.src = SCRIPT;
      script.async = true;
      document.head.append(script);
    }
  });
}

export function ConnectBank({ label = "Connect a bank" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const running = useRef(false);

  const connect = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(false);
    setMessage("Preparing a secure connection…");
    try {
      const { linkToken } = (await post({ type: "link.start" })) as {
        linkToken: string;
      };
      const plaid = await loadPlaid();
      // The public token is all that reaches this app; credentials stay with Plaid.
      await new Promise<void>((resolve, reject) => {
        plaid
          .create({
            token: linkToken,
            onSuccess: (publicToken) => {
              setMessage("Linking accounts…");
              post({ type: "link.complete", publicToken })
                .then(() => resolve())
                .catch(reject);
            },
            onExit: (exit) =>
              exit
                ? reject(new Error("Bank connection was not completed."))
                : resolve(),
          })
          .open();
      });
      setMessage("Connected. Choose which accounts to use below.");
      router.refresh();
    } catch (failure) {
      setError(true);
      setMessage(
        failure instanceof Error ? failure.message : "Could not connect.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [router]);

  return (
    <div className="finance-form">
      <button
        className="primary-button"
        type="button"
        onClick={connect}
        disabled={busy}
      >
        {busy ? "Working…" : label}
      </button>
      <p
        role={error ? "alert" : "status"}
        className={error ? "form-message error" : "form-message"}
      >
        {message}
      </p>
    </div>
  );
}

/** One button that runs a provider command and refreshes the page. */
export function ProviderAction({
  command,
  label,
  busyLabel = "Working…",
  confirm,
  secondary,
  acknowledgement = false,
}: {
  command: Record<string, unknown>;
  label: string;
  busyLabel?: string;
  confirm?: string;
  secondary?: boolean;
  acknowledgement?: boolean;
}) {
  const router = useRouter();
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  return (
    <div className="finance-form">
      {acknowledgement && (
        <label className="check-field">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
          I acknowledge any affected reconciliation will need review.
        </label>
      )}
      <button
        className={secondary ? "secondary-button" : "primary-button"}
        type="button"
        disabled={busy}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setError(false);
          setMessage("");
          try {
            const result = await post({
              ...command,
              acknowledgeReconciled: ack,
            });
            setMessage(
              typeof result.created === "number"
                ? `Imported ${result.created}. Bank changes awaiting review: ${result.reviewed ?? 0}.`
                : "Done.",
            );
            router.refresh();
          } catch (failure) {
            setError(true);
            setMessage(
              failure instanceof Error ? failure.message : "That did not work.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? busyLabel : label}
      </button>
      <p
        role={error ? "alert" : "status"}
        className={error ? "form-message error" : "form-message"}
      >
        {message}
      </p>
    </div>
  );
}

/** Attach a discovered account to a budget account, or approve an import. */
export function ProviderSelect({
  command,
  field,
  options,
  label,
  action,
  allowNone,
  acknowledgement = false,
  suggested,
  hint,
}: {
  command: Record<string, unknown>;
  field: string;
  options: { id: string; name: string }[];
  label: string;
  /** Preselected, never submitted on the owner's behalf. */
  suggested?: string | null;
  hint?: string;
  action: string;
  allowNone?: string;
  acknowledgement?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(suggested ?? "");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  return (
    <form
      className="finance-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(false);
        setMessage("");
        try {
          await post({
            ...command,
            [field]: value || null,
            acknowledgeReconciled: ack,
          });
          setMessage("Saved.");
          router.refresh();
        } catch (failure) {
          setError(true);
          setMessage(
            failure instanceof Error ? failure.message : "That did not work.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        {acknowledgement && (
          <label className="check-field">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I acknowledge any affected reconciliation will need review.
          </label>
        )}
        <label>
          {label}
          <select
            aria-label={label}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required={!allowNone}
          >
            <option value="">{allowNone ?? "Choose…"}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          {hint && <small>{hint}</small>}
        </label>
        <button className="primary-button" type="submit">
          {busy ? "Working…" : action}
        </button>
      </fieldset>
      <p
        role={error ? "alert" : "status"}
        className={error ? "form-message error" : "form-message"}
      >
        {message}
      </p>
    </form>
  );
}
