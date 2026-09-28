"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { appPath } from "@/infrastructure/app-path";

declare global {
  interface Window {
    Plaid?: {
      create(options: {
        token: string;
        receivedRedirectUri?: string;
        onSuccess(publicToken: string): void;
        onExit(error: PlaidLinkError | null, metadata?: PlaidExitMetadata): void;
        onEvent?(eventName: string, metadata?: PlaidEventMetadata): void;
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

/**
 * What an OAuth institution needs to resume Link after sending the browser to
 * its own site and back. Kept only in this tab's sessionStorage and removed as
 * soon as Link finishes; the server never stores a link token.
 */
const PENDING = "mynab.plaid.link";
type Pending = { token: string; connectionId?: string };
function remember(pending: Pending | null) {
  try {
    if (pending) sessionStorage.setItem(PENDING, JSON.stringify(pending));
    else sessionStorage.removeItem(PENDING);
  } catch {
    // Storage may be unavailable; only an OAuth return depends on it.
  }
}
function recall(): Pending | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(PENDING) ?? "null");
    return value && typeof value.token === "string" ? value : null;
  } catch {
    return null;
  }
}

/** What Link reports when it closes with an error (Plaid's own fields). */
type PlaidLinkError = {
  error_code?: string;
  error_type?: string;
  error_message?: string;
  display_message?: string | null;
};
type PlaidExitMetadata = {
  institution?: { name?: string } | null;
  status?: string | null;
  link_session_id?: string;
};
type PlaidEventMetadata = {
  error_code?: string | null;
  institution_name?: string | null;
  view_name?: string | null;
};

/**
 * Why Link stopped, in words the owner can act on or pass along: Plaid's own
 * message and code, the bank, the last step Link reached, and the session id
 * Plaid support asks for. Nothing here is secret; no token is included.
 */
export function linkFailure(
  error: PlaidLinkError | null,
  metadata: PlaidExitMetadata | undefined,
  lastEvent: string | null,
) {
  const bank = metadata?.institution?.name;
  const reason =
    error?.display_message ||
    error?.error_message ||
    (metadata?.status ? `Stopped at: ${metadata.status}` : "");
  const code = error?.error_code ? ` (${error.error_code})` : "";
  const step = lastEvent ? ` Last step: ${lastEvent}.` : "";
  const session = metadata?.link_session_id
    ? ` Plaid session ${metadata.link_session_id}.`
    : "";
  return `Bank connection was not completed${bank ? ` with ${bank}` : ""}.${
    reason ? ` ${reason}${code}.` : code ? ` ${code.trim()}.` : ""
  }${step}${session}`.replace(/\.\./g, ".");
}

/** Open Link, then tell the server what happened. New items are exchanged; an
 * update-mode sign-in only clears the connection's error state. */
async function runLink(pending: Pending, receivedRedirectUri?: string) {
  const plaid = await loadPlaid();
  remember(pending);
  // The last step Link reported, e.g. OPEN_OAUTH or FAIL_OAUTH, so a
  // bank sign-in window that never appears still leaves a trace.
  let lastEvent: string | null = null;
  try {
    await new Promise<void>((resolve, reject) => {
      plaid
        .create({
          token: pending.token,
          receivedRedirectUri,
          onEvent: (eventName, metadata) => {
            lastEvent = [
              eventName,
              metadata?.view_name,
              metadata?.error_code,
              metadata?.institution_name,
            ]
              .filter(Boolean)
              .join(" · ");
          },
          // The public token is all that reaches this app; credentials stay with Plaid.
          onSuccess: (publicToken) => {
            (pending.connectionId
              ? post({
                  type: "link.reauth.complete",
                  connectionId: pending.connectionId,
                })
              : post({ type: "link.complete", publicToken })
            )
              .then(() => resolve())
              .catch(reject);
          },
          // Success arrives only through onSuccess; any exit, with or without
          // an error, means nothing was connected.
          onExit: (exit, metadata) =>
            reject(new Error(linkFailure(exit, metadata, lastEvent))),
        })
        .open();
    });
  } finally {
    remember(null);
  }
}

export function ConnectBank({
  label = "Connect a bank",
  connectionId,
}: {
  label?: string;
  /** Sign an existing connection in again (update mode) instead of adding one. */
  connectionId?: string;
}) {
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
      const { linkToken } = (await post(
        connectionId
          ? { type: "link.reauth.start", connectionId }
          : { type: "link.start" },
      )) as { linkToken: string };
      await runLink({ token: linkToken, connectionId });
      setMessage(
        connectionId
          ? "Signed in again. A sync has been queued."
          : "Connected. Choose which accounts to use below.",
      );
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
  }, [router, connectionId]);

  return (
    <div className="finance-form">
      <button
        className={connectionId ? "btn btn-secondary" : "btn btn-primary"}
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

/** The OAuth return page: resume the Link session this tab started. */
export function ResumeLink() {
  const router = useRouter();
  const [message, setMessage] = useState("Finishing your bank sign-in…");
  const [error, setError] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const pending = recall();
    (pending
      ? runLink(pending, window.location.href)
      : Promise.reject(
          new Error(
            "This sign-in could not be resumed in this tab. Start again from Bank sync.",
          ),
        )
    )
      .then(() => router.replace("/accounts/connections"))
      .catch((failure) => {
        setError(true);
        setMessage(
          failure instanceof Error ? failure.message : "Could not connect.",
        );
      });
  }, [router]);
  return (
    <p
      role={error ? "alert" : "status"}
      className={error ? "form-message error" : "form-message"}
    >
      {message}
    </p>
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
        className={secondary ? "btn btn-secondary" : "btn btn-primary"}
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
              typeof result.message === "string"
                ? result.message
                : typeof result.created === "number"
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
        <button className="btn btn-primary" type="submit">
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

/** Approve many imports with their current categories (YNAB-style bulk approve). */
export function BulkApprove({ entryIds }: { entryIds: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  // Keep the outcome visible after the refresh empties the list.
  if (!entryIds.length && !message) return null;
  return (
    <div className="finance-form finance-form-inline">
      <button
        className="btn btn-secondary"
        type="button"
        hidden={!entryIds.length}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(false);
          setMessage("");
          try {
            let approved = 0;
            // The request limit holds 150 identifiers; send larger sets in turn.
            for (let i = 0; i < entryIds.length; i += 150) {
              const result = await post({
                type: "entries.approve",
                entryIds: entryIds.slice(i, i + 150),
              });
              approved += Number(result.approved ?? 0);
            }
            setMessage(`Approved ${approved}.`);
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
        {busy ? "Approving…" : `Approve all ${entryIds.length}`}
      </button>
      {message && (
        <p
          role={error ? "alert" : "status"}
          className={error ? "form-message error" : "form-message"}
        >
          {message}
        </p>
      )}
    </div>
  );
}
