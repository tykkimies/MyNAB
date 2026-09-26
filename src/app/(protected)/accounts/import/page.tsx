import { financePage } from "@/application/finance-page";
import { requireUser } from "@/application/session";
import { getImports } from "@/application/imports";
import { FileImport, UndoImport } from "@/components/file-import";
import { formatDate } from "@/domain/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Help } from "@/components/ui/help";

const MUTED = "text-table text-ink-2";

export default async function ImportFiles() {
  const state = await financePage();
  const data = await getImports((await requireUser()).userId, state.budget.id);
  return (
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        breadcrumb={[{ href: "/accounts", label: "Accounts" }]}
        title="Import a file"
        meta="CSV, OFX or QFX from your bank"
        actions={
          <Help label="About importing files" align="right">
            You see exactly what would be imported before anything changes, and
            imported rows wait for your approval like bank-synced ones.
            Importing the same file twice adds nothing. Accounts synced from a
            bank are not offered here, so nothing arrives twice, and rows on or
            before an account&apos;s opening balance are skipped because that
            history is already inside it.
          </Help>
        }
      />
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        <section className="surface mt-4 p-4" aria-labelledby="import-heading">
          <h2 id="import-heading" className="section-title">
            Import
          </h2>
          <div className="mt-3">
            <FileImport accounts={data.accounts} />
          </div>
        </section>
        {data.batches.length > 0 && (
          <section className="surface mt-4" aria-labelledby="batches-heading">
            <div className="flex items-baseline justify-between gap-2 px-4 py-2 lg:px-6">
              <h2 id="batches-heading" className="section-title">
                Past imports
              </h2>
              <span className={MUTED}>
                An import can be undone as a whole until any of its rows is
                approved
              </span>
            </div>
            <ul className="border-t border-hairline">
              {data.batches.map((b) => (
                <li
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-hairline px-4 py-2 last:border-b-0 lg:px-6"
                  key={b.id}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-table font-medium text-ink">
                      {b.fileName || `${b.format} file`}
                    </span>
                    <span className="ledger-sub">
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
      </div>
    </main>
  );
}
