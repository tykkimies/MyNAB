import type { ReactNode } from "react";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";

export type NoticeTone = "info" | "warning" | "negative" | "positive" | "accent";

/**
 * One-line status the page needs the owner to see: an icon, the sentence, and
 * the action that resolves it on the right. Tinted, never boxed.
 */
export function Notice({
  tone = "info",
  action,
  children,
  role,
  className = "",
  as: Tag = "div",
}: {
  tone?: NoticeTone;
  action?: ReactNode;
  children: ReactNode;
  role?: "status" | "alert";
  className?: string;
  /** A standing warning the page keeps showing is an aside. */
  as?: "div" | "aside";
}) {
  const Icon =
    tone === "negative"
      ? CircleAlert
      : tone === "warning"
        ? TriangleAlert
        : Info;
  return (
    <Tag
      className={`notice ${className}`}
      data-tone={tone === "info" ? undefined : tone}
      role={role}
    >
      <Icon size={16} aria-hidden />
      <div className="notice-body">{children}</div>
      {action && <div className="notice-action">{action}</div>}
    </Tag>
  );
}

export function NoticeList({ children }: { children: ReactNode }) {
  return <div className="notice-list">{children}</div>;
}
