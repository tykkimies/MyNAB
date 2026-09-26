import type { ReactNode } from "react";
import { MaybeAmount } from "@/components/amount";

export type StatTone = "positive" | "negative" | "warning" | "neutral";

/**
 * The page's key figures in one line: a caps label over a tabular figure, an
 * optional note, hairlines between. The first item may lead with a larger
 * figure. It replaces the stat cards; no borders, no icons, no gradients.
 */
export function SummaryStrip({
  children,
  ariaLabel,
}: {
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <section className="summary-strip" aria-label={ariaLabel}>
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  note,
  tone,
  lead = false,
  fill = false,
  as: Tag = "div",
  labelTag: LabelTag = "span",
  children,
  className = "",
}: {
  label: ReactNode;
  /** The Budget page's Ready to Assign label is a heading of its own. */
  labelTag?: "span" | "h2";
  /** A preformatted string is masked by Hide Amounts when it is money. */
  value: ReactNode;
  note?: ReactNode;
  tone?: StatTone;
  lead?: boolean;
  /** Pushes the item to the right edge (an action slot). */
  fill?: boolean;
  as?: "div" | "article";
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Tag
      className={className}
      data-lead={lead ? "" : undefined}
      data-fill={fill ? "" : undefined}
      data-tone={tone && tone !== "neutral" ? tone : undefined}
    >
      <LabelTag className="stat-label">{label}</LabelTag>
      <span className="stat-value" data-numeric>
        {typeof value === "string" ? <MaybeAmount value={value} /> : value}
      </span>
      {note && <span className="stat-note">{note}</span>}
      {children}
    </Tag>
  );
}
