import { cn } from "@/lib/core/cn";

export type BarItem = { key: string; label: string; value: number; sub?: string };

// Horizontal bars for a short ranked list: label, a thin bar in the data
// colour, and the value at the tip (text stays in text colours).
export function BarList({ items, format, empty = "Nothing in this period.", className }: { items: BarItem[]; format: (v: number) => string; empty?: string; className?: string }) {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (items.length === 0 || max <= 0) return <p className="py-4 text-sm text-fg-muted">{empty}</p>;
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((i) => (
        <li key={i.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-fg">{i.label}</span>
            <span className="shrink-0 text-fg-muted tabular-nums">
              <span className="font-semibold text-fg">{format(i.value)}</span>
              {i.sub && <span> · {i.sub}</span>}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 rounded-full bg-sunken" aria-hidden>
            <div className="h-full rounded-full bg-series-1" style={{ width: `${Math.max(1.5, (i.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
