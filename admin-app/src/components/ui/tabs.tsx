"use client";

import { useRef, type ReactNode, type KeyboardEvent } from "react";
import { cn } from "@/lib/core/cn";

export type TabItem<T extends string> = { id: T; label: ReactNode; count?: number; icon?: ReactNode };

// Controlled tab strip with arrow-key navigation. Render the panel yourself
// with <TabPanel> (so each panel can fetch its own data).
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idPrefix = "tab",
  className,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  idPrefix?: string;
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  function onKeyDown(e: KeyboardEvent, index: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  }
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-1 overflow-x-auto rounded-xl bg-sunken p-1 ring-1 ring-line", className)}>
      {tabs.map((t, i) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${idPrefix}-${t.id}`}
            role="tab"
            type="button"
            aria-selected={on}
            aria-controls={`${idPrefix}-${t.id}-panel`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "flex h-11 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
              on ? "bg-panel text-fg shadow-card ring-1 ring-line" : "text-fg-muted hover:text-fg",
            )}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  "min-w-6 rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                  on ? "bg-accent text-accent-fg" : "bg-raised text-fg-muted",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  idPrefix = "tab",
  className,
  children,
}: {
  id: string;
  idPrefix?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="tabpanel" id={`${idPrefix}-${id}-panel`} aria-labelledby={`${idPrefix}-${id}`} className={className}>
      {children}
    </div>
  );
}
