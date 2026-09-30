"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/core/cn";
import { niceTicks, useWidth } from "./use-width";

export type Column = { key: string; label: string; longLabel?: string; value: number };

// Single-series column chart: thin columns (≤24px) with 4px rounded tops
// growing from one baseline, hairline grid, clean y ticks, thinned x labels,
// and a per-column hover/focus tooltip (the whole band is the hit target).
export function ColumnChart({
  data,
  format,
  axisFormat = format,
  height = 240,
  label,
}: {
  data: Column[];
  format: (v: number) => string;
  axisFormat?: (v: number) => string;
  height?: number;
  label: string;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();
  const left = 56;
  const right = 8;
  const top = 12;
  const bottom = 28;
  const plotW = Math.max(width - left - right, 50);
  const plotH = height - top - bottom;
  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const yMax = ticks[ticks.length - 1] || 1;
  const band = plotW / Math.max(data.length, 1);
  const barW = Math.max(2, Math.min(24, band - 2 - band * 0.3));
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 64))));
  const y = (v: number) => top + plotH - (v / yMax) * plotH;

  const hovered = hover === null ? null : data[hover];
  return (
    <div ref={ref} className="relative w-full">
      <svg width={width} height={height} role="img" aria-labelledby={titleId} className="block overflow-visible">
        <title id={titleId}>{label}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
            <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-fg-muted text-[11px] tabular-nums">
              {axisFormat(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = left + band * i + band / 2;
          const h = Math.max(0, (d.value / yMax) * plotH);
          const x0 = cx - barW / 2;
          const yTop = top + plotH - h;
          const r = Math.min(4, h, barW / 2);
          // Rounded data-end, square at the baseline.
          const path =
            h <= 0
              ? ""
              : `M${x0},${top + plotH} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + barW - r} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} V${top + plotH} Z`;
          return (
            <g key={d.key}>
              {path && <path d={path} className={cn("fill-series-1 transition-opacity", hover !== null && hover !== i && "opacity-45")} />}
              {i % labelEvery === 0 && (
                <text x={cx} y={height - 8} textAnchor="middle" className="fill-fg-muted text-[11px]">
                  {d.label}
                </text>
              )}
              <rect
                x={left + band * i}
                y={top}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${d.longLabel ?? d.label}: ${format(d.value)}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h2) => (h2 === i ? null : h2))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((h2) => (h2 === i ? null : h2))}
                className="cursor-default outline-none focus-visible:stroke-focus focus-visible:stroke-2"
              />
            </g>
          );
        })}
        <line x1={left} x2={width - right} y1={top + plotH} y2={top + plotH} className="stroke-line-strong" strokeWidth={1} />
      </svg>
      {hovered && hover !== null && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-panel px-3 py-2 text-sm whitespace-nowrap shadow-pop ring-1 ring-line"
          style={{ left: Math.min(Math.max(left + band * hover + band / 2, 70), width - 70), top: Math.max(y(hovered.value) - 8, 40) }}
        >
          <p className="font-bold text-fg tabular-nums">{format(hovered.value)}</p>
          <p className="text-fg-muted">{hovered.longLabel ?? hovered.label}</p>
        </div>
      )}
    </div>
  );
}
