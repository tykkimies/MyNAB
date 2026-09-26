import { Download } from "lucide-react";
import { financePage } from "@/application/finance-page";
import { appPath } from "@/infrastructure/app-path";
import { PageHeader } from "@/components/ui/page-header";
import { Notice } from "@/components/ui/notice";

const MUTED = "text-table text-ink-2";
const TABLES = [
  [
    "transactions",
    "Transactions",
    "One row per category split, with voided history",
  ],
  ["accounts", "Accounts", "Names, types and whether each is on budget"],
  [
    "categories",
    "Categories",
    "Groups and categories, including archived ones",
  ],
  [
    "assignments",
    "Assignments",
    "What you assigned to each category, by month",
  ],
  ["targets", "Targets", "Every target version"],
  ["schedules", "Schedules", "Recurring plans"],
  ["rules", "Rules", "Saved automation rules"],
] as const;

export default async function Export() {
  // Authorizes the viewer; the downloads authorize again on their own.
  await financePage();
  return (
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        breadcrumb={[{ href: "/accounts", label: "Accounts" }]}
        title="Export"
        meta="Everything you have recorded belongs to you"
        actions={
          /* A plain link: a download needs no script. */
          <a
            className="btn btn-primary"
            href={appPath("/api/export?format=json")}
            download
          >
            <Download size={14} aria-hidden />
            Download everything (JSON)
          </a>
        }
      />
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        <section className="surface mt-4 p-4" aria-labelledby="json-heading">
          <h2 id="json-heading" className="section-title">
            Complete export
          </h2>
          <p className={`mt-1 ${MUTED}`}>
            One versioned JSON file with every account, transaction (including
            corrected ones), category, assignment, target, debt term, schedule
            and rule. Amounts are exact whole cents. Bank sign-in tokens are
            never included, so a connected bank must be relinked if you move
            elsewhere.
          </p>
        </section>
        <section className="surface mt-4" aria-labelledby="csv-heading">
          <div className="flex items-baseline justify-between gap-2 px-4 py-2 lg:px-6">
            <h2 id="csv-heading" className="section-title">
              Spreadsheet tables (CSV)
            </h2>
            <span className={MUTED}>
              Opens in Excel, Numbers or Google Sheets; formula-like text is
              escaped
            </span>
          </div>
          <table className="ledger">
            <caption className="sr-only">CSV tables to download</caption>
            <thead>
              <tr>
                <th scope="col">Table</th>
                <th scope="col" data-hide="sm">
                  Contents
                </th>
                <th scope="col" className="num">
                  <span className="sr-only">Download</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {TABLES.map(([table, label, description]) => (
                <tr key={table}>
                  <th scope="row">
                    {label}
                    <span className="ledger-sub sm:hidden">{description}</span>
                  </th>
                  <td className="text-ink-2" data-hide="sm">
                    {description}
                  </td>
                  <td className="num">
                    <a
                      className="btn btn-ghost btn-sm -mr-2"
                      href={appPath(`/api/export?format=csv&table=${table}`)}
                      download
                    >
                      <Download size={14} aria-hidden />
                      Download {label.toLowerCase()}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <div className="mt-4">
          <Notice>
            <strong>Exports are not backups.</strong> An export is for reading
            your data elsewhere. Restoring this app uses a database backup taken
            on the server, which also keeps bank connections working. Back up
            before every upgrade, encrypt copies before they leave the server,
            and keep the server&apos;s encryption key in a password manager,
            apart from the backups: without it, connected banks cannot be read
            again. The operator guide in deploy/portainer/README.md describes
            backing up and restoring.
          </Notice>
        </div>
      </div>
    </main>
  );
}
