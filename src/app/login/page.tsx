import { redirect } from "next/navigation";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { currentUser } from "@/application/session";
import { Brand } from "@/components/brand";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentUser()) redirect("/budget");
  const { error } = await searchParams;
  return (
    <main className="login-page">
      <div className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">YOUR MONEY. YOUR DIRECTION.</span>
          <h1>
            A little clarity.
            <br />A world of
            <br />
            <em>possibility.</em>
          </h1>
          <p>
            Make room for the everyday.
            <br />
            And the things you’re dreaming of.
          </p>
        </div>
        <span className="login-privacy">
          <ShieldCheck size={18} aria-hidden />
          Personal finance, at home with you.
        </span>
      </div>
      <div className="login-panel">
        <div className="login-form-wrap">
          <span className="eyebrow">WELCOME HOME</span>
          <h2>Your space awaits.</h2>
          <p>Sign in to your personal finance workspace.</p>
          {error && (
            <div className="form-error" role="alert">
              {error === "throttled"
                ? "Too many sign-in attempts. Try again in 15 minutes."
                : "The username or passphrase wasn’t recognized."}
            </div>
          )}
          <form action="/api/auth/login" method="post" className="login-form">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={64}
              autoCapitalize="none"
              spellCheck={false}
            />
            <label htmlFor="password">Passphrase</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={15}
              maxLength={128}
            />
            <button className="primary-button" type="submit">
              Sign in
              <ArrowRight size={18} aria-hidden />
            </button>
          </form>
          <p className="recovery-note">
            Need access? Your server administrator can create your account or
            reset your passphrase.
          </p>
        </div>
        <span className="login-version">MyNAB · Your data stays with you.</span>
      </div>
    </main>
  );
}
