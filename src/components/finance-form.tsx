"use client";
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { appPath } from "@/infrastructure/app-path";
export function FinanceForm({
  budgetId,
  command,
  children,
  label = "Save",
  reset = false,
}: {
  budgetId: string;
  command: Record<string, unknown>;
  children?: ReactNode;
  label?: string;
  reset?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const retry = useRef<{ payload: string; key: string } | null>(null);
  return (
    <form
      className="finance-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        const values: Record<string, unknown> = { ...command };
        for (const [key, value] of data) {
          if (key === "splitCategory" || key === "splitAmount") continue;
          values[key] = value;
        }
        for (const field of [
          "closed",
          "archived",
          "cleared",
          "acknowledgeReconciled",
          "refill",
        ])
          if (form.elements.namedItem(field))
            values[field] = data.get(field) === "on";
        if (data.has("splitCategory"))
          values.splits = data
            .getAll("splitCategory")
            .map((categoryId, i) => ({
              categoryId,
              amount: data.getAll("splitAmount")[i],
            }))
            .filter((s) => s.categoryId);
        // A blank optional field is absent, not an empty value. Listing the
        // fields individually meant every new optional one broke until it was
        // added, so nothing empty is sent at all; commands that accept an empty
        // string declare a default for it.
        for (const key of Object.keys(values))
          if (values[key] === "") delete values[key];
        // Numeric fields arrive from the DOM as strings.
        for (const numeric of ["cadenceMonths", "dayOfWeek", "dueDay"])
          if (typeof values[numeric] === "string")
            values[numeric] = Number(values[numeric]);
        const payload = JSON.stringify(values);
        if (retry.current?.payload !== payload)
          retry.current = { payload, key: crypto.randomUUID() };
        setBusy(true);
        setMessage("");
        setError(false);
        try {
          const response = await fetch(appPath("/api/finance"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              budgetId,
              key: retry.current.key,
              command: values,
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "Unable to save.");
          retry.current = null;
          // A command may report what it actually did, such as how much was
          // assigned and how much is still owed. Prefer it over a bare "Saved."
          setMessage(
            typeof result?.message === "string" ? result.message : "Saved.",
          );
          if (reset) form.reset();
          router.refresh();
        } catch (error) {
          setError(true);
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to save. Retry this change.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        {children}
        <button className="primary-button" type="submit">
          {busy ? "Saving…" : label}
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
export function SplitFields({
  categories,
  initial = [],
}: {
  categories: { id: string; name: string }[];
  initial?: { categoryId: string; amount: string }[];
}) {
  const [rows, setRows] = useState(
    initial.length
      ? initial.map((r, i) => ({ ...r, key: i }))
      : [{ categoryId: "", amount: "", key: 0 }],
  );
  const counter = useRef(rows.length);
  return (
    <div className="split-fields">
      <p>
        Category splits · Match the signed budget amount. Leave blank for income
        and internal transfers.
      </p>
      {rows.map((row, i) => (
        <div className="split-row" key={row.key}>
          <label>
            Category {i + 1}
            <select
              name="splitCategory"
              defaultValue={row.categoryId}
              aria-label={`Category ${i + 1}`}
            >
              <option value="">Ready to Assign / no category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Split amount {i + 1}
            <input
              name="splitAmount"
              inputMode="decimal"
              defaultValue={row.amount}
              placeholder="-25.00"
            />
          </label>
          {rows.length > 1 && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
              aria-label={`Remove split ${i + 1}`}
            >
              Remove
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="secondary-button"
        disabled={rows.length >= 50}
        onClick={() =>
          setRows([
            ...rows,
            { categoryId: "", amount: "", key: counter.current++ },
          ])
        }
      >
        Add split
      </button>
    </div>
  );
}
