"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { formatClock, formatDate, todayISO } from "@/lib/core/time";
import { useNow } from "@/lib/shop/hooks";
import { SearchDialog } from "./search-dialog";

export function Topbar() {
  const now = useNow(15_000);
  const [searchOpen, setSearchOpen] = useState(false);

  // "/" or Ctrl/⌘+K opens search (handy with a keyboard on the counter).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-panel/80 px-4 backdrop-blur lg:px-6 print:hidden">
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-xl bg-sunken px-4 text-left text-[15px] text-fg-faint ring-1 ring-line transition hover:ring-line-strong focus-visible:outline-2 focus-visible:outline-focus sm:max-w-md"
      >
        <Search size={18} aria-hidden />
        <span className="truncate">Search name, phone, rego or booking ref…</span>
      </button>
      <div className="ml-auto text-right">
        <p className="text-lg leading-tight font-bold text-fg tabular-nums">{formatClock(now)}</p>
        <p className="text-xs text-fg-muted">{formatDate(todayISO(now), "short")}</p>
      </div>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
