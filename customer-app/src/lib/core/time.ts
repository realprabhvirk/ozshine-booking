// Dates and times. OzShine Beenleigh runs on Brisbane time (UTC+10, no
// daylight saving). Every "today", every displayed time, every date sent to
// the database is Brisbane — never the server's zone (Vercel runs in UTC) and
// never the browser's.

export const SHOP_TZ = "Australia/Brisbane";

// YYYY-MM-DD, matching Postgres `date` columns.
export type ISODate = string;

const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHOP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const hm = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHOP_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

// The Brisbane calendar date of an instant.
export function shopDateOf(value: Date | string | number): ISODate {
  return ymd.format(toDate(value));
}

// The Brisbane wall-clock time of an instant, "HH:MM".
export function shopTimeOf(value: Date | string | number): string {
  return hm.format(toDate(value));
}

export function todayISO(now: Date = new Date()): ISODate {
  return shopDateOf(now);
}

// Calendar arithmetic on YYYY-MM-DD strings (no timezone involved).
function isoToUTC(iso: ISODate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function utcToISO(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  const d = isoToUTC(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return utcToISO(d);
}

export function daysBetweenISO(from: ISODate, to: ISODate): number {
  return Math.round((isoToUTC(to).getTime() - isoToUTC(from).getTime()) / 86_400_000);
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

// "mon".."sun" — the keys used by settings.opening_hours.
export function dayKeyOf(iso: ISODate): DayKey {
  return DAY_KEYS[isoToUTC(iso).getUTCDay()];
}

// Monday of the week containing `iso`.
export function startOfWeekISO(iso: ISODate): ISODate {
  const dow = isoToUTC(iso).getUTCDay();
  return addDaysISO(iso, dow === 0 ? -6 : 1 - dow);
}

const DATE_STYLES = {
  // "Tue 7 Oct"
  short: { weekday: "short", day: "numeric", month: "short" },
  // "7 Oct 2026"
  medium: { day: "numeric", month: "short", year: "numeric" },
  // "Tuesday 7 October"
  long: { weekday: "long", day: "numeric", month: "long" },
  // "Tuesday 7 October 2026"
  full: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;
export type DateStyle = keyof typeof DATE_STYLES;

const dateFormatters = Object.fromEntries(
  Object.entries(DATE_STYLES).map(([k, o]) => [k, new Intl.DateTimeFormat("en-AU", { ...o, timeZone: "UTC" })]),
) as Record<DateStyle, Intl.DateTimeFormat>;

// Format a YYYY-MM-DD date. en-AU inserts a comma after the weekday; drop it.
export function formatDate(iso: ISODate | null | undefined, style: DateStyle = "short"): string {
  if (!iso) return "—";
  return dateFormatters[style].format(isoToUTC(iso.slice(0, 10))).replace(",", "");
}

// "Today", "Tomorrow", "Yesterday", otherwise formatDate().
export function formatDay(iso: ISODate, style: DateStyle = "short", today: ISODate = todayISO()): string {
  const diff = daysBetweenISO(today, iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return formatDate(iso, style);
}

// "HH:MM" or "HH:MM:SS" → minutes after midnight.
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// Minutes after midnight → "HH:MM".
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// "09:30:00" → "9:30am", "13:00" → "1pm".
export function formatTime(time: string | null | undefined): string {
  if (!time) return "—";
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

// An instant shown in Brisbane time: "9:30am".
export function formatClock(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return formatTime(shopTimeOf(value));
}

// An instant shown in Brisbane: "Tue 7 Oct, 9:30am".
export function formatDateTime(
  value: Date | string | number | null | undefined,
  style: DateStyle = "short",
): string {
  if (value === null || value === undefined) return "—";
  return `${formatDate(shopDateOf(value), style)}, ${formatClock(value)}`;
}

// 90 → "1 h 30 min", 45 → "45 min", 360 → "6 h".
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// "just now", "5 min ago", "3 h ago", "yesterday", then the date.
export function formatRelative(value: Date | string | number, now: Date = new Date()): string {
  const then = toDate(value);
  const secs = Math.round((now.getTime() - then.getTime()) / 1000);
  if (secs < 0) {
    const mins = Math.round(-secs / 60);
    if (mins < 60) return `in ${Math.max(mins, 1)} min`;
    return formatDateTime(then);
  }
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24 && shopDateOf(then) === shopDateOf(now)) return `${hours} h ago`;
  const days = daysBetweenISO(shopDateOf(then), shopDateOf(now));
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(shopDateOf(then), "medium");
}
