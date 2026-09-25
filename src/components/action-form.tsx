"use client";
import { useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * A form that posts to an API route without reloading the page. The route
 * answers a fetch with the page to show next; the router then updates only
 * what changed. Without JavaScript it is an ordinary form post and redirect.
 */
export function ActionForm({
  action,
  className,
  children,
}: {
  action: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const busy = useRef(false);
  return (
    <form
      action={action}
      method="post"
      className={className}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy.current) return;
        busy.current = true;
        const form = event.currentTarget;
        form.setAttribute("aria-busy", "true");
        try {
          const response = await fetch(action, {
            method: "POST",
            body: new FormData(form),
            headers: { Accept: "application/json" },
          });
          const result = (await response.json().catch(() => null)) as {
            redirect?: string;
          } | null;
          if (!result?.redirect) throw new Error("Unexpected response");
          router.push(result.redirect, { scroll: false });
          router.refresh();
        } catch {
          // Fall back to the ordinary post, which always works.
          form.submit();
        } finally {
          busy.current = false;
          form.removeAttribute("aria-busy");
        }
      }}
    >
      {children}
    </form>
  );
}
