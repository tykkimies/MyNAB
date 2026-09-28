"use client";
import { useRef, useState, type ReactNode } from "react";

/** One readout: a title (the month, the group) and a row per series. */
export interface ChartTip {
  title: string;
  rows: { name: string; value: string; color?: string; money?: boolean }[];
}

/**
 * The hover layer for a report chart. Marks carry their readout in a
 * `data-tip` attribute (JSON the server wrote); this shows it beside the
 * pointer. It only enhances: every value is also in the chart's table.
 * Text goes in through React, never as HTML.
 */
export function ChartHover({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<
    (ChartTip & { x: number; y: number; flip: boolean }) | null
  >(null);
  const show = (target: EventTarget | null, x: number, y: number) => {
    const el = (target as HTMLElement | null)?.closest?.("[data-tip]");
    if (!el || !root.current) return setTip(null);
    const box = root.current.getBoundingClientRect();
    try {
      setTip({
        ...(JSON.parse(el.getAttribute("data-tip")!) as ChartTip),
        x: x - box.left,
        y: y - box.top,
        // Past the middle, show it on the pointer's left so it stays inside.
        flip: x - box.left > box.width / 2,
      });
    } catch {
      setTip(null);
    }
  };
  return (
    <div
      ref={root}
      className="chart-hover relative"
      onPointerMove={(e) => show(e.target, e.clientX, e.clientY)}
      onPointerLeave={() => setTip(null)}
    >
      {children}
      {tip && (
        <div
          className="chart-tip pointer-events-none absolute z-20 min-w-40 rounded-md border border-hairline bg-surface px-3 py-2 text-table shadow-pop"
          style={{
            left: tip.x,
            top: tip.y,
            transform: `translate(${tip.flip ? "calc(-100% - 12px)" : "12px"}, -50%)`,
          }}
          aria-hidden
        >
          <p className="text-meta text-ink-3">{tip.title}</p>
          <ul className="mt-1 grid gap-0.5">
            {tip.rows.map((row) => (
              <li
                key={row.name}
                className="flex items-center justify-between gap-4"
              >
                <span className="flex items-center gap-1.5 text-ink-2">
                  {row.color && (
                    <span
                      className="inline-block h-0.5 w-3 rounded-full"
                      style={{ background: row.color }}
                    />
                  )}
                  {row.name}
                </span>
                <span
                  className={`text-num font-semibold text-ink ${row.money ? "amount" : ""}`}
                >
                  {row.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
