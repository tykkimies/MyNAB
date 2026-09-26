import Link from "next/link";
import { financePage } from "@/application/finance-page";
import { appPath } from "@/infrastructure/app-path";

const CARD = "rounded-lg border border-border-warm bg-surface-card";
const MUTED = "font-body-sm text-body-sm leading-relaxed text-text-secondary";
const MAIN =
  "mx-auto w-full max-w-canvas px-gutter pb-space-xl pt-space-lg outline-none lg:px-space-lg";
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
    <main id="main" className={MAIN} tabIndex={-1}>
      <div className="flex max-w-2xl flex-col">
        <span className="font-label-caps text-label-caps uppercase tracking-widest text-secondary">
          <Link className="underline-offset-2 hover:underline" href="/accounts">
            Accounts
          </Link>{" "}
          · Your data
        </span>
        <h1 className="mt-space-xs font-headline-lg text-headline-lg leading-tight text-text-primary">
          Take it with you.
        </h1>
        <p className="mt-space-xs font-body-md text-body-md leading-relaxed text-text-secondary">
          Everything you have recorded belongs to you. Download it whenever you
          like, in a form other tools can read.
        </p>
      </div>
      <section className={`finance-panel mt-space-lg ${CARD} p-space-lg`}>
        <h2 className="font-headline-md text-headline-md">Complete export</h2>
        <p className={`mt-space-xs ${MUTED}`}>
          One versioned JSON file with every account, transaction (including
          corrected ones), category, assignment, target, debt term, schedule and
          rule. Amounts are exact whole cents. Bank sign-in tokens are never
          included, so a connected bank must be relinked if you move elsewhere.
        </p>
        {/* Plain links: a download needs no script. */}
        <a
          className="primary-button mt-space-md inline-flex"
          href={appPath("/api/export?format=json")}
          download
        >
          Download everything (JSON)
        </a>
      </section>
      <section className={`finance-panel mt-space-lg ${CARD} p-space-lg`}>
        <h2 className="font-headline-md text-headline-md">
          Spreadsheet tables (CSV)
        </h2>
        <p className={`mt-space-xs ${MUTED}`}>
          Each opens in Excel, Numbers or Google Sheets. Text that a spreadsheet
          would run as a formula is escaped.
        </p>
        <ul className="mt-space-md divide-y divide-border-warm">
          {TABLES.map(([table, label, description]) => (
            <li
              className="flex flex-wrap items-center justify-between gap-space-sm py-space-sm"
              key={table}
            >
              <span>
                <strong>{label}</strong>
                <span className={`block ${MUTED}`}>{description}</span>
              </span>
              <a
                className="secondary-button"
                href={appPath(`/api/export?format=csv&table=${table}`)}
                download
              >
                Download {label.toLowerCase()}
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section className={`finance-panel mt-space-lg ${CARD} p-space-lg`}>
        <h2 className="font-headline-md text-headline-md">
          Exports are not backups
        </h2>
        <p className={`mt-space-xs ${MUTED}`}>
          An export is for reading your data elsewhere. Restoring this app uses
          a database backup taken on the server, which also keeps bank
          connections working. Back up before every upgrade, encrypt copies
          before they leave the server, and keep the server&apos;s encryption
          key in a password manager, apart from the backups: without it,
          connected banks cannot be read again. The operator guide in
          deploy/portainer/README.md describes backing up and restoring.
        </p>
      </section>
    </main>
  );
}
