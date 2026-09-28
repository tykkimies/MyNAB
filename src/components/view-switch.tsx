"use client";
import { useRouter } from "next/navigation";
import { Monitor, Smartphone } from "lucide-react";

/**
 * "Use desktop site" / "Phone site": remembers the choice in the
 * `mynab-view` cookie, which the proxy reads before any device detection, and
 * re-renders the current page in the other presentation.
 */
export function ViewSwitch({
  to,
  className = "btn btn-secondary",
  labelClassName,
}: {
  to: "phone" | "desktop";
  className?: string;
  /** For example `hidden md:inline` to show only the icon on a narrow bar. */
  labelClassName?: string;
}) {
  const router = useRouter();
  const label = to === "desktop" ? "Use desktop site" : "Phone site";
  return (
    <button
      type="button"
      className={className}
      aria-label={labelClassName ? label : undefined}
      title={labelClassName ? label : undefined}
      onClick={() => {
        document.cookie = `mynab-view=${to}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
        router.refresh();
      }}
    >
      {to === "desktop" ? (
        <Monitor size={16} aria-hidden />
      ) : (
        <Smartphone size={16} aria-hidden />
      )}
      <span className={labelClassName}>{label}</span>
    </button>
  );
}
