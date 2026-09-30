"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { Skeleton } from "./feedback";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  // Provide to make the column sortable.
  sortValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  // Hide on narrow screens (phones / portrait tablets).
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
};

type Sort = { key: string; dir: "asc" | "desc" } | null;

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };
const ALIGN = { left: "text-left", right: "text-right", center: "text-center" };

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowLabel,
  loading,
  empty,
  initialSort = null,
  caption,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  // Accessible name for clickable rows, e.g. "Open booking OZ-7K3P".
  rowLabel?: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  initialSort?: Sort;
  caption?: string;
  className?: string;
}) {
  const [sort, setSort] = useState<Sort>(initialSort);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "en-AU", { numeric: true });
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  function toggle(key: string) {
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  }

  return (
    <div className={cn("overflow-x-auto rounded-3xl bg-panel ring-1 ring-line shadow-card", className)}>
      <table className="w-full border-collapse text-[15px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(
                    "px-4 py-3 text-xs font-semibold tracking-wide text-fg-muted uppercase",
                    ALIGN[c.align ?? "left"],
                    c.hideBelow && HIDE[c.hideBelow],
                  )}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className="inline-flex items-center gap-1 uppercase hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      {c.header}
                      <Icon size={14} className={active ? "text-fg" : "text-fg-faint"} aria-hidden />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 5 }, (_, i) => (
              <tr key={`sk-${i}`} className="border-b border-line last:border-0">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-4", c.hideBelow && HIDE[c.hideBelow])}>
                    <Skeleton className="h-4 w-3/4" />
                  </td>
                ))}
              </tr>
            ))}
          {!loading &&
            sorted.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                aria-label={onRowClick && rowLabel ? rowLabel(row) : undefined}
                className={cn(
                  "border-b border-line last:border-0",
                  onRowClick && "cursor-pointer transition hover:bg-raised focus-visible:bg-raised focus-visible:outline-none",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn("h-14 px-4 py-2 text-fg", ALIGN[c.align ?? "left"], c.hideBelow && HIDE[c.hideBelow], c.className)}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
      {!loading && rows.length === 0 && (empty ?? <p className="px-4 py-10 text-center text-fg-muted">Nothing here yet.</p>)}
    </div>
  );
}
