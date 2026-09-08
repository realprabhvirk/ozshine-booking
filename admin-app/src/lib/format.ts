export function formatMoney(amount: number | null): string {
  if (amount === null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amount);
}

export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Same as formatDate but with the year — for invoices and anything else
// that might get looked at long after the fact.
export function formatDateFull(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// requested_time comes back from Postgres as "HH:MM:SS" — format to 12h.
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

// Beenleigh's timezone, fixed (Queensland doesn't observe daylight saving).
// "Today" for this business always means today in Brisbane — not wherever
// the server happens to be running. Vercel's serverless functions run in
// UTC by default, so computing "today" with a plain `new Date()` here would
// silently disagree with the browser's local date for a chunk of every day
// (bookings/dashboards would look like they're missing entries). This is
// what actually keeps Active Today, the dashboard KPIs, and Order History's
// default range all in sync with the shop's actual calendar day.
const LOCATION_TZ = "Australia/Brisbane";

function isoDateOf(date: Date): string {
  // en-CA's default date format is already YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LOCATION_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Today's date as YYYY-MM-DD, matching Postgres `date` columns.
export function todayISODate(): string {
  return isoDateOf(new Date());
}

// N days before today, as YYYY-MM-DD — used for order history's default
// date-range filter.
export function isoDateDaysAgo(days: number): string {
  const [year, month, day] = todayISODate().split("-").map(Number);
  // Anchor as a UTC-midnight instant purely so setUTCDate() does calendar
  // arithmetic without any further timezone reinterpretation.
  const anchor = new Date(Date.UTC(year, month - 1, day));
  anchor.setUTCDate(anchor.getUTCDate() - days);
  const y = anchor.getUTCFullYear();
  const m = String(anchor.getUTCMonth() + 1).padStart(2, "0");
  const d = String(anchor.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
