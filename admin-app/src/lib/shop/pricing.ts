import { toCents, type Cents } from "@/lib/core/money";
import type { VehicleType } from "@/lib/core/status";
import type { AddonRow, ServiceRow } from "./types";

// Mirrors SQL service_price_for(): per-type price, falling back to price_from.
export function servicePriceCents(service: ServiceRow, type: VehicleType): Cents {
  const byType = { sedan: null, small_wagon: service.price_small_wagon, van: service.price_van, "4wd": service.price_4wd }[type];
  return toCents(byType ?? service.price_from);
}

export function addonsTotalCents(addons: AddonRow[], ids: string[]): Cents {
  return addons.filter((a) => ids.includes(a.id)).reduce((sum, a) => sum + toCents(a.price), 0);
}

// Mirrors SQL job_duration(): service minutes + add-on minutes.
export function jobMinutes(service: ServiceRow | null, addons: AddonRow[], ids: string[]): number {
  const base = service?.duration_minutes ?? 60;
  return base + addons.filter((a) => ids.includes(a.id)).reduce((m, a) => m + a.duration_minutes, 0);
}
