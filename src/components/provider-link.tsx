"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { appPath } from "@/infrastructure/app-path";

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
 * SimpleFIN has no widget: the owner creates a setup token on SimpleFIN Bridge
 * and pastes it here. The server claims it once; the token itself is useless
 * afterwards. With a connection id it replaces that connection's access.
 */
export function SimpleFinConnect({ connectionId }: { connectionId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  return (
    <form
      className="finance-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const setupToken = String(new FormData(form).get("setupToken") ?? "");
        setBusy(true);
        setError(false);
        setMessage("Claiming the token with SimpleFIN…");
        try {
          await post(
            connectionId
              ? { type: "link.retoken.simplefin", connectionId, setupToken }
              : { type: "link.complete.simplefin", setupToken },
          );
          form.reset();
          setMessage(
            connectionId
              ? "Access replaced. A sync has been queued."
              : "Connected. Choose which accounts to use below.",
          );
          router.refresh();
        } catch (failure) {
          setError(true);
          setMessage(
            failure instanceof Error ? failure.message : "Could not connect.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        <label>
          SimpleFIN setup token
          <textarea
            name="setupToken"
            required
            rows={3}
            maxLength={2000}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </fieldset>
      <div className="form-actions">
        <button
          className={connectionId ? "btn btn-secondary" : "btn btn-primary"}
          type="submit"
          disabled={busy}
        >
          {busy
            ? "Working…"
            : connectionId
              ? "Replace access"
              : "Connect with SimpleFIN"}
        </button>
        <p
          role={error ? "alert" : "status"}
          className={error ? "form-message error" : "form-message"}
        >
          {message}
        </p>
      </div>
    </form>
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
