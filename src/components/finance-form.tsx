"use client";
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SplitAssist } from "@/components/split-assist";
import { appPath } from "@/infrastructure/app-path";
import { queueEntry } from "@/components/outbox";
export function FinanceForm({
  budgetId,
  command,
  children,
  label = "Save",
  reset = false,
  inline = false,
  onSaved,
  closeDetailsOnSave = false,
  inspectCreatedCategoryMonth,
  queueOffline = false,
  buttonClassName = "",
  buttonLabel,
  submitDisabled = false,
}: {
  budgetId: string;
  command: Record<string, unknown>;
  children?: ReactNode;
  /** Button text; a node lets a money figure sit inside `<Amount>`. */
  label?: ReactNode;
  /** Accessible name for the button when its text alone is not enough. */
  buttonLabel?: string;
  submitDisabled?: boolean;
  reset?: boolean;
  /** Lays the controls out in a row, for a form that sits inside a table cell. */
  inline?: boolean;
  /** Called after a successful save, for forms that manage their own fields. */
  onSaved?: () => void;
  /** Dismiss a compact disclosure after a successful inline edit. */
  closeDetailsOnSave?: boolean;
  /** Open the new category's inspector after inline creation. */
  inspectCreatedCategoryMonth?: string;
  /** Keep the change on this device when the network is down, and send it later. */
  queueOffline?: boolean;
  /** Extra classes for the submit button, e.g. a size or a marker. */
  buttonClassName?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const retry = useRef<{ payload: string; key: string } | null>(null);
  return (
    <form
      className={inline ? "finance-form finance-form-inline" : "finance-form"}
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
          "zeroBalance",
          "archived",
          "cleared",
          "acknowledgeReconciled",
          "refill",
          "enabled",
          "minimumIncludesInterest",
          "clearPayment",
          "removeApproved",
          "introDeferred",
          "setPaymentTarget",
          "unplanned",
        ])
          if (form.elements.namedItem(field))
            values[field] = data.get(field) === "on";
        if (values.kind !== "TRANSFER" && data.has("splitCategory"))
          values.splits = data
            .getAll("splitCategory")
            .map((categoryId, i) => ({
              categoryId,
              amount: data.getAll("splitAmount")[i],
            }))
            .filter((s) => s.categoryId);
        if (values.type === "view.save")
          values.categoryIds = data.getAll("categoryId");
        // Bulk forms carry their selection as repeated hidden `ids` fields;
        // a single-row form passes its id in the command instead.
        if (values.type === "payee.rename") {
          values.from = data.getAll("from");
          values.rule = data.get("rule") === "on";
        }
        if (
          (values.type === "transaction.flag" ||
            values.type === "transaction.review" ||
            values.type === "transaction.categorize") &&
          data.has("ids")
        )
          values.ids = data.getAll("ids");
        // A blank optional field is absent, not an empty value. Listing the
        // fields individually meant every new optional one broke until it was
        // added, so nothing empty is sent at all; commands that accept an empty
        // string declare a default for it.
        for (const key of Object.keys(values))
          if (values[key] === "") delete values[key];
        if (values.type === "transaction.protect")
          values.locked = data.getAll("locked");
        // Numeric fields arrive from the DOM as strings.
        for (const numeric of [
          "cadenceMonths",
          "dayOfWeek",
          "targetDueDay",
          "dueDay",
          "interval",
          "priority",
        ])
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
          onSaved?.();
          if (closeDetailsOnSave)
            form.closest("details")?.removeAttribute("open");
          // A replace alone keeps the shell's cached data (the sidebar's
          // account list), so every outcome also refreshes.
          if (values.type === "rule.apply")
            router.replace(`/accounts/rules?transactionId=${result.id}`);
          else if (values.type === "account.delete")
            router.replace("/accounts");
          else if (
            (values.type === "category.create" ||
              values.type === "starter.add") &&
            inspectCreatedCategoryMonth
          )
            router.replace(
              `/budget?month=${inspectCreatedCategoryMonth}&inspect=${result.id}#inspector-heading`,
              { scroll: false },
            );
          router.refresh();
        } catch (error) {
          // fetch rejects with a TypeError only when the request never
          // reached the server; a refused command arrives as a response.
          if (queueOffline && error instanceof TypeError && retry.current) {
            queueEntry({ budgetId, key: retry.current.key, command: values });
            retry.current = null;
            setMessage(
              "No connection. Saved on this device; it will be sent when you are back online.",
            );
            if (reset) form.reset();
            onSaved?.();
            return;
          }
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
      {children && <fieldset disabled={busy}>{children}</fieldset>}
      {/* The button and its outcome share a row; the label never changes
          width while saving, so nothing around it jumps. */}
      <div className="form-actions">
        <button
          className={`${inline ? "btn btn-secondary" : "btn btn-primary"} ${buttonClassName}`}
          type="submit"
          disabled={busy || submitDisabled}
          aria-busy={busy || undefined}
          aria-label={buttonLabel}
        >
          {label}
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
              className="btn btn-secondary"
              onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
              aria-label={`Remove split ${i + 1}`}
            >
              Remove
            </button>
          )}
        </div>
      ))}
      <SplitAssist />
      <button
        type="button"
        className="btn btn-secondary"
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
