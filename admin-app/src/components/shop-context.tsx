"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Catalogue } from "@/lib/shop/types";
import type { StaffRole } from "@/lib/core/status";

export type ShopStaff = { id: string; name: string; role: StaffRole; location_id: string };

type ShopCtx = Catalogue & { staff: ShopStaff; supabase: SupabaseClient; serverNow: number };
const Ctx = createContext<ShopCtx | null>(null);

// Loaded once by the (app) layout: who's logged in, plus the catalogue every
// screen needs (services, add-ons, bays, settings) and one browser client.
export function ShopProvider({
  staff,
  catalogue,
  serverNow,
  client,
  children,
}: {
  staff: ShopStaff;
  catalogue: Catalogue;
  // When the server rendered the page, so time-based text (clock, "waiting
  // 12 min") renders identically on the server and during hydration.
  serverNow: number;
  // Only for local previews/tests: a stand-in client.
  client?: SupabaseClient;
  children: ReactNode;
}) {
  const [supabase] = useState(() => client ?? createClient());
  return <Ctx.Provider value={{ ...catalogue, staff, supabase, serverNow }}>{children}</Ctx.Provider>;
}

export function useShop(): ShopCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useShop() used outside <ShopProvider>");
  return v;
}
