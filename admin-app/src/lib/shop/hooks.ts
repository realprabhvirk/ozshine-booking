"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { playAlertSound } from "@/lib/alert-sound";
import { BOOKINGS_CHANGED } from "./actions";
import { useShop } from "@/components/shop-context";

export type LiveStatus = "connecting" | "live" | "offline";

// Keeps `load()`'s result fresh: refetches on any booking / invoice / payment
// change (Supabase Realtime), when this tablet changes something, when the
// tab comes back into view, and every 60s as a safety net. Chimes when a new
// online request arrives.
export function useLiveData<T>({
  supabase,
  locationId,
  initial,
  load,
  channel,
  chime = false,
}: {
  supabase: SupabaseClient;
  locationId: string;
  initial: T;
  load: () => Promise<T>;
  channel: string;
  chime?: boolean;
}) {
  const [data, setData] = useState<T>(initial);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [error, setError] = useState<unknown>(null);
  const [refreshedAt, setRefreshedAt] = useState<number>(() => Date.now());
  const { settings } = useShop();
  const sound = useRef({ kind: settings?.alert_sound ?? "chime", volume: Number(settings?.alert_volume ?? 0.6) });
  const loadRef = useRef(load);
  const timer = useRef<number | null>(null);
  const inflight = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    sound.current = { kind: settings?.alert_sound ?? "chime", volume: Number(settings?.alert_volume ?? 0.6) };
  }, [settings?.alert_sound, settings?.alert_volume]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const refresh = useCallback(async () => {
    // One fetch at a time; anything that arrives meanwhile triggers one more.
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    try {
      do {
        again.current = false;
        try {
          const next = await loadRef.current();
          setData(next);
          setError(null);
          setRefreshedAt(Date.now());
        } catch (e) {
          setError(e);
        }
      } while (again.current);
    } finally {
      inflight.current = false;
    }
  }, []);

  // Coalesce bursts of events (a checkout touches 3 tables) into one fetch.
  const soon = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void refresh(), 250);
  }, [refresh]);

  useEffect(() => {
    const ch = supabase
      .channel(`${channel}-${locationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `location_id=eq.${locationId}` }, (payload) => {
        if (chime && payload.eventType === "INSERT" && (payload.new as { status?: string }).status === "pending") {
          playAlertSound(sound.current.kind, sound.current.volume);
        }
        soon();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `location_id=eq.${locationId}` }, soon)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, soon)
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          setStatus("live");
          soon(); // catch anything missed while connecting
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          setStatus("offline");
        }
      });

    const onLocal = () => soon();
    const onVisible = () => {
      if (document.visibilityState === "visible") soon();
    };
    window.addEventListener(BOOKINGS_CHANGED, onLocal);
    document.addEventListener("visibilitychange", onVisible);
    const poll = window.setInterval(() => void refresh(), 60_000);

    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener(BOOKINGS_CHANGED, onLocal);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(poll);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [supabase, locationId, channel, chime, soon, refresh]);

  return { data, status, error, refresh, refreshedAt };
}

// Re-render every `ms` (clocks, "in bay for 23 min" timers). Starts from the
// server's render time so hydration matches, then catches up immediately.
export function useNow(ms = 30_000): Date {
  const { serverNow } = useShop();
  const [now, setNow] = useState(() => new Date(serverNow));
  useEffect(() => {
    const first = window.setTimeout(() => setNow(new Date()), 0);
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, [ms]);
  return now;
}
