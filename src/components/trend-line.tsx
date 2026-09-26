import { formatUSD, money } from "@/domain/money";

/**
 * One series over time, with a zero line: net worth, an account balance.
 * Server-rendered SVG; each point carries a native tooltip and a hit target
 * larger than the mark. The series is named by the heading beside it, and
 * the values are always also shown as text or a table nearby.
 */
export function TrendLine({
  points,
  label,
}: {
  points: { label: string; value: bigint }[];
  label: string;
}) {
  if (points.length < 2) return null;
  const usd = (v: bigint) => formatUSD(money(v));
  const values = points.map((p) => Number(p.value) / 100);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const W = 600,
    H = 160,
    PAD = 12;
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (points.length - 1);
  const y = (v: number) => PAD + ((hi - v) * (H - 2 * PAD)) / span;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-space-md h-40 w-full"
      role="img"
      aria-label={`${label} from ${usd(points[0].value)} to ${usd(points.at(-1)!.value)}`}
    >
      <line
        x1={PAD}
        x2={W - PAD}
        y1={y(0)}
        y2={y(0)}
        className="stroke-hairline-strong"
        strokeWidth={1}
      />
      <polyline
        points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
        fill="none"
        className="stroke-chart-1"
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {values.map((v, i) => (
        <g key={points[i].label}>
          <circle cx={x(i)} cy={y(v)} r={12} fill="transparent">
            <title>
              {points[i].label}: {usd(points[i].value)}
            </title>
          </circle>
          <circle
            cx={x(i)}
            cy={y(v)}
            r={4}
            className="fill-chart-1 stroke-surface"
            strokeWidth={2}
            pointerEvents="none"
          />
        </g>
      ))}
    </svg>
  );
}
