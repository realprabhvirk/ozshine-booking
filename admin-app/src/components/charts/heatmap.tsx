"use client";

import { useState } from "react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function hourLabel(h: number) {
  const s = h >= 12 ? "pm" : "am";
  return `${h % 12 === 0 ? 12 : h % 12}${s}`;
}

// Day × hour grid, one hue light→dark by count (opacity of the data colour,
// so it works on both themes). Each cell is focusable with its own tooltip.
export function Heatmap({ cells, fromHour = 7, toHour = 18, unit = "bookings" }: { cells: Array<{ dow: number; hour: number; count: number }>; fromHour?: number; toHour?: number; unit?: string }) {
  const [hover, setHover] = useState<{ dow: number; hour: number; count: number } | null>(null);
  const hours = Array.from({ length: toHour - fromHour + 1 }, (_, i) => fromHour + i);
  const lookup = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c.count]));
  const max = Math.max(1, ...cells.map((c) => c.count));
  return (
    <div className="overflow-x-auto">
      <div className="inline-grid min-w-full gap-[2px]" style={{ gridTemplateColumns: `3rem repeat(${hours.length}, minmax(1.75rem, 1fr))` }}>
        <span />
        {hours.map((h) => (
          <span key={h} className="pb-1 text-center text-[11px] text-fg-muted">
            {h % 2 === 0 ? hourLabel(h) : ""}
          </span>
        ))}
        {DAYS.map((d, di) => (
          <div key={d} className="contents">
            <span className="self-center pr-2 text-xs font-medium text-fg-muted">{d}</span>
            {hours.map((h) => {
              const count = lookup.get(`${di + 1}-${h}`) ?? 0;
              const label = `${d} ${hourLabel(h)}: ${count} ${unit}`;
              return (
                <div
                  key={h}
                  tabIndex={0}
                  role="img"
                  aria-label={label}
                  onPointerEnter={() => setHover({ dow: di + 1, hour: h, count })}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover({ dow: di + 1, hour: h, count })}
                  onBlur={() => setHover(null)}
                  className="relative h-8 rounded-[4px] bg-sunken outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  {count > 0 && <span className="absolute inset-0 rounded-[4px] bg-series-1" style={{ opacity: 0.15 + 0.85 * (count / max) }} />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-fg-muted">
        <p role="status" className="min-h-5">
          {hover ? (
            <>
              <span className="font-bold text-fg tabular-nums">
                {hover.count} {unit}
              </span>{" "}
              · {DAYS[hover.dow - 1]} {hourLabel(hover.hour)}
            </>
          ) : (
            "Hover or tap a square for the count"
          )}
        </p>
        <span className="flex items-center gap-2">
          Fewer
          <span className="flex gap-[2px]" aria-hidden>
            {[0.15, 0.36, 0.57, 0.78, 1].map((o) => (
              <span key={o} className="relative size-3.5 rounded-[3px] bg-sunken">
                <span className="absolute inset-0 rounded-[3px] bg-series-1" style={{ opacity: o }} />
              </span>
            ))}
          </span>
          More
        </span>
      </div>
    </div>
  );
}
