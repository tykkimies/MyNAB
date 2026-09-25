"use client";
import { useRouter } from "next/navigation";

/** Hides the checklist in this browser; the guide stays one link away. */
export function DismissSetup({ budgetId }: { budgetId: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="secondary-button"
      onClick={() => {
        document.cookie = `mynab-setup-hidden=${budgetId}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
        router.refresh();
      }}
    >
      Hide checklist
    </button>
  );
}

/** Brings the checklist back in this browser. */
export function ShowSetup({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={`font-semibold text-secondary underline underline-offset-2 ${className}`}
      onClick={() => {
        document.cookie = `mynab-setup-hidden=; Path=/; Max-Age=0; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
        router.push("/budget");
        router.refresh();
      }}
    >
      Show getting-started checklist
    </button>
  );
}
