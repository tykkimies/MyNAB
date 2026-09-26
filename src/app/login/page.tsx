import { appPath } from "@/infrastructure/app-path";
import { redirect } from "next/navigation";
import { currentUser } from "@/application/session";
import { Brand } from "@/components/brand";
import { Notice } from "@/components/ui/notice";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentUser()) redirect("/budget");
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen flex-col items-center bg-canvas px-gutter py-12 sm:justify-center">
      <div className="w-full max-w-[22.5rem]">
        {/*
         * No focusable element may precede the form: the suite tabs once from
         * a fresh page and expects the username field. The wordmark is a
         * plain span here for that reason.
         */}
        <Brand href={null} />
        <h1 className="mt-6 text-page-title text-ink">Sign in</h1>
        <p className="mt-1 text-table text-ink-2">
          Your budget, on your own server.
        </p>
        {error && (
          <div className="mt-4">
            <Notice tone="negative" role="alert">
              {error === "throttled"
                ? "Too many sign-in attempts. Try again in 15 minutes."
                : "The username or passphrase wasn’t recognized."}
            </Notice>
          </div>
        )}
        <form
          action={appPath("/api/auth/login")}
          method="post"
          className="finance-form surface mt-4 p-4"
        >
          <fieldset>
            <label htmlFor="username">
              Username
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
            </label>
            <label htmlFor="password">
              Passphrase
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={15}
                maxLength={128}
              />
            </label>
          </fieldset>
          <div className="form-actions">
            <button className="btn btn-primary btn-lg w-full" type="submit">
              Sign in
            </button>
          </div>
        </form>
        <p className="mt-4 text-meta text-ink-3">
          Need access? Your server administrator can create your account or
          reset your passphrase.
        </p>
      </div>
    </main>
  );
}
