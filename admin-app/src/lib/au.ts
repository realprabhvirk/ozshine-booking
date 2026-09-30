// Australian business rules used by settings: ABN check, QLD public holidays.

// ABN: 11 digits with the ATO weighted checksum.
export function isValidAbn(input: string): boolean {
  const d = input.replace(/\s/g, "");
  if (!/^\d{11}$/.test(d)) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = d.split("").map(Number);
  digits[0] -= 1;
  return digits.reduce((s, n, i) => s + n * w[i], 0) % 89 === 0;
}

export function formatAbn(input: string): string {
  const d = input.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : input;
}

// Easter Sunday (Anonymous Gregorian algorithm).
function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function dow(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function shift(isoDate: string, days: number) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}
function firstMonday(y: number, m: number) {
  const first = iso(y, m, 1);
  return shift(first, (8 - dow(first)) % 7);
}

// Queensland public holidays, worked out by rule. Shown as suggestions for
// the owner to confirm against the official list, not applied automatically.
export function qldPublicHolidays(year: number): Array<{ date: string; name: string }> {
  const e = easter(year);
  const out: Array<{ date: string; name: string }> = [];
  const add = (date: string, name: string) => out.push({ date, name });
  const weekendToMonday = (date: string, name: string) => {
    add(date, name);
    const w = dow(date);
    if (w === 6) add(shift(date, 2), `${name} (observed)`);
    if (w === 0) add(shift(date, 1), `${name} (observed)`);
  };
  weekendToMonday(iso(year, 1, 1), "New Year's Day");
  weekendToMonday(iso(year, 1, 26), "Australia Day");
  add(shift(e, -2), "Good Friday");
  add(shift(e, -1), "Easter Saturday");
  add(e, "Easter Sunday");
  add(shift(e, 1), "Easter Monday");
  add(iso(year, 4, 25), "Anzac Day");
  add(firstMonday(year, 5), "Labour Day");
  add(firstMonday(year, 10), "King's Birthday");
  const xmas = iso(year, 12, 25);
  const boxing = iso(year, 12, 26);
  add(xmas, "Christmas Day");
  add(boxing, "Boxing Day");
  const xw = dow(xmas);
  if (xw === 5) add(shift(boxing, 2), "Boxing Day (observed)"); // Fri/Sat → Mon
  if (xw === 6) {
    add(shift(xmas, 2), "Christmas Day (observed)");
    add(shift(xmas, 3), "Boxing Day (observed)");
  }
  if (xw === 0) add(shift(boxing, 1), "Christmas Day (observed)");
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
