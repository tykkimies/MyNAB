import { appPath } from "@/infrastructure/app-path";
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
    <main className="grid min-h-screen grid-cols-1 bg-canvas-paper lg:grid-cols-2">
      {/*
       * The forest story panel keeps its own light-on-dark palette in both
       * themes, like the hero cards, so the brand side never inverts.
       */}
      <div className="flex flex-col justify-between gap-space-xl bg-linear-to-br from-hero-from via-hero-via to-hero-to px-gutter py-space-xl text-hero-text lg:px-space-xl lg:py-space-xl">
        <Brand inverse />
        <div className="hidden max-w-lg flex-col lg:flex">
          <span className="font-label-caps text-label-caps uppercase tracking-widest text-hero-muted">
            Your money. Your direction.
          </span>
          <h1 className="mt-space-md font-headline-hero text-[clamp(2.5rem,4.5vw,4.25rem)] font-normal leading-[1.08] tracking-tight">
            A little clarity.
            <br />A world of
            <br />
            <em className="text-accent-mint">possibility.</em>
          </h1>
          <p className="mt-space-lg font-body-lg text-body-lg leading-relaxed text-hero-muted">
            Make room for the everyday.
            <br />
            And the things you’re dreaming of.
          </p>
        </div>
        <span className="hidden items-center gap-space-sm font-body-sm text-body-sm text-hero-muted lg:flex">
          <ShieldCheck size={18} aria-hidden />
          Personal finance, at home with you.
        </span>
      </div>
      <div className="relative flex items-start justify-center px-gutter py-space-xl lg:items-center lg:px-space-xl">
        <div className="w-full max-w-sm">
          <span className="font-label-caps text-label-caps uppercase tracking-widest text-secondary">
            Welcome home
          </span>
          <h2 className="mt-space-sm font-headline-lg text-headline-lg text-text-primary">
            Your space awaits.
          </h2>
          <p className="mt-space-sm font-body-md text-body-md leading-relaxed text-text-secondary">
            Sign in to your personal finance workspace.
          </p>
          {error && (
            <div
              className="mt-space-md rounded-md border border-status-negative-border bg-status-negative-bg p-space-md font-body-sm text-body-sm leading-relaxed text-status-negative-text"
              role="alert"
            >
              {error === "throttled"
                ? "Too many sign-in attempts. Try again in 15 minutes."
                : "The username or passphrase wasn’t recognized."}
            </div>
          )}
          {/*
           * No focusable element may precede this form: the suite tabs once
           * from a fresh page and expects the username field.
           */}
          <form
            action={appPath("/api/auth/login")}
            method="post"
            className="mt-space-lg flex flex-col"
          >
            <label
              className="mb-space-xs font-label-sm text-label-sm font-semibold text-text-primary"
              htmlFor="username"
            >
              Username
            </label>
            <input
              className="mb-space-md h-9 w-full rounded-md border border-border-warm bg-surface-card px-2.5 text-text-primary"
              id="username"
              name="username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={64}
              autoCapitalize="none"
              spellCheck={false}
            />
            <label
              className="mb-space-xs font-label-sm text-label-sm font-semibold text-text-primary"
              htmlFor="password"
            >
              Passphrase
            </label>
            <input
              className="mb-space-lg h-9 w-full rounded-md border border-border-warm bg-surface-card px-2.5 text-text-primary"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={15}
              maxLength={128}
            />
            <button
              className="inline-flex h-9 items-center justify-center gap-space-sm rounded-md bg-button-bg px-space-lg font-label-sm text-label-sm font-semibold text-button-text transition-colors hover:brightness-110"
              type="submit"
            >
              Sign in
              <ArrowRight size={16} aria-hidden />
            </button>
          </form>
          <p className="mt-space-lg font-body-sm text-body-sm leading-relaxed text-text-secondary">
            Need access? Your server administrator can create your account or
            reset your passphrase.
          </p>
        </div>
        <span className="absolute bottom-space-lg font-body-sm text-body-sm text-text-tertiary">
          MyNAB · Your data stays with you.
        </span>
      </div>
    </main>
  );
}
