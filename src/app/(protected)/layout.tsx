import { appPath } from "@/infrastructure/app-path";
import { cookies } from "next/headers";
import { LogOut, ShieldCheck } from "lucide-react";
import { requireUser } from "@/application/session";
import { listBudgets } from "@/application/auth";
import { Navigation } from "@/components/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { Brand } from "@/components/brand";
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const budgets = await listBudgets(user.userId).catch(() => {
    throw new Error("Workspace temporarily unavailable");
  });
  const dark = (await cookies()).get("mynab-theme")?.value === "dark";
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="budget-name">
          <span className="eyebrow">YOUR SPACE</span>
          <strong>{budgets[0]?.name ?? "Your budget"}</strong>
          <span>US dollars · Personal</span>
        </div>
        <Navigation />
        <div className="sidebar-bottom">
          <div className="privacy-note">
            <ShieldCheck size={18} aria-hidden />
            <span>
              Your data.
              <br />
              Your home.
            </span>
          </div>
          <div className="profile">
            <span className="avatar" aria-hidden>
              {user.username[0].toUpperCase()}
            </span>
            <span>
              {user.username}
              <small>Owner</small>
            </span>
            <form action={appPath("/api/auth/logout")} method="post">
              <button
                className="icon-button"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={18} aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="workspace-label">
            PERSONAL FINANCE, WITH INTENTION
          </span>
          <div className="topbar-actions">
            <span className="status-pill">
              <span />
              Private workspace
            </span>
            <ThemeToggle initiallyDark={dark} />
          </div>
        </header>
        {children}
        <footer className="workspace-footer">
          <span>A little clarity. A little more possibility.</span>
          <span>MyNAB · Foundation preview</span>
        </footer>
      </div>
    </div>
  );
}
