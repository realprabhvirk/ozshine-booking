import { formatTime } from "@/lib/core/time";
import type { DayHours } from "./public";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const LABEL: Record<(typeof DAYS)[number], string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

// Opening hours grouped into readable rows: "Mon–Fri 8:00am – 5:00pm".
export function hoursRows(hours: Record<string, DayHours> | null | undefined): Array<{ days: string; time: string }> {
  if (!hours) return [];
  const text = (d: (typeof DAYS)[number]) => {
    const h = hours[d];
    return !h || h.closed ? "Closed" : `${formatTime(h.open)} – ${formatTime(h.close)}`;
  };
  const rows: Array<{ from: string; to: string; time: string }> = [];
  for (const d of DAYS) {
    const t = text(d);
    const last = rows.at(-1);
    if (last && last.time === t) last.to = LABEL[d];
    else rows.push({ from: LABEL[d], to: LABEL[d], time: t });
  }
  return rows.map((r) => ({ days: r.from === r.to ? r.from : `${r.from}–${r.to}`, time: r.time }));
}

export function mapsLink(address: string | null | undefined): string | null {
  if (!address) return null;
  // OpenStreetMap search: no Google APIs, works on every device.
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`;
}

export function telLink(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/[^\d+]/g, "");
  return d ? `tel:${d}` : null;
}
