import Link from "next/link";
import type { ReactNode } from "react";
import { formatUSD, money } from "@/domain/money";
import { ChartHover, type ChartTip } from "./chart-hover";

/**
 * Report charts: plain HTML marks positioned by percentage, so text stays
 * crisp at every width, with SVG only for lines. Specs follow the dataviz
 * method: bars at most 24px thick with a 4px rounded data end, a 2px
 * surface gap between touching segments, 2px lines, 8px dots with a 2px
 * surface ring, hairline grid. Every chart has a legend for two or more
 * series and is always paired with a table, which is also the answer to the
 * lighter hues' low contrast on white. Values are cents (or days).
 */

/** The categorical order; see globals.css. Never cycled: a seventh folds. */
export const SERIES = [1, 2, 3, 4, 5, 6].map((n) => `var(--series-${n})`);
export const OTHER = "var(--series-other)";

export type Format = "usd" | "days";
const full = (v: number, format: Format) =>
  format === "usd"
    ? formatUSD(money(BigInt(Math.round(v))))
    : `${Math.round(v)} days`;
const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const tick = (v: number, format: Format) =>
  format === "usd" ? compactUsd.format(v / 100) : `${Math.round(v)}`;

/** Round ticks (0, 500, 1,000) that cover the range, zero included. */
function scale(lo: number, hi: number, count = 4) {
  lo = Math.min(0, lo);
  hi = Math.max(0, hi);
  if (lo === hi) hi = 1;
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step / 2; t += step) ticks.push(t);
  return { min, max, ticks, pct: (v: number) => ((v - min) / (max - min)) * 100 };
}

export interface Series {
  name: string;
  color: string;
  values: number[];
}

/** A legend: rectangles for bars, a short line for a line. */
export function Legend({
  items,
}: {
  items: { name: string; color: string; line?: boolean }[];
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-ink-2">
      {items.map((item) => (
        <li key={item.name} className="inline-flex items-center gap-1.5">
          <span
            className={`inline-block ${item.line ? "h-0.5 w-4 rounded-full" : "size-2.5 rounded-sm"}`}
            style={{ background: item.color }}
            aria-hidden
          />
          {item.name}
        </li>
      ))}
    </ul>
  );
}

/**
 * Columns over time. `stacked` piles the series in each column (negative
 * values below zero, as debts under assets); `grouped` sets them side by
 * side. An optional line (net worth) and a labelled reference (the average)
 * sit over the columns on the same, single axis. With no series, it is a
 * line chart.
 */
export function ColumnChart({
  label,
  labels,
  tipLabels = labels,
  series,
  mode = "stacked",
  line,
  reference,
  format = "usd",
  legend = true,
}: {
  /** Names the chart for assistive technology; the table carries values. */
  label: string;
  labels: string[];
  tipLabels?: string[];
  series: Series[];
  mode?: "stacked" | "grouped";
  line?: { name: string; color: string; values: (number | null)[] };
  reference?: { label: string; value: number };
  format?: Format;
  legend?: boolean;
}) {
  const n = labels.length;
  if (!n) return null;
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = 0; i < n; i++) {
    const vals = series.map((s) => s.values[i] ?? 0);
    if (mode === "stacked") {
      highs.push(vals.filter((v) => v > 0).reduce((a, b) => a + b, 0));
      lows.push(vals.filter((v) => v < 0).reduce((a, b) => a + b, 0));
    } else {
      highs.push(Math.max(0, ...vals));
      lows.push(Math.min(0, ...vals));
    }
    const l = line?.values[i];
    if (l !== null && l !== undefined) {
      highs.push(l);
      lows.push(l);
    }
  }
  if (reference) highs.push(reference.value);
  const s = scale(Math.min(...lows), Math.max(...highs));
  // Every k-th month label, so they never collide on a long range.
  const every = Math.ceil(n / 12);
  const barWidth = "min(24px, 60%)";
  const tipFor = (i: number): ChartTip => ({
    title: tipLabels[i],
    rows: [
      ...series.map((ser) => ({
        name: ser.name,
        value: full(Math.abs(ser.values[i] ?? 0), format),
        color: ser.color,
        money: format === "usd",
      })),
      ...(line && line.values[i] !== null && line.values[i] !== undefined
        ? [
            {
              name: line.name,
              value: full(line.values[i]!, format),
              color: line.color,
              money: format === "usd",
            },
          ]
        : []),
      ...(mode === "stacked" && series.length > 1
        ? [
            {
              name: "Total",
              value: full(
                series.reduce((t, ser) => t + Math.abs(ser.values[i] ?? 0), 0),
                format,
              ),
              money: format === "usd",
            },
          ]
        : []),
    ],
  });
  const bars = (i: number) => {
    if (mode === "grouped")
      return (
        <div
          className="absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-stretch gap-[2px]"
          // The pair, sized against the month's slot: each bar at most 12px.
          style={{ width: `min(${series.length * 14}px, 70%)` }}
        >
          {series.map((ser) => {
            const v = ser.values[i] ?? 0;
            const top = s.pct(Math.max(v, 0));
            const bottom = s.pct(Math.min(v, 0));
            return (
              <div key={ser.name} className="relative min-w-1 flex-1">
                <div
                  className={`absolute inset-x-0 ${v >= 0 ? "rounded-t" : "rounded-b"}`}
                  style={{
                    bottom: `${bottom}%`,
                    height: `${top - bottom}%`,
                    background: ser.color,
                  }}
                />
              </div>
            );
          })}
        </div>
      );
    // Stacked: positives upward from zero, negatives downward, each segment
    // after the first parted from the one before by a 2px surface gap.
    const segments: ReactNode[] = [];
    for (const sign of [1, -1]) {
      let cum = 0;
      const members = series.filter((ser) => Math.sign(ser.values[i] ?? 0) === sign);
      members.forEach((ser, k) => {
        const v = ser.values[i];
        const from = s.pct(cum);
        cum += v;
        const to = s.pct(cum);
        const last = k === members.length - 1;
        segments.push(
          <div
            key={ser.name}
            className={`absolute inset-x-0 ${last ? (sign > 0 ? "rounded-t" : "rounded-b") : ""}`}
            style={{
              bottom: `${Math.min(from, to)}%`,
              height: `${Math.abs(to - from)}%`,
              background: ser.color,
              ...(k > 0
                ? sign > 0
                  ? { borderBottom: "2px solid var(--surface)" }
                  : { borderTop: "2px solid var(--surface)" }
                : {}),
            }}
          />,
        );
      });
    }
    return (
      <div
        className="absolute inset-y-0 left-1/2 -translate-x-1/2"
        style={{ width: barWidth, minWidth: 4 }}
      >
        {segments}
      </div>
    );
  };
  const x = (i: number) => ((i + 0.5) / n) * 100;
  return (
    <figure className="report-chart" aria-label={label}>
      {legend && (series.length + (line ? 1 : 0) > 1 || reference) && (
        <div className="mb-3">
          <Legend
            items={[
              ...series.map((ser) => ({ name: ser.name, color: ser.color })),
              ...(line ? [{ name: line.name, color: line.color, line: true }] : []),
            ]}
          />
        </div>
      )}
      <ChartHover>
        <div className="grid grid-cols-[3.25rem_minmax(0,1fr)]" aria-hidden>
          {/* Y axis: round ticks, thousands-compacted, muted. */}
          <div className="relative h-56">
            {s.ticks.map((t) => (
              <span
                key={t}
                className={`absolute right-2 translate-y-1/2 text-meta text-ink-3 ${format === "usd" ? "amount" : ""}`}
                style={{ bottom: `${s.pct(t)}%` }}
              >
                {tick(t, format)}
              </span>
            ))}
          </div>
          <div className="relative h-56">
            {s.ticks.map((t) => (
              <div
                key={t}
                className={`absolute inset-x-0 h-px ${t === 0 ? "bg-hairline-strong" : "bg-hairline"}`}
                style={{ bottom: `${s.pct(t)}%` }}
              />
            ))}
            <div className="absolute inset-0 flex">
              {labels.map((l, i) => (
                <div
                  key={`${l}-${i}`}
                  className="chart-slot relative flex-1"
                  data-tip={JSON.stringify(tipFor(i))}
                >
                  {series.length > 0 && bars(i)}
                </div>
              ))}
            </div>
            {reference && (
              <>
                <div
                  className="pointer-events-none absolute inset-x-0 h-px bg-ink-3"
                  style={{ bottom: `${s.pct(reference.value)}%` }}
                />
                <span
                  className="pointer-events-none absolute right-0 mb-0.5 rounded-sm bg-surface px-1 text-meta text-ink-2"
                  style={{ bottom: `${s.pct(reference.value)}%` }}
                >
                  {reference.label}{" "}
                  <span className={format === "usd" ? "amount" : ""}>
                    {full(reference.value, format)}
                  </span>
                </span>
              </>
            )}
            {line && (
              <>
                <svg
                  className="pointer-events-none absolute inset-0 size-full overflow-visible"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <polyline
                    points={line.values
                      .map((v, i) => (v === null ? null : `${x(i)},${100 - s.pct(v)}`))
                      .filter(Boolean)
                      .join(" ")}
                    fill="none"
                    stroke={line.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                {line.values.map((v, i) =>
                  v === null ? null : (
                    <span
                      key={i}
                      className="pointer-events-none absolute size-3 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-surface"
                      style={{ left: `${x(i)}%`, bottom: `${s.pct(v)}%`, background: line.color }}
                    />
                  ),
                )}
              </>
            )}
          </div>
          <div />
          <div className="mt-1 flex">
            {labels.map((l, i) => (
              <span
                key={`${l}-${i}`}
                className="flex-1 truncate text-center text-meta text-ink-3"
              >
                {i % every === 0 ? l : ""}
              </span>
            ))}
          </div>
        </div>
      </ChartHover>
    </figure>
  );
}

/**
 * Part to whole in one horizontal bar (at most six parts and Other), with a
 * legend that carries each part's amount and share.
 */
export function PartBar({
  label,
  parts,
}: {
  label: string;
  /** A part with `href` names itself as a link (narrowing the report). */
  parts: { name: string; color: string; amount: bigint; href?: string }[];
}) {
  const total = parts.reduce((t, p) => t + (p.amount > 0n ? p.amount : 0n), 0n);
  if (total <= 0n) return null;
  const share = (a: bigint) => Number((a * 1000n) / total) / 10;
  const shown = parts.filter((p) => p.amount > 0n);
  return (
    <figure className="report-chart" aria-label={label}>
      <ChartHover>
        <div className="flex h-4 gap-[2px] overflow-hidden rounded" aria-hidden>
          {shown.map((p) => (
            <div
              key={p.name}
              className="h-full min-w-[2px]"
              style={{ width: `${share(p.amount)}%`, background: p.color }}
              data-tip={JSON.stringify({
                title: p.name,
                rows: [
                  { name: "Spent", value: formatUSD(money(p.amount)), money: true },
                  { name: "Share", value: `${share(p.amount).toFixed(1)}%` },
                ],
              } satisfies ChartTip)}
            />
          ))}
        </div>
      </ChartHover>
      <ul className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-table">
        {shown.map((p) => (
          <li key={p.name} className="inline-flex items-center gap-2">
            <span
              className="inline-block size-2.5 shrink-0 rounded-sm"
              style={{ background: p.color }}
              aria-hidden
            />
            {p.href ? (
              <Link className="text-ink underline-offset-2 hover:underline" href={p.href} scroll={false}>
                {p.name}
              </Link>
            ) : (
              <span className="text-ink">{p.name}</span>
            )}
            <span className="text-num text-ink-2">
              <span className="amount">{formatUSD(money(p.amount))}</span>
              <span className="ml-1.5 text-ink-3">{share(p.amount).toFixed(1)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
