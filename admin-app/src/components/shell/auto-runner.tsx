"use client";

import { useEffect } from "react";
import { useShop } from "@/components/shop-context";
import { runAutomations } from "@/lib/shop/messages";

const KEY = "oz-automations-last-run";
const EVERY = 60 * 60 * 1000;

// Checks for due reminders / feedback requests about once an hour while the
// staff app is open, so automatic messages work even before the Vercel daily
// job is set up. Safe to run from several tablets: the database never queues
// the same message twice.
export function AutoRunner() {
  const { supabase } = useShop();
  useEffect(() => {
    const tick = () => {
      let last = 0;
      try {
        last = Number(localStorage.getItem(KEY) ?? 0);
      } catch {}
      if (Date.now() - last < EVERY - 60_000) return;
      try {
        localStorage.setItem(KEY, String(Date.now()));
      } catch {}
      runAutomations(supabase).catch(() => {});
    };
    const first = window.setTimeout(tick, 15_000);
    const id = window.setInterval(tick, 5 * 60 * 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [supabase]);
  return null;
}
