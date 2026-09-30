"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/core/cn";

// Section tabs that are real links (each tab is its own page).
export function SubNav({ label, tabs, exact }: { label: string; tabs: Array<{ href: string; label: string }>; exact?: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-sunken p-1 ring-1 ring-line print:hidden">
      {tabs.map((t) => {
        const on = t.href === exact ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex h-11 shrink-0 items-center rounded-lg px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-focus",
              on ? "bg-panel text-fg shadow-card ring-1 ring-line" : "text-fg-muted hover:text-fg",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
