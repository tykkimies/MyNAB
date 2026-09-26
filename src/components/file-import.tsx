"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { appPath } from "@/infrastructure/app-path";
import { Amount } from "@/components/amount";

type Mapping = {
  header: boolean;
  date?: number;
  dateFormat: "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY";
  payee?: number;
  amount?: number;
  invert?: boolean;
  outflow?: number;
  inflow?: number;
};
type Inspect =
  | { format: "OFX"; rows: number }
  | {
      format: "CSV";
      headers: string[];
      sample: string[][];
      suggested: Partial<Mapping>;
      rows: number;
    };
type Preview = {
  format: "CSV" | "OFX";
  account: { name: string };
  openingDate: string | null;
  counts: {
    new: number;
    duplicate: number;
    beforeOpening: number;
    invalid: number;
  };
  rows: {
    line: number;
    date: string;
    amount: string;
    payee: string;
    status: "new" | "duplicate" | "before-opening";
  }[];
  rejected: { line: number; reason: string }[];
};

async function send(command: Record<string, unknown>) {
  const response = await fetch(appPath("/api/import"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "That did not complete.");
  return result;
}

const usd = (cents: string) => {
  const v = BigInt(cents);
  const a = v < 0n ? -v : v;
  return `${v < 0n ? "-" : ""}$${(a / 100n).toLocaleString("en-US")}.${(a % 100n).toString().padStart(2, "0")}`;
};
const STATUS = {
  new: "New",
  duplicate: "Already imported",
  "before-opening": "Before opening balance",
} as const;

export function FileImport({
  accounts,
}: {
  accounts: { id: string; name: string; bankLinked: boolean }[];
}) {
  const router = useRouter();
  const usable = accounts.filter((a) => !a.bankLinked);
  const [accountId, setAccountId] = useState(usable[0]?.id ?? "");
  const [fileName, setFileName] = useState("");
  const [content, setContent] = useState("");
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const [mapping, setMapping] = useState<Mapping>({
    header: true,
    dateFormat: "MM/DD/YYYY",
  });
  const [split, setSplit] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(false);
    setMessage("");
    try {
      await work();
    } catch (failure) {
      setError(true);
      setMessage(failure instanceof Error ? failure.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };

  const chosenMapping = () =>
    inspect?.format === "CSV"
      ? {
          header: mapping.header,
          date: mapping.date,
          dateFormat: mapping.dateFormat,
          payee: mapping.payee,
          ...(split
            ? { outflow: mapping.outflow, inflow: mapping.inflow }
            : { amount: mapping.amount, invert: Boolean(mapping.invert) }),
        }
      : undefined;
  const payload = () => ({
    accountId,
    fileName,
    content,
    mapping: chosenMapping(),
  });

  const column = (
    label: string,
    key: "date" | "payee" | "amount" | "outflow" | "inflow",
  ) =>
    inspect?.format === "CSV" && (
      <label>
        {label}
        <select
          value={mapping[key] ?? ""}
          onChange={(e) => {
            setPreview(null);
            setMapping({
              ...mapping,
              [key]: e.target.value === "" ? undefined : Number(e.target.value),
            });
          }}
        >
          <option value="">Choose a column</option>
          {inspect.headers.map((h, i) => (
            <option key={i} value={i}>
              {mapping.header ? h || `Column ${i + 1}` : `Column ${i + 1}`}
            </option>
          ))}
        </select>
      </label>
    );

  if (!usable.length)
    return (
      <p className="form-message">
        Every open account is synced from a bank. Add an account without a bank
        connection to import files into it.
      </p>
    );

  return (
    <div className="finance-form">
      <div className="field-grid">
        <label>
          Import into
          <select
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setPreview(null);
            }}
          >
            {usable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Bank file (CSV, OFX or QFX)
          <input
            type="file"
            accept=".csv,.ofx,.qfx,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setInspect(null);
              setPreview(null);
              setMessage("");
              if (!file) return;
              if (file.size > 2 * 1024 * 1024) {
                setError(true);
                setMessage("File is larger than 2 MB.");
                return;
              }
              void run(async () => {
                const text = await file.text();
                setFileName(file.name);
                setContent(text);
                const found = (await send({
                  type: "inspect",
                  content: text,
                })) as Inspect;
                setInspect(found);
                if (found.format === "CSV") {
                  setMapping({
                    dateFormat: "MM/DD/YYYY",
                    ...found.suggested,
                  } as Mapping);
                  setSplit(
                    found.suggested.outflow !== undefined &&
                      found.suggested.inflow !== undefined,
                  );
                }
              });
            }}
          />
        </label>
      </div>

      {inspect?.format === "OFX" && (
        <p className="form-message">
          OFX/QFX statement with {inspect.rows} transaction
          {inspect.rows === 1 ? "" : "s"}. Its amounts and bank IDs are used as
          they are.
        </p>
      )}

      {inspect?.format === "CSV" && (
        <fieldset className="mt-3 border-t border-hairline pt-3">
          <legend className="text-caps uppercase text-ink-3">
            Match the columns
          </legend>
          <div
            className="mt-2 overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="First rows of the file"
          >
            <table className="ledger">
              <caption className="sr-only">First rows of the file</caption>
              <thead>
                <tr>
                  {inspect.headers.map((h, i) => (
                    <th
                      scope="col"
                      key={i}
                    >
                      {mapping.header
                        ? h || `Column ${i + 1}`
                        : `Column ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inspect.sample.slice(0, 3).map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="field-grid mt-3" data-cols="3">
            <label className="check-field">
              <input
                type="checkbox"
                checked={mapping.header}
                onChange={(e) => {
                  setPreview(null);
                  setMapping({ ...mapping, header: e.target.checked });
                }}
              />
              First row is headings
            </label>
            {column("Date column", "date")}
            <label>
              Date layout
              <select
                value={mapping.dateFormat}
                onChange={(e) => {
                  setPreview(null);
                  setMapping({
                    ...mapping,
                    dateFormat: e.target.value as Mapping["dateFormat"],
                  });
                }}
              >
                <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </label>
            {column("Payee or description column", "payee")}
            <label className="check-field">
              <input
                type="checkbox"
                checked={split}
                onChange={(e) => {
                  setPreview(null);
                  setSplit(e.target.checked);
                }}
              />
              Money out and money in are separate columns
            </label>
            {split ? (
              <>
                {column("Money out column", "outflow")}
                {column("Money in column", "inflow")}
              </>
            ) : (
              <>
                {column("Amount column", "amount")}
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={Boolean(mapping.invert)}
                    onChange={(e) => {
                      setPreview(null);
                      setMapping({ ...mapping, invert: e.target.checked });
                    }}
                  />
                  Spending is shown as a positive number
                </label>
              </>
            )}
          </div>
        </fieldset>
      )}

      {inspect && (
        <button
          className="btn btn-secondary mt-3"
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              setPreview(
                (await send({ type: "preview", ...payload() })) as Preview,
              );
            })
          }
        >
          {busy ? "Checking…" : "Preview import"}
        </button>
      )}

      {preview && (
        <section className="mt-3 border-t border-hairline pt-3" aria-labelledby="preview-heading">
          <h3
            id="preview-heading"
            className="text-label text-ink"
          >
            Preview for {preview.account.name}
          </h3>
          <p className="form-message">
            {preview.counts.new} new · {preview.counts.duplicate} already
            imported · {preview.counts.beforeOpening} on or before the opening
            balance
            {preview.openingDate ? ` (${preview.openingDate})` : ""} ·{" "}
            {preview.counts.invalid} unreadable. Only new rows are imported;
            they wait in Uncategorized for your approval, like bank imports.
          </p>
          <div
            className="mt-2 max-h-96 overflow-auto rounded-md border border-hairline"
            tabIndex={0}
            role="region"
            aria-label="Rows in this import"
          >
            <table className="ledger">
              <caption className="sr-only">Rows in this import</caption>
              <thead>
                <tr>
                  <th scope="col">
                    Date
                  </th>
                  <th scope="col">
                    Payee
                  </th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line}>
                    <td className="text-num font-normal text-ink-2">
                      {r.date}
                    </td>
                    <td>
                      {r.payee || "—"}
                    </td>
                    <td className="num">
                      <Amount>{usd(r.amount)}</Amount>
                    </td>
                    <td className="text-ink-2">{STATUS[r.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rejected.length > 0 && (
            <ul className="form-message mt-2">
              {preview.rejected.map((r) => (
                <li key={r.line}>
                  Row {r.line}: {r.reason}
                </li>
              ))}
            </ul>
          )}
          <button
            className="btn btn-primary mt-3"
            type="button"
            disabled={busy || preview.counts.new === 0}
            onClick={() =>
              run(async () => {
                const result = await send({ type: "commit", ...payload() });
                setPreview(null);
                setInspect(null);
                setMessage(
                  `Imported ${result.created}. Review them under Bank sync → Needs review.`,
                );
                router.refresh();
              })
            }
          >
            Import {preview.counts.new} new row
            {preview.counts.new === 1 ? "" : "s"}
          </button>
        </section>
      )}
      <p
        role={error ? "alert" : "status"}
        className={error ? "form-message error" : "form-message"}
      >
        {message}
      </p>
    </div>
  );
}

export function UndoImport({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div className="finance-form finance-form-inline">
      <label className="check-field">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
        />
        Also if reconciled
      </label>
      <button
        className="btn btn-secondary btn-sm"
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm("Undo this whole import?")) return;
          setBusy(true);
          setMessage("");
          try {
            await send({ type: "undo", batchId, acknowledgeReconciled: ack });
            router.refresh();
          } catch (failure) {
            setMessage(failure instanceof Error ? failure.message : "Failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Undo import
      </button>
      {message && (
        <p role="alert" className="form-message error">
          {message}
        </p>
      )}
    </div>
  );
}
