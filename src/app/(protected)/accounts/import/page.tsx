import Link from "next/link";
import { financePage } from "@/application/finance-page";
import { requireUser } from "@/application/session";
import { getImports } from "@/application/imports";
import { FileImport, UndoImport } from "@/components/file-import";
import { formatDate } from "@/domain/dates";

const CARD = "rounded-lg border border-border-warm bg-surface-card";
const MUTED = "font-body-sm text-body-sm leading-relaxed text-text-secondary";
const MAIN =
  "mx-auto w-full max-w-canvas px-gutter pb-space-xl pt-space-lg outline-none lg:px-space-lg";

export default async function ImportFiles() {
  const state = await financePage();
  const data = await getImports((await requireUser()).userId, state.budget.id);
  return (
    <main id="main" className={MAIN} tabIndex={-1}>
      <div className="flex max-w-2xl flex-col">
        <span className="font-label-caps text-label-caps uppercase tracking-widest text-secondary">
          <Link className="underline-offset-2 hover:underline" href="/accounts">
            Accounts
          </Link>{" "}
          · Import a file
        </span>
        <h1 className="mt-space-xs font-headline-lg text-headline-lg leading-tight text-text-primary">
          Bring in a statement.
        </h1>
        <p className="mt-space-xs font-body-md text-body-md leading-relaxed text-text-secondary">
          Upload a CSV, OFX or QFX file from your bank. You will see exactly
          what would be imported before anything changes, and imported rows wait
          for your approval like bank-synced ones. Importing the same file twice
          adds nothing.
        </p>
      </div>
      <section className={`finance-panel mt-space-lg ${CARD} p-space-lg`}>
        <h2 className="font-headline-md text-headline-md">Import</h2>
        <p className={`mt-space-xs mb-space-md ${MUTED}`}>
          Accounts synced from a bank are not offered here, so nothing arrives
          twice. Rows on or before an account&apos;s opening balance are
          skipped, because that history is already inside it.
        </p>
        <FileImport accounts={data.accounts} />
      </section>
      {data.batches.length > 0 && (
        <section className={`finance-panel mt-space-lg ${CARD} p-space-lg`}>
          <h2 className="font-headline-md text-headline-md">Past imports</h2>
          <p className={`mt-space-xs ${MUTED}`}>
            An import can be undone as a whole until any of its rows is
            approved. After that, correct individual transactions in the account
            register.
          </p>
          <ul className="mt-space-md divide-y divide-border-warm">
            {data.batches.map((b) => (
              <li
                className="flex flex-wrap items-center justify-between gap-space-sm py-space-sm"
                key={b.id}
              >
                <span>
                  <strong>{b.fileName || `${b.format} file`}</strong>
                  <span className={`block ${MUTED}`}>
                    {b.accountName} · {b.created} imported ·{" "}
                    {formatDate(b.createdAt, state.budget.dateFormat)}
                    {b.undoneAt
                      ? ` · undone ${formatDate(b.undoneAt, state.budget.dateFormat)}`
                      : ""}
                  </span>
                </span>
                {b.undoable && <UndoImport batchId={b.id} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
